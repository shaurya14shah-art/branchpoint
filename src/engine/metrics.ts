import type { Condition, Id, Metric, Scope, WorldModel, WorldState } from './model'
import { relationKey } from './model'
import { indexModel } from './modelIndex'

/** Location ids covered by a scope, resolved against *current* ownership, sorted by id. */
export function resolveScope(scope: Scope, model: WorldModel, state: WorldState): Id[] {
  const ids = model.locations.map((l) => l.id).filter((id) => state.locations[id])
  const index = indexModel(model)
  const out = ids.filter((id) => {
    switch (scope.kind) {
      case 'all':
        return true
      case 'location':
        return id === scope.id
      case 'faction':
        return state.locations[id]?.ownerId === scope.id
      case 'region':
        return index.locations.get(id)?.region === scope.region
    }
  })
  return out.sort()
}

export function factionLocations(state: WorldState, factionId: Id): Id[] {
  return Object.keys(state.locations)
    .filter((id) => state.locations[id]?.ownerId === factionId)
    .sort()
}

export function factionStock(state: WorldState, factionId: Id, resourceId: Id): number {
  let total = 0
  for (const id of factionLocations(state, factionId)) total += state.locations[id]?.stock[resourceId] ?? 0
  return total
}

export function factionPopulation(state: WorldState, factionId: Id): number {
  let total = 0
  for (const id of factionLocations(state, factionId)) total += state.locations[id]?.population ?? 0
  return total
}

export function totalStock(state: WorldState, resourceId: Id): number {
  let total = 0
  for (const l of Object.values(state.locations)) total += l.stock[resourceId] ?? 0
  return total
}

export function totalPopulation(state: WorldState): number {
  let total = 0
  for (const l of Object.values(state.locations)) total += l.population
  return total
}

export function readMetric(metric: Metric, state: WorldState): number {
  switch (metric.kind) {
    case 'stock':
      return state.locations[metric.locationId]?.stock[metric.resourceId] ?? 0
    case 'factionStock':
      return factionStock(state, metric.factionId, metric.resourceId)
    case 'population':
      return state.locations[metric.locationId]?.population ?? 0
    case 'factionPopulation':
      return factionPopulation(state, metric.factionId)
    case 'stability':
      return state.factions[metric.factionId]?.stability ?? 0
    case 'relation':
      return state.relations[relationKey(metric.a, metric.b)] ?? 0
  }
}

export function evaluateCondition(c: Condition, state: WorldState): { value: number; met: boolean } {
  const value = readMetric(c.metric, state)
  const met =
    c.op === '<' ? value < c.value : c.op === '<=' ? value <= c.value : c.op === '>' ? value > c.value : value >= c.value
  return { value, met }
}
