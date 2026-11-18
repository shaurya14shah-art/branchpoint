import type { Change, DriftRule, Id } from '../model'
import { setStability } from '../ops'
import { fmt, pct } from '../format'
import type { RuleImpl } from './types'

export const drift: RuleImpl<DriftRule> = {
  type: 'drift',
  label: 'Stability drift',
  summary: 'Faction stability relaxes toward a baseline each step.',
  validate(rule, refs, path) {
    if (rule.factionIds !== 'all') rule.factionIds.forEach((id, i) => refs.faction(id, `${path}.factionIds[${i}]`))
  },
  apply(rule, ctx) {
    const ids = rule.factionIds === 'all' ? Object.keys(ctx.state.factions) : rule.factionIds
    const changes: Change[] = []
    const entityIds: Id[] = []
    for (const id of [...ids].sort()) {
      const f = ctx.state.factions[id]
      if (!f) continue
      const delta = Math.round((rule.target - f.stability) * rule.rate * 10) / 10
      if (delta === 0) continue
      changes.push(setStability(ctx.state, id, f.stability + delta))
      entityIds.push(id)
    }
    if (changes.length === 0) return
    ctx.emit({ kind: 'growth', severity: 'info', ruleId: rule.id, message: `${rule.name}: stability drifts toward ${fmt(rule.target)}`, entityIds, changes })
  },
  describe(rule, ix) {
    const who = rule.factionIds === 'all' ? 'Every faction' : rule.factionIds.map((id) => ix.name(id)).join(', ')
    return `${who} recovers ${pct(rule.rate)} of the gap between its stability and ${fmt(rule.target)} each step.`
  },
}
