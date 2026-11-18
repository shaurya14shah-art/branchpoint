import { useEffect, useRef, useState } from 'react'
import { ChevronsRight, Flag, GitBranch, History, MoreHorizontal, Pause, Play, StepForward, Undo2 } from 'lucide-react'
import type { Branch } from '../../engine/history/branch'
import { fmt } from '../../engine/format'
import { totalPopulation } from '../../engine/metrics'
import { appStore, useApp } from '../../state/store'
import { useWorld, type WorldView } from '../../state/useWorld'
import { Button, IconButton, Segmented } from '../../components/ui'
import { Menu } from '../../components/Menu'
import { ConfirmDialog, PromptDialog } from '../../components/Dialog'

const LANE_H = 24
const LABEL_W = 168

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(800)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export function TimelineDock() {
  const w = useWorld()
  if (!w) return null
  return (
    <div className="dock">
      <ControlBar w={w} />
      <Lanes w={w} />
    </div>
  )
}

function ControlBar({ w }: { w: WorldView }) {
  const playing = useApp((s) => s.playing)
  const speed = useApp((s) => s.speed)
  const [rewindTarget, setRewindTarget] = useState<{ step: number; label: string } | null>(null)
  const [cpOpen, setCpOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const s = appStore.getState()
  const blocked = !!w.simError
  const checkpoints = w.branch.checkpoints

  return (
    <div className="controls" role="toolbar" aria-label="Simulation controls">
      <div className="controls-group">
        <Menu
          label="Reset to checkpoint"
          trigger={(p) => (
            <button {...p} type="button" className="icon-btn" aria-label="Reset to checkpoint" data-tip="Reset to checkpoint" disabled={w.head === 0}>
              <Undo2 size={15} />
            </button>
          )}
          items={[
            ...checkpoints
              .filter((c) => c.step < w.head)
              .map((c) => ({ label: c.label, hint: `step ${c.step}`, icon: <Flag size={13} />, onSelect: () => setRewindTarget({ step: c.step, label: c.label }) })),
            ...(checkpoints.some((c) => c.step < w.head) ? (['separator'] as const) : []),
            { label: 'Start of the world', hint: 'step 0', icon: <History size={13} />, onSelect: () => setRewindTarget({ step: 0, label: 'the start' }) },
          ]}
        />
        <IconButton label={playing ? 'Pause' : 'Play'} shortcut="Space" icon={playing ? <Pause size={15} /> : <Play size={15} />} active={playing} disabled={blocked} onClick={() => s.setPlaying(!playing)} />
        <IconButton label="Advance one step" shortcut="→" icon={<StepForward size={15} />} disabled={blocked || playing} onClick={() => s.step(1)} />
        <IconButton label="Advance ten steps" shortcut="⇧→" icon={<ChevronsRight size={15} />} disabled={blocked || playing} onClick={() => s.step(10)} />
        <Segmented
          label="Playback speed"
          value={String(speed)}
          onChange={(v) => s.setSpeed(Number(v))}
          options={[1, 2, 4, 8, 16].map((n) => ({ value: String(n), label: `${n}×`, title: `${n} steps per second` }))}
        />
      </div>

      <div className="controls-step" aria-live="polite">
        <span className="step-label">Step</span>
        <span className="step-num">{w.step}</span>
        {w.readOnly && (
          <>
            <span className="muted">of {w.head}</span>
            <Button size="sm" variant="ghost" onClick={() => s.setViewStep(null)}>
              Return to head
            </Button>
          </>
        )}
        {w.state && <span className="step-stat">pop {fmt(totalPopulation(w.state))}</span>}
      </div>

      <div className="controls-group">
        <Button size="sm" icon={<Flag size={13} />} onClick={() => setCpOpen(true)} title="Save a checkpoint at the displayed step (C)">
          Checkpoint
        </Button>
        <Button size="sm" variant="primary" icon={<GitBranch size={13} />} onClick={() => setBranchOpen(true)} title="Create an alternate timeline from the displayed step (B)">
          Branch from {w.step}
        </Button>
      </div>

      <ConfirmDialog
        open={rewindTarget !== null}
        onClose={() => setRewindTarget(null)}
        danger
        title={`Reset “${w.branch.name}” to ${rewindTarget?.label ?? ''}?`}
        confirmLabel={`Reset to step ${rewindTarget?.step ?? 0}`}
        body={
          <p>
            Steps {(rewindTarget?.step ?? 0) + 1}–{w.head} on this branch, and any rule changes or interventions made after step {rewindTarget?.step}, will be discarded. Other branches are not affected. To keep this future, branch instead.
          </p>
        }
        onConfirm={() => rewindTarget && s.rewindTo(rewindTarget.step)}
      />
      <PromptDialog open={cpOpen} onClose={() => setCpOpen(false)} title={`Checkpoint at step ${w.step}`} label="Label" initial={`Step ${w.step}`} confirmLabel="Save checkpoint" onSubmit={(v) => s.addCheckpoint(v)} />
      <PromptDialog
        open={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={`Branch from step ${w.step}`}
        label="Branch name"
        initial={`What if… (${w.step})`}
        confirmLabel="Create branch"
        hint={<>The new branch shares history up to step {w.step}, then evolves independently. Change a rule or value on it to explore an alternative.</>}
        onSubmit={(v) => s.branchFrom(w.step, v)}
      />
    </div>
  )
}

function Lanes({ w }: { w: WorldView }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const timelines = useApp((s) => s.timelines)
  const [hover, setHover] = useState<{ branch: string; step: number } | null>(null)
  const [renaming, setRenaming] = useState<Branch | null>(null)
  const [deleting, setDeleting] = useState<Branch | null>(null)
  const branches = orderLanes(w.project.branches)
  const maxHead = Math.max(...branches.map((b) => b.headStep), 10)
  const avail = Math.max(200, width - LABEL_W - 24)
  const px = Math.max(3, Math.min(28, avail / (maxHead + 3)))
  const trackW = Math.max(avail, (maxHead + 3) * px)
  const x = (s: number) => 10 + s * px
  const laneOf = new Map(branches.map((b, i) => [b.id, i]))
  const s = appStore.getState()

  const stepAt = (e: React.MouseEvent, b: Branch) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    const step = Math.round((e.clientX - r.left - 10) / px)
    return Math.max(b.forkStep === 0 && !b.parentId ? 0 : 0, Math.min(b.headStep, step))
  }

  return (
    <div className="lanes" ref={ref}>
      <div className="lanes-labels" style={{ width: LABEL_W }}>
        {branches.map((b) => (
          <div key={b.id} className={`lane-label ${b.id === w.branch.id ? 'is-active' : ''}`} style={{ height: LANE_H }}>
            <button type="button" className="lane-name" onClick={() => s.switchBranch(b.id)} aria-current={b.id === w.branch.id} title={b.parentId ? `Forked from ${w.project.branches.find((p) => p.id === b.parentId)?.name ?? 'a deleted branch'} at step ${b.forkStep}` : 'Root timeline'}>
              <span className="lane-dot" style={{ background: b.color }} />
              <span className="lane-text">{b.name}</span>
              <span className="lane-head mono">{b.headStep}</span>
            </button>
            <Menu
              label={`${b.name} actions`}
              align="left"
              trigger={(p) => (
                <button {...p} type="button" className="icon-btn lane-more" aria-label={`${b.name} actions`}>
                  <MoreHorizontal size={13} />
                </button>
              )}
              items={[
                { label: 'Switch to', onSelect: () => s.switchBranch(b.id), disabled: b.id === w.branch.id },
                { label: 'Rename…', onSelect: () => setRenaming(b) },
                {
                  label: 'Add to comparison',
                  onSelect: () => {
                    s.setCompare([...new Set([...appStore.getState().compareIds, b.id])])
                    s.setView('compare')
                  },
                },
                'separator',
                { label: 'Delete branch…', danger: true, disabled: w.project.branches.length <= 1, onSelect: () => setDeleting(b) },
              ]}
            />
          </div>
        ))}
      </div>
      <div className="lanes-track">
        <svg width={trackW} height={branches.length * LANE_H + 18} role="group" aria-label="Branch timelines">
          {/* step ruler */}
          {Array.from({ length: Math.floor(maxHead / 5) + 2 }, (_, i) => i * 5).map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={branches.length * LANE_H} className="ruler-line" />
              <text x={x(t)} y={branches.length * LANE_H + 13} className="ruler-text" textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
          {branches.map((b, i) => {
            const y = i * LANE_H + LANE_H / 2
            const active = b.id === w.branch.id
            const tl = timelines[b.id]
            const parentLane = b.parentId ? laneOf.get(b.parentId) : undefined
            return (
              <g key={b.id} className={`lane ${active ? 'is-active' : ''}`}>
                {active && <rect x={0} y={i * LANE_H} width={trackW} height={LANE_H} className="lane-bg" />}
                {parentLane !== undefined && (
                  <path d={`M${x(b.forkStep)},${parentLane * LANE_H + LANE_H / 2} C${x(b.forkStep) + 10},${parentLane * LANE_H + LANE_H / 2} ${x(b.forkStep) - 4},${y} ${x(b.forkStep) + 8},${y}`} fill="none" stroke={b.color} strokeOpacity={0.6} strokeWidth={1.2} />
                )}
                {b.forkStep > 0 && parentLane === undefined && <line x1={x(0)} x2={x(b.forkStep)} y1={y} y2={y} stroke={b.color} strokeOpacity={0.25} strokeDasharray="2 3" />}
                <line x1={x(b.forkStep)} x2={x(b.headStep)} y1={y} y2={y} stroke={b.color} strokeWidth={active ? 2.2 : 1.4} strokeOpacity={active ? 1 : 0.7} />
                {tl &&
                  tl.events.map((evs, step) => {
                    if (step <= b.forkStep && b.parentId) return null
                    const worst = evs.reduce((m, e) => Math.max(m, e.severity === 'critical' ? 3 : e.severity === 'warning' ? 2 : 0), 0)
                    if (!worst) return null
                    return <rect key={step} x={x(step) - 1} y={y - (worst === 3 ? 7 : 5)} width={2} height={worst === 3 ? 4 : 3} fill={worst === 3 ? 'var(--crit)' : 'var(--warn)'} />
                  })}
                {b.checkpoints.map((c) => (
                  <g key={c.id} transform={`translate(${x(c.step)},${y})`} className="cp">
                    <title>{`${c.label} · step ${c.step}`}</title>
                    <rect x={-4} y={-4} width={8} height={8} transform="rotate(45)" fill="var(--bg-1)" stroke={b.color} strokeWidth={1.4} />
                  </g>
                ))}
                <circle cx={x(b.headStep)} cy={y} r={active ? 4 : 3} fill={b.color} />
                <rect
                  x={0}
                  y={i * LANE_H}
                  width={trackW}
                  height={LANE_H}
                  fill="transparent"
                  className="lane-hit"
                  onMouseMove={(e) => setHover({ branch: b.id, step: stepAt(e, b) })}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    const step = stepAt(e, b)
                    if (!active) s.switchBranch(b.id)
                    s.setViewStep(step)
                  }}
                />
              </g>
            )
          })}
          {/* displayed-step cursor on the active lane */}
          <line x1={x(w.step)} x2={x(w.step)} y1={0} y2={branches.length * LANE_H} className="cursor-line" />
          {hover && (
            <g pointerEvents="none">
              <line x1={x(hover.step)} x2={x(hover.step)} y1={(laneOf.get(hover.branch) ?? 0) * LANE_H} y2={((laneOf.get(hover.branch) ?? 0) + 1) * LANE_H} className="hover-line" />
              <text x={x(hover.step) + 6} y={(laneOf.get(hover.branch) ?? 0) * LANE_H + 10} className="hover-text">
                {hover.step} · {timelines[hover.branch]?.events[hover.step]?.filter((e) => e.severity !== 'info').length ?? 0} notable
              </text>
            </g>
          )}
        </svg>
      </div>
      <PromptDialog open={renaming !== null} onClose={() => setRenaming(null)} title="Rename branch" label="Name" initial={renaming?.name ?? ''} confirmLabel="Rename" onSubmit={(v) => renaming && s.renameBranch(renaming.id, v)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        danger
        title={`Delete “${deleting?.name}”?`}
        confirmLabel="Delete branch"
        body={<p>This branch’s history and inputs will be removed. Branches forked from it keep their own copies and stay intact.</p>}
        onConfirm={() => deleting && s.deleteBranch(deleting.id)}
      />
    </div>
  )
}

/** Depth-first so children sit under their parent. */
function orderLanes(branches: Branch[]): Branch[] {
  const ids = new Set(branches.map((b) => b.id))
  const kids = new Map<string | null, Branch[]>()
  for (const b of branches) {
    const p = b.parentId && ids.has(b.parentId) ? b.parentId : null
    kids.set(p, [...(kids.get(p) ?? []), b])
  }
  const out: Branch[] = []
  const walk = (p: string | null) => {
    for (const b of (kids.get(p) ?? []).sort((a, c) => a.createdAt - c.createdAt)) {
      out.push(b)
      walk(b.id)
    }
  }
  walk(null)
  return out
}
