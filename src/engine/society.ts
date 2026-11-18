import type { FactionTraits, Id, WorldModel, WorldState } from './model'
import { relationKey } from './model'
import { factionLocations, factionPopulation, factionStock } from './metrics'
import { getRelation } from './ops'

/**
 * Shared readings of a society used by the emergent rules (agency, warfare, migration…).
 * All are pure functions of the current state.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Stock of a resource per 100 people. ~8 is one step of eating in the example worlds. */
export function perCapita(stock: number, population: number): number {
  return population <= 0 ? 999 : stock / (population / 100)
}

/** 0 = well fed (≥ 4 steps of food), 1 = nothing left. */
export function factionHunger(s: WorldState, factionId: Id, food: Id): number {
  return clamp01(1 - perCapita(factionStock(s, factionId, food), factionPopulation(s, factionId)) / 32)
}

export function locationHunger(s: WorldState, locationId: Id, food: Id): number {
  const l = s.locations[locationId]
  if (!l) return 0
  return clamp01(1 - perCapita(l.stock[food] ?? 0, l.population) / 32)
}

/** Faction personality blended with its current ruler's temperament. */
export function effectiveTraits(model: WorldModel, s: WorldState, factionId: Id): FactionTraits {
  const base = model.factions.find((f) => f.id === factionId)?.traits ?? { aggression: 0.4, ambition: 0.5, caution: 0.5, mercantile: 0.5 }
  const r = s.factions[factionId]?.ruler
  const bold = r?.boldness ?? 0
  const wise = r?.wisdom ?? 0
  return {
    aggression: clamp01(base.aggression + bold),
    ambition: clamp01(base.ambition + wise * 0.6),
    caution: clamp01(base.caution + wise * 0.4 - bold * 0.6),
    mercantile: clamp01(base.mercantile + wise * 0.3),
  }
}

/** Military strength: people × morale × technology × arms supply. */
export function strength(s: WorldState, factionId: Id, arms: Id): number {
  const f = s.factions[factionId]
  if (!f) return 0
  const pop = factionPopulation(s, factionId)
  if (pop <= 0) return 0
  const armsPerCap = perCapita(factionStock(s, factionId, arms), pop)
  const armed = 1 + Math.min(1, armsPerCap / 20) * 0.6
  const morale = 0.5 + f.stability / 200
  const weary = 1 - f.exhaustion / 250
  return (pop / 100) * morale * f.tech * armed * weary
}

export function warsOf(s: WorldState, factionId: Id): Id[] {
  return Object.keys(s.wars)
    .map((k) => k.split('|'))
    .filter((pair) => pair.includes(factionId))
    .map((pair) => (pair[0] === factionId ? pair[1] : pair[0]) as Id)
    .sort()
}

export function alliesOf(s: WorldState, factionId: Id): Id[] {
  return Object.keys(s.alliances)
    .map((k) => k.split('|'))
    .filter((pair) => pair.includes(factionId))
    .map((pair) => (pair[0] === factionId ? pair[1] : pair[0]) as Id)
    .sort()
}

/** Factions that still hold at least one settlement. */
export function livingFactions(s: WorldState): Id[] {
  return Object.keys(s.factions)
    .filter((f) => factionLocations(s, f).length > 0)
    .sort()
}

export function relation(s: WorldState, a: Id, b: Id): number {
  return getRelation(s, a, b)
}

export function pairKey(a: Id, b: Id): string {
  return relationKey(a, b)
}

/** The settlement of a faction that maximises `score` (ties broken by id). */
export function bestLocation(s: WorldState, factionId: Id, score: (id: Id) => number): Id | null {
  let best: Id | null = null
  let bestScore = -Infinity
  for (const id of factionLocations(s, factionId)) {
    const v = score(id)
    if (v > bestScore) {
      best = id
      bestScore = v
    }
  }
  return best
}

export function fmtReasons(reasons: [string, number][]): string {
  return reasons
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4)
    .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v.toFixed(2)}`)
    .join(', ')
}
