import { describe, expect, test } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { IndexedDbRepository } from '../src/lib/storage/repository'
import { deserializeProject, parseProject, serializeProject, ProjectFormatError } from '../src/lib/storage/format'
import { SCHEMA_VERSION, type Project } from '../src/lib/storage/project'
import { advance, createRootBranch, fork } from '../src/engine/history/branch'
import { replay } from '../src/engine/history/replay'
import { SHATTERED_ISLES, SHATTERED_ISLES_LAYOUT } from '../src/examples/shatteredIsles'

function project(): Project {
  const main = advance(createRootBranch(SHATTERED_ISLES, { id: 'main', color: '#ffffff', createdAt: 1 }), 8)
  const alt = advance(fork(main, 4, { id: 'alt', name: 'Alt', color: '#6fa8d6', createdAt: 2 }), 3)
  return { schemaVersion: SCHEMA_VERSION, id: 'w1', name: 'Isles', description: '', createdAt: 1, updatedAt: 2, activeBranchId: 'alt', branches: [main, alt], layout: SHATTERED_ISLES_LAYOUT }
}

describe('export / import', () => {
  test('round trip preserves the project and its replayed history', () => {
    const p = project()
    const back = deserializeProject(serializeProject(p, '2026-01-01T00:00:00Z'))
    expect(back).toEqual(p)
    expect(replay(back.branches[1]!)).toEqual(replay(p.branches[1]!))
  })

  test('rejects non-JSON, foreign formats and future versions with clear messages', () => {
    expect(() => deserializeProject('{nope')).toThrow(/Not valid JSON/)
    expect(() => deserializeProject(JSON.stringify({ format: 'other' }))).toThrow(/Not a Branchpoint world export/)
    const future = JSON.stringify({ format: 'branchpoint.world', version: 9, project: { ...project(), schemaVersion: 9 } })
    expect(() => deserializeProject(future)).toThrow(/newer version/)
  })

  test('rejects semantically broken models with issue paths', () => {
    const p = project()
    const broken = structuredClone(p)
    broken.branches[0]!.revisions[0]!.model.routes[0]!.fromId = 'atlantis'
    try {
      parseProject(broken)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectFormatError)
      expect((e as ProjectFormatError).issues[0]?.path).toBe('branches[0].revisions[0].model.routes[0].fromId')
    }
  })

  test('rejects a missing active branch and interventions beyond the head', () => {
    const p = { ...project(), activeBranchId: 'ghost' }
    expect(() => parseProject(p)).toThrow(/invalid data/)
    const q = project()
    q.branches[0] = { ...q.branches[0]!, interventions: [{ id: 'x', step: 99, label: 'x', effects: [{ kind: 'adjustPopulation', locationId: 'gullrock', delta: 1 }] }] }
    expect(() => parseProject(q)).toThrow(ProjectFormatError)
  })
})

describe('IndexedDB repository', () => {
  test('save, list, load, remove', async () => {
    const repo = new IndexedDbRepository(new IDBFactory())
    const p = project()
    await repo.save(p)
    const { projects } = await repo.list()
    expect(projects).toEqual([{ id: 'w1', name: 'Isles', description: '', updatedAt: 2, branchCount: 2 }])
    expect(await repo.load('w1')).toEqual(p)
    await repo.remove('w1')
    expect((await repo.list()).projects).toEqual([])
  })

  test('survives a new connection (simulated reload)', async () => {
    const factory = new IDBFactory()
    await new IndexedDbRepository(factory).save(project())
    expect((await new IndexedDbRepository(factory).load('w1')).branches).toHaveLength(2)
  })

  test('malformed stored data is reported, not loaded, and does not hide valid worlds', async () => {
    const repo = new IndexedDbRepository(new IDBFactory())
    await repo.save(project())
    await repo.putRaw({ id: 'bad', schemaVersion: 1, name: 42 })
    const { projects, corrupt } = await repo.list()
    expect(projects.map((p) => p.id)).toEqual(['w1'])
    expect(corrupt).toEqual([{ id: 'bad', error: 'The world file is malformed' }])
    await expect(repo.load('bad')).rejects.toThrow(ProjectFormatError)
  })
})
