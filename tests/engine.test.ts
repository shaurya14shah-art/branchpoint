import { describe, expect, test } from 'vitest'
import { SHATTERED_ISLES } from '../src/examples/shatteredIsles'
import { createInitialState, initialStep, simulateStep } from '../src/engine/simulate'
import { validateModel } from '../src/engine/validate'
import { deepFreeze } from '../src/engine/util'
import { advance, createRootBranch } from '../src/engine/history/branch'
import { replay } from '../src/engine/history/replay'
import { SimulationError } from '../src/engine/ops'
import type { ChangeTarget, WorldState } from '../src/engine/model'
import { relationKey } from '../src/engine/model'
import { R, tinyWorld } from './fixtures'

const run = (model = SHATTERED_ISLES, steps = 30) => replay(advance(createRootBranch(model, { id: 'm', color: '#ffffff', createdAt: 0 }), steps))

describe('validation', () => {
  test('The Shattered Isles is valid with no warnings', () => {
    expect(validateModel(SHATTERED_ISLES).issues).toEqual([])
  })

  test('reports missing references with paths', () => {
    const bad = tinyWorld([R.produce({ resourceId: 'gold', scope: { kind: 'location', id: 'nowhere' } })])
    const { ok, issues } = validateModel(bad)
    expect(ok).toBe(false)
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(['rules[0].scope.id', 'rules[0].resourceId']))
  })

  test('rejects duplicate ids, self-routes and self-relations', () => {
    const m = tinyWorld([], {
      routes: [{ id: 'a', name: 'loop', fromId: 'a', toId: 'a', resourceId: 'food', amount: 1, minRelation: 0, initiallyActive: true }],
      relations: [{ a: 'red', b: 'red', value: 0 }],
    })
    const msgs = validateModel(m).issues.map((i) => i.message).join('\n')
    expect(msgs).toMatch(/already used/)
    expect(msgs).toMatch(/two different locations/)
    expect(msgs).toMatch(/two different factions/)
  })

  test('rejects structurally invalid rules (schema)', () => {
    const m = { ...tinyWorld(), rules: [{ ...R.produce(), variance: 3 }] }
    const r = validateModel(m)
    expect(r.ok).toBe(false)
    expect(r.issues[0]?.path).toContain('rules')
  })

  test('replay refuses an invalid model and explains why', () => {
    expect(() => run(tinyWorld([R.trade({ routeIds: ['missing'] })]), 1)).toThrow(SimulationError)
    expect(() => run(tinyWorld([R.trade({ routeIds: ['missing'] })]), 1)).toThrow(/unknown trade route "missing"/)
  })

  test('an empty world is valid (with a warning) and simulates without change', () => {
    const empty = tinyWorld([], { locations: [], routes: [], factions: [], relations: [] })
    expect(validateModel(empty).ok).toBe(true)
    const tl = run(empty, 3)
    expect(tl.states).toHaveLength(4)
    expect(tl.events.flat()).toEqual([])
  })
})

describe('determinism & purity', () => {
  test('same model + seed → identical history', () => {
    expect(run()).toEqual(run())
  })

  test('different seed → different history (variance is seeded, not global)', () => {
    const a = run()
    const b = run({ ...SHATTERED_ISLES, seed: 99 })
    expect(a.states[10]).not.toEqual(b.states[10])
  })

  test('simulateStep never mutates its inputs', () => {
    const model = deepFreeze(structuredClone(SHATTERED_ISLES))
    let state: WorldState = deepFreeze(initialStep(model).state)
    for (let i = 0; i < 25; i++) state = deepFreeze(simulateStep(state, model).state)
    expect(state.step).toBe(25)
  })
})

