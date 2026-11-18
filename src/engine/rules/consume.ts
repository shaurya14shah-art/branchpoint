import type { Change, ConsumeRule, Id } from '../model'
import { addPopulation, addStability, addStock } from '../ops'
import { resolveScope } from '../metrics'
import { fmt, pct, scopeText, signed } from '../format'
import type { RuleImpl } from './types'

export const consume: RuleImpl<ConsumeRule> = {
  type: 'consume',
  label: 'Consumption',
  summary: 'Locations use up a resource; unmet need causes a shortage.',
  validate(rule, refs, path) {
    refs.scope(rule.scope, `${path}.scope`)
    refs.resource(rule.resourceId, `${path}.resourceId`)
    if (rule.shortageStabilityDelta > 0) refs.warn(`${path}.shortageStabilityDelta`, 'shortages increase stability — is the sign intended?')
  },
  apply(rule, ctx) {
    const res = ctx.index.name(rule.resourceId)
    const changes: Change[] = []
    const entityIds: Id[] = [rule.resourceId]
    let total = 0
    for (const locationId of resolveScope(rule.scope, ctx.model, ctx.state)) {
      const loc = ctx.state.locations[locationId]
      if (!loc) continue
      const need = Math.round(rule.perCapita ? (rule.amount * loc.population) / 100 : rule.amount)
      if (need <= 0) continue
      const available = loc.stock[rule.resourceId] ?? 0
      const take = Math.min(need, available)
      if (take > 0) {
        const { applied, change } = addStock(ctx.state, locationId, rule.resourceId, -take)
        changes.push(change)
        entityIds.push(locationId)
        total -= applied
      }
      if (take < need) {
        const unmet = need - take
        const shortageChanges: Change[] = []
        if (rule.shortageStabilityDelta !== 0) shortageChanges.push(addStability(ctx.state, loc.ownerId, rule.shortageStabilityDelta))
        const lost = Math.round(loc.population * (unmet / need) * rule.shortagePopulationLoss)
        if (lost > 0) shortageChanges.push(addPopulation(ctx.state, locationId, -lost).change)
        ctx.emit({
          kind: 'shortage',
          severity: unmet / need >= 0.5 ? 'critical' : 'warning',
          ruleId: rule.id,
          message: `${ctx.index.name(locationId)} is short of ${res}: needed ${fmt(need)}, had ${fmt(available)}${lost > 0 ? `, ${fmt(lost)} people lost` : ''}`,
          entityIds: [locationId, loc.ownerId, rule.resourceId],
          changes: shortageChanges,
        })
      }
    }
    if (changes.length === 0) return
    ctx.emit({
      kind: 'consumption',
      severity: 'info',
      ruleId: rule.id,
      message: `${rule.name}: ${signed(-total)} ${res} across ${changes.length} location${changes.length === 1 ? '' : 's'}`,
      entityIds,
      changes,
    })
  },
  describe(rule, ix) {
    const amt = rule.perCapita ? `${fmt(rule.amount)} ${ix.name(rule.resourceId)} per 100 people` : `${fmt(rule.amount)} ${ix.name(rule.resourceId)}`
    const parts = [`${scopeText(rule.scope, ix)} consumes ${amt} each step.`]
    const pen: string[] = []
    if (rule.shortageStabilityDelta !== 0) pen.push(`owner stability ${signed(rule.shortageStabilityDelta)}`)
    if (rule.shortagePopulationLoss > 0) pen.push(`${pct(rule.shortagePopulationLoss)} of the unfed population is lost`)
    if (pen.length) parts.push(`If stock runs short: ${pen.join('; ')}.`)
    return parts.join(' ')
  },
}
