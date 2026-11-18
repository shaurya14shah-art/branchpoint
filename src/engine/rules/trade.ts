import type { TradeRule } from '../model'
import { addRelation, addStock, getRelation, isAllied, isAtWar } from '../ops'
import { fmt, signed } from '../format'
import type { RuleImpl } from './types'

export const trade: RuleImpl<TradeRule> = {
  type: 'trade',
  label: 'Trade',
  summary: 'Moves goods along trade routes, respecting reserves and relations.',
  validate(rule, refs, path) {
    if (rule.routeIds !== 'all') rule.routeIds.forEach((id, i) => refs.route(id, `${path}.routeIds[${i}]`))
  },
  apply(rule, ctx) {
    const ids = rule.routeIds === 'all' ? ctx.model.routes.map((r) => r.id) : rule.routeIds
    for (const routeId of [...ids].sort()) {
      const route = ctx.index.routes.get(routeId)
      const rs = ctx.state.routes[routeId]
      if (!route || !rs || !rs.active) continue
      const from = ctx.state.locations[route.fromId]
      const to = ctx.state.locations[route.toId]
      if (!from || !to) continue
      const res = ctx.index.name(route.resourceId)
      const crossFaction = from.ownerId !== to.ownerId
      // A blockage is notable when it starts; while it persists it is routine.
      const severity = (ctx.prev.routes[routeId]?.lastTransferred ?? 0) > 0 ? 'notable' : 'info'
      const entityIds = [routeId, route.fromId, route.toId, route.resourceId]
      if (crossFaction && isAtWar(ctx.state, from.ownerId, to.ownerId)) {
        ctx.emit({ kind: 'trade-blocked', severity, ruleId: rule.id, message: `${route.name} halted: ${ctx.index.name(from.ownerId)} and ${ctx.index.name(to.ownerId)} are at war`, entityIds: [...entityIds, from.ownerId, to.ownerId], changes: [] })
        continue
      }
      if (crossFaction && !isAllied(ctx.state, from.ownerId, to.ownerId)) {
        const rel = getRelation(ctx.state, from.ownerId, to.ownerId)
        if (rel < route.minRelation) {
          ctx.emit({
            kind: 'trade-blocked',
            severity,
            ruleId: rule.id,
            message: `${route.name} halted: relations ${ctx.index.name(from.ownerId)} ↔ ${ctx.index.name(to.ownerId)} at ${fmt(rel)}, route needs ${fmt(route.minRelation)}`,
            entityIds: [...entityIds, from.ownerId, to.ownerId],
            changes: [],
          })
          continue
        }
      }
      const available = Math.max(0, (from.stock[route.resourceId] ?? 0) - rule.reserve)
      const amount = Math.min(route.amount, available)
      if (amount <= 0) {
        ctx.emit({
          kind: 'trade-blocked',
          severity,
          ruleId: rule.id,
          message: `${route.name} carried nothing: ${ctx.index.name(route.fromId)} has no ${res} above its reserve of ${fmt(rule.reserve)}`,
          entityIds,
          changes: [],
        })
        continue
      }
      const out = addStock(ctx.state, route.fromId, route.resourceId, -amount)
      const inc = addStock(ctx.state, route.toId, route.resourceId, amount)
      rs.lastTransferred = amount
      const changes = [out.change, inc.change]
      if (crossFaction && rule.relationGain !== 0) changes.push(addRelation(ctx.state, from.ownerId, to.ownerId, rule.relationGain))
      ctx.emit({
        kind: 'trade',
        severity: 'info',
        ruleId: rule.id,
        message: `${route.name}: ${fmt(amount)} ${res} ${ctx.index.name(route.fromId)} → ${ctx.index.name(route.toId)}${amount < route.amount ? ` (capacity ${fmt(route.amount)}, limited by stock)` : ''}`,
        entityIds: crossFaction ? [...entityIds, from.ownerId, to.ownerId] : entityIds,
        changes,
      })
    }
  },
  describe(rule, ix) {
    const which = rule.routeIds === 'all' ? 'every active trade route' : rule.routeIds.map((id) => ix.name(id)).join(', ')
    const rel = rule.relationGain !== 0 ? ` Each cross-faction delivery shifts relations by ${signed(rule.relationGain)}.` : ''
    return `Ships goods along ${which} each step, never drawing a source below ${fmt(rule.reserve)}. Routes between factions halt during war, and when relations fall below the route's minimum unless the two are allied.${rel}`
  },
}