describe('rules', () => {
  test('production adds a fixed amount and logs before/after', () => {
    const m = tinyWorld([R.produce()])
    const r = simulateStep(createInitialState(m), m)
    expect(r.state.locations.a?.stock.food).toBe(110)
    const ev = r.events.find((e) => e.kind === 'production')
    expect(ev?.ruleId).toBe('p')
    expect(ev?.changes).toContainEqual({ target: { kind: 'stock', locationId: 'a', resourceId: 'food' }, before: 100, after: 110 })
  })

  test('per-capita production scales with population and modifiers', () => {
    const m = tinyWorld([R.produce({ perCapita: true, amount: 20 })], {
      events: [{ id: 'e', name: 'Blight', description: '', step: 1, effects: [{ kind: 'addModifier', locationId: 'a', resourceId: 'food', factor: 0.5, duration: 2, label: 'Blight' }] }],
    })
    const tl = run(m, 3)
    expect(tl.states[1]?.locations.a?.stock.food).toBe(110) // 20 × 0.5
    expect(tl.states[2]?.locations.a?.stock.food).toBe(120) // still blighted
    expect(tl.states[3]?.locations.a?.stock.food).toBe(140) // expired after exactly 2 steps
    expect(tl.events[3]?.some((e) => e.kind === 'modifier-expired')).toBe(true)
  })

  test('consumption never goes negative; shortage is recorded with penalties', () => {
    const m = tinyWorld([R.consume()])
    const r = simulateStep(createInitialState(m), m)
    const b = r.state.locations.b
    expect(b?.stock.food).toBe(0)
    const shortage = r.events.find((e) => e.kind === 'shortage')
    expect(shortage?.message).toMatch(/needed 20, had 10/)
    expect(b?.population).toBe(75) // 100 × (10/20 unmet) × 0.5
    expect(r.state.factions.blue?.stability).toBe(45)
    expect(shortage?.ruleId).toBe('c')
  })

  test('trade conserves quantity, respects reserve and builds relations', () => {
    const m = tinyWorld([R.trade({ reserve: 80 })])
    const r = simulateStep(createInitialState(m), m)
    expect(r.state.locations.a?.stock.food).toBe(80)
    expect(r.state.locations.b?.stock.food).toBe(30)
    expect(r.state.routes.ab?.lastTransferred).toBe(20)
    expect(r.state.relations[relationKey('red', 'blue')]).toBe(11)
  })

  test('trade halts when relations fall below the route minimum', () => {
    const m = tinyWorld([R.trade()], { relations: [{ a: 'red', b: 'blue', value: -5 }] })
    const r = simulateStep(createInitialState(m), m)
    expect(r.state.locations.b?.stock.food).toBe(10)
    expect(r.events[0]?.kind).toBe('trade-blocked')
    expect(r.events[0]?.message).toMatch(/needs 0/)
  })

  test('threshold rules respect cooldown', () => {
    const m = tinyWorld([
      {
        id: 'th', name: 'Unrest', type: 'threshold', enabled: true, priority: 1, eventLabel: 'Unrest', cooldown: 3,
        condition: { metric: { kind: 'stability', factionId: 'red' }, op: '<=', value: 50 },
        effects: [{ kind: 'adjustPopulation', locationId: 'a', delta: -1 }],
      },
    ])
    const fired = run(m, 7).events.flat().filter((e) => e.kind === 'threshold').map((e) => e.step)
    expect(fired).toEqual([1, 4, 7])
  })

  test('bounded values are clamped and the clamp is recorded', () => {
    const m = tinyWorld([], { events: [{ id: 'e', name: 'Coup', description: '', step: 1, effects: [{ kind: 'adjustStability', factionId: 'red', delta: -80 }] }] })
    const r = simulateStep(createInitialState(m), m)
    expect(r.state.factions.red?.stability).toBe(0)
    expect(r.events[0]?.changes[0]?.note).toMatch(/clamped/)
  })

  test('disabled rules do nothing', () => {
    const m = tinyWorld([R.produce({ enabled: false })])
    expect(simulateStep(createInitialState(m), m).events).toEqual([])
  })
})

