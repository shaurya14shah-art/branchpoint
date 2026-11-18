import { describe, expect, test } from 'vitest'
import { SHATTERED_ISLES } from '../src/examples/shatteredIsles'
import { addCheckpoint, addIntervention, advance, createRootBranch, fork, headModel, revise, rewind, BranchError, type Branch } from '../src/engine/history/branch'
import { extendTo, forkTimeline, recomputeHead, replay } from '../src/engine/history/replay'
import { diffModels, divergence } from '../src/engine/history/diff'
import { divergentEvents, finalStateRows, milestones, series } from '../src/engine/compare'
import { deepFreeze } from '../src/engine/util'
import type { Rule, WorldModel } from '../src/engine/model'

const root = () => createRootBranch(SHATTERED_ISLES, { id: 'main', color: '#ffffff', createdAt: 0 })
const opts = (id: string) => ({ id, name: id, color: '#000000', createdAt: 1 })

function withRule(model: WorldModel, id: string, patch: Partial<Rule>): WorldModel {
  return { ...model, rules: model.rules.map((r) => (r.id === id ? ({ ...r, ...patch } as Rule) : r)) }
}

describe('branching', () => {
  test('advancing or editing a child never alters the parent', () => {
    const parent = deepFreeze(advance(root(), 12))
    const parentTl = deepFreeze(replay(parent))
    const snapshot = structuredClone(parentTl)

    let child = fork(parent, 5, opts('child'))
    child = revise(child, withRule(headModel(child), 'r-trade', { reserve: 400 }), 'Hoard grain')
    child = advance(child, 20)
    let childTl = extendTo(forkTimeline(parentTl, child), child)
    child = addIntervention(child, { id: 'iv', step: child.headStep, label: 'Gift', effects: [{ kind: 'adjustStock', locationId: 'ashkeep', resourceId: 'grain', delta: 500 }] })
    childTl = recomputeHead(childTl, child)

    expect(parentTl).toEqual(snapshot) // frozen + structurally unchanged
    expect(replay(parent)).toEqual(snapshot) // and its inputs still replay to the same history
    expect(childTl.states[5]).toBe(parentTl.states[5]) // shared prefix, by reference
    expect(childTl.states[6]).not.toEqual(parentTl.states[6])
  })

  test('advancing one sibling does not affect another', () => {
    const p = advance(root(), 4)
    const a = advance(fork(p, 4, opts('a')), 10)
    const b0 = fork(p, 4, opts('b'))
    const before = replay(b0)
    advance(a, 30)
    expect(replay(b0)).toEqual(before)
    expect(replay(a).states[4]).toEqual(before.states[4])
  })

  test('a child replays to the same prefix as its parent', () => {
    const p = advance(root(), 10)
    const c = advance(fork(p, 3, opts('c')), 7)
    const pt = replay(p)
    const ct = replay(c)
    for (let s = 0; s <= 10; s++) expect(ct.states[s]).toEqual(pt.states[s]) // no changes → identical futures
  })

  test('branching at step 0 and at an earlier step works', () => {
    const p = advance(root(), 10)
    const c0 = fork(p, 0, opts('c0'))
    expect(c0.headStep).toBe(0)
    expect(replay(c0).states).toHaveLength(1)
    const edited = revise(c0, { ...headModel(c0), seed: 5 }, 'reseed')
    expect(edited.revisions).toHaveLength(1) // step-0 edit rewrites the starting definition
    expect(p.revisions).toHaveLength(1)
  })

  test('cannot branch beyond the head', () => {
    expect(() => fork(advance(root(), 2), 3, opts('x'))).toThrow(BranchError)
  })

  test('a revision only affects transitions from the head onward', () => {
    const p = advance(root(), 6)
    const pt = replay(p)
    const r = advance(revise(p, withRule(headModel(p), 'r-harvest', { amount: 0 }), 'Famine'), 4)
    const rt = replay(r)
    for (let s = 0; s <= 6; s++) expect(rt.states[s]).toEqual(pt.states[s])
    expect(rt.events[7]?.some((e) => e.ruleId === 'r-harvest')).toBe(false)
  })

  test('interventions are only accepted at the head', () => {
    const p = advance(root(), 3)
    expect(() => addIntervention(p, { id: 'x', step: 1, label: 'past', effects: [{ kind: 'adjustPopulation', locationId: 'gullrock', delta: 1 }] })).toThrow(/branch to change the past/)
  })

  test('rewinding to a checkpoint restores exactly the checkpointed history', () => {
    let b = addCheckpoint(advance(root(), 5), { id: 'cp', step: 5, label: 'Before the drought' })
    const at5 = replay(b)
    b = advance(revise(b, withRule(headModel(b), 'r-eat', { amount: 20 }), 'Feast'), 10)
    b = revise(b, withRule(headModel(b), 'r-eat', { amount: 30 }), 'Later edit')
    const rewound = rewind(b, 5)
    // Edits made *at* step 5 are kept (they were in force when leaving step 5); later ones are dropped.
    expect(rewound.revisions.map((r) => r.fromStep)).toEqual([0, 5])
    expect(replay(rewound)).toEqual(at5)
    expect(rewound.checkpoints.map((c) => c.id)).toEqual(['cp'])
  })
})

