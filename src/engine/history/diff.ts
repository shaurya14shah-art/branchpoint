import type { Intervention, WorldModel } from '../model'
import { deepEqual } from '../util'
import { type Branch, interventionsAt, modelAt } from './branch'

export type EntityKind = 'resource' | 'faction' | 'location' | 'route' | 'relation' | 'rule' | 'event' | 'world'

export interface FieldChange {
  field: string
  before: unknown
  after: unknown
}

export interface ModelChange {
  change: 'added' | 'removed' | 'changed'
  kind: EntityKind
  id: string
  name: string
  fields: FieldChange[]
}

function diffFields(a: object, b: object, prefix = ''): FieldChange[] {
  const out: FieldChange[] = []
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const keys = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()
  for (const k of keys) {
    const va = ra[k]
    const vb = rb[k]
    if (deepEqual(va, vb)) continue
    const isObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v)
    if (isObj(va) && isObj(vb)) out.push(...diffFields(va as object, vb as object, `${prefix}${k}.`))
    else out.push({ field: `${prefix}${k}`, before: va, after: vb })
  }
  return out
}

function diffList<T extends { id: string; name: string }>(kind: EntityKind, a: T[], b: T[]): ModelChange[] {
  const out: ModelChange[] = []
  const mb = new Map(b.map((x) => [x.id, x]))
  const ma = new Map(a.map((x) => [x.id, x]))
  for (const x of a) {
    const y = mb.get(x.id)
    if (!y) out.push({ change: 'removed', kind, id: x.id, name: x.name, fields: [] })
    else {
      const fields = diffFields(x, y)
      if (fields.length) out.push({ change: 'changed', kind, id: x.id, name: y.name, fields })
    }
  }
  for (const y of b) if (!ma.has(y.id)) out.push({ change: 'added', kind, id: y.id, name: y.name, fields: [] })
  return out
}

/** Structural differences between two models, by stable entity id. */
export function diffModels(a: WorldModel, b: WorldModel): ModelChange[] {
  const rel = (m: WorldModel) => m.relations.map((r) => ({ ...r, id: [r.a, r.b].sort().join('|'), name: `${r.a} ↔ ${r.b}` }))
  const out: ModelChange[] = [
    ...diffList('resource', a.resources, b.resources),
    ...diffList('faction', a.factions, b.factions),
    ...diffList('location', a.locations, b.locations),
    ...diffList('route', a.routes, b.routes),
    ...diffList('relation', rel(a), rel(b)),
    ...diffList('rule', a.rules, b.rules),
    ...diffList('event', a.events, b.events),
  ]
  const world = diffFields({ name: a.name, description: a.description, seed: a.seed }, { name: b.name, description: b.description, seed: b.seed })
  if (world.length) out.unshift({ change: 'changed', kind: 'world', id: a.id, name: b.name, fields: world })
  return out
}

export interface Divergence {
  /** First step whose state can differ between the branches; null if inputs are identical up to both heads. */
  step: number | null
  modelChanges: ModelChange[]
  interventionsOnlyA: Intervention[]
  interventionsOnlyB: Intervention[]
}

/**
 * Find where two branches' *inputs* first differ. Because simulation is deterministic, states are
 * identical before this step, so these input differences are the root cause of every later
 * difference in outcome. This is computed, not inferred.
 */
export function divergence(a: Branch, b: Branch): Divergence {
  const limit = Math.min(a.headStep, b.headStep)
  for (let s = 0; s <= limit; s++) {
    const ia = interventionsAt(a, s)
    const ib = interventionsAt(b, s)
    if (!deepEqual(ia, ib)) {
      const sigB = new Set(ib.map((x) => JSON.stringify(x)))
      const sigA = new Set(ia.map((x) => JSON.stringify(x)))
      return {
        step: s,
        modelChanges: s > 0 ? diffModels(modelAt(a, s - 1), modelAt(b, s - 1)) : diffModels(modelAt(a, 0), modelAt(b, 0)),
        interventionsOnlyA: ia.filter((x) => !sigB.has(JSON.stringify(x))),
        interventionsOnlyB: ib.filter((x) => !sigA.has(JSON.stringify(x))),
      }
    }
    // The model at step s drives s → s + 1 (and defines the initial state at s = 0).
    const ma = modelAt(a, s)
    const mb = modelAt(b, s)
    if (ma !== mb && !deepEqual(ma, mb)) {
      return { step: s === 0 && !deepEqual(modelAt(a, 0), modelAt(b, 0)) ? 0 : s + 1, modelChanges: diffModels(ma, mb), interventionsOnlyA: [], interventionsOnlyB: [] }
    }
  }
  return { step: null, modelChanges: [], interventionsOnlyA: [], interventionsOnlyB: [] }
}