describe('update semantics', () => {
  test('rules are sequential: later rules see earlier changes within the step', () => {
    // Trade (priority 20) moves 30 food A→B before consumption (priority 30), so B is fed.
    const m = tinyWorld([R.trade(), R.consume({ scope: { kind: 'location', id: 'b' } })])
    const r = simulateStep(createInitialState(m), m)
    expect(r.state.locations.b?.stock.food).toBe(20)
    expect(r.events.some((e) => e.kind === 'shortage')).toBe(false)
  })

  test('changing priority changes the order and therefore the outcome', () => {
    const m = tinyWorld([R.trade({ priority: 40 }), R.consume({ scope: { kind: 'location', id: 'b' } })])
    const r = simulateStep(createInitialState(m), m)
    expect(r.events.map((e) => e.kind)).toEqual(['shortage', 'consumption', 'trade'])
    expect(r.state.locations.b?.stock.food).toBe(30)
  })

  test('equal priorities are ordered by rule id', () => {
    const m = tinyWorld([R.produce({ id: 'z', priority: 5 }), R.produce({ id: 'a1', priority: 5, resourceId: 'ore' })])
    const r = simulateStep(createInitialState(m), m)
    expect(r.events.map((e) => e.ruleId)).toEqual(['a1', 'z'])
  })
})

describe('event log accuracy', () => {
  test('the last recorded change to every target matches the resulting state', () => {
    const tl = run(SHATTERED_ISLES, 30)
    const read = (s: WorldState, t: ChangeTarget): unknown => {
      switch (t.kind) {
        case 'stock': return s.locations[t.locationId]?.stock[t.resourceId] ?? 0
        case 'population': return s.locations[t.locationId]?.population
        case 'stability': return s.factions[t.factionId]?.stability
        case 'relation': return s.relations[relationKey(t.a, t.b)]
        case 'routeActive': return s.routes[t.routeId]?.active
        case 'owner': return s.locations[t.locationId]?.ownerId
        case 'modifier': return undefined
        case 'tech': return s.factions[t.factionId]?.tech
        case 'exhaustion': return s.factions[t.factionId]?.exhaustion
        case 'plague': return s.locations[t.locationId]?.plague
        case 'war': return !!s.wars[relationKey(t.a, t.b)]
        case 'alliance': return !!s.alliances[relationKey(t.a, t.b)]
        case 'ruler': return undefined
      }
    }
    let checked = 0
    tl.events.forEach((events, step) => {
      const last = new Map<string, { target: ChangeTarget; after: unknown }>()
      for (const e of events) {
        expect(e.step).toBe(step)
        for (const c of e.changes) {
          if (c.target.kind === 'modifier' || c.target.kind === 'ruler') continue
          const t = c.target
          const key = t.kind === 'relation' || t.kind === 'war' || t.kind === 'alliance' ? `${t.kind}:${relationKey(t.a, t.b)}` : JSON.stringify(t)
          last.set(key, c)
        }
      }
      for (const c of last.values()) {
        expect(read(tl.states[step] as WorldState, c.target)).toEqual(c.after)
        checked++
      }
    })
    expect(checked).toBeGreaterThan(300)
  })

  test('every rule-driven event references an existing rule and entity', () => {
    const tl = run(SHATTERED_ISLES, 30)
    const ids = new Set([...SHATTERED_ISLES.locations, ...SHATTERED_ISLES.factions, ...SHATTERED_ISLES.routes, ...SHATTERED_ISLES.resources].map((e) => e.id))
    const rules = new Set(SHATTERED_ISLES.rules.map((r) => r.id))
    for (const e of tl.events.flat()) {
      if (e.ruleId) expect(rules.has(e.ruleId)).toBe(true)
      for (const id of e.entityIds) expect(ids.has(id)).toBe(true)
    }
  })

  test('the example world evolves on its own: shocks, decisions, rulers, plague, war', () => {
    const kinds = new Set(run(SHATTERED_ISLES, 80).events.flat().map((e) => e.kind))
    for (const k of ['scheduled', 'decision', 'innovation', 'succession', 'plague', 'migration', 'fortune', 'war', 'battle', 'peace'] as const) expect(kinds).toContain(k)
  })
})
