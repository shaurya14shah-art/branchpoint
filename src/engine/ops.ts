import type { Change, Id, WorldState } from './model'
import { RELATION_RANGE, STABILITY_RANGE, relationKey } from './model'

/**
 * Primitive state mutations used by rules and effects. They operate on the step's *draft* state
 * (a private clone), never on a published state. Each returns the Change it caused so callers
 * can attach it to an event. Nothing is changed without a Change record.
 */

export class SimulationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SimulationError'
  }
}

function loc(s: WorldState, id: Id) {
  const l = s.locations[id]
  if (!l) throw new SimulationError(`Unknown location "${id}"`)
  return l
}

function fac(s: WorldState, id: Id) {
  const f = s.factions[id]
  if (!f) throw new SimulationError(`Unknown faction "${id}"`)
  return f
}

export function getStock(s: WorldState, locationId: Id, resourceId: Id): number {
  return loc(s, locationId).stock[resourceId] ?? 0
}

/** Add (or remove, when negative) stock. Quantities never go below zero; a shortfall is noted. */
export function addStock(s: WorldState, locationId: Id, resourceId: Id, delta: number): { applied: number; change: Change } {
  const l = loc(s, locationId)
  const before = l.stock[resourceId] ?? 0
  const requested = Math.round(delta)
  const after = Math.max(0, before + requested)
  l.stock[resourceId] = after
  const change: Change = { target: { kind: 'stock', locationId, resourceId }, before, after }
  if (after !== before + requested) change.note = `requested ${requested}, only ${before} available`
  return { applied: after - before, change }
}

export function setStock(s: WorldState, locationId: Id, resourceId: Id, value: number): Change {
  const l = loc(s, locationId)
  const before = l.stock[resourceId] ?? 0
  const after = Math.max(0, Math.round(value))
  l.stock[resourceId] = after
  return { target: { kind: 'stock', locationId, resourceId }, before, after }
}

export function addPopulation(s: WorldState, locationId: Id, delta: number): { applied: number; change: Change } {
  const l = loc(s, locationId)
  const before = l.population
  const requested = Math.round(delta)
  const after = Math.max(0, before + requested)
  l.population = after
  const change: Change = { target: { kind: 'population', locationId }, before, after }
  if (after !== before + requested) change.note = `population cannot fall below 0 (requested ${requested})`
  return { applied: after - before, change }
}

export function setPopulation(s: WorldState, locationId: Id, value: number): Change {
  const l = loc(s, locationId)
  const before = l.population
  l.population = Math.max(0, Math.round(value))
  return { target: { kind: 'population', locationId }, before, after: l.population }
}

function clamp(v: number, [lo, hi]: readonly [number, number]) {
  return Math.min(hi, Math.max(lo, v))
}

const round1 = (v: number) => Math.round(v * 10) / 10

export function setStability(s: WorldState, factionId: Id, value: number): Change {
  const f = fac(s, factionId)
  const before = f.stability
  const target = round1(value)
  const after = clamp(target, STABILITY_RANGE)
  f.stability = after
  const change: Change = { target: { kind: 'stability', factionId }, before, after }
  if (after !== target) change.note = `clamped to ${STABILITY_RANGE[0]}..${STABILITY_RANGE[1]} (would be ${target})`
  return change
}

export function addStability(s: WorldState, factionId: Id, delta: number): Change {
  return setStability(s, factionId, fac(s, factionId).stability + delta)
}

export function getRelation(s: WorldState, a: Id, b: Id): number {
  return s.relations[relationKey(a, b)] ?? 0
}

export function addRelation(s: WorldState, a: Id, b: Id, delta: number): Change {
  fac(s, a)
  fac(s, b)
  const key = relationKey(a, b)
  const before = s.relations[key] ?? 0
  const target = round1(before + delta)
  const after = clamp(target, RELATION_RANGE)
  s.relations[key] = after
  const change: Change = { target: { kind: 'relation', a, b }, before, after }
  if (after !== target) change.note = `clamped to ${RELATION_RANGE[0]}..${RELATION_RANGE[1]} (would be ${target})`
  return change
}

