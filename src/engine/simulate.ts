import type { Change, Intervention, SimEvent, WorldModel, WorldState } from './model'
import { relationKey } from './model'
import { indexModel } from './modelIndex'
import { Rng, seedState } from './rng'
import { createEmitter, type StepContext } from './context'
import { generateRuler } from './names'
import { applyEffects } from './effects'
import { orderRules, ruleImpl } from './rules/registry'
import { SimulationError } from './ops'

/**
 * ── Update semantics (documented contract, covered by tests/engine.test.ts) ──
 *
 * One transition `simulateStep(prev, model, interventions)` produces step `prev.step + 1`:
 *
 *   1. Clone `prev` into a private draft. Reset per-step route counters.
 *   2. Reconcile the draft with the model (entities added or removed by a revision).
 *   3. Age modifiers; expired ones are removed and logged.
 *   4. Fire scheduled events whose `step` equals the new step, ordered by id.
 *   5. Run enabled rules ordered by (priority, id). Rules are SEQUENTIAL: each rule observes
 *      the effects of rules that ran before it in the same step. This makes transfers
 *      conserve quantities (no two rules can spend the same stock).
 *   6. Apply user interventions recorded for the new step, in the order given.
 *
 * The function is pure: same inputs → same outputs, inputs are never mutated, and all
 * randomness flows through the seeded RNG stored in `state.rng`.
 */

export interface StepResult {
  state: WorldState
  events: SimEvent[]
}

function newFaction(f: WorldModel['factions'][number], rng: Rng, step: number): WorldState['factions'][string] {
  return { stability: f.initialStability, tech: 1, exhaustion: 0, ruler: generateRuler(rng, step) }
}

function newLocation(l: WorldModel['locations'][number]): WorldState['locations'][string] {
  return { ownerId: l.initialOwnerId, population: Math.round(l.initialPopulation), stock: roundStock(l.initialStock), modifiers: [], culture: l.initialOwnerId, plague: 0, immunity: 0 }
}

export function createInitialState(model: WorldModel): WorldState {
  const rng = new Rng(seedState(model.seed))
  const state: WorldState = {
    step: 0,
    rng: 0,
    locations: {},
    factions: {},
    routes: {},
    relations: {},
    wars: {},
    alliances: {},
    truces: {},
    ruleCooldowns: {},
  }
  // Rulers are drawn from the seed in id order so the starting cast is reproducible.
  for (const f of [...model.factions].sort((a, b) => (a.id < b.id ? -1 : 1))) state.factions[f.id] = newFaction(f, rng, 0)
  state.rng = rng.state
  for (const l of model.locations) state.locations[l.id] = newLocation(l)
  for (const r of model.routes) state.routes[r.id] = { active: r.initiallyActive, lastTransferred: 0 }
  for (const r of model.relations) state.relations[relationKey(r.a, r.b)] = r.value
  return state
}

/** Step 0 for a branch: the initial state plus any interventions recorded at step 0. */
export function initialStep(model: WorldModel, interventions: Intervention[] = []): StepResult {
  const state = createInitialState(model)
  const events: SimEvent[] = []
  const ctx = makeContext(model, state, state, 0, events)
  applyInterventions(ctx, interventions)
  state.rng = ctx.rng.state
  return { state, events }
}

export function simulateStep(prev: WorldState, model: WorldModel, interventions: Intervention[] = []): StepResult {
  const step = prev.step + 1
  const state = structuredClone(prev)
  state.step = step
  for (const r of Object.values(state.routes)) r.lastTransferred = 0

  const events: SimEvent[] = []
  const ctx = makeContext(model, state, prev, step, events)

  reconcile(ctx)
  ageModifiers(ctx)

  for (const ev of model.events.filter((e) => e.step === step).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const { changes, entityIds } = applyEffects(ctx, ev.effects, ev.id)
    ctx.emit({ kind: 'scheduled', severity: 'critical', scheduledEventId: ev.id, message: `${ev.name}${ev.description ? ` — ${ev.description}` : ''}`, entityIds, changes })
  }

  for (const rule of orderRules(model.rules)) {
    if (!rule.enabled) continue
    ruleImpl(rule).apply(rule, ctx)
  }

  applyInterventions(ctx, interventions)

  state.rng = ctx.rng.state
  return { state, events }
}

function makeContext(model: WorldModel, state: WorldState, prev: WorldState, step: number, sink: SimEvent[]): StepContext {
  return { model, index: indexModel(model), state, prev, step, rng: new Rng(state.rng), emit: createEmitter(step, sink) }
}

