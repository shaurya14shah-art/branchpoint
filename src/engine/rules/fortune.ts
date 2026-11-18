import type { Change, FortuneRule, Id } from '../model'
import { addPopulation, addStability, addStock, addTech } from '../ops'
import { generateRuler, rulerLabel } from '../names'
import { livingFactions } from '../society'
import { fmt, pct } from '../format'
import type { RuleImpl } from './types'
import type { StepContext } from '../context'

type Card = { weight: number; play: (rule: FortuneRule, ctx: StepContext) => void }

const pick = <T>(ctx: StepContext, xs: T[]): T | undefined => xs[Math.floor(ctx.rng.next() * xs.length)]

const DECK: Card[] = [
  {
    weight: 3,
    play: (rule, ctx) => {
      const id = pick(ctx, Object.keys(ctx.state.locations).sort())
      const l = id ? ctx.state.locations[id] : undefined
      if (!id || !l) return
      const amt = Math.round((l.population / 100) * 18 * rule.intensity)
      emit(ctx, rule, 'notable', `A bumper harvest in ${ctx.index.name(id)}: +${fmt(amt)} ${ctx.index.name(rule.foodResourceId)}`, [id], [addStock(ctx.state, id, rule.foodResourceId, amt).change])
    },
  },
  {
    weight: 2,
    play: (rule, ctx) => {
      const id = pick(ctx, Object.keys(ctx.state.locations).sort())
      const l = id ? ctx.state.locations[id] : undefined
      if (!id || !l) return
      const changes = ctx.model.resources.map((r) => addStock(ctx.state, id, r.id, -Math.round((l.stock[r.id] ?? 0) * 0.2 * rule.intensity)).change)
      emit(ctx, rule, 'critical', `A great storm wrecks the stores of ${ctx.index.name(id)}`, [id], [...changes, addStability(ctx.state, l.ownerId, -3)])
    },
  },
  {
    weight: 2,
    play: (rule, ctx) => {
      const f = pick(ctx, livingFactions(ctx.state))
      if (!f) return
      emit(ctx, rule, 'notable', `Scholars of ${ctx.index.name(f)} make a breakthrough`, [f], [addTech(ctx.state, f, 0.04 * rule.intensity)])
    },
  },
  {
    weight: 2,
    play: (rule, ctx) => {
      const id = pick(ctx, Object.keys(ctx.state.locations).sort())
      const res = pick(ctx, ctx.model.resources.map((r) => r.id).sort())
      const l = id ? ctx.state.locations[id] : undefined
      if (!id || !res || !l) return
      const amt = Math.round(60 * rule.intensity + (l.population / 100) * 5)
      emit(ctx, rule, 'notable', `Prospectors near ${ctx.index.name(id)} strike a rich seam of ${ctx.index.name(res)} (+${fmt(amt)})`, [id, res], [addStock(ctx.state, id, res, amt).change])
    },
  },
  {
    weight: 2,
    play: (rule, ctx) => {
      const f = pick(ctx, livingFactions(ctx.state))
      if (!f) return
      const good = ctx.rng.next() < 0.5
      emit(ctx, rule, 'notable', `A comet over ${ctx.index.name(f)} is read as ${good ? 'a blessing' : 'an ill omen'}`, [f], [addStability(ctx.state, f, (good ? 8 : -8) * rule.intensity)])
    },
  },
  {
    weight: 1,
    play: (rule, ctx) => {
      const f = pick(ctx, livingFactions(ctx.state))
      const st = f ? ctx.state.factions[f] : undefined
      if (!f || !st) return
      const old = rulerLabel(st.ruler)
      st.ruler = generateRuler(ctx.rng, ctx.step, 20, 30)
      emit(ctx, rule, 'critical', `${old} of ${ctx.index.name(f)} is assassinated; ${rulerLabel(st.ruler)} seizes power`, [f], [{ target: { kind: 'ruler', factionId: f }, before: old, after: rulerLabel(st.ruler) }, addStability(ctx.state, f, -10 * rule.intensity)])
    },
  },
  {
    weight: 1,
    play: (rule, ctx) => {
      const id = pick(ctx, Object.keys(ctx.state.locations).sort())
      const l = id ? ctx.state.locations[id] : undefined
      if (!id || !l) return
      const n = Math.round(l.population * 0.06 * rule.intensity)
      emit(ctx, rule, 'notable', `Settlers arrive from beyond the map at ${ctx.index.name(id)} (+${fmt(n)})`, [id], [addPopulation(ctx.state, id, n).change])
    },
  },
]

function emit(ctx: StepContext, rule: FortuneRule, severity: 'notable' | 'critical', message: string, entityIds: Id[], changes: Change[]) {
  ctx.emit({ kind: 'fortune', severity, ruleId: rule.id, message, entityIds, changes, detail: 'Drawn from the fortune deck with the seeded generator' })
}

/** Fortune: seeded windfalls and disasters that keep histories from repeating. */
export const fortune: RuleImpl<FortuneRule> = {
  type: 'fortune',
  label: 'Fortune',
  summary: 'Seeded windfalls and disasters: harvests, storms, discoveries, omens, assassinations.',
  validate(rule, refs, path) {
    refs.resource(rule.foodResourceId, `${path}.foodResourceId`)
  },
  apply(rule, ctx) {
    if (ctx.rng.next() >= rule.chance) return
    const total = DECK.reduce((a, c) => a + c.weight, 0)
    let roll = ctx.rng.next() * total
    for (const card of DECK) {
      roll -= card.weight
      if (roll < 0) return card.play(rule, ctx)
    }
  },
  describe(rule) {
    return `Each step there is a ${pct(rule.chance)} chance of a fortune card: bumper harvest, storm, breakthrough, rich seam, comet omen, assassination or new settlers — magnitudes ×${fmt(rule.intensity)}. All draws are seeded, so a world replays identically, but different seeds diverge.`
  },
}
