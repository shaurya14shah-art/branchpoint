import type { AgencyRule, Change, Id } from '../model'
import type { StepContext } from '../context'
import { addPopulation, addRelation, addStability, addStock, addTech, inTruce, isAllied, isAtWar, setAlliance, setRouteActive, setWar } from '../ops'
import { factionLocations, factionPopulation, factionStock } from '../metrics'
import { alliesOf, bestLocation, effectiveTraits, factionHunger, fmtReasons, livingFactions, locationHunger, relation, strength, warsOf } from '../society'
import { rulerLabel } from '../names'
import { fmt, pct } from '../format'
import type { RuleImpl } from './types'

/**
 * Faction agency. Each step, every living faction may take one action. Options are scored from
 * the faction's traits (blended with its ruler), its hunger, strength, relations and wars; a
 * small seeded perturbation breaks ties so different seeds produce different histories. The
 * winning option's score breakdown is recorded on the event, so every decision is explainable.
 */

type Reasons = [string, number][]
interface Option {
  label: string
  utility: number
  reasons: Reasons
  run: () => void
}

const INNOVATIONS = [
  'crop rotation', 'deep-keeled hulls', 'tidal mills', 'iron ploughshares', 'granary ledgers', 'lens-grinding',
  'terraced irrigation', 'standardised weights', 'kiln-dried timber', 'navigational star charts', 'printing blocks',
  'blast furnaces', 'canal locks', 'double-entry bookkeeping', 'clockwork pumps', 'vaccination by variolation',
]

const sumUtility = (r: Reasons) => r.reduce((a, [, v]) => a + v, 0)

export const agency: RuleImpl<AgencyRule> = {
  type: 'agency',
  label: 'Faction decisions',
  summary: 'Factions raid, trade, ally, invest, declare war or sue for peace according to personality and need.',
  validate(rule, refs, path) {
    refs.resource(rule.foodResourceId, `${path}.foodResourceId`)
    refs.resource(rule.investResourceId, `${path}.investResourceId`)
  },
  apply(rule, ctx) {
    for (const f of livingFactions(ctx.state)) {
      if (ctx.rng.next() >= rule.activity) continue
      // A faction may have been conquered by an earlier decision this step.
      if (factionLocations(ctx.state, f).length === 0) continue
      decide(rule, ctx, f)
    }
  },
  describe(rule, ix) {
    return `Each step, every faction acts with ${pct(rule.activity)} probability, choosing among raiding, war, peace, alliances, aid, embargoes, reopening trade, restoring order and investing ${ix.name(rule.investResourceId)} in innovation. Choices weigh personality and the ruler’s temperament against hunger for ${ix.name(rule.foodResourceId)}, relative strength and relations, with seeded variation (temperament ×${fmt(rule.temperament)}).`
  },
}

