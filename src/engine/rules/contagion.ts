import type { Change, ContagionRule, Id } from '../model'
import { addPopulation, addStability, setPlague } from '../ops'
import { locationHunger } from '../society'
import { fmt, pct } from '../format'
import type { RuleImpl } from './types'

const IMMUNITY = 14

/**
 * Plague. Infected settlements lose people every step; outbreaks are more likely in crowded,
 * hungry places, and travel along routes that actually carried goods last step. New infections
 * are decided from the start-of-rule state, so contagion cannot cascade within one step.
 */
export const contagion: RuleImpl<ContagionRule> = {
  type: 'contagion',
  label: 'Contagion',
  summary: 'Plague breaks out in crowded, hungry settlements and spreads along busy trade routes.',
  validate(rule, refs, path) {
    refs.resource(rule.foodResourceId, `${path}.foodResourceId`)
  },
  apply(rule, ctx) {
    const s = ctx.state
    const ix = ctx.index
    const ids = Object.keys(s.locations).sort()
    const infectedAtStart = new Set(ids.filter((id) => (s.locations[id]?.plague ?? 0) > 0))

    // 1. The sick: deaths, unrest, recovery.
    const deaths: Change[] = []
    const dead: Id[] = []
    for (const id of infectedAtStart) {
      const l = s.locations[id]
      if (!l) continue
      const lost = Math.round(l.population * rule.mortality * (1 + locationHunger(s, id, rule.foodResourceId) * 0.6))
      if (lost > 0) {
        deaths.push(addPopulation(s, id, -lost).change, addStability(s, l.ownerId, -1.5))
        dead.push(id, l.ownerId)
      }
      deaths.push(setPlague(s, id, l.plague - 1))
      if (l.plague === 0) {
        l.immunity = IMMUNITY
        ctx.emit({ kind: 'plague', severity: 'notable', ruleId: rule.id, message: `The plague burns itself out in ${ix.name(id)}`, entityIds: [id], changes: [] })
      }
    }
    if (deaths.length) ctx.emit({ kind: 'plague', severity: 'warning', ruleId: rule.id, message: `Plague deaths in ${[...new Set(dead.filter((d) => ix.locations.has(d)))].map((d) => ix.name(d)).join(', ')}`, entityIds: [...new Set(dead)], changes: deaths })

    // 2. Spread along routes that moved goods last step.
    const newly = new Map<Id, string>()
    for (const r of [...ctx.model.routes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if ((ctx.prev.routes[r.id]?.lastTransferred ?? 0) <= 0) continue
      for (const [src, dst] of [[r.fromId, r.toId], [r.toId, r.fromId]] as const) {
        const d = s.locations[dst]
        if (!infectedAtStart.has(src) || !d || d.plague > 0 || d.immunity > 0 || newly.has(dst)) continue
        if (ctx.rng.next() < rule.spreadChance) newly.set(dst, `carried from ${ix.name(src)} along the ${r.name}`)
      }
    }
    // 3. Spontaneous outbreaks.
    for (const id of ids) {
      const l = s.locations[id]
      if (!l || l.plague > 0 || l.immunity > 0 || infectedAtStart.has(id) || newly.has(id)) continue
      const crowding = Math.min(2.5, Math.max(0.3, l.population / 900))
      const p = rule.outbreakChance * crowding * (1 + locationHunger(s, id, rule.foodResourceId) * 1.5)
      if (ctx.rng.next() < p) newly.set(id, `crowding ×${fmt(crowding)}, hunger ${pct(locationHunger(s, id, rule.foodResourceId))}`)
    }
    for (const [id, why] of newly) {
      const owner = s.locations[id]?.ownerId
      ctx.emit({
        kind: 'plague',
        severity: 'critical',
        ruleId: rule.id,
        message: `Plague breaks out in ${ix.name(id)}`,
        entityIds: owner ? [id, owner] : [id],
        changes: [setPlague(s, id, rule.duration), ...(owner ? [addStability(s, owner, -4)] : [])],
        detail: why,
      })
    }
    // 4. Immunity wanes.
    for (const id of ids) {
      const l = s.locations[id]
      if (l && l.immunity > 0 && !newly.has(id)) l.immunity -= 1
    }
  },
  describe(rule, ix) {
    return `Each healthy settlement risks an outbreak (${pct(rule.outbreakChance)} base, more when crowded or short of ${ix.name(rule.foodResourceId)}). A sick settlement loses ${pct(rule.mortality)} of its people per step for ${rule.duration} steps and infects trade partners along busy routes (${pct(rule.spreadChance)} per route). Survivors are immune for ${IMMUNITY} steps.`
  },
}
