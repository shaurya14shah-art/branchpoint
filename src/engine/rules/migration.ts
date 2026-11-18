import type { Change, Id, MigrationRule, WorldState } from '../model'
import { addPopulation, isAtWar } from '../ops'
import { locationHunger, relation, warsOf } from '../society'
import { fmt, pct } from '../format'
import type { RuleImpl } from './types'

function appeal(s: WorldState, id: Id, food: Id): number {
  const l = s.locations[id]
  if (!l) return 0
  const f = s.factions[l.ownerId]
  return (1 - locationHunger(s, id, food)) * 1.2 + (f?.stability ?? 50) / 100 + ((f?.tech ?? 1) - 1) * 0.5 - (l.plague > 0 ? 0.9 : 0) - (warsOf(s, l.ownerId).length > 0 ? 0.3 : 0)
}

/**
 * Migration. People follow trade routes from places with poor prospects (hunger, unrest, plague,
 * war) to better ones, including across borders when relations are friendly. Flows are computed
 * from the start-of-rule state, then applied in route order.
 */
export const migration: RuleImpl<MigrationRule> = {
  type: 'migration',
  label: 'Migration',
  summary: 'People move along routes toward food, safety and stability.',
  validate(rule, refs, path) {
    refs.resource(rule.foodResourceId, `${path}.foodResourceId`)
  },
  apply(rule, ctx) {
    const s = ctx.state
    const ix = ctx.index
    const scores = new Map(Object.keys(s.locations).map((id) => [id, appeal(s, id, rule.foodResourceId)]))
    const flows: { from: Id; to: Id; people: number; gap: number }[] = []
    for (const r of [...ctx.model.routes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      for (const [x, y] of [[r.fromId, r.toId], [r.toId, r.fromId]] as const) {
        const lx = s.locations[x]
        const ly = s.locations[y]
        if (!lx || !ly) continue
        const gap = (scores.get(y) ?? 0) - (scores.get(x) ?? 0)
        if (gap < 0.3) continue
        if (lx.ownerId !== ly.ownerId && (isAtWar(s, lx.ownerId, ly.ownerId) || relation(s, lx.ownerId, ly.ownerId) < 0)) continue
        const people = Math.round(lx.population * rule.rate * Math.min(1, gap - 0.2))
        if (people >= 3) flows.push({ from: x, to: y, people, gap })
      }
    }
    for (const fl of flows) {
      const out = addPopulation(s, fl.from, -fl.people)
      const moved = -out.applied
      if (moved <= 0) continue
      const changes: Change[] = [out.change, addPopulation(s, fl.to, moved).change]
      const cross = s.locations[fl.from]?.ownerId !== s.locations[fl.to]?.ownerId
      const big = moved > ((s.locations[fl.from]?.population ?? 0) + moved) * 0.08
      ctx.emit({
        kind: 'migration',
        severity: big || cross ? 'notable' : 'info',
        ruleId: rule.id,
        message: `${fmt(moved)} people leave ${ix.name(fl.from)} for ${ix.name(fl.to)}${cross ? ` (${ix.name(s.locations[fl.to]?.ownerId ?? '')} lands)` : ''}`,
        entityIds: [fl.from, fl.to],
        changes,
        detail: `Prospects gap ${fmt(fl.gap)} (food, stability, innovation, plague, war)`,
      })
    }
  },
  describe(rule, ix) {
    return `Along every route, up to ${pct(rule.rate)} of a settlement’s people per step move toward the end with clearly better prospects: ${ix.name(rule.foodResourceId)} per head, stability, innovation, and freedom from plague and war. Crossing borders requires non-negative relations and peace.`
  },
}
