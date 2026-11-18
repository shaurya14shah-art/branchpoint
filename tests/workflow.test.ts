import { describe, expect, test } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createAppStore } from '../src/state/store'
import { IndexedDbRepository } from '../src/lib/storage/repository'
import { activeBranchOf } from '../src/state/store'
import { divergence } from '../src/engine/history/diff'
import { finalStateRows } from '../src/engine/compare'
import { replay } from '../src/engine/history/replay'
import type { Rule } from '../src/engine/model'

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('definition-of-done workflow (store level)', () => {
  test('load → step → checkpoint → branch → edit rule → compare → reload → export/import', async () => {
    const factory = new IDBFactory()
    const store = createAppStore(new IndexedDbRepository(factory), { saveDelay: 0 })
    const s = () => store.getState()
    await s().init()
    expect(s().projects).toEqual([])

    // 1. Load the example
    await s().openExample()
    expect(s().project?.name).toBe('The Shattered Isles')

    // 3/4. Step and observe real events
    s().step(1)
    s().step(5)
    const main = activeBranchOf(s())!
    expect(main.headStep).toBe(6)
    expect(s().timelines[main.id]!.events[6]!.length).toBeGreaterThan(0)

    // 5. Checkpoint + branch
    s().addCheckpoint('Before the drought')
    const altId = s().branchFrom(6, 'No Ember Run')!
    expect(activeBranchOf(s())!.id).toBe(altId)

    // 6. Modify a rule on the branch only and continue
    const ok = s().updateModel(
      (m) => ({ ...m, rules: m.rules.map((r): Rule => (r.id === 'r-trade' && r.type === 'trade' ? { ...r, routeIds: m.routes.filter((x) => x.id !== 'ember-run').map((x) => x.id) } : r)) }),
      'Close the Ember Run',
    )
    expect(ok).toBe(true)
    s().step(20)
    s().switchBranch(main.id)
    s().step(20)

    const p = s().project!
    const [a, b] = [p.branches.find((x) => x.id === main.id)!, p.branches.find((x) => x.id === altId)!]
    expect(a.revisions).toHaveLength(1) // parent untouched by the child's rule edit
    expect(divergence(a, b).step).toBe(7)

    // 7. Compare using real history
    const ta = s().timelines[a.id]!
    const tb = s().timelines[b.id]!
    expect(ta).toEqual(replay(a))
    const rows = finalStateRows(a.revisions[0]!.model, [ta.states.at(-1)!, tb.states.at(-1)!])
    expect(rows.some((r) => r.spread > 0)).toBe(true)

    // Invalid edits are rejected without changing anything
    const before = s().project
    expect(s().updateModel((m) => ({ ...m, routes: [...m.routes, { ...m.routes[0]!, id: 'loop', toId: m.routes[0]!.fromId }] }), 'bad')).toBe(false)
    expect(s().project).toBe(before)

    // 8. Reload from storage in a fresh store
    await flush()
    const reloaded = createAppStore(new IndexedDbRepository(factory), { saveDelay: 0 })
    await reloaded.getState().init()
    await reloaded.getState().openProject(p.id)
    const rp = reloaded.getState().project!
    expect(rp.branches).toEqual(s().project!.branches)
    expect(reloaded.getState().timelines[altId]).toEqual(s().timelines[altId])

    // 9. Export and re-import
    const exported = s().exportProject()!
    const res = await s().importProject(exported.text)
    expect(res).toEqual({ ok: true })
    expect(s().project!.name).toBe('The Shattered Isles (imported)')
    expect(s().project!.branches).toEqual(p.branches)
    expect((await s().importProject('{"format":"nope"}')).ok).toBe(false)
  })

  test('viewing history is read-only; rewinding restores the checkpoint', async () => {
    const store = createAppStore(new IndexedDbRepository(new IDBFactory()), { saveDelay: 0 })
    const s = () => store.getState()
    await s().init()
    await s().openExample()
    s().step(10)
    s().setViewStep(4)
    expect(s().updateModel((m) => ({ ...m, name: 'x' }), 'x')).toBe(false)
    s().setViewStep(null)
    const at4 = s().timelines[activeBranchOf(s())!.id]!.states[4]
    s().rewindTo(4)
    const b = activeBranchOf(s())!
    expect(b.headStep).toBe(4)
    expect(s().timelines[b.id]!.states.at(-1)).toEqual(at4)
  })

  test('interventions change the head state and are replayed', async () => {
    const store = createAppStore(new IndexedDbRepository(new IDBFactory()), { saveDelay: 0 })
    const s = () => store.getState()
    await s().init()
    await s().openExample()
    s().step(3)
    s().intervene('Relief shipment', [{ kind: 'adjustStock', locationId: 'ashkeep', resourceId: 'grain', delta: 1000 }])
    const b = activeBranchOf(s())!
    const head = s().timelines[b.id]!.states[3]!
    expect(head.locations.ashkeep!.stock.grain).toBeGreaterThan(1000)
    expect(replay(b).states[3]).toEqual(head)
  })

  test('deleting a branch keeps its children usable', async () => {
    const store = createAppStore(new IndexedDbRepository(new IDBFactory()), { saveDelay: 0 })
    const s = () => store.getState()
    await s().init()
    await s().openExample()
    s().step(4)
    const a = s().branchFrom(2, 'A')!
    s().step(2)
    const b = s().branchFrom(3, 'B')!
    s().deleteBranch(a)
    const child = s().project!.branches.find((x) => x.id === b)!
    expect(child.parentId).toBe(s().project!.branches[0]!.id)
    expect(replay(child).states).toHaveLength(4)
  })
})
