import { useMemo, useState } from 'react'
import { GitBranch, GitCompareArrows } from 'lucide-react'
import type { WorldModel } from '../../engine/model'
import { headModel, type Branch } from '../../engine/history/branch'
import { divergence, type ModelChange } from '../../engine/history/diff'
import { divergentEvents, finalStateRows, milestones, series, type SeriesMetric } from '../../engine/compare'
import { effectText, fmt } from '../../engine/format'
import { indexModel } from '../../engine/modelIndex'
import { useWorld } from '../../state/useWorld'
import { appStore, useApp } from '../../state/store'
import { Badge, Button, EmptyState, Field, Section, Select, Toggle } from '../../components/ui'
import { LineChart } from '../../components/charts'
import { AiCompareSummary } from '../ai/AiCompareSummary'

type MetricKey = string

function metricOptions(m: WorldModel): { value: MetricKey; label: string; metric: SeriesMetric }[] {
  const out: { value: MetricKey; label: string; metric: SeriesMetric }[] = [{ value: 'pop', label: 'Total population', metric: { kind: 'population' } }]
  for (const r of m.resources) out.push({ value: `stock:${r.id}`, label: `Total ${r.name}`, metric: { kind: 'stock', resourceId: r.id } })
  for (const f of m.factions) {
    out.push({ value: `stab:${f.id}`, label: `${f.name} · stability`, metric: { kind: 'stability', factionId: f.id } })
    out.push({ value: `fpop:${f.id}`, label: `${f.name} · population`, metric: { kind: 'factionPopulation', factionId: f.id } })
    out.push({ value: `tech:${f.id}`, label: `${f.name} · innovation`, metric: { kind: 'tech', factionId: f.id } })
    out.push({ value: `held:${f.id}`, label: `${f.name} · settlements held`, metric: { kind: 'settlements', factionId: f.id } })
    for (const r of m.resources) out.push({ value: `fs:${f.id}:${r.id}`, label: `${f.name} · ${r.name}`, metric: { kind: 'factionStock', factionId: f.id, resourceId: r.id } })
  }
  for (let i = 0; i < m.factions.length; i++)
    for (let j = i + 1; j < m.factions.length; j++) {
      const a = m.factions[i]!
      const b = m.factions[j]!
      out.push({ value: `rel:${a.id}:${b.id}`, label: `Relations ${a.name} ↔ ${b.name}`, metric: { kind: 'relation', a: a.id, b: b.id } })
    }
  return out
}

function describeChange(c: ModelChange, m: WorldModel): string {
  const ix = indexModel(m)
  const what = `${c.kind} “${c.name}”`
  if (c.change !== 'changed') return `${c.change === 'added' ? 'Added' : 'Removed'} ${what}`
  const fields = c.fields.map((f) => {
    const show = (v: unknown) => (typeof v === 'number' ? fmt(v) : typeof v === 'string' ? ix.name(v) : Array.isArray(v) ? `[${v.length} items]` : JSON.stringify(v))
    return `${f.field}: ${show(f.before)} → ${show(f.after)}`
  })
  return `Changed ${what} — ${fields.join('; ')}`
}

