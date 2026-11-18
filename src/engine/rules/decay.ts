import type { Change, DecayRule, Id } from '../model'
import { addStock } from '../ops'
import { resolveScope } from '../metrics'
import { pct, scopeText, signed } from '../format'
import type { RuleImpl } from './types'

export const decay: RuleImpl<DecayRule> = {
  type: 'decay',
  label: 'Spoilage',
  summary: 'A fraction of a stored resource is lost each step.',
  validate(rule, refs, path) {
    refs.scope(rule.scope, `${path}.scope`)
    refs.resource(rule.resourceId, `${path}.resourceId`)
  },
  apply(rule, ctx) {
    const changes: Change[] = []
    const entityIds: Id[] = [rule.resourceId]
    let total = 0
    for (const locationId of resolveScope(rule.scope, ctx.model, ctx.state)) {
      const stock = ctx.state.locations[locationId]?.stock[rule.resourceId] ?? 0
      const lost = Math.round(stock * rule.rate)
      if (lost <= 0) continue
      const { applied, change } = addStock(ctx.state, locationId, rule.resourceId, -lost)
      changes.push(change)
      entityIds.push(locationId)
      total += applied
    }
    if (changes.length === 0) return
    ctx.emit({
      kind: 'decay',
      severity: 'info',
      ruleId: rule.id,
      message: `${rule.name}: ${signed(total)} ${ctx.index.name(rule.resourceId)} spoiled across ${changes.length} location${changes.length === 1 ? '' : 's'}`,
      entityIds,
      changes,
    })
  },
  describe(rule, ix) {
    return `${pct(rule.rate)} of the ${ix.name(rule.resourceId)} stored at ${scopeText(rule.scope, ix)} spoils each step.`
  },
}
