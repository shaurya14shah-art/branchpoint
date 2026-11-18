import { useMemo } from 'react'
import { CalendarClock, Plus } from 'lucide-react'
import type { RuleType } from '../../engine/model'
import { RULES, RULE_TYPES, orderRules, ruleImpl } from '../../engine/rules/registry'
import { effectText } from '../../engine/format'
import { useWorld } from '../../state/useWorld'
import { appStore, useApp } from '../../state/store'
import { newId } from '../../state/ids'
import { Badge, Button, EmptyState, Toggle } from '../../components/ui'
import { Menu } from '../../components/Menu'
import { editor, replaceById } from '../world-editor/edit'
import { ReadOnlyBanner } from '../world-editor/common'
import { ruleTemplate } from './editors'

export function RulesView() {
  const w = useWorld()
  const sel = useApp((s) => s.selection)
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const e of w?.timeline?.events.flat() ?? []) if (e.ruleId) c.set(e.ruleId, (c.get(e.ruleId) ?? 0) + 1)
    return c
  }, [w?.timeline])
  if (!w) return null
  const ed = editor(w)
  const ordered = orderRules(w.model.rules)

  const addRule = (type: RuleType) => {
    const id = newId('rule')
    if (ed.update((m) => ({ ...m, rules: [...m.rules, ruleTemplate(type, m, id)] }), `Add ${RULES[type].label.toLowerCase()} rule`)) appStore.getState().select({ kind: 'rule', id })
  }
  const addEvent = () => {
    const id = newId('ev')
    const step = w.head + 3
    if (ed.update((m) => ({ ...m, events: [...m.events, { id, name: 'New event', description: '', step, effects: [] }] }), 'Add scheduled event')) appStore.getState().select({ kind: 'scheduled', id })
  }

  return (
    <div className="page">
      <ReadOnlyBanner w={w} />
      <header className="page-head">
        <div>
          <h1>Rules</h1>
          <p className="muted">
            Each step runs scheduled events, then every enabled rule in this order. Rules are sequential: a rule sees the changes made by rules above it.
            {!ed.atStart && ed.canEdit && <> Edits apply to “{w.branch.name}” from step {w.head}.</>}
          </p>
        </div>
        <Menu
          label="Add rule"
          align="right"
          trigger={(p) => (
            <Button {...p} variant="primary" icon={<Plus size={14} />} disabled={!ed.canEdit}>
              Add rule
            </Button>
          )}
          items={RULE_TYPES.map((t) => ({ label: RULES[t].label, hint: RULES[t].summary, onSelect: () => addRule(t) }))}
        />
      </header>

      {ordered.length === 0 ? (
        <EmptyState title="No rules yet" action={<Button onClick={() => addRule('produce')}>Add a production rule</Button>}>
          Rules are what make the world change. Start with production and consumption of a staple resource.
        </EmptyState>
      ) : (
        <table className="table rules-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th className="num">Priority</th>
              <th>Rule</th>
              <th>What it does</th>
              <th className="num">Events</th>
              <th>On</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r, i) => (
              <tr key={r.id} className={`${sel?.kind === 'rule' && sel.id === r.id ? 'is-selected' : ''} ${r.enabled ? '' : 'is-disabled'}`} onClick={() => appStore.getState().select({ kind: 'rule', id: r.id })}>
                <td className="num muted">{i + 1}</td>
                <td className="num mono">{r.priority}</td>
                <td>
                  <button type="button" className="row-link" onClick={(e) => { e.stopPropagation(); appStore.getState().select({ kind: 'rule', id: r.id }) }}>
                    {r.name}
                  </button>
                  <div>
                    <Badge>{RULES[r.type].label}</Badge>
                  </div>
                </td>
                <td className="desc">{ruleImpl(r).describe(r, w.index)}</td>
                <td className="num mono">{counts.get(r.id) ?? 0}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <Toggle label={`Enable ${r.name}`} checked={r.enabled} disabled={!ed.canEdit} onChange={(enabled) => ed.update((m) => ({ ...m, rules: replaceById(m.rules, r.id, (x) => ({ ...x, enabled })) }), `${enabled ? 'Enable' : 'Disable'} “${r.name}”`)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <header className="page-head sub">
        <div>
          <h2>Scheduled events</h2>
          <p className="muted">Fixed-step shocks — droughts, discoveries, edicts. They fire before rules on their step.</p>
        </div>
        <Button icon={<CalendarClock size={14} />} disabled={!ed.canEdit} onClick={addEvent}>
          Schedule event
        </Button>
      </header>
      {w.model.events.length === 0 ? (
        <p className="muted">No scheduled events.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th className="num">Step</th>
              <th>Event</th>
              <th>Effects</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {[...w.model.events]
              .sort((a, b) => a.step - b.step)
              .map((ev) => {
                const fired = w.timeline?.events[ev.step]?.some((e) => e.scheduledEventId === ev.id)
                return (
                  <tr key={ev.id} className={sel?.kind === 'scheduled' && sel.id === ev.id ? 'is-selected' : ''} onClick={() => appStore.getState().select({ kind: 'scheduled', id: ev.id })}>
                    <td className="num mono">{ev.step}</td>
                    <td>
                      <button type="button" className="row-link" onClick={(e) => { e.stopPropagation(); appStore.getState().select({ kind: 'scheduled', id: ev.id }) }}>
                        {ev.name}
                      </button>
                    </td>
                    <td className="desc">{ev.effects.map((e) => effectText(e, w.index)).join('; ') || '—'}</td>
                    <td>{fired ? <Badge tone="crit">fired</Badge> : ev.step > w.head ? <Badge>upcoming</Badge> : <Badge tone="warn">missed</Badge>}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      )}
    </div>
  )
}