export function CompareView() {
  const w = useWorld()
  const timelines = useApp((s) => s.timelines)
  const compareIds = useApp((s) => s.compareIds)
  const [metric, setMetric] = useState<MetricKey>('pop')
  const [onlyDiff, setOnlyDiff] = useState(true)

  const branches = useMemo(() => (w ? compareIds.map((id) => w.project.branches.find((b) => b.id === id)).filter((b): b is Branch => !!b) : []), [w, compareIds])
  const ready = branches.filter((b) => timelines[b.id])
  const ref = ready[0]
  const refModel = ref ? headModel(ref) : w?.model

  const options = useMemo(() => (refModel ? metricOptions(refModel) : []), [refModel])
  const chosen = options.find((o) => o.value === metric) ?? options[0]

  const analysis = useMemo(() => {
    if (!ref || !refModel || ready.length < 2) return null
    const refTl = timelines[ref.id]!
    const others = ready.slice(1).map((b) => {
      const tl = timelines[b.id]!
      const d = divergence(ref, b)
      return { b, tl, d, events: divergentEvents(refTl, tl, d.step ?? Infinity) }
    })
    const rows = finalStateRows(refModel, ready.map((b) => timelines[b.id]!.states.at(-1)!))
    const ms = ready.map((b) => ({ b, list: milestones(timelines[b.id]!, headModel(b)) }))
    return { refTl, others, rows, ms }
  }, [ref, refModel, ready, timelines])

  if (!w || !refModel) return null
  const toggle = (id: string) => appStore.getState().setCompare(compareIds.includes(id) ? compareIds.filter((x) => x !== id) : [...compareIds, id])

  const picker = (
    <div className="chip-row" role="group" aria-label="Branches to compare">
      {w.project.branches.map((b) => (
        <button key={b.id} type="button" className={`chip ${compareIds.includes(b.id) ? 'is-on' : ''}`} aria-pressed={compareIds.includes(b.id)} onClick={() => toggle(b.id)} disabled={!compareIds.includes(b.id) && compareIds.length >= 4}>
          <span className="lane-dot" style={{ background: b.color }} />
          {b.name}
          <span className="mono muted">{b.headStep}</span>
        </button>
      ))}
    </div>
  )

  if (!analysis || !ref) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1>Compare timelines</h1>
            <p className="muted">Pick two to four branches. The first one is the reference.</p>
          </div>
        </header>
        {picker}
        <EmptyState
          icon={<GitCompareArrows size={20} />}
          title={w.project.branches.length < 2 ? 'Only one timeline so far' : 'Select at least two branches'}
          action={
            w.project.branches.length < 2 ? (
              <Button variant="primary" icon={<GitBranch size={14} />} onClick={() => appStore.getState().branchFrom(w.head)}>
                Branch from step {w.head}
              </Button>
            ) : undefined
          }
        >
          {w.project.branches.length < 2 ? 'Create a branch, change a rule or value on it, and advance both. Comparisons are drawn only from simulated history.' : 'Use the chips above to choose which timelines to compare.'}
        </EmptyState>
      </div>
    )
  }

  const markers = analysis.others.filter((o) => o.d.step !== null).map((o) => ({ step: o.d.step!, label: `${o.b.name} diverges`, color: o.b.color }))
  const rows = onlyDiff ? analysis.rows.filter((r) => r.spread !== 0) : analysis.rows
  const groups = [...new Set(rows.map((r) => r.group))]

  return (
    <div className="page compare">
      <header className="page-head">
        <div>
          <h1>Compare timelines</h1>
          <p className="muted">All numbers are read from replayed history. Reference: <strong style={{ color: ref.color }}>{ref.name}</strong>.</p>
        </div>
      </header>
      {picker}

      <Section title="Why they differ">
        {analysis.others.map(({ b, d }) => (
          <div key={b.id} className="why">
            <div className="why-head">
              <span className="lane-dot" style={{ background: b.color }} />
              <strong>{b.name}</strong>
              {d.step === null ? <Badge>identical inputs</Badge> : <Badge tone="notable">diverges at step {d.step}</Badge>}
            </div>
            {d.step === null ? (
              <p className="muted">Same model and interventions up to step {Math.min(ref.headStep, b.headStep)} — any difference is only in how far each has been run.</p>
            ) : (
              <ul className="why-list">
                {d.modelChanges.map((c, i) => (
                  <li key={i}>{describeChange(c, refModel)}</li>
                ))}
                {d.interventionsOnlyB.map((iv) => (
                  <li key={iv.id}>
                    Intervention on {b.name} at step {iv.step}: {iv.label} ({iv.effects.map((e) => effectText(e, indexModel(headModel(b)))).join('; ')})
                  </li>
                ))}
                {d.interventionsOnlyA.map((iv) => (
                  <li key={iv.id}>
                    Intervention only on {ref.name} at step {iv.step}: {iv.label}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small">Because the engine is deterministic, states are identical before this step; every later difference follows from these inputs.</p>
          </div>
        ))}
      </Section>

      <Section
        title="Over time"
        actions={
          <Field label="Metric" inline>
            {(id) => <Select id={id} value={chosen?.value ?? 'pop'} options={options.map((o) => ({ value: o.value, label: o.label }))} onChange={setMetric} />}
          </Field>
        }
      >
        {chosen && <LineChart yLabel={chosen.label} series={ready.map((b) => ({ id: b.id, label: b.name, color: b.color, values: series(timelines[b.id]!, chosen.metric) }))} markers={markers} />}
      </Section>

      <Section title="Final state" actions={<label className="inline-toggle"><Toggle label="Only differences" checked={onlyDiff} onChange={setOnlyDiff} /> Only differences</label>}>
        {rows.length === 0 ? (
          <p className="muted">No differences in the final states.</p>
        ) : (
          <table className="table final">
            <thead>
              <tr>
                <th />
                {ready.map((b, i) => (
                  <th key={b.id} className="num">
                    <span className="lane-dot" style={{ background: b.color }} /> {b.name}
                    <div className="muted small">step {b.headStep}{i === 0 ? ' · ref' : ''}</div>
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g}>
                <tr className="group-row">
                  <th colSpan={ready.length + 1}>{g}</th>
                </tr>
                {rows
                  .filter((r) => r.group === g)
                  .map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      {r.values.map((v, i) => {
                        const d = v - (r.values[0] ?? 0)
                        return (
                          <td key={i} className="num mono">
                            {fmt(v)}
                            {i > 0 && d !== 0 && <span className={d > 0 ? 'pos' : 'neg'}> {d > 0 ? '+' : ''}{fmt(d)}</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        )}
        {ready.some((b) => b.headStep !== ref.headStep) && <p className="note warn">Branches are at different steps; final states are compared at each branch’s own head.</p>}
      </Section>

      <Section title="Milestones">
        <div className="milestones" style={{ gridTemplateColumns: `repeat(${ready.length}, minmax(0, 1fr))` }}>
          {analysis.ms.map(({ b, list }) => (
            <div key={b.id}>
              <div className="ms-head">
                <span className="lane-dot" style={{ background: b.color }} /> {b.name}
              </div>
              {list.length === 0 ? (
                <p className="muted small">None yet.</p>
              ) : (
                <ol className="ms-list">
                  {list.map((m, i) => (
                    <li key={i}>
                      <span className="mono muted">{m.step}</span>
                      {m.eventId ? (
                        <button type="button" className="entity-link" onClick={() => appStore.getState().select({ kind: 'event', id: m.eventId!, branchId: b.id })}>
                          {m.label}
                        </button>
                      ) : (
                        <span>{m.label}</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </Section>

      {analysis.others.map(({ b, events }) => (
        <Section key={b.id} title={<>Events that differ · {ref.name} vs {b.name}</>}>
          {events.length === 0 ? (
            <p className="muted">No notable events differ{b.headStep !== ref.headStep ? ' over the steps both branches have reached' : ''}.</p>
          ) : (
            <table className="table diff-events">
              <thead>
                <tr>
                  <th className="num">Step</th>
                  <th>Only in {ref.name}</th>
                  <th>Only in {b.name}</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 60).map((d) => (
                  <tr key={d.step}>
                    <td className="num mono">{d.step}</td>
                    <td>
                      {d.onlyA.map((e) => (
                        <button key={e.id} type="button" className={`diff-ev sev-${e.severity}`} onClick={() => appStore.getState().select({ kind: 'event', id: e.id, branchId: ref.id })}>
                          {e.message}
                        </button>
                      ))}
                    </td>
                    <td>
                      {d.onlyB.map((e) => (
                        <button key={e.id} type="button" className={`diff-ev sev-${e.severity}`} onClick={() => appStore.getState().select({ kind: 'event', id: e.id, branchId: b.id })}>
                          {e.message}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {events.length > 60 && <p className="muted small">Showing the first 60 differing steps of {events.length}.</p>}
        </Section>
      ))}

      <AiCompareSummary reference={ref} others={analysis.others.map((o) => o.b)} rows={analysis.rows} />
    </div>
  )
}
