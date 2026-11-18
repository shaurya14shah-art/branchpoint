import { useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import type { EventKind, SimEvent } from '../../engine/model'
import { headModel } from '../../engine/history/branch'
import { indexModel } from '../../engine/modelIndex'
import { useWorld } from '../../state/useWorld'
import { appStore, useApp } from '../../state/store'
import { Button, EmptyState, Field, NumberInput, Select } from '../../components/ui'

const SEVERITY_RANK = { info: 0, notable: 1, warning: 2, critical: 3 } as const
const KINDS: EventKind[] = ['production', 'consumption', 'shortage', 'trade', 'trade-blocked', 'growth', 'decline', 'decay', 'threshold', 'scheduled', 'intervention', 'modifier-expired', 'revision', 'decision', 'war', 'peace', 'alliance', 'battle', 'conquest', 'plague', 'migration', 'fortune', 'succession', 'innovation']
const TONE: Record<SimEvent['severity'], string> = { info: 'var(--text-4)', notable: 'var(--notable)', warning: 'var(--warn)', critical: 'var(--crit)' }

export function EventsView() {
  const w = useWorld()
  const timelines = useApp((s) => s.timelines)
  const selection = useApp((s) => s.selection)
  const [branchId, setBranchId] = useState<string>('')
  const [entity, setEntity] = useState('')
  const [rule, setRule] = useState('')
  const [kind, setKind] = useState<EventKind | ''>('')
  const [minSev, setMinSev] = useState<'0' | '1' | '2' | '3'>('1')
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState<number | null>(null)
  const [limit, setLimit] = useState(300)

  const bid = branchId || w?.branch.id || ''
  const branch = w?.project.branches.find((b) => b.id === bid)
  const tl = timelines[bid]
  const model = branch ? headModel(branch) : null
  const ix = model ? indexModel(model) : null

  const filtered = useMemo(() => {
    if (!tl) return []
    const hi = to ?? tl.events.length - 1
    const out: SimEvent[] = []
    for (let s = hi; s >= from; s--)
      for (const e of [...(tl.events[s] ?? [])].reverse()) {
        if (SEVERITY_RANK[e.severity] < Number(minSev)) continue
        if (entity && !e.entityIds.includes(entity)) continue
        if (rule && e.ruleId !== rule) continue
        if (kind && e.kind !== kind) continue
        out.push(e)
      }
    return out
  }, [tl, from, to, minSev, entity, rule, kind])

  if (!w || !model || !ix) return null
  const entities = [
    ...model.factions.map((x) => ({ value: x.id, label: `Faction · ${x.name}` })),
    ...model.locations.map((x) => ({ value: x.id, label: `Settlement · ${x.name}` })),
    ...model.routes.map((x) => ({ value: x.id, label: `Route · ${x.name}` })),
    ...model.resources.map((x) => ({ value: x.id, label: `Resource · ${x.name}` })),
  ]
  const reset = () => {
    setEntity('')
    setRule('')
    setKind('')
    setMinSev('0')
    setFrom(0)
    setTo(null)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Event log</h1>
          <p className="muted">Every change the engine made, with the rule or event responsible. This log — not any summary — is the record of what happened.</p>
        </div>
      </header>
      <div className="filters" role="group" aria-label="Event filters">
        <Field label="Branch">{(id) => <Select id={id} value={bid} options={w.project.branches.map((b) => ({ value: b.id, label: b.name }))} onChange={setBranchId} />}</Field>
        <Field label="Entity">{(id) => <Select id={id} value={entity} options={[{ value: '', label: 'Any' }, ...entities]} onChange={setEntity} />}</Field>
        <Field label="Rule">{(id) => <Select id={id} value={rule} options={[{ value: '', label: 'Any' }, ...model.rules.map((r) => ({ value: r.id, label: r.name }))]} onChange={setRule} />}</Field>
        <Field label="Kind">{(id) => <Select<EventKind | ''> id={id} value={kind} options={[{ value: '', label: 'Any' }, ...KINDS.map((k) => ({ value: k, label: k }))]} onChange={setKind} />}</Field>
        <Field label="Severity">
          {(id) => (
            <Select
              id={id}
              value={minSev}
              options={[
                { value: '0', label: 'All, incl. routine' },
                { value: '1', label: 'Notable and above' },
                { value: '2', label: 'Warnings and above' },
                { value: '3', label: 'Critical only' },
              ]}
              onChange={setMinSev}
            />
          )}
        </Field>
        <Field label="From step">{(id) => <NumberInput id={id} min={0} max={100000} value={from} onCommit={(v) => setFrom(Math.round(v))} />}</Field>
        <Field label="To step">{(id) => <NumberInput id={id} min={0} max={100000} value={to ?? (tl ? tl.events.length - 1 : 0)} onCommit={(v) => setTo(Math.round(v))} />}</Field>
        <Button variant="ghost" size="sm" onClick={reset}>
          Clear
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<ScrollText size={20} />} title={tl && tl.events.length > 1 ? 'No events match these filters' : 'No history yet'}>
          {tl && tl.events.length > 1 ? 'Loosen the filters — routine production and trade are hidden by the default severity.' : 'Advance the simulation (→) to record events.'}
        </EmptyState>
      ) : (
        <>
          <p className="muted small">{filtered.length.toLocaleString()} events</p>
          <ol className="log">
            {filtered.slice(0, limit).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className={`log-row ${selection?.kind === 'event' && selection.id === e.id && selection.branchId === bid ? 'is-selected' : ''}`}
                  onClick={() => appStore.getState().select({ kind: 'event', id: e.id, branchId: bid })}
                >
                  <span className="event-dot" style={{ background: TONE[e.severity] }} />
                  <span className="log-step mono">{e.step}</span>
                  <span className="log-kind">{e.kind}</span>
                  <span className="log-msg">{e.message}</span>
                  <span className="log-rule">{e.ruleId ? ix.name(e.ruleId) : e.scheduledEventId ? ix.name(e.scheduledEventId) : e.interventionId ? 'intervention' : ''}</span>
                </button>
              </li>
            ))}
          </ol>
          {filtered.length > limit && (
            <Button variant="ghost" onClick={() => setLimit(limit + 500)}>
              Show {Math.min(500, filtered.length - limit)} more
            </Button>
          )}
        </>
      )}
    </div>
  )
}
