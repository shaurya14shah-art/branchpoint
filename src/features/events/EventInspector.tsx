import { ArrowRight } from 'lucide-react'
import type { Change, SimEvent } from '../../engine/model'
import { fmt } from '../../engine/format'
import { ruleImpl } from '../../engine/rules/registry'
import { modelAt } from '../../engine/history/branch'
import { indexModel, type ModelIndex } from '../../engine/modelIndex'
import type { WorldView } from '../../state/useWorld'
import { appStore, useApp } from '../../state/store'
import { Badge, Button, Section } from '../../components/ui'
import { EntityLink, kindOf } from '../world-editor/common'

export function targetLabel(c: Change, ix: ModelIndex): string {
  const t = c.target
  switch (t.kind) {
    case 'stock':
      return `${ix.name(t.resourceId)} @ ${ix.name(t.locationId)}`
    case 'population':
      return `Population @ ${ix.name(t.locationId)}`
    case 'stability':
      return `${ix.name(t.factionId)} stability`
    case 'relation':
      return `${ix.name(t.a)} ↔ ${ix.name(t.b)}`
    case 'routeActive':
      return `${ix.name(t.routeId)} open`
    case 'owner':
      return `Owner of ${ix.name(t.locationId)}`
    case 'modifier':
      return `${ix.name(t.resourceId)} output @ ${ix.name(t.locationId)}`
    case 'tech':
      return `${ix.name(t.factionId)} innovation`
    case 'exhaustion':
      return `${ix.name(t.factionId)} war weariness`
    case 'plague':
      return `Plague @ ${ix.name(t.locationId)} (steps left)`
    case 'war':
      return `War ${ix.name(t.a)} ↔ ${ix.name(t.b)}`
    case 'alliance':
      return `Alliance ${ix.name(t.a)} ↔ ${ix.name(t.b)}`
    case 'ruler':
      return `Ruler of ${ix.name(t.factionId)}`
  }
}

function val(v: Change['before'], ix: ModelIndex) {
  if (typeof v === 'number') return fmt(v)
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  return ix.has(v) ? ix.name(v) : v
}

const TONE = { info: 'neutral', notable: 'notable', warning: 'warn', critical: 'crit' } as const

/** Trace an event back to its cause: the rule (with its parameters at that step) and exact changes. */
export function EventInspector({ w, id, branchId }: { w: WorldView; id: string; branchId: string }) {
  const project = useApp((s) => s.project)
  const timelines = useApp((s) => s.timelines)
  const branch = project?.branches.find((b) => b.id === branchId)
  const tl = timelines[branchId]
  const step = Number(id.split('.')[0])
  const e: SimEvent | undefined = tl?.events[step]?.find((x) => x.id === id)
  if (!branch || !e) return <p className="muted">This event is no longer in the branch’s history (it may have been rewound).</p>
  // The model that produced step s is the one in force at s − 1.
  const model = modelAt(branch, Math.max(0, e.step - 1))
  const ix = indexModel(model)
  const rule = e.ruleId ? ix.rules.get(e.ruleId) : undefined
  const sched = e.scheduledEventId ? model.events.find((x) => x.id === e.scheduledEventId) : undefined
  const iv = e.interventionId ? branch.interventions.find((x) => x.id === e.interventionId) : undefined
  const delta = (c: Change) => (typeof c.before === 'number' && typeof c.after === 'number' ? c.after - c.before : null)

  return (
    <>
      <Section title="Event">
        <div className="event-head">
          <Badge tone={TONE[e.severity]}>{e.kind}</Badge>
          <span className="muted small">
            step {e.step} · {branch.name}
          </span>
        </div>
        <p className="event-message">{e.message}</p>
        {e.detail && (
          <p className="event-detail">
            <span className="trace-kind">Why</span> {e.detail}
          </p>
        )}
        {branch.id === w.branch.id && step !== w.step && (
          <Button size="sm" variant="ghost" onClick={() => appStore.getState().setViewStep(step)}>
            Show world at step {step}
          </Button>
        )}
      </Section>

      <Section title="Cause">
        {rule ? (
          <div className="trace">
            <div className="trace-kind">Rule</div>
            <button type="button" className="entity-link strong" onClick={() => appStore.getState().select({ kind: 'rule', id: rule.id })}>
              {rule.name}
            </button>
            <p className="rule-desc">{ruleImpl(rule).describe(rule, ix)}</p>
            <p className="muted small">Parameters as they were at step {e.step} on this branch (priority {rule.priority}).</p>
          </div>
        ) : sched ? (
          <div className="trace">
            <div className="trace-kind">Scheduled event</div>
            <button type="button" className="entity-link strong" onClick={() => appStore.getState().select({ kind: 'scheduled', id: sched.id })}>
              {sched.name}
            </button>
            <p className="muted small">Fires at step {sched.step}.</p>
          </div>
        ) : iv ? (
          <div className="trace">
            <div className="trace-kind">Intervention</div>
            <strong>{iv.label}</strong>
            <p className="muted small">Recorded by you at step {iv.step} on “{branch.name}”.</p>
          </div>
        ) : e.kind === 'modifier-expired' ? (
          <p className="muted">A temporary modifier reached the end of its duration.</p>
        ) : e.kind === 'revision' ? (
          <p className="muted">A model revision on this branch added or removed entities.</p>
        ) : (
          <p className="muted">Engine bookkeeping.</p>
        )}
      </Section>

      <Section title={`Changes (${e.changes.length})`}>
        {e.changes.length === 0 ? (
          <p className="muted">No state changed — this records why something did <em>not</em> happen.</p>
        ) : (
          <table className="table changes">
            <tbody>
              {e.changes.map((c, i) => {
                const d = delta(c)
                return (
                  <tr key={i}>
                    <td>
                      {targetLabel(c, ix)}
                      {c.note && <div className="muted small">{c.note}</div>}
                    </td>
                    <td className="num mono">{val(c.before, ix)}</td>
                    <td className="arrow">
                      <ArrowRight size={11} />
                    </td>
                    <td className="num mono">{val(c.after, ix)}</td>
                    <td className={`num mono ${d === null ? '' : d > 0 ? 'pos' : d < 0 ? 'neg' : ''}`}>{d === null || d === 0 ? '' : d > 0 ? `+${fmt(d)}` : fmt(d)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Entities">
        <span className="link-list">
          {e.entityIds.map((eid) => {
            const k = kindOf(eid, w)
            return k ? <EntityLink key={eid} id={eid} w={w} kind={k} /> : <span key={eid} className="muted">{eid}</span>
          })}
        </span>
      </Section>
    </>
  )
}