export function setRouteActive(s: WorldState, routeId: Id, active: boolean): Change {
  const r = s.routes[routeId]
  if (!r) throw new SimulationError(`Unknown trade route "${routeId}"`)
  const before = r.active
  r.active = active
  return { target: { kind: 'routeActive', routeId }, before, after: active }
}

export function setOwner(s: WorldState, locationId: Id, factionId: Id): Change {
  fac(s, factionId)
  const l = loc(s, locationId)
  const before = l.ownerId
  l.ownerId = factionId
  return { target: { kind: 'owner', locationId }, before, after: factionId }
}

/** Product of active modifiers for a resource at a location. */
export function modifierFactor(s: WorldState, locationId: Id, resourceId: Id): number {
  let f = 1
  for (const m of loc(s, locationId).modifiers) if (m.resourceId === resourceId) f *= m.factor
  return f
}

// ── Diplomacy, innovation, disease, rulers ───────────────────────────────────

/** After a peace, neither side may declare war on the other for this many steps. */
export const TRUCE_STEPS = 12

export function inTruce(s: WorldState, a: Id, b: Id, step: number): boolean {
  return (s.truces[relationKey(a, b)] ?? -1) > step
}

export function isAtWar(s: WorldState, a: Id, b: Id): boolean {
  return !!s.wars[relationKey(a, b)]
}

export function isAllied(s: WorldState, a: Id, b: Id): boolean {
  return !!s.alliances[relationKey(a, b)]
}

/** Declaring war ends any alliance between the two; making peace leaves relations as they are. */
export function setWar(s: WorldState, a: Id, b: Id, active: boolean, step: number): Change[] {
  fac(s, a)
  fac(s, b)
  if (a === b) throw new SimulationError('A faction cannot war with itself')
  const key = relationKey(a, b)
  const before = !!s.wars[key]
  const changes: Change[] = []
  if (active && !before) {
    s.wars[key] = { since: step }
    if (s.alliances[key]) changes.push(...setAlliance(s, a, b, false, step))
  } else if (!active && before) {
    delete s.wars[key]
    s.truces[key] = step + TRUCE_STEPS
  }
  changes.unshift({ target: { kind: 'war', a, b }, before, after: active })
  return changes
}

export function setAlliance(s: WorldState, a: Id, b: Id, active: boolean, step: number): Change[] {
  fac(s, a)
  fac(s, b)
  if (a === b) throw new SimulationError('A faction cannot ally with itself')
  const key = relationKey(a, b)
  const before = !!s.alliances[key]
  if (active && s.wars[key]) throw new SimulationError(`${a} and ${b} are at war; make peace before allying`)
  if (active && !before) s.alliances[key] = { since: step }
  else if (!active && before) delete s.alliances[key]
  return [{ target: { kind: 'alliance', a, b }, before, after: active }]
}

export function addTech(s: WorldState, factionId: Id, delta: number): Change {
  const f = fac(s, factionId)
  const before = f.tech
  const target = Math.round((before + delta) * 1000) / 1000
  const after = Math.min(5, Math.max(0.2, target))
  f.tech = after
  const change: Change = { target: { kind: 'tech', factionId }, before, after }
  if (after !== target) change.note = `clamped to 0.2..5 (would be ${target})`
  return change
}

export function addExhaustion(s: WorldState, factionId: Id, delta: number): Change {
  const f = fac(s, factionId)
  const before = f.exhaustion
  f.exhaustion = Math.min(100, Math.max(0, Math.round((before + delta) * 10) / 10))
  return { target: { kind: 'exhaustion', factionId }, before, after: f.exhaustion }
}

export function setPlague(s: WorldState, locationId: Id, steps: number): Change {
  const l = loc(s, locationId)
  const before = l.plague
  l.plague = Math.max(0, Math.round(steps))
  return { target: { kind: 'plague', locationId }, before, after: l.plague }
}