function decide(rule: AgencyRule, ctx: StepContext, f: Id) {
  const s = ctx.state
  const ix = ctx.index
  const food = rule.foodResourceId
  const temper = rule.temperament
  const T = effectiveTraits(ctx.model, s, f)
  const fState = s.factions[f]
  if (!fState) return
  const hunger = factionHunger(s, f, food)
  const myStrength = strength(s, f, rule.investResourceId)
  const wars = warsOf(s, f)
  const others = livingFactions(s).filter((x) => x !== f)
  const name = ix.name(f)
  const who = `${name} (${rulerLabel(fState.ruler)})`
  const options: Option[] = []

  const emit = (kind: 'decision' | 'war' | 'peace' | 'alliance' | 'innovation', severity: 'notable' | 'critical' | 'warning', message: string, entityIds: Id[], changes: Change[], reasons: Reasons) =>
    ctx.emit({ kind, severity, ruleId: rule.id, message, entityIds, changes, detail: `Chosen by ${name}: ${fmtReasons(reasons)}` })

  for (const b of others) {
    const rel = relation(s, f, b)
    const atWar = isAtWar(s, f, b)
    const allied = isAllied(s, f, b)
    const theirStrength = strength(s, b, rule.investResourceId)
    const ratio = theirStrength > 0 ? myStrength / theirStrength : 3
    const bName = ix.name(b)
    const bHunger = factionHunger(s, b, food)

    // ── Raid: take food from a rival's best-stocked settlement ──
    if (!allied && !atWar && factionStock(s, b, food) > 50) {
      const reasons: Reasons = [
        ['aggression', T.aggression * 0.6],
        ['hunger', hunger * 0.9],
        ['caution', -T.caution * 0.45],
        ['relations', rel < 0 ? -rel / 200 : -rel / 90],
        ['strength', Math.min(0.3, (ratio - 1) * 0.2)],
        ['base', -0.45],
      ]
      options.push({
        label: `raid ${bName}`,
        utility: sumUtility(reasons),
        reasons,
        run: () => {
          const from = bestLocation(s, b, (id) => s.locations[id]?.stock[food] ?? 0)
          const to = bestLocation(s, f, (id) => locationHunger(s, id, food) * 1000 + (s.locations[id]?.population ?? 0) / 1000)
          if (!from || !to) return
          const success = ctx.rng.next() < ratio / (ratio + 0.8)
          const changes: Change[] = [addRelation(s, f, b, -10 * temper), addStability(s, b, -4)]
          if (success) {
            const want = Math.round(Math.min((s.locations[from]?.stock[food] ?? 0) * 0.25 * temper, (factionPopulation(s, f) / 100) * 12))
            const lost = addStock(s, from, food, -want)
            const taken = -lost.applied
            const got = addStock(s, to, food, taken)
            changes.unshift(lost.change, got.change)
            changes.push(addStability(s, f, 2))
            emit('decision', 'critical', `${who} raids ${ix.name(from)} and carries off ${fmt(taken)} ${ix.name(food)} to ${ix.name(to)}`, [f, b, from, to, food], changes, reasons)
          } else {
            const biggest = bestLocation(s, f, (id) => s.locations[id]?.population ?? 0)
            if (biggest) changes.push(addPopulation(s, biggest, -Math.round((s.locations[biggest]?.population ?? 0) * 0.02)).change)
            changes.push(addStability(s, f, -3))
            emit('decision', 'warning', `${who} raids ${ix.name(from)} but the raiders are driven off`, [f, b, from], changes, reasons)
          }
        },
      })
    }

    // ── Declare war ──
    if (!atWar && !allied && rel < -35 && wars.length < 2 && !inTruce(s, f, b, ctx.step)) {
      const reasons: Reasons = [
        ['aggression', T.aggression * 0.8],
        ['grievance', (-rel - 35) / 90],
        ['strength', Math.max(-0.5, Math.min(0.5, (ratio - 1) * 0.45))],
        ['hunger', hunger * 0.35],
        ['caution', -T.caution * 0.6],
        ['weariness', -fState.exhaustion / 80],
        ['base', -0.4],
      ]
      options.push({
        label: `declare war on ${bName}`,
        utility: sumUtility(reasons),
        reasons,
        run: () => {
          const changes = [...setWar(s, f, b, true, ctx.step), addRelation(s, f, b, -15)]
          emit('war', 'critical', `${who} declares war on ${bName}`, [f, b], changes, reasons)
          callToArms(ctx, rule.id, f, b)
        },
      })
    }

    // ── Sue for peace ──
    const war = s.wars[`${f < b ? f : b}|${f < b ? b : f}`]
    if (atWar && war && ctx.step - war.since >= 3) {
      const reasons: Reasons = [
        ['caution', T.caution * 0.5],
        ['weariness', fState.exhaustion / 70],
        ['hunger', hunger * 0.3],
        ['losing', Math.max(0, (1 / Math.max(ratio, 0.1) - 1) * 0.3)],
        ['aggression', -T.aggression * 0.45],
        ['base', -0.15],
      ]
      options.push({
        label: `sue ${bName} for peace`,
        utility: sumUtility(reasons),
        reasons,
        run: () => {
          const tb = effectiveTraits(ctx.model, s, b)
          const accept = (s.factions[b]?.exhaustion ?? 0) / 100 + tb.caution * 0.4 + (1 / Math.max(ratio, 0.1) - 1) * -0.2 + ctx.rng.next() * 0.35
          if (accept > 0.45) {
            const changes = [...setWar(s, f, b, false, ctx.step), addRelation(s, f, b, Math.max(0, -25 - rel) + 10)]
            emit('peace', 'critical', `${who} and ${bName} make peace after ${ctx.step - war.since} steps of war`, [f, b], changes, reasons)
          } else {
            emit('decision', 'notable', `${who} sues for peace; ${bName} refuses`, [f, b], [addRelation(s, f, b, -3)], reasons)
          }
        },
      })
    }

    // ── Alliance ──
    const theirEnemies = new Set(warsOf(s, b))
    const commonEnemy = wars.some((e) => theirEnemies.has(e))
    if (!allied && !atWar && rel > 40 && (rel > 60 || commonEnemy)) {
      const reasons: Reasons = [
        ['mercantile', T.mercantile * 0.45],
        ['friendship', (rel - 40) / 90],
        ['common enemy', commonEnemy ? 0.45 : 0],
        ['caution', T.caution * 0.15],
        ['base', -0.3],
      ]
      options.push({
        label: `ally with ${bName}`,
        utility: sumUtility(reasons),
        reasons,
        run: () => emit('alliance', 'critical', `${who} and ${bName} swear an alliance`, [f, b], [...setAlliance(s, f, b, true, ctx.step), addRelation(s, f, b, 6)], reasons),
      })
    }
    if (allied && rel < 10) {
      const reasons: Reasons = [['estrangement', (10 - rel) / 40], ['aggression', T.aggression * 0.2], ['base', -0.1]]
      options.push({
        label: `break alliance with ${bName}`,
        utility: sumUtility(reasons),
        reasons,
        run: () => emit('alliance', 'critical', `${who} renounces its alliance with ${bName}`, [f, b], [...setAlliance(s, f, b, false, ctx.step), addRelation(s, f, b, -12)], reasons),
      })
    }

    // ── Join an ally's war ──
    if (allied) {
      for (const enemy of warsOf(s, b)) {
        if (enemy === f || isAtWar(s, f, enemy) || isAllied(s, f, enemy) || inTruce(s, f, enemy, ctx.step)) continue
        const relE = relation(s, f, enemy)
        const reasons: Reasons = [
          ['loyalty', rel / 150],
          ['aggression', T.aggression * 0.35],
          ['enmity', relE < 0 ? -relE / 120 : -0.3],
          ['caution', -T.caution * 0.35],
          ['already at war', -wars.length * 0.3],
          ['base', -0.15],
        ]
        options.push({
          label: `join ${bName}'s war on ${ix.name(enemy)}`,
          utility: sumUtility(reasons),
          reasons,
          run: () => emit('war', 'critical', `${who} joins its ally ${bName} in the war against ${ix.name(enemy)}`, [f, b, enemy], [...setWar(s, f, enemy, true, ctx.step), addRelation(s, f, enemy, -15)], reasons),
        })
      }
    }

    // ── Aid a friend in famine ──
    if (!atWar && rel > 25 && bHunger > 0.45 && hunger < 0.3) {
      const reasons: Reasons = [['mercantile', T.mercantile * 0.5], ['friendship', rel / 150], ['their need', bHunger * 0.4], ['ally', isAllied(s, f, b) ? 0.2 : 0], ['base', -0.3]]
      options.push({
        label: `send aid to ${bName}`,
        utility: sumUtility(reasons),
        reasons,
        run: () => {
          const from = bestLocation(s, f, (id) => s.locations[id]?.stock[food] ?? 0)
          const to = bestLocation(s, b, (id) => locationHunger(s, id, food))
          if (!from || !to) return
          const amount = Math.round(factionStock(s, f, food) * 0.12)
          const out = addStock(s, from, food, -amount)
          const sent = -out.applied
          const changes = [out.change, addStock(s, to, food, sent).change, addRelation(s, f, b, 9), addStability(s, b, 2)]
          emit('decision', 'notable', `${who} ships ${fmt(sent)} ${ix.name(food)} in relief to famine-struck ${ix.name(to)}`, [f, b, from, to, food], changes, reasons)
        },
      })
    }

    // ── Embargo / reopen trade ──
    const between = ctx.model.routes.filter((r) => {
      const o1 = s.locations[r.fromId]?.ownerId
      const o2 = s.locations[r.toId]?.ownerId
      return (o1 === f && o2 === b) || (o1 === b && o2 === f)
    })
    const open = between.filter((r) => s.routes[r.id]?.active)
    const closed = between.filter((r) => s.routes[r.id] && !s.routes[r.id]?.active)
    if (open.length && rel < -15 && !allied) {
      const reasons: Reasons = [['hostility', -rel / 120], ['aggression', T.aggression * 0.3], ['mercantile', -T.mercantile * 0.45], ['base', -0.05]]
      options.push({
        label: `embargo ${bName}`,
        utility: sumUtility(reasons),
        reasons,
        run: () => emit('decision', 'critical', `${who} closes ${open.map((r) => r.name).join(', ')} to ${bName}`, [f, b, ...open.map((r) => r.id)], [...open.map((r) => setRouteActive(s, r.id, false)), addRelation(s, f, b, -6)], reasons),
      })
    }
    if (closed.length && rel > -5 && !atWar) {
      const reasons: Reasons = [['mercantile', T.mercantile * 0.6], ['relations', rel / 150], ['hunger', hunger * 0.3], ['base', -0.15]]
      options.push({
        label: `reopen trade with ${bName}`,
        utility: sumUtility(reasons),
        reasons,
        run: () => emit('decision', 'notable', `${who} reopens ${closed.map((r) => r.name).join(', ')} to ${bName}`, [f, b, ...closed.map((r) => r.id)], [...closed.map((r) => setRouteActive(s, r.id, true)), addRelation(s, f, b, 4)], reasons),
      })
    }
  }

  // ── Invest in innovation ──
  const pop = factionPopulation(s, f)
  const cost = Math.round((pop / 100) * 6 * fState.tech)
  if (cost > 0 && factionStock(s, f, rule.investResourceId) >= cost * 1.5) {
    const reasons: Reasons = [['ambition', T.ambition * 0.7], ['security', (1 - hunger) * 0.25], ['at war', -wars.length * 0.25], ['base', -0.3]]
    options.push({
      label: 'invest in innovation',
      utility: sumUtility(reasons),
      reasons,
      run: () => {
        const changes: Change[] = []
        let left = cost
        for (const id of factionLocations(s, f).sort((a, b2) => (s.locations[b2]?.stock[rule.investResourceId] ?? 0) - (s.locations[a]?.stock[rule.investResourceId] ?? 0))) {
          if (left <= 0) break
          const r = addStock(s, id, rule.investResourceId, -left)
          left += r.applied
          changes.push(r.change)
        }
        const gain = 0.05 * (1 + (fState.ruler.wisdom ?? 0))
        changes.push(addTech(s, f, gain))
        const idea = INNOVATIONS[Math.min(INNOVATIONS.length - 1, Math.floor((fState.tech - 1) / 0.05)) % INNOVATIONS.length] ?? 'new methods'
        emit('innovation', 'notable', `${who} spends ${fmt(cost)} ${ix.name(rule.investResourceId)} on ${idea}; output now ×${fmt(fState.tech)}`, [f, rule.investResourceId], changes, reasons)
      },
    })
  }

  // ── Restore order at home ──
  const orderKey = `${rule.id}:order:${f}`
  if (fState.stability < 40 && (s.ruleCooldowns[orderKey] ?? 0) <= ctx.step) {
    const reasons: Reasons = [['unrest', (40 - fState.stability) / 35], ['caution', T.caution * 0.2], ['base', -0.15]]
    const harsh = T.aggression > T.mercantile
    options.push({
      label: harsh ? 'crack down on unrest' : 'distribute bread',
      utility: sumUtility(reasons),
      reasons,
      run: () => {
        s.ruleCooldowns[orderKey] = ctx.step + 4
        const changes: Change[] = []
        if (harsh) {
          const biggest = bestLocation(s, f, (id) => s.locations[id]?.population ?? 0)
          if (biggest) changes.push(addPopulation(s, biggest, -Math.round((s.locations[biggest]?.population ?? 0) * 0.015)).change)
          changes.push(addStability(s, f, 10 * temper))
          emit('decision', 'notable', `${who} crushes dissent by force`, [f, ...(biggest ? [biggest] : [])], changes, reasons)
        } else {
          const from = bestLocation(s, f, (id) => s.locations[id]?.stock[food] ?? 0)
          if (from) changes.push(addStock(s, from, food, -Math.round((s.locations[from]?.stock[food] ?? 0) * 0.08)).change)
          changes.push(addStability(s, f, 8 * temper))
          emit('decision', 'notable', `${who} opens the granaries to calm the streets`, [f, ...(from ? [from] : [])], changes, reasons)
        }
      },
    })
  }

  // Seeded perturbation: one draw per option, in a fixed order.
  let best: Option | null = null
  let bestScore = 0.18
  for (const o of options) {
    const noise = (ctx.rng.next() - 0.5) * 0.3 * temper
    const score = o.utility + noise
    if (score > bestScore) {
      best = o
      bestScore = score
    }
  }
  best?.run()
}

/** Allies of the defender join against the aggressor (and vice versa) when relations allow. */
function callToArms(ctx: StepContext, ruleId: Id, aggressor: Id, defender: Id) {
  const s = ctx.state
  for (const ally of alliesOf(s, defender)) {
    if (ally === aggressor || isAtWar(s, ally, aggressor) || isAllied(s, ally, aggressor)) continue
    if (relation(s, ally, aggressor) < 30 && !inTruce(s, ally, aggressor, ctx.step)) {
      ctx.emit({
        kind: 'war',
        severity: 'critical',
        ruleId,
        message: `${ctx.index.name(ally)} honours its alliance and enters the war against ${ctx.index.name(aggressor)}`,
        entityIds: [ally, aggressor, defender],
        changes: [...setWar(s, ally, aggressor, true, ctx.step), addRelation(s, ally, aggressor, -15)],
        detail: `Allied to ${ctx.index.name(defender)}; relations with the aggressor below 30`,
      })
    }
  }
}
