import type { SuccessionRule } from '../model'
import { addStability } from '../ops'
import { epithetFor, generateRuler, rulerLabel } from '../names'
import { livingFactions } from '../society'
import { fmt } from '../format'
import type { RuleImpl } from './types'

/**
 * Rulers age and die (or are deposed when stability collapses). Each heir is drawn from the seed
 * with a new temperament, which changes how the faction behaves under the decisions rule.
 */
export const succession: RuleImpl<SuccessionRule> = {
  type: 'succession',
  label: 'Rulers & succession',
  summary: 'Rulers age, die or are deposed; heirs bring new temperaments.',
  validate() {},
  apply(rule, ctx) {
    const s = ctx.state
    for (const f of livingFactions(s)) {
      const st = s.factions[f]
      if (!st) continue
      const r = st.ruler
      if (ctx.step % rule.stepsPerYear === 0) r.age += 1
      const yearly = r.age < 45 ? 0.006 : 0.006 + (r.age - 45) * 0.011
      const coup = st.stability < 15 ? 0.05 : 0
      const roll = ctx.rng.next()
      if (roll >= yearly / rule.stepsPerYear + coup) continue
      const deposed = roll >= yearly / rule.stepsPerYear
      const old = rulerLabel(r)
      const reign = Math.round((ctx.step - r.since) / rule.stepsPerYear)
      st.ruler = generateRuler(ctx.rng, ctx.step, deposed ? 25 : 16, 30)
      st.ruler.epithet = epithetFor(st.ruler.boldness, st.ruler.wisdom)
      const crisis = -rule.crisisStability * (0.4 + ctx.rng.next() * 0.9)
      ctx.emit({
        kind: 'succession',
        severity: 'critical',
        ruleId: rule.id,
        message: deposed
          ? `${old} of ${ctx.index.name(f)} is deposed amid unrest; ${rulerLabel(st.ruler)} takes power`
          : `${old} of ${ctx.index.name(f)} dies at ${r.age} after ${reign} years; ${rulerLabel(st.ruler)} succeeds`,
        entityIds: [f],
        changes: [{ target: { kind: 'ruler', factionId: f }, before: old, after: rulerLabel(st.ruler) }, addStability(s, f, crisis)],
        detail: `Boldness ${fmt(st.ruler.boldness)}, wisdom ${fmt(st.ruler.wisdom)} — these shift the faction’s decisions`,
      })
    }
  },
  describe(rule) {
    return `Rulers age one year every ${rule.stepsPerYear} step${rule.stepsPerYear === 1 ? '' : 's'}; death becomes likely past 45, and collapsing stability (<15) invites a coup. Heirs bring new boldness and wisdom; a succession costs up to ${fmt(rule.crisisStability * 1.3)} stability.`
  },
}
