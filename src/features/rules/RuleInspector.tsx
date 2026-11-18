import { useMemo } from 'react'
import { Copy } from 'lucide-react'
import type { Id, Rule, ScheduledEvent } from '../../engine/model'
import { RULES, orderRules, ruleImpl } from '../../engine/rules/registry'
import { RefChecker } from '../../engine/refs'
import { effectText } from '../../engine/format'
import type { WorldView } from '../../state/useWorld'
import { appStore } from '../../state/store'
import { newId } from '../../state/ids'
import { Badge, Button, Field, NumberInput, Section, TextInput, Toggle } from '../../components/ui'
import { editor, replaceById } from '../world-editor/edit'
import { EventRow } from '../world-editor/common'
import { EffectsEditor, RuleParams } from './editors'
import { DeleteEntity } from './DeleteEntity'

export function RuleInspector({ w, id }: { w: WorldView; id: Id }) {
  const rule = w.index.rules.get(id)
  const fired = useMemo(() => (w.timeline ? w.timeline.events.flat().filter((e) => e.ruleId === id) : []), [w.timeline, id])
  if (!rule) return <p className="muted">This rule does not exist at step {w.step}.</p>
  const ed = editor(w)
  const set = (patch: Partial<Rule>, note = `Edit rule “${rule.name}”`) => ed.update((m) => ({ ...m, rules: replaceById(m.rules, id, (r) => ({ ...r, ...patch }) as Rule) }), note)
  const order = orderRules(w.model.rules)
  const position = order.findIndex((r) => r.id === id) + 1
  const refs = new RefChecker(w.model)
  ruleImpl(rule).validate(rule, refs, 'rule')
  const lastFired = fired.at(-1)

  return (
    <>
      <Section title="Rule">
        <p className="rule-desc">{ruleImpl(rule).describe(rule, w.index)}</p>
        {refs.issues.map((i, k) => (
          <p key={k} className={`note ${i.severity === 'error' ? 'crit' : 'warn'}`}>
            {i.message}
          </p>
        ))}
        <Field label="Name">{(fid) => <TextInput id={fid} value={rule.name} disabled={!ed.canEdit} onCommit={(v) => v.trim() && set({ name: v.trim() }, 'Rename rule')} />}</Field>
        <Field label="Enabled" inline>{(fid) => <Toggle id={fid} label="Enabled" checked={rule.enabled} disabled={!ed.canEdit} onChange={(enabled) => set({ enabled }, `${enabled ? 'Enable' : 'Disable'} “${rule.name}”`)} />}</Field>
        <Field label="Priority" inline hint={`Runs #${position} of ${order.length} each step. Lower runs first; later rules see earlier changes.`}>
          {(fid) => <NumberInput id={fid} min={-1000} max={1000} value={rule.priority} disabled={!ed.canEdit} onCommit={(priority) => set({ priority: Math.round(priority) })} />}
        </Field>
      </Section>
      <Section title={<>Parameters <Badge>{RULES[rule.type].label}</Badge></>}>
        {!ed.atStart && ed.canEdit && <p className="note">Changes apply on “{w.branch.name}” from step {w.head} onward.</p>}
        <RuleParams rule={rule} model={w.model} disabled={!ed.canEdit} set={(p) => set(p)} />
      </Section>
      <Section title="Execution on this branch">
        <p className="muted small">
          {fired.length ? `${fired.length} events recorded; last at step ${lastFired?.step}.` : 'This rule has not changed anything yet.'}
        </p>
        {fired
          .filter((e) => e.step <= w.step)
          .slice(-5)
          .reverse()
          .map((e) => (
            <EventRow key={e.id} e={e} w={w} compact />
          ))}
      </Section>
      {ed.canEdit && (
        <div className="inspector-danger">
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy size={13} />}
            onClick={() => {
              const nid = newId('rule')
              if (ed.update((m) => ({ ...m, rules: [...m.rules, { ...rule, id: nid, name: `${rule.name} (copy)`.slice(0, 80) }] }), `Duplicate “${rule.name}”`))
                appStore.getState().select({ kind: 'rule', id: nid })
            }}
          >
            Duplicate
          </Button>
          <DeleteEntity w={w} what="rule" note={`Remove rule “${rule.name}”`} fn={(m) => ({ ...m, rules: m.rules.filter((r) => r.id !== id) })} />
        </div>
      )}
    </>
  )
}

export function ScheduledEventInspector({ w, id }: { w: WorldView; id: Id }) {
  const ev = w.model.events.find((e) => e.id === id)
  if (!ev) return <p className="muted">This event does not exist at step {w.step}.</p>
  const ed = editor(w)
  const set = (patch: Partial<ScheduledEvent>, note = `Edit event “${ev.name}”`) => ed.update((m) => ({ ...m, events: replaceById(m.events, id, (e) => ({ ...e, ...patch })) }), note)
  const firedEvent = w.timeline?.events[ev.step]?.find((e) => e.scheduledEventId === id)
  const past = ev.step <= w.head
  return (
    <>
      <Section title="Scheduled event">
        <p className="rule-desc">
          At step {ev.step}: {ev.effects.map((e) => effectText(e, w.index)).join('; ') || 'no effects'}.
        </p>
        <p className={`note ${past && !firedEvent ? 'warn' : ''}`}>
          {firedEvent ? `Fired at step ${ev.step} on this branch.` : past ? `Step ${ev.step} has passed on this branch without it firing (it was added or changed later).` : `Upcoming — ${ev.step - w.head} step${ev.step - w.head === 1 ? '' : 's'} away.`}
        </p>
        <Field label="Name">{(fid) => <TextInput id={fid} value={ev.name} disabled={!ed.canEdit} onCommit={(v) => v.trim() && set({ name: v.trim() }, 'Rename event')} />}</Field>
        <Field label="Fires at step" inline>{(fid) => <NumberInput id={fid} min={1} max={100000} value={ev.step} disabled={!ed.canEdit} onCommit={(step) => set({ step: Math.round(step) })} />}</Field>
        <Field label="Description">{(fid) => <TextInput id={fid} multiline maxLength={2000} value={ev.description} disabled={!ed.canEdit} onCommit={(description) => set({ description })} />}</Field>
      </Section>
      <Section title="Effects">
        <EffectsEditor value={ev.effects} model={w.model} disabled={!ed.canEdit} onChange={(effects) => set({ effects })} />
      </Section>
      {firedEvent && (
        <Section title="Recorded outcome">
          <EventRow e={firedEvent} w={w} compact />
        </Section>
      )}
      {ed.canEdit && (
        <div className="inspector-danger">
          <DeleteEntity w={w} what="event" note={`Remove event “${ev.name}”`} fn={(m) => ({ ...m, events: m.events.filter((e) => e.id !== id) })} />
        </div>
      )}
    </>
  )
}
