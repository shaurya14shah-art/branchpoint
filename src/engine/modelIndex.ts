import type { FactionDef, Id, LocationDef, ResourceDef, Rule, TradeRouteDef, WorldModel } from './model'

export interface ModelIndex {
  resources: Map<Id, ResourceDef>
  factions: Map<Id, FactionDef>
  locations: Map<Id, LocationDef>
  routes: Map<Id, TradeRouteDef>
  rules: Map<Id, Rule>
  regions: Set<string>
  /** Display name for any entity id, falling back to the id itself. */
  name(id: Id): string
  has(id: Id): boolean
}

const cache = new WeakMap<WorldModel, ModelIndex>()

/** Lookup tables for a model. Models are treated as immutable, so the index is cached. */
export function indexModel(model: WorldModel): ModelIndex {
  const hit = cache.get(model)
  if (hit) return hit
  const resources = new Map(model.resources.map((r) => [r.id, r]))
  const factions = new Map(model.factions.map((f) => [f.id, f]))
  const locations = new Map(model.locations.map((l) => [l.id, l]))
  const routes = new Map(model.routes.map((r) => [r.id, r]))
  const rules = new Map(model.rules.map((r) => [r.id, r]))
  const regions = new Set(model.locations.map((l) => l.region).filter(Boolean))
  const names = new Map<Id, string>()
  for (const list of [model.resources, model.factions, model.locations, model.routes, model.rules, model.events]) {
    for (const e of list) names.set(e.id, e.name)
  }
  const index: ModelIndex = {
    resources,
    factions,
    locations,
    routes,
    rules,
    regions,
    name: (id) => names.get(id) ?? id,
    has: (id) => names.has(id),
  }
  cache.set(model, index)
  return index
}

export function byId<T extends { id: Id }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
