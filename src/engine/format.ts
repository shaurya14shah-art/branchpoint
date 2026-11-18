import type { Condition, Effect, Metric, Scope } from './model'
import type { ModelIndex } from './modelIndex'

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? r.toLocaleString('en-US') : r.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

export function signed(n: number): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n)
}

export function pct(f: number): string {
  return `${fmt(f * 100)}%`
}

export function scopeText(scope: Scope, ix: ModelIndex): string {
  switch (scope.kind) {
    case 'all':
      return 'every location'
    case 'location':
      return ix.name(scope.id)
    case 'faction':
      return `every location held by ${ix.name(scope.id)}`
    case 'region':
      return `every location in ${scope.region}`
  }
}

export function metricText(m: Metric, ix: ModelIndex): string {
  switch (m.kind) {
    case 'stock':
      return `${ix.name(m.resourceId)} at ${ix.name(m.locationId)}`
    case 'factionStock':
      return `${ix.name(m.factionId)}'s total ${ix.name(m.resourceId)}`
    case 'population':
      return `population of ${ix.name(m.locationId)}`
    case 'factionPopulation':
      return `${ix.name(m.factionId)}'s population`
    case 'stability':
      return `${ix.name(m.factionId)} stability`
    case 'relation':
      return `relations between ${ix.name(m.a)} and ${ix.name(m.b)}`
  }
}

export function conditionText(c: Condition, ix: ModelIndex): string {
  const op = { '<': 'falls below', '<=': 'is at most', '>': 'exceeds', '>=': 'reaches' }[c.op]
  return `${metricText(c.metric, ix)} ${op} ${fmt(c.value)}`
}

export function effectText(e: Effect, ix: ModelIndex): string {
  switch (e.kind) {
    case 'adjustStock':
      return `${signed(e.delta)} ${ix.name(e.resourceId)} at ${ix.name(e.locationId)}`
    case 'setStock':
      return `set ${ix.name(e.resourceId)} at ${ix.name(e.locationId)} to ${fmt(e.value)}`
    case 'adjustPopulation':
      return `${signed(e.delta)} population at ${ix.name(e.locationId)}`
    case 'setPopulation':
      return `set population of ${ix.name(e.locationId)} to ${fmt(e.value)}`
    case 'adjustStability':
      return `${signed(e.delta)} ${ix.name(e.factionId)} stability`
    case 'setStability':
      return `set ${ix.name(e.factionId)} stability to ${fmt(e.value)}`
    case 'adjustRelation':
      return `${signed(e.delta)} relations ${ix.name(e.a)} ↔ ${ix.name(e.b)}`
    case 'setRouteActive':
      return `${e.active ? 'open' : 'close'} ${ix.name(e.routeId)}`
    case 'setOwner':
      return `${ix.name(e.locationId)} passes to ${ix.name(e.factionId)}`
    case 'addModifier':
      return `${e.label}: ${ix.name(e.resourceId)} output at ${ix.name(e.locationId)} ×${e.factor} for ${e.duration} steps`
    case 'setWar':
      return e.active ? `war between ${ix.name(e.a)} and ${ix.name(e.b)}` : `peace between ${ix.name(e.a)} and ${ix.name(e.b)}`
    case 'setAlliance':
      return e.active ? `alliance of ${ix.name(e.a)} and ${ix.name(e.b)}` : `${ix.name(e.a)} and ${ix.name(e.b)} break their alliance`
    case 'adjustTech':
      return `${ix.name(e.factionId)} productivity ${signed(e.delta)}`
    case 'startPlague':
      return `plague breaks out in ${ix.name(e.locationId)} for ${e.duration} steps`
  }
}