describe('divergence & comparison', () => {
  const setup = () => {
    const main = advance(root(), 6)
    let alt = fork(main, 6, opts('alt'))
    alt = revise(alt, withRule(headModel(alt), 'r-trade', { routeIds: ['grain-road', 'iron-barges', 'tool-trade', 'timber-fleet', 'ash-ferry', 'fen-carts', 'reef-supply'] }), 'Close the Ember Run')
    const m2 = advance(main, 24)
    const a2 = advance(alt, 24)
    return { main: m2, alt: a2, mt: replay(m2), at: replay(a2) }
  }

  test('divergence finds the first differing step and the responsible model change', () => {
    const { main, alt } = setup()
    const d = divergence(main, alt)
    expect(d.step).toBe(7)
    expect(d.modelChanges).toHaveLength(1)
    expect(d.modelChanges[0]).toMatchObject({ change: 'changed', kind: 'rule', id: 'r-trade' })
    expect(d.modelChanges[0]?.fields[0]?.field).toBe('routeIds')
  })

  test('identical branches have no divergence', () => {
    const p = advance(root(), 5)
    expect(divergence(p, advance(fork(p, 2, opts('x')), 3)).step).toBeNull()
  })

  test('series and final-state rows come from real history', () => {
    const { mt, at } = setup()
    const pop = series(mt, { kind: 'stock', resourceId: 'grain' })
    expect(pop).toHaveLength(31)
    const rows = finalStateRows(SHATTERED_ISLES, [mt.states.at(-1)!, at.states.at(-1)!])
    const emberGrain = rows.find((r) => r.key === 'fstock:ember:grain')
    expect(emberGrain?.values[0]).toBe(mt.states.at(-1)!.locations.ashkeep!.stock.grain! + mt.states.at(-1)!.locations.slagmouth!.stock.grain!)
    expect(emberGrain?.spread).toBeGreaterThan(0)
  })

  test('divergent events are empty before the divergence step', () => {
    const { mt, at } = setup()
    const diffs = divergentEvents(mt, at, 0)
    expect(diffs.length).toBeGreaterThan(0)
    expect(Math.min(...diffs.map((d) => d.step))).toBeGreaterThanOrEqual(7)
  })

  test('closing the Ember Run leaves Ember hungrier while the routes are cut', () => {
    const { mt, at } = setup()
    const avg = (tl: typeof mt) => series(tl, { kind: 'factionStock', factionId: 'ember', resourceId: 'grain' }).slice(7, 13).reduce((a, b) => a + b, 0)
    expect(avg(at)).toBeLessThan(avg(mt))
    expect(milestones(at, SHATTERED_ISLES).length).toBeGreaterThan(0)
  })

  test('diffModels reports added, removed and changed entities by id', () => {
    const a = SHATTERED_ISLES
    const b: WorldModel = { ...a, rules: a.rules.filter((r) => r.id !== 'r-spoil'), events: [...a.events, { id: 'ev-x', name: 'X', description: '', step: 3, effects: [] }] }
    const d = diffModels(a, b)
    expect(d).toContainEqual(expect.objectContaining({ change: 'removed', id: 'r-spoil' }))
    expect(d).toContainEqual(expect.objectContaining({ change: 'added', id: 'ev-x' }))
  })
})

test('Branch type is plain serialisable data', () => {
  const b: Branch = advance(root(), 2)
  expect(JSON.parse(JSON.stringify(b))).toEqual(b)
})
