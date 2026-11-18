import type { Change, Id, ProduceRule } from '../model'
import { addStock, modifierFactor } from '../ops'
import { resolveScope } from '../metrics'
import { fmt, pct, scopeText, signed } from '../format'
import type { RuleImpl } from './types'

export const produce: RuleImpl<ProduceRule> = {
  type: 'produce',
  label: 'Production',
  summary: 'Locations generate a resource each step.',
  validate(rule, refs, path) {
    refs.scope(rule.scope, `${path}.scope`)
    refs.resource(rule.resourceId, `${path}.resourceId`)
  },
  apply(rule, ctx) {
    const changes: Change[] = []
    const entityIds: Id[] = [rule.resourceId]
    let total = 0
    for (const locationId of resolveScope(rule.scope, ctx.model, ctx.state)) {
      const loc = ctx.state.locations[locationId]
      if (!loc) continue
      const base = rule.perCapita ? (rule.amount * loc.population) / 100 : rule.amount
      const factor = modifierFactor(ctx.state, locationId, rule.resourceId) * (ctx.state.factions[loc.ownerId]?.tech ?? 1)
      // Draw only when variance is used, so toggling variance on one rule is the only thing
      // that changes the random stream.
      const jitter = rule.variance > 0 ? 1 + rule.variance * (2 * ctx.rng.next() - 1) : 1
      const qty = Math.round(base * factor * jitter)
      if (qty <= 0) continue
      const { applied, change } = addStock(ctx.state, locationId, rule.resourceId, qty)
      if (factor !== 1) change.note = `output ×${fmt(factor)} from modifiers and innovation`
      changes.push(change)
      entityIds.push(locationId)
      total += applied
    }
    if (changes.length === 0) return
    ctx.emit({
      kind: 'production',
      severity: 'info',
      ruleId: rule.id,
      message: `${rule.name}: ${signed(total)} ${ctx.index.name(rule.resourceId)} across ${changes.length} location${changes.length === 1 ? '' : 's'}`,
      entityIds,
      changes,
    })
  },
  describe(rule, ix) {
    const amt = rule.perCapita ? `${fmt(rule.amount)} per 100 people` : fmt(rule.amount)
    const v = rule.variance > 0 ? `, varying by up to ±${pct(rule.variance)} (seeded)` : ''
    return `${scopeText(rule.scope, ix)} produces ${amt} ${ix.name(rule.resourceId)} each step${v}. Active modifiers (e.g. drought) and the owner’s innovation multiply the output.`
  },
}
