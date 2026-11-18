import { describe, expect, test } from 'vitest'
import { SHATTERED_ISLES } from '../src/examples/shatteredIsles'
import { advance, createRootBranch } from '../src/engine/history/branch'
import { replay } from '../src/engine/history/replay'
import { createInitialState, simulateStep } from '../src/engine/simulate'
import { inTruce, TRUCE_STEPS } from '../src/engine/ops'
import { totalPopulation } from '../src/engine/metrics'
import { parseProject } from '../src/lib/storage/format'
import { validateModel } from '../src/engine/validate'
import type { Rule, WorldModel } from '../src/engine/model'
import { R, tinyWorld } from './fixtures'

const run = (model: WorldModel, steps: number) => replay(advance(createRootBranch(model, { id: 'm', color: '#ffffff', createdAt: 0 }), steps))

describe('rulers', () => {
  test('starting rulers are drawn from the seed: reproducible, and different per seed', () => {
    const a = createInitialState(SHATTERED_ISLES).factions.ember?.ruler
    expect(createInitialState(SHATTERED_ISLES).factions.ember?.ruler).toEqual(a)
    const others = [2, 3, 4, 5].map((seed) => createInitialState({ ...SHATTERED_ISLES, seed }).factions.ember?.ruler?.name)
    expect(new Set([a?.name, ...others]).size).toBeGreaterThan(2)
  })

  test('succession replaces rulers over time and records the change', () => {
    const tl = run({ ...tinyWorld([{ id: 's', name: 'Rulers', type: 'succession', enabled: true, priority: 1, stepsPerYear: 1, crisisStability: 10 }]) }, 120)
    const successions = tl.events.flat().filter((e) => e.kind === 'succession')
    expect(successions.length).toBeGreaterThan(0)
    expect(successions[0]?.changes[0]?.target.kind).toBe('ruler')
  })
})

describe('faction decisions', () => {
  test('every decision records why it was chosen', () => {
    const tl = run(SHATTERED_ISLES, 60)
    const decisions = tl.events.flat().filter((e) => e.ruleId === 'r-decisions')
    expect(decisions.length).toBeGreaterThan(10)
    for (const d of decisions) expect(d.detail).toMatch(/^(Chosen by|Allied to)/)
  })

  test('different seeds write different histories', () => {
    const story = (seed: number) =>
      run({ ...SHATTERED_ISLES, seed }, 60)
        .events.flat()
        .filter((e) => e.severity === 'critical' && e.kind !== 'shortage')
        .map((e) => `${e.step}:${e.kind}`)
        .join(',')
    const stories = new Set([1, 2, 3].map(story))
    expect(stories.size).toBe(3)
  })
})

describe('war', () => {
  const warWorld = (rules: Rule[] = []) =>
    tinyWorld(
      [{ id: 'w', name: 'War', type: 'warfare', enabled: true, priority: 50, armsResourceId: 'ore', casualtyRate: 0.08, conquestRatio: 1.2, exhaustionLimit: 40 }, ...rules],
      {
        locations: [
          { id: 'a', name: 'A', region: 'West', description: '', initialOwnerId: 'red', initialPopulation: 1000, initialStock: { food: 100, ore: 500 } },
          { id: 'a2', name: 'A2', region: 'West', description: '', initialOwnerId: 'red', initialPopulation: 800, initialStock: { food: 100, ore: 200 } },
          { id: 'b', name: 'B', region: 'East', description: '', initialOwnerId: 'blue', initialPopulation: 300, initialStock: { food: 10 } },
          { id: 'b2', name: 'B2', region: 'East', description: '', initialOwnerId: 'blue', initialPopulation: 200, initialStock: { food: 10 } },
        ],
        routes: [],
        events: [{ id: 'e', name: 'Casus belli', description: '', step: 1, effects: [{ kind: 'setWar', a: 'red', b: 'blue', active: true }] }],
      },
    )

  test('battles cost lives, build exhaustion, can take settlements, and end in a truce', () => {
    const tl = run(warWorld(), 40)
    const ev = tl.events.flat()
    expect(ev.some((e) => e.kind === 'battle' || e.kind === 'conquest')).toBe(true)
    expect(ev.some((e) => e.kind === 'conquest')).toBe(true)
    const peace = ev.find((e) => e.kind === 'peace')
    expect(peace).toBeDefined()
    const after = tl.states[peace!.step]!
    expect(after.wars).toEqual({})
    expect(inTruce(after, 'red', 'blue', peace!.step + TRUCE_STEPS - 1)).toBe(true)
    expect(inTruce(after, 'red', 'blue', peace!.step + TRUCE_STEPS)).toBe(false)
  })

  test('conquered settlements remember their people and can revolt', () => {
    const tl = run(warWorld(), 300)
    const conquered = tl.states.find((s) => Object.values(s.locations).some((l) => l.ownerId !== l.culture))
    expect(conquered).toBeDefined()
    expect(tl.events.flat().some((e) => e.kind === 'conquest' && /returns to|rises against/.test(e.message))).toBe(true)
  })

  test('trade halts between factions at war', () => {
    const m = tinyWorld([R.trade()], { events: [{ id: 'e', name: 'War', description: '', step: 1, effects: [{ kind: 'setWar', a: 'red', b: 'blue', active: true }] }] })
    const r = simulateStep(createInitialState(m), m)
    expect(r.events.some((e) => e.kind === 'trade-blocked' && /at war/.test(e.message))).toBe(true)
    expect(r.state.locations.b?.stock.food).toBe(10)
  })
})

