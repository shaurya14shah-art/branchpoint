import type { Change, GrowthRule, Id } from '../model'
import { addPopulation } from '../ops'
import { resolveScope } from '../metrics'
import { fmt, pct, scopeText, signed } from '../format'
import type { RuleImpl } from './types'

export const growth: RuleImpl<GrowthRule> = {
  type: 'growth',
  label: 'Population growth',
  summary: 'Populations grow while a resource is in surplus.',
  validate(rule, refs, path) {
    refs.scope(rule.scope, `${path}.scope`)
    refs.resource(rule.resourceId, `${path}.resourceId`)
  },
  apply(rule, ctx) {
    const changes: Change[] = []
    const entityIds: Id[] = []
    let total = 0
    for (const locationId of resolveScope(rule.scope, ctx.model, ctx.state)) {
      const loc = ctx.state.locations[locationId]
      if (!loc || loc.population <= 0) continue
      const required = (rule.surplusPerCapita * loc.population) / 100
      if ((loc.stock[rule.resourceId] ?? 0) < required) continue
      const delta = Math.max(1, Math.round(loc.population * rule.rate))
      const { applied, change } = addPopulation(ctx.state, locationId, delta)
      changes.push(change)
      entityIds.push(locationId)
      total += applied
    }
    if (changes.length === 0) return
    ctx.emit({
      kind: 'growth',
      severity: 'info',
      ruleId: rule.id,
      message: `${rule.name}: population ${signed(total)} across ${changes.length} location${changes.length === 1 ? '' : 's'}`,
      entityIds,
      changes,
    })
  },
  describe(rule, ix) {
    return `${scopeText(rule.scope, ix)} grows by ${pct(rule.rate)} per step while it holds at least ${fmt(rule.surplusPerCapita)} ${ix.name(rule.resourceId)} per 100 people (checked after earlier rules this step).`
  },
}
