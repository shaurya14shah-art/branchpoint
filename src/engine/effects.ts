import type { Change, Effect, Id } from './model'
import type { StepContext } from './context'
import * as ops from './ops'

/**
 * Applies one effect to the draft state and returns the resulting changes plus the entity ids
 * involved. Shared by threshold rules, scheduled events and user interventions.
 */
export function applyEffect(ctx: StepContext, effect: Effect, sourceId: Id): { changes: Change[]; entityIds: Id[] } {
  const s = ctx.state
  switch (effect.kind) {
    case 'adjustStock':
      return {
        changes: [ops.addStock(s, effect.locationId, effect.resourceId, effect.delta).change],
        entityIds: [effect.locationId, effect.resourceId],
      }
    case 'setStock':
      return {
        changes: [ops.setStock(s, effect.locationId, effect.resourceId, effect.value)],
        entityIds: [effect.locationId, effect.resourceId],
      }
    case 'adjustPopulation':
      return { changes: [ops.addPopulation(s, effect.locationId, effect.delta).change], entityIds: [effect.locationId] }
    case 'setPopulation':
      return { changes: [ops.setPopulation(s, effect.locationId, effect.value)], entityIds: [effect.locationId] }
    case 'adjustStability':
      return { changes: [ops.addStability(s, effect.factionId, effect.delta)], entityIds: [effect.factionId] }
    case 'setStability':
      return { changes: [ops.setStability(s, effect.factionId, effect.value)], entityIds: [effect.factionId] }
    case 'adjustRelation':
      return { changes: [ops.addRelation(s, effect.a, effect.b, effect.delta)], entityIds: [effect.a, effect.b] }
    case 'setRouteActive':
      return { changes: [ops.setRouteActive(s, effect.routeId, effect.active)], entityIds: [effect.routeId] }
    case 'setOwner':
      return { changes: [ops.setOwner(s, effect.locationId, effect.factionId)], entityIds: [effect.locationId, effect.factionId] }
    case 'addModifier': {
      const l = s.locations[effect.locationId]
      if (!l) throw new ops.SimulationError(`Unknown location "${effect.locationId}"`)
      const before = ops.modifierFactor(s, effect.locationId, effect.resourceId)
      l.modifiers.push({
        id: `${sourceId}@${ctx.step}`,
        resourceId: effect.resourceId,
        factor: effect.factor,
        remaining: effect.duration,
        label: effect.label,
      })
      const after = ops.modifierFactor(s, effect.locationId, effect.resourceId)
      return {
        changes: [
          {
            target: { kind: 'modifier', locationId: effect.locationId, resourceId: effect.resourceId },
            before,
            after,
            note: `${effect.label}: ×${effect.factor} for ${effect.duration} step${effect.duration === 1 ? '' : 's'}`,
          },
        ],
        entityIds: [effect.locationId, effect.resourceId],
      }
    }
    case 'setWar':
      return { changes: ops.setWar(s, effect.a, effect.b, effect.active, ctx.step), entityIds: [effect.a, effect.b] }
    case 'setAlliance':
      // An alliance cannot be formed during a war; refuse with a recorded no-op rather than throw.
      if (effect.active && ops.isAtWar(s, effect.a, effect.b))
        return { changes: [{ target: { kind: 'alliance', a: effect.a, b: effect.b }, before: false, after: false, note: 'blocked: the two are at war' }], entityIds: [effect.a, effect.b] }
      return { changes: ops.setAlliance(s, effect.a, effect.b, effect.active, ctx.step), entityIds: [effect.a, effect.b] }
    case 'adjustTech':
      return { changes: [ops.addTech(s, effect.factionId, effect.delta)], entityIds: [effect.factionId] }
    case 'startPlague':
      return { changes: [ops.setPlague(s, effect.locationId, effect.duration)], entityIds: [effect.locationId] }
  }
}

export function applyEffects(ctx: StepContext, effects: Effect[], sourceId: Id) {
  const changes: Change[] = []
  const entityIds: Id[] = []
  for (const e of effects) {
    const r = applyEffect(ctx, e, sourceId)
    changes.push(...r.changes)
    entityIds.push(...r.entityIds)
  }
  return { changes, entityIds }
}
