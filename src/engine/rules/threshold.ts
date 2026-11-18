import type { ThresholdRule } from '../model'
import { evaluateCondition } from '../metrics'
import { applyEffects } from '../effects'
import { conditionText, effectText, fmt } from '../format'
import type { RuleImpl } from './types'

export const threshold: RuleImpl<ThresholdRule> = {
  type: 'threshold',
  label: 'Threshold event',
  summary: 'When a condition holds, apply effects (with a cooldown).',
  validate(rule, refs, path) {
    refs.condition(rule.condition, `${path}.condition`)
    rule.effects.forEach((e, i) => refs.effect(e, `${path}.effects[${i}]`))
  },
  apply(rule, ctx) {
    const readyAt = ctx.state.ruleCooldowns[rule.id] ?? 0
    if (ctx.step < readyAt) return
    const { value, met } = evaluateCondition(rule.condition, ctx.state)
    if (!met) return
    const { changes, entityIds } = applyEffects(ctx, rule.effects, rule.id)
    ctx.state.ruleCooldowns[rule.id] = ctx.step + Math.max(1, rule.cooldown)
    ctx.emit({
      kind: 'threshold',
      severity: 'critical',
      ruleId: rule.id,
      message: `${rule.eventLabel} — ${conditionText(rule.condition, ctx.index)} (now ${fmt(value)})`,
      entityIds,
      changes,
    })
  },
  describe(rule, ix) {
    const cd = rule.cooldown > 0 ? ` It can fire again ${rule.cooldown} steps later.` : ' It fires every step the condition holds.'
    return `When ${conditionText(rule.condition, ix)}: “${rule.eventLabel}” — ${rule.effects.map((e) => effectText(e, ix)).join('; ')}.${cd}`
  },
}
