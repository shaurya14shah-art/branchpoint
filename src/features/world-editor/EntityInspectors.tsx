import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Id, LocationDef } from '../../engine/model'
import { relationKey } from '../../engine/model'
import { fmt, signed } from '../../engine/format'
import { factionLocations, factionPopulation, factionStock, totalPopulation, totalStock } from '../../engine/metrics'
import { getRelation, inTruce, isAllied, isAtWar } from '../../engine/ops'
import { effectiveTraits } from '../../engine/society'
import { semanticIssues } from '../../engine/validate'
import type { WorldView } from '../../state/useWorld'
import { appStore } from '../../state/store'
import { Badge, Button, Field, NumberInput, Section, Select, Swatch, TextInput, Toggle } from '../../components/ui'
import { Sparkline } from '../../components/charts'
import { ConfirmDialog } from '../../components/Dialog'
import { editor, replaceById } from './edit'
import { EditModeNote, EntityLink, EventRow, KV, recentEventsFor } from './common'

function useSeries(w: WorldView, read: (s: NonNullable<WorldView['state']>) => number) {
  return useMemo(() => (w.timeline ? w.timeline.states.map(read) : []), [w.timeline, read])
}

function Trend({ w, label, read, color }: { w: WorldView; label: string; read: (s: NonNullable<WorldView['state']>) => number; color?: string }) {
  const values = useSeries(w, read)
  const now = values[w.step]
  return (
    <div className="trend">
      <span className="trend-label">{label}</span>
      <Sparkline values={values} color={color} upTo={w.readOnly ? w.step : undefined} />
      <span className="trend-val">{now === undefined ? '—' : fmt(now)}</span>
    </div>
  )
}

function DeleteButton({ what, onConfirm, disabled }: { what: string; onConfirm: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="danger" size="sm" icon={<Trash2 size={13} />} disabled={disabled} onClick={() => setOpen(true)}>
        Delete {what}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        danger
        title={`Delete ${what}?`}
        confirmLabel="Delete"
        body={<p>This removes it from the model on this branch from the current step onward. History already simulated is kept. Rules that still reference it will block the change.</p>}
        onConfirm={onConfirm}
      />
    </>
  )
}

/** Remove an entity and explain any references that block it. */
function removeEntity(w: WorldView, note: string, fn: Parameters<ReturnType<typeof editor>['update']>[0]) {
  const next = fn(w.headModel)
  const errors = semanticIssues(next).filter((i) => i.severity === 'error')
  if (errors.length) {
    appStore.getState().notify({ tone: 'error', message: `Cannot delete: still referenced`, detail: errors.slice(0, 6).map((e) => `${e.path}: ${e.message}`).join('\n') })
    return
  }
  if (editor(w).update(fn, note)) appStore.getState().select(null)
}

// ── Location ────────────────────────────────────────────────────────────────