describe('plague, migration, fortune', () => {
  test('plague spreads along a route that carried goods, then leaves immunity', () => {
    const m = tinyWorld(
      [R.trade(), { id: 'p', name: 'Plague', type: 'contagion', enabled: true, priority: 40, foodResourceId: 'food', outbreakChance: 0, spreadChance: 1, mortality: 0.05, duration: 3 }],
      { events: [{ id: 'e', name: 'Patient zero', description: '', step: 1, effects: [{ kind: 'startPlague', locationId: 'a', duration: 3 }] }] },
    )
    const tl = run(m, 8)
    expect(tl.states[1]?.locations.a?.plague).toBe(2) // the outbreak step counts toward its duration
    expect(tl.states[2]?.locations.b?.plague).toBeGreaterThan(0)
    expect(tl.events[2]?.find((e) => e.kind === 'plague' && e.severity === 'critical')?.detail).toMatch(/carried from A/)
    expect(tl.states[8]?.locations.a?.plague).toBe(0)
    expect(tl.states[5]?.locations.a?.immunity).toBeGreaterThan(0)
  })

  test('migration moves people toward better prospects and conserves them', () => {
    const m = tinyWorld([{ id: 'mig', name: 'Migration', type: 'migration', enabled: true, priority: 1, foodResourceId: 'food', rate: 0.1 }], {
      locations: [
        { id: 'a', name: 'A', region: 'W', description: '', initialOwnerId: 'red', initialPopulation: 1000, initialStock: { food: 0 } },
        { id: 'b', name: 'B', region: 'E', description: '', initialOwnerId: 'red', initialPopulation: 100, initialStock: { food: 500 } },
      ],
    })
    const r = simulateStep(createInitialState(m), m)
    expect(r.state.locations.a!.population).toBeLessThan(1000)
    expect(totalPopulation(r.state)).toBe(1100)
    expect(r.events[0]?.kind).toBe('migration')
  })

  test('fortune draws one seeded card when it fires', () => {
    const m = tinyWorld([{ id: 'f', name: 'Fortune', type: 'fortune', enabled: true, priority: 1, foodResourceId: 'food', chance: 1, intensity: 1 }])
    const tl = run(m, 20)
    for (let s = 1; s <= 20; s++) expect(tl.events[s]?.filter((e) => e.kind === 'fortune').length).toBeLessThanOrEqual(1)
    expect(tl.events.flat().filter((e) => e.kind === 'fortune').length).toBeGreaterThan(15)
    expect(run(m, 20)).toEqual(tl)
  })
})

describe('compatibility', () => {
  test('format v1 worlds (no personalities) migrate to v2 with default traits', () => {
    const v1model = { ...SHATTERED_ISLES, factions: SHATTERED_ISLES.factions.map(({ traits: _t, ...f }) => f) }
    const branch = createRootBranch(v1model as unknown as WorldModel, { id: 'main', color: '#ffffff', createdAt: 1 })
    const p = parseProject({ schemaVersion: 1, id: 'w', name: 'Old', description: '', createdAt: 1, updatedAt: 1, activeBranchId: 'main', branches: [branch], layout: {} })
    expect(p.schemaVersion).toBe(2)
    expect(p.branches[0]!.revisions[0]!.model.factions[0]!.traits).toEqual({ aggression: 0.4, ambition: 0.5, caution: 0.5, mercantile: 0.5 })
    expect(validateModel(p.branches[0]!.revisions[0]!.model).ok).toBe(true)
  })
})