function applyInterventions(ctx: StepContext, interventions: Intervention[]) {
  for (const iv of interventions) {
    if (iv.step !== ctx.step) throw new SimulationError(`Intervention "${iv.id}" is for step ${iv.step}, not ${ctx.step}`)
    const { changes, entityIds } = applyEffects(ctx, iv.effects, iv.id)
    ctx.emit({ kind: 'intervention', severity: 'notable', interventionId: iv.id, message: `Intervention: ${iv.label}`, entityIds, changes })
  }
}

/** Bring a state in line with a (possibly revised) model: add new entities, drop removed ones. */
function reconcile(ctx: StepContext) {
  const { model, state } = ctx
  const changes: Change[] = []
  const entityIds: string[] = []
  for (const f of model.factions) {
    if (!state.factions[f.id]) {
      state.factions[f.id] = newFaction(f, ctx.rng, ctx.step)
      changes.push({ target: { kind: 'stability', factionId: f.id }, before: '—', after: f.initialStability, note: 'faction added' })
      entityIds.push(f.id)
    }
  }
  for (const l of model.locations) {
    if (!state.locations[l.id]) {
      state.locations[l.id] = newLocation(l)
      changes.push({ target: { kind: 'population', locationId: l.id }, before: '—', after: Math.round(l.initialPopulation), note: 'location added' })
      entityIds.push(l.id)
    }
  }
  for (const r of model.routes) {
    if (!state.routes[r.id]) {
      state.routes[r.id] = { active: r.initiallyActive, lastTransferred: 0 }
      changes.push({ target: { kind: 'routeActive', routeId: r.id }, before: '—', after: r.initiallyActive, note: 'route added' })
      entityIds.push(r.id)
    }
  }
  const ix = ctx.index
  const removed: string[] = []
  for (const id of Object.keys(state.locations)) if (!ix.locations.has(id)) { delete state.locations[id]; removed.push(id) }
  for (const id of Object.keys(state.factions)) if (!ix.factions.has(id)) { delete state.factions[id]; removed.push(id) }
  for (const table of [state.wars, state.alliances, state.truces])
    for (const key of Object.keys(table)) if (key.split('|').some((f) => !ix.factions.has(f))) delete table[key]
  for (const id of Object.keys(state.routes)) if (!ix.routes.has(id)) { delete state.routes[id]; removed.push(id) }
  for (const [id, l] of Object.entries(state.locations)) {
    if (!state.factions[l.ownerId]) {
      const def = ix.locations.get(id)
      if (!def || !state.factions[def.initialOwnerId]) throw new SimulationError(`Location "${id}" has no valid owner after a model change`)
      changes.push({ target: { kind: 'owner', locationId: id }, before: l.ownerId, after: def.initialOwnerId, note: 'owner was removed; reverted to initial owner' })
      l.ownerId = def.initialOwnerId
    }
  }
  if (changes.length || removed.length) {
    ctx.emit({
      kind: 'revision',
      severity: 'notable',
      message: `Model revision applied${removed.length ? ` (removed: ${removed.map((id) => id).join(', ')})` : ''}`,
      entityIds: [...entityIds, ...removed],
      changes,
    })
  }
}

function ageModifiers(ctx: StepContext) {
  for (const [locationId, loc] of Object.entries(ctx.state.locations).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (loc.modifiers.length === 0) continue
    const kept: typeof loc.modifiers = []
    const expired: typeof loc.modifiers = []
    for (const m of loc.modifiers) {
      const remaining = m.remaining - 1
      if (remaining > 0) kept.push({ ...m, remaining })
      else expired.push(m)
    }
    for (const m of expired) {
      const before = loc.modifiers.filter((x) => x.resourceId === m.resourceId).reduce((f, x) => f * x.factor, 1)
      const after = kept.filter((x) => x.resourceId === m.resourceId).reduce((f, x) => f * x.factor, 1)
      ctx.emit({
          kind: 'modifier-expired',
          severity: 'notable',
          message: `${m.label} has ended at ${ctx.index.name(locationId)}`,
          entityIds: [locationId, m.resourceId],
          changes: [{ target: { kind: 'modifier', locationId, resourceId: m.resourceId }, before, after, note: m.label }],
        })
    }
    loc.modifiers = kept
  }
}

function roundStock(stock: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(stock)) out[k] = Math.max(0, Math.round(v))
  return out
}
