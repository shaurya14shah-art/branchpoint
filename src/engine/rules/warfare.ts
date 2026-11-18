import type { Change, Id, WarfareRule } from '../model'
import { addExhaustion, addPopulation, addRelation, addStability, addStock, isAtWar as isAtWarWith, setOwner, setWar } from '../ops'
import { generateRuler, rulerLabel } from '../names'
import { factionLocations, factionPopulation } from '../metrics'
import { bestLocation, effectiveTraits, livingFactions, relation, strength, warsOf } from '../society'
import { fmt } from '../format'
import type { RuleImpl } from './types'

/**
 * Each step, every war fights one battle. The stronger side (strength × seeded fortune of war)
 * wins; both sides lose people and arms, exhaustion builds, and a decisive enough victory takes a
 * settlement. Wars end when a side is exhausted or loses its last settlement.
 */
const DEFENCE = 1.25 // home-ground advantage for the losing side's front
const SIEGE_STEPS = 3 // minimum steps between conquests in the same war

export const warfare: RuleImpl<WarfareRule> = {
  type: 'warfare',
  label: 'Warfare',
  summary: 'Battles, casualties, conquest and exhaustion for factions at war.',
  validate(rule, refs, path) {
    refs.resource(rule.armsResourceId, `${path}.armsResourceId`)
  },
  apply(rule, ctx) {
    const s = ctx.state
    const ix = ctx.index
    const arms = rule.armsResourceId

    for (const key of Object.keys(s.wars).sort()) {
      const war = s.wars[key]
      const [a, b] = key.split('|') as [Id, Id]
      if (!war) continue
      if (factionLocations(s, a).length === 0 || factionLocations(s, b).length === 0) {
        ctx.emit({ kind: 'peace', severity: 'critical', ruleId: rule.id, message: `The war between ${ix.name(a)} and ${ix.name(b)} ends: one side has nothing left to defend`, entityIds: [a, b], changes: setWar(s, a, b, false, ctx.step) })
        continue
      }
      // The side that declared (holds the older grievance) attacks; defenders get home ground.
      const sa = strength(s, a, arms) * (0.75 + ctx.rng.next() * 0.5)
      const sb = strength(s, b, arms) * (0.75 + ctx.rng.next() * 0.5)
      const [win, lose, sw, sl] = sa >= sb ? [a, b, sa, sb * DEFENCE] : [b, a, sb, sa * DEFENCE]
      const ratio = sl > 0 ? sw / sl : 10
      const changes: Change[] = []

      // Armies consume arms in proportion to their size.
      for (const side of [win, lose]) {
        const need = Math.round(factionPopulation(s, side) / 100)
        const depot = bestLocation(s, side, (id) => s.locations[id]?.stock[arms] ?? 0)
        if (depot && need > 0) changes.push(addStock(s, depot, arms, -need).change)
      }

      // Casualties: the losing front settlement bleeds; the winner pays a smaller price.
      const front = bestLocation(s, lose, (id) => -(s.locations[id]?.population ?? 0)) // weakest settlement
      const winFront = bestLocation(s, win, (id) => s.locations[id]?.population ?? 0)
      const loserLoss = Math.round(factionPopulation(s, lose) * rule.casualtyRate * Math.min(2, ratio) * 0.25)
      const winnerLoss = Math.round(factionPopulation(s, win) * rule.casualtyRate * 0.12 / Math.max(1, ratio))
      if (front && loserLoss > 0) changes.push(addPopulation(s, front, -loserLoss).change)
      if (winFront && winnerLoss > 0) changes.push(addPopulation(s, winFront, -winnerLoss).change)
      changes.push(addExhaustion(s, lose, 5 + Math.min(5, ratio * 1.5)), addExhaustion(s, win, 2.5), addStability(s, lose, -3), addStability(s, win, 1))

      let message = `Battle between ${ix.name(a)} and ${ix.name(b)}: ${ix.name(win)} prevails${front ? ` near ${ix.name(front)}` : ''} (${fmt(loserLoss)} vs ${fmt(winnerLoss)} fallen)`
      let kind: 'battle' | 'conquest' = 'battle'
      let severity: 'notable' | 'critical' = 'notable'
      const entityIds: Id[] = [win, lose, ...(front ? [front] : [])]

      // Conquest: a decisive victory takes the front settlement.
      const lastTaken = s.ruleCooldowns[`${rule.id}:siege:${key}`] ?? -99
      if (front && ratio >= rule.conquestRatio && ctx.step - lastTaken >= SIEGE_STEPS && ctx.rng.next() < 0.55) {
        s.ruleCooldowns[`${rule.id}:siege:${key}`] = ctx.step
        changes.push(setOwner(s, front, win))
        const loot = Math.round((s.locations[front]?.stock[arms] ?? 0) * 0.5)
        if (loot > 0 && winFront) {
          changes.push(addStock(s, front, arms, -loot).change, addStock(s, winFront, arms, loot).change)
        }
        changes.push(addStability(s, lose, -8), addRelation(s, a, b, -10))
        kind = 'conquest'
        severity = 'critical'
        message = `${ix.name(win)} storms ${ix.name(front)} and takes it from ${ix.name(lose)} (strength ×${fmt(ratio)})`
      }
      ctx.emit({ kind, severity, ruleId: rule.id, message, entityIds, changes, detail: `Strength with fortune of war: ${ix.name(a)} ${fmt(sa)} vs ${ix.name(b)} ${fmt(sb)}` })

      // Exhaustion or annihilation ends the war.
      const exA = s.factions[a]?.exhaustion ?? 0
      const exB = s.factions[b]?.exhaustion ?? 0
      if (factionLocations(s, lose).length === 0) {
        ctx.emit({ kind: 'peace', severity: 'critical', ruleId: rule.id, message: `${ix.name(lose)} has lost its last settlement; the war with ${ix.name(win)} is over`, entityIds: [a, b], changes: setWar(s, a, b, false, ctx.step) })
      } else if (exA >= rule.exhaustionLimit || exB >= rule.exhaustionLimit) {
        const tired = exA >= exB ? a : b
        const peace = [...setWar(s, a, b, false, ctx.step), addRelation(s, a, b, Math.max(0, -15 - relation(s, a, b))), addExhaustion(s, a, -15), addExhaustion(s, b, -15)]
        ctx.emit({ kind: 'peace', severity: 'critical', ruleId: rule.id, message: `Exhausted, ${ix.name(tired)} accepts a negotiated peace with ${ix.name(tired === a ? b : a)}`, entityIds: [a, b], changes: peace })
      }
    }

    // Occupied settlements may revolt and return to their own people — even reviving a lost faction.
    for (const id of Object.keys(s.locations).sort()) {
      const l = s.locations[id]
      if (!l || l.ownerId === l.culture || !s.factions[l.culture] || !ix.factions.has(l.culture)) continue
      const occupier = s.factions[l.ownerId]
      const homeAlive = factionLocations(s, l.culture).length > 0
      const p = 0.015 + ((occupier?.stability ?? 50) < 40 ? 0.04 : 0) + (homeAlive && isAtWarWith(s, l.ownerId, l.culture) ? 0.03 : 0) + (homeAlive ? 0 : 0.02)
      if (ctx.rng.next() >= p) continue
      const from = l.ownerId
      const changes: Change[] = [setOwner(s, id, l.culture), addPopulation(s, id, -Math.round(l.population * 0.04)).change, addStability(s, from, -5), addRelation(s, from, l.culture, -12)]
      const reborn = !homeAlive
      const home = s.factions[l.culture]
      if (reborn && home) {
        const old = rulerLabel(home.ruler)
        home.ruler = generateRuler(ctx.rng, ctx.step, 22, 20)
        home.stability = 45
        home.exhaustion = 0
        changes.push({ target: { kind: 'ruler', factionId: l.culture }, before: old, after: rulerLabel(home.ruler) })
      }
      ctx.emit({
        kind: 'conquest',
        severity: 'critical',
        ruleId: rule.id,
        message: reborn
          ? `${ix.name(id)} rises against ${ix.name(from)} — the ${ix.name(l.culture)} are reborn under ${rulerLabel(home?.ruler ?? generateRuler(ctx.rng, ctx.step))}`
          : `${ix.name(id)} throws off ${ix.name(from)} rule and returns to the ${ix.name(l.culture)}`,
        entityIds: [id, from, l.culture],
        changes,
        detail: `Revolt chance ${fmt(p * 100)}% (occupier stability ${fmt(occupier?.stability ?? 0)}${homeAlive ? '' : ', homeland lost'})`,
      })
    }

    // Weariness fades in peacetime.
    const recover: Change[] = []
    const ids: Id[] = []
    for (const f of livingFactions(s)) {
      const st = s.factions[f]
      if (!st || st.exhaustion <= 0 || warsOf(s, f).length > 0) continue
      const t = effectiveTraits(ctx.model, s, f)
      recover.push(addExhaustion(s, f, -(3 + t.caution * 3)))
      ids.push(f)
    }
    if (recover.length) ctx.emit({ kind: 'growth', severity: 'info', ruleId: rule.id, message: 'War weariness fades in peacetime', entityIds: ids, changes: recover })
  },
  describe(rule, ix) {
    return `Factions at war fight one battle per step. Strength = population × morale × innovation × supply of ${ix.name(rule.armsResourceId)}, varied by a seeded fortune of war. Losers lose up to ${fmt(rule.casualtyRate * 50)}% of their front; a win at ×${fmt(rule.conquestRatio)} strength can take a settlement. Wars end at ${fmt(rule.exhaustionLimit)} exhaustion, followed by a truce. Occupied settlements may revolt and return to their own people, even reviving a conquered faction.`
  },
}
