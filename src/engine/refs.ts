import type { Condition, Effect, Id, Metric, Scope, WorldModel } from './model'
import { indexModel, type ModelIndex } from './modelIndex'

export interface ValidationIssue {
  severity: 'error' | 'warning'
  path: string
  message: string
}

/** Collects semantic validation issues against a model's entity references. */
export class RefChecker {
  readonly issues: ValidationIssue[] = []
  readonly index: ModelIndex

  constructor(readonly model: WorldModel) {
    this.index = indexModel(model)
  }

  error(path: string, message: string) {
    this.issues.push({ severity: 'error', path, message })
  }

  warn(path: string, message: string) {
    this.issues.push({ severity: 'warning', path, message })
  }

  resource(id: Id, path: string) {
    if (!this.index.resources.has(id)) this.error(path, `unknown resource "${id}"`)
  }

  location(id: Id, path: string) {
    if (!this.index.locations.has(id)) this.error(path, `unknown location "${id}"`)
  }

  faction(id: Id, path: string) {
    if (!this.index.factions.has(id)) this.error(path, `unknown faction "${id}"`)
  }

  route(id: Id, path: string) {
    if (!this.index.routes.has(id)) this.error(path, `unknown trade route "${id}"`)
  }

  scope(scope: Scope, path: string) {
    if (scope.kind === 'location') this.location(scope.id, `${path}.id`)
    if (scope.kind === 'faction') this.faction(scope.id, `${path}.id`)
    if (scope.kind === 'region' && !this.index.regions.has(scope.region))
      this.error(`${path}.region`, `no location is in region "${scope.region}"`)
  }

  metric(m: Metric, path: string) {
    switch (m.kind) {
      case 'stock':
        this.location(m.locationId, `${path}.locationId`)
        this.resource(m.resourceId, `${path}.resourceId`)
        break
      case 'factionStock':
        this.faction(m.factionId, `${path}.factionId`)
        this.resource(m.resourceId, `${path}.resourceId`)
        break
      case 'population':
        this.location(m.locationId, `${path}.locationId`)
        break
      case 'factionPopulation':
      case 'stability':
        this.faction(m.factionId, `${path}.factionId`)
        break
      case 'relation':
        this.faction(m.a, `${path}.a`)
        this.faction(m.b, `${path}.b`)
        if (m.a === m.b) this.error(path, 'a relation needs two different factions')
        break
    }
  }

  condition(c: Condition, path: string) {
    this.metric(c.metric, `${path}.metric`)
  }

  effect(e: Effect, path: string) {
    switch (e.kind) {
      case 'adjustStock':
      case 'setStock':
      case 'addModifier':
        this.location(e.locationId, `${path}.locationId`)
        this.resource(e.resourceId, `${path}.resourceId`)
        break
      case 'adjustPopulation':
      case 'setPopulation':
        this.location(e.locationId, `${path}.locationId`)
        break
      case 'adjustStability':
      case 'setStability':
        this.faction(e.factionId, `${path}.factionId`)
        break
      case 'adjustRelation':
        this.faction(e.a, `${path}.a`)
        this.faction(e.b, `${path}.b`)
        if (e.a === e.b) this.error(path, 'a relation needs two different factions')
        break
      case 'setRouteActive':
        this.route(e.routeId, `${path}.routeId`)
        break
      case 'setOwner':
        this.location(e.locationId, `${path}.locationId`)
        this.faction(e.factionId, `${path}.factionId`)
        break
      case 'setWar':
      case 'setAlliance':
        this.faction(e.a, `${path}.a`)
        this.faction(e.b, `${path}.b`)
        if (e.a === e.b) this.error(path, 'needs two different factions')
        break
      case 'adjustTech':
        this.faction(e.factionId, `${path}.factionId`)
        break
      case 'startPlague':
        this.location(e.locationId, `${path}.locationId`)
        break
    }
  }
}