export function LocationInspector({ w, id }: { w: WorldView; id: Id }) {
  const def = w.index.locations.get(id)
  if (!def) return <p className="muted">This settlement does not exist at step {w.step}.</p>
  const ed = editor(w)
  const st = w.state?.locations[id]
  const setDef = (patch: Partial<LocationDef>, note: string) => ed.update((m) => ({ ...m, locations: replaceById(m.locations, id, (l) => ({ ...l, ...patch })) }), note)
  const factionOpts = w.model.factions.map((f) => ({ value: f.id, label: f.name }))
  const outgoing = w.model.routes.filter((r) => r.fromId === id)
  const incoming = w.model.routes.filter((r) => r.toId === id)

  return (
    <>
      <Section title="Definition">
        <Field label="Name">{(fid) => <TextInput id={fid} value={def.name} disabled={!ed.canEdit} onCommit={(v) => v.trim() && setDef({ name: v.trim() }, `Rename ${def.name}`)} />}</Field>
        <Field label="Region" hint="Settlements in the same region are drawn as one island.">
          {(fid) => <TextInput id={fid} value={def.region} disabled={!ed.canEdit} onCommit={(v) => setDef({ region: v.trim() }, `Move ${def.name} to ${v}`)} />}
        </Field>
        <Field label="Description">{(fid) => <TextInput id={fid} multiline maxLength={2000} value={def.description} disabled={!ed.canEdit} onCommit={(v) => setDef({ description: v }, 'Edit description')} />}</Field>
      </Section>

      <Section title={<>Values {w.readOnly ? `at step ${w.step}` : ed.atStart ? '· starting' : `· step ${w.head}`}</>}>
        <EditModeNote w={w} />
        {!st && <p className="note">Added on this branch after step 0 — it joins the simulation at step {w.head + 1}.</p>}
        <Field label="Owner" inline>
          {(fid) => (
            <Select
              id={fid}
              value={st?.ownerId ?? def.initialOwnerId}
              options={factionOpts}
              disabled={!ed.canEdit}
              onChange={(v) => (ed.atStart || !st ? setDef({ initialOwnerId: v }, `${def.name} owner`) : ed.intervene(`${def.name} passes to ${w.index.name(v)}`, [{ kind: 'setOwner', locationId: id, factionId: v }]))}
            />
          )}
        </Field>
        <Field label="Population" inline>
          {(fid) => (
            <NumberInput
              id={fid}
              min={0}
              max={10_000_000}
              step={10}
              value={st?.population ?? def.initialPopulation}
              disabled={!ed.canEdit}
              onCommit={(v) => (ed.atStart || !st ? setDef({ initialPopulation: Math.round(v) }, `${def.name} population`) : ed.intervene(`Set ${def.name} population to ${fmt(v)}`, [{ kind: 'setPopulation', locationId: id, value: v }]))}
            />
          )}
        </Field>
        {w.model.resources.map((r) => (
          <Field key={r.id} label={r.name} inline>
            {(fid) => (
              <NumberInput
                id={fid}
                min={0}
                max={1e9}
                step={10}
                value={st?.stock[r.id] ?? def.initialStock[r.id] ?? 0}
                disabled={!ed.canEdit}
                onCommit={(v) =>
                  ed.atStart || !st
                    ? setDef({ initialStock: { ...def.initialStock, [r.id]: Math.round(v) } }, `${def.name} ${r.name}`)
                    : ed.intervene(`Set ${r.name} at ${def.name} to ${fmt(v)}`, [{ kind: 'setStock', locationId: id, resourceId: r.id, value: v }])
                }
              />
            )}
          </Field>
        ))}
        {st && (st.plague > 0 || st.ownerId !== st.culture || st.immunity > 0) && (
          <div className="mods">
            {st.plague > 0 && <Badge tone="crit">plague · {st.plague} steps left</Badge>}
            {st.immunity > 0 && st.plague === 0 && <Badge tone="ok">immune · {st.immunity}</Badge>}
            {st.ownerId !== st.culture && <Badge tone="warn" title="May revolt and return to its own people">occupied · {w.index.name(st.culture)} people</Badge>}
          </div>
        )}
        {st && st.modifiers.length > 0 && (
          <div className="mods">
            {st.modifiers.map((m) => (
              <Badge key={m.id} tone="warn" title={`${m.label} on ${w.index.name(m.resourceId)}`}>
                {m.label}: {w.index.name(m.resourceId)} ×{m.factor} · {m.remaining} left
              </Badge>
            ))}
          </div>
        )}
      </Section>

      <Section title="History">
        <Trend w={w} label="Population" read={(s) => s.locations[id]?.population ?? 0} />
        {w.model.resources.map((r) => (
          <Trend key={r.id} w={w} label={r.name} color={r.color} read={(s) => s.locations[id]?.stock[r.id] ?? 0} />
        ))}
      </Section>

      <Section title="Trade routes">
        {outgoing.length + incoming.length === 0 ? (
          <p className="muted">No routes. Use the connect tool (R) on the map to open one.</p>
        ) : (
          <ul className="plain-list">
            {outgoing.map((r) => (
              <li key={r.id}>
                <span className="dir">out</span> <EntityLink id={r.id} w={w} kind="route" /> <span className="muted">→ {w.index.name(r.toId)}</span>
              </li>
            ))}
            {incoming.map((r) => (
              <li key={r.id}>
                <span className="dir">in</span> <EntityLink id={r.id} w={w} kind="route" /> <span className="muted">← {w.index.name(r.fromId)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <RecentEvents w={w} id={id} />

      {ed.canEdit && (
        <div className="inspector-danger">
          <DeleteButton what="settlement" onConfirm={() => removeEntity(w, `Remove ${def.name}`, (m) => ({ ...m, locations: m.locations.filter((l) => l.id !== id), routes: m.routes.filter((r) => r.fromId !== id && r.toId !== id) }))} />
        </div>
      )}
    </>
  )
}

function RecentEvents({ w, id }: { w: WorldView; id: Id }) {
  const events = recentEventsFor(w, id)
  return (
    <Section title="Recent events">
      {events.length === 0 ? <p className="muted">Nothing involving this in the last few steps.</p> : events.map((e) => <EventRow key={e.id} e={e} w={w} compact />)}
    </Section>
  )
}

// ── Faction ────────────────────────────────────────────────────────────────

const TRAIT_LABEL = { aggression: 'Aggression', ambition: 'Ambition', caution: 'Caution', mercantile: 'Mercantile' } as const

export function FactionInspector({ w, id }: { w: WorldView; id: Id }) {
  const def = w.index.factions.get(id)
  if (!def) return <p className="muted">This faction does not exist at step {w.step}.</p>
  const ed = editor(w)
  const st = w.state?.factions[id]
  const setDef = (patch: Partial<typeof def>, note: string) => ed.update((m) => ({ ...m, factions: replaceById(m.factions, id, (f) => ({ ...f, ...patch })) }), note)
  const held = w.state ? factionLocations(w.state, id) : []
  const effective = w.state ? effectiveTraits(w.model, w.state, id) : def.traits

  const setRelation = (other: Id, value: number) => {
    if (ed.atStart) {
      ed.update((m) => {
        const key = relationKey(id, other)
        const rest = m.relations.filter((r) => relationKey(r.a, r.b) !== key)
        return { ...m, relations: [...rest, { a: id, b: other, value }] }
      }, `Relations ${def.name} ↔ ${w.index.name(other)}`)
    } else if (w.state) {
      const delta = value - getRelation(w.state, id, other)
      if (delta !== 0) ed.intervene(`Relations ${def.name} ↔ ${w.index.name(other)} ${signed(delta)}`, [{ kind: 'adjustRelation', a: id, b: other, delta }])
    }
  }

  return (
    <>
      <Section title="Definition">
        <Field label="Name">{(fid) => <TextInput id={fid} value={def.name} disabled={!ed.canEdit} onCommit={(v) => v.trim() && setDef({ name: v.trim() }, `Rename ${def.name}`)} />}</Field>
        <Field label="Colour" inline>
          {(fid) => <input id={fid} type="color" className="color-input" value={def.color} disabled={!ed.canEdit} onChange={(e) => setDef({ color: e.target.value }, 'Colour')} />}
        </Field>
        <Field label="Description">{(fid) => <TextInput id={fid} multiline maxLength={2000} value={def.description} disabled={!ed.canEdit} onCommit={(v) => setDef({ description: v }, 'Edit description')} />}</Field>
      </Section>

      <Section title="Personality" actions={<span className="muted small">0 – 1</span>}>
        {(['aggression', 'ambition', 'caution', 'mercantile'] as const).map((t) => (
          <Field key={t} label={TRAIT_LABEL[t]} inline>
            {(fid) => (
              <NumberInput
                id={fid}
                min={0}
                max={1}
                step={0.05}
                value={def.traits[t]}
                disabled={!ed.canEdit}
                onCommit={(v) => setDef({ traits: { ...def.traits, [t]: v } }, `${def.name} ${t}`)}
              />
            )}
          </Field>
        ))}
        {st && (
          <p className="muted small">
            With {st.ruler.title} {st.ruler.name}: {(['aggression', 'ambition', 'caution', 'mercantile'] as const).map((t) => `${t} ${fmt(effective[t])}`).join(' · ')}
          </p>
        )}
      </Section>

      {st && (
        <Section title="Ruler">
          <div className="ruler">
            <div className="ruler-name">
              {st.ruler.title} {st.ruler.name} <span className="ruler-epithet">{st.ruler.epithet}</span>
            </div>
            <div className="muted small">
              Age {st.ruler.age} · reigning since step {st.ruler.since} · boldness {signed(st.ruler.boldness)} · wisdom {signed(st.ruler.wisdom)}
            </div>
          </div>
        </Section>
      )}

      {st && (
        <Section title="Diplomacy">
          {w.model.factions
            .filter((f) => f.id !== id)
            .map((f) => {
              const war = w.state ? isAtWar(w.state, id, f.id) : false
              const ally = w.state ? isAllied(w.state, id, f.id) : false
              const truce = w.state ? inTruce(w.state, id, f.id, w.step) : false
              return (
                <div key={f.id} className="diplo-row">
                  <EntityLink id={f.id} w={w} kind="faction" />
                  {war ? <Badge tone="crit">at war</Badge> : ally ? <Badge tone="ok">allied</Badge> : truce ? <Badge tone="info">truce</Badge> : <Badge>neutral</Badge>}
                  {ed.canEdit && !ed.atStart && (
                    <span className="diplo-actions">
                      <Button size="sm" variant="ghost" onClick={() => ed.intervene(war ? `Force peace: ${def.name} / ${f.name}` : `Force war: ${def.name} / ${f.name}`, [{ kind: 'setWar', a: id, b: f.id, active: !war }])}>
                        {war ? 'Force peace' : 'Force war'}
                      </Button>
                    </span>
                  )}
                </div>
              )
            })}
        </Section>
      )}

      <Section title={<>State {w.readOnly ? `at step ${w.step}` : ed.atStart ? '· starting' : `· step ${w.head}`}</>}>
        <EditModeNote w={w} />
        <Field label="Stability" inline hint="0–100. Shortages lower it; drift rules restore it.">
          {(fid) => (
            <NumberInput
              id={fid}
              min={0}
              max={100}
              value={st?.stability ?? def.initialStability}
              disabled={!ed.canEdit}
              onCommit={(v) => (ed.atStart || !st ? setDef({ initialStability: v }, `${def.name} stability`) : ed.intervene(`Set ${def.name} stability to ${fmt(v)}`, [{ kind: 'setStability', factionId: id, value: v }]))}
            />
          )}
        </Field>
        {st && (
          <>
            <KV k="Innovation">×{fmt(st.tech)}</KV>
            <KV k="War weariness">{fmt(st.exhaustion)}</KV>
          </>
        )}
        {w.state && (
          <>
            <KV k="Population">{fmt(factionPopulation(w.state, id))}</KV>
            {w.model.resources.map((r) => (
              <KV key={r.id} k={<><Swatch color={r.color} /> {r.name}</>}>
                {fmt(factionStock(w.state!, id, r.id))}
              </KV>
            ))}
            <KV k="Holds">
              <span className="link-list">{held.length ? held.map((l) => <EntityLink key={l} id={l} w={w} kind="location" />) : <span className="muted">nothing</span>}</span>
            </KV>
          </>
        )}
      </Section>

      <Section title="Relations" actions={<span className="muted small">−100 hostile · +100 allied</span>}>
        {w.model.factions
          .filter((f) => f.id !== id)
          .map((f) => {
            const v = w.state ? getRelation(w.state, id, f.id) : (w.model.relations.find((r) => relationKey(r.a, r.b) === relationKey(id, f.id))?.value ?? 0)
            return (
              <Field key={f.id} label={f.name} inline>
                {(fid) => <NumberInput id={fid} min={-100} max={100} value={v} disabled={!ed.canEdit} onCommit={(nv) => setRelation(f.id, nv)} />}
              </Field>
            )
          })}
        {w.model.factions.length < 2 && <p className="muted">Add another faction to define relations.</p>}
      </Section>

      <Section title="History">
        <Trend w={w} label="Stability" color={def.color} read={(s) => s.factions[id]?.stability ?? 0} />
        <Trend w={w} label="Innovation" read={(s) => s.factions[id]?.tech ?? 1} />
        <Trend w={w} label="Settlements" read={(s) => factionLocations(s, id).length} />
        <Trend w={w} label="Population" read={(s) => factionPopulation(s, id)} />
        {w.model.resources.map((r) => (
          <Trend key={r.id} w={w} label={r.name} color={r.color} read={(s) => factionStock(s, id, r.id)} />
        ))}
      </Section>

      <RecentEvents w={w} id={id} />

      {ed.canEdit && (
        <div className="inspector-danger">
          <DeleteButton
            what="faction"
            onConfirm={() =>
              removeEntity(w, `Remove ${def.name}`, (m) => ({
                ...m,
                factions: m.factions.filter((f) => f.id !== id),
                relations: m.relations.filter((r) => r.a !== id && r.b !== id),
              }))
            }
          />
        </div>
      )}
    </>
  )
}

// ── Trade route ────────────────────────────────────────────────────────────

export function RouteInspector({ w, id }: { w: WorldView; id: Id }) {
  const def = w.index.routes.get(id)
  if (!def) return <p className="muted">This route does not exist at step {w.step}.</p>
  const ed = editor(w)
  const rs = w.state?.routes[id]
  const set = (patch: Partial<typeof def>, note: string) => ed.update((m) => ({ ...m, routes: replaceById(m.routes, id, (r) => ({ ...r, ...patch })) }), note)
  const locOpts = w.model.locations.map((l) => ({ value: l.id, label: l.name }))
  const resOpts = w.model.resources.map((r) => ({ value: r.id, label: r.name }))
  const last = w.events.filter((e) => e.entityIds[0] === id && (e.kind === 'trade' || e.kind === 'trade-blocked'))
  const tradeRules = w.model.rules.filter((r) => r.type === 'trade' && r.enabled && (r.routeIds === 'all' || r.routeIds.includes(id)))

  return (
    <>
      <Section title="Route">
        <Field label="Name">{(fid) => <TextInput id={fid} value={def.name} disabled={!ed.canEdit} onCommit={(v) => v.trim() && set({ name: v.trim() }, 'Rename route')} />}</Field>
        <Field label="From" inline>{(fid) => <Select id={fid} value={def.fromId} options={locOpts} disabled={!ed.canEdit} onChange={(v) => set({ fromId: v }, 'Route origin')} />}</Field>
        <Field label="To" inline>{(fid) => <Select id={fid} value={def.toId} options={locOpts} disabled={!ed.canEdit} onChange={(v) => set({ toId: v }, 'Route destination')} />}</Field>
        <Field label="Carries" inline>{(fid) => <Select id={fid} value={def.resourceId} options={resOpts} disabled={!ed.canEdit} onChange={(v) => set({ resourceId: v }, 'Route cargo')} />}</Field>
        <Field label="Capacity / step" inline>{(fid) => <NumberInput id={fid} min={0} max={1e6} value={def.amount} disabled={!ed.canEdit} onCommit={(v) => set({ amount: v }, `${def.name} capacity`)} />}</Field>
        <Field label="Min. relation" inline hint="Between different owners, the route halts below this.">
          {(fid) => <NumberInput id={fid} min={-100} max={100} value={def.minRelation} disabled={!ed.canEdit} onCommit={(v) => set({ minRelation: v }, `${def.name} min relation`)} />}
        </Field>
        <Field label={ed.atStart ? 'Open at start' : 'Open now'} inline>
          {(fid) => (
            <Toggle
              id={fid}
              label="Route open"
              checked={rs ? rs.active : def.initiallyActive}
              disabled={!ed.canEdit}
              onChange={(v) => (ed.atStart || !rs ? set({ initiallyActive: v }, `${def.name} ${v ? 'open' : 'closed'}`) : ed.intervene(`${v ? 'Open' : 'Close'} ${def.name}`, [{ kind: 'setRouteActive', routeId: id, active: v }]))}
            />
          )}
        </Field>
      </Section>
      <Section title={`Step ${w.step}`}>
        {last.length ? last.map((e) => <EventRow key={e.id} e={e} w={w} compact />) : <p className="muted">{rs?.active === false ? 'Route is closed.' : w.step === 0 ? 'Nothing has moved yet.' : 'No trade recorded this step.'}</p>}
        {tradeRules.length === 0 && <p className="note warn">No enabled trade rule covers this route, so it will never carry goods.</p>}
        <Trend w={w} label="Moved / step" color={w.index.resources.get(def.resourceId)?.color} read={(s) => s.routes[id]?.lastTransferred ?? 0} />
      </Section>
      {ed.canEdit && (
        <div className="inspector-danger">
          <DeleteButton what="route" onConfirm={() => removeEntity(w, `Remove ${def.name}`, (m) => ({ ...m, routes: m.routes.filter((r) => r.id !== id) }))} />
        </div>
      )}
    </>
  )
}

// ── Resource ───────────────────────────────────────────────────────────────

export function ResourceInspector({ w, id }: { w: WorldView; id: Id }) {
  const def = w.index.resources.get(id)
  if (!def) return <p className="muted">This resource does not exist at step {w.step}.</p>
  const ed = editor(w)
  const set = (patch: Partial<typeof def>, note: string) => ed.update((m) => ({ ...m, resources: replaceById(m.resources, id, (r) => ({ ...r, ...patch })) }), note)
  const usedBy = w.model.rules.filter((r) => 'resourceId' in r && r.resourceId === id)
  return (
    <>
      <Section title="Resource">
        <Field label="Name">{(fid) => <TextInput id={fid} value={def.name} disabled={!ed.canEdit} onCommit={(v) => v.trim() && set({ name: v.trim() }, 'Rename resource')} />}</Field>
        <Field label="Colour" inline>{(fid) => <input id={fid} type="color" className="color-input" value={def.color} disabled={!ed.canEdit} onChange={(e) => set({ color: e.target.value }, 'Colour')} />}</Field>
        <Field label="Description">{(fid) => <TextInput id={fid} multiline maxLength={2000} value={def.description} disabled={!ed.canEdit} onCommit={(v) => set({ description: v }, 'Edit description')} />}</Field>
      </Section>
      <Section title={`Stock at step ${w.step}`}>
        {w.state && <KV k="World total">{fmt(totalStock(w.state, id))}</KV>}
        {w.model.locations.map((l) => (
          <KV key={l.id} k={<EntityLink id={l.id} w={w} kind="location" />}>
            {fmt(w.state?.locations[l.id]?.stock[id] ?? 0)}
          </KV>
        ))}
        <Trend w={w} label="World total" color={def.color} read={(s) => totalStock(s, id)} />
      </Section>
      <Section title="Used by rules">
        {usedBy.length ? <span className="link-list">{usedBy.map((r) => <EntityLink key={r.id} id={r.id} w={w} kind="rule" />)}</span> : <p className="muted">No rule produces or consumes it.</p>}
      </Section>
      {ed.canEdit && (
        <div className="inspector-danger">
          <DeleteButton
            what="resource"
            onConfirm={() =>
              removeEntity(w, `Remove ${def.name}`, (m) => ({
                ...m,
                resources: m.resources.filter((r) => r.id !== id),
                locations: m.locations.map((l) => {
                  const { [id]: _gone, ...rest } = l.initialStock
                  return { ...l, initialStock: rest }
                }),
              }))
            }
          />
        </div>
      )}
    </>
  )
}

// ── World overview (nothing selected) ─────────────────────────────────────

export function WorldOverview({ w }: { w: WorldView }) {
  const ed = editor(w)
  const issues = semanticIssues(w.model)
  const notable = w.events.filter((e) => e.severity !== 'info')
  return (
    <>
      <Section title="World">
        <Field label="Name">{(fid) => <TextInput id={fid} value={w.model.name} disabled={!ed.canEdit} onCommit={(v) => v.trim() && ed.update((m) => ({ ...m, name: v.trim() }), 'Rename world')} />}</Field>
        <Field label="Description">{(fid) => <TextInput id={fid} multiline maxLength={2000} value={w.model.description} disabled={!ed.canEdit} onCommit={(v) => ed.update((m) => ({ ...m, description: v }), 'Edit description')} />}</Field>
        <Field label="Random seed" inline hint={ed.atStart ? 'Seeds every random draw. Same seed + same rules → same history.' : 'The seed only sets the starting RNG state; branch to explore a different seed from step 0.'}>
          {(fid) => <NumberInput id={fid} min={0} max={4294967295} value={w.model.seed} disabled={!ed.canEdit || !ed.atStart} onCommit={(v) => ed.update((m) => ({ ...m, seed: Math.round(v) }), 'Change seed')} />}
        </Field>
      </Section>
      {w.state && (
        <Section title={`Step ${w.step}`}>
          <KV k="Population">{fmt(totalPopulation(w.state))}</KV>
          {w.model.resources.map((r) => (
            <KV key={r.id} k={<><Swatch color={r.color} /> {r.name}</>}>
              {fmt(totalStock(w.state!, r.id))}
            </KV>
          ))}
          <div className="faction-bars">
            {w.model.factions.map((f) => {
              const s = w.state?.factions[f.id]?.stability ?? 0
              return (
                <button key={f.id} type="button" className="faction-bar" onClick={() => appStore.getState().select({ kind: 'faction', id: f.id })}>
                  <span className="faction-bar-name">
                    <Swatch color={f.color} ring /> {f.name}
                  </span>
                  <span className="faction-bar-track" aria-label={`stability ${fmt(s)}`}>
                    <span style={{ width: `${s}%`, background: f.color }} />
                  </span>
                  <span className="faction-bar-val">{fmt(s)}</span>
                </button>
              )
            })}
          </div>
        </Section>
      )}
      <Section title={`Notable at step ${w.step}`}>
        {notable.length ? notable.map((e) => <EventRow key={e.id} e={e} w={w} compact />) : <p className="muted">{w.step === 0 ? 'Advance the simulation to see events.' : 'Routine step — only production, trade and consumption.'}</p>}
      </Section>
      {issues.length > 0 && (
        <Section title="Model checks">
          {issues.map((i, k) => (
            <p key={k} className={`note ${i.severity === 'error' ? 'crit' : 'warn'}`}>
              <code>{i.path}</code> {i.message}
            </p>
          ))}
        </Section>
      )}
    </>
  )
}
