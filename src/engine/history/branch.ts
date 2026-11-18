import type { Id, Intervention, WorldModel } from '../model'

/**
 * Branches are event-sourced: a branch stores *inputs* (model revisions + interventions) and a
 * head step. States are derived by deterministic replay (see replay.ts), so a branch never shares
 * mutable data with any other branch.
 */

export interface Revision {
  /** This model drives the transition fromStep → fromStep + 1 and all later ones until replaced. */
  fromStep: number
  model: WorldModel
  note: string
}

export interface Checkpoint {
  id: Id
  step: number
  label: string
}

export interface Branch {
  id: Id
  name: string
  color: string
  parentId: Id | null
  forkStep: number
  createdAt: number
  revisions: Revision[]
  interventions: Intervention[]
  headStep: number
  checkpoints: Checkpoint[]
}

export class BranchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BranchError'
  }
}

export function createRootBranch(model: WorldModel, opts: { id: Id; name?: string; color: string; createdAt: number }): Branch {
  return {
    id: opts.id,
    name: opts.name ?? 'Main',
    color: opts.color,
    parentId: null,
    forkStep: 0,
    createdAt: opts.createdAt,
    revisions: [{ fromStep: 0, model, note: 'Initial model' }],
    interventions: [],
    headStep: 0,
    checkpoints: [],
  }
}

/** The model in force at `step` (drives step → step + 1, and is used to display state `step`). */
export function modelAt(branch: Branch, step: number): WorldModel {
  let current = branch.revisions[0]
  if (!current) throw new BranchError(`Branch "${branch.name}" has no model`)
  for (const r of branch.revisions) if (r.fromStep <= step) current = r
  return current.model
}

export function headModel(branch: Branch): WorldModel {
  return modelAt(branch, branch.headStep)
}

export function interventionsAt(branch: Branch, step: number): Intervention[] {
  return branch.interventions.filter((iv) => iv.step === step)
}

export function advance(branch: Branch, steps = 1): Branch {
  if (!Number.isInteger(steps) || steps < 1) throw new BranchError('steps must be a positive integer')
  return { ...branch, headStep: branch.headStep + steps }
}

/**
 * Create an independent child that shares history up to `step`. Arrays are copied; the revision
 * and intervention objects themselves are immutable values, so sharing them is safe.
 */
export function fork(parent: Branch, step: number, opts: { id: Id; name: string; color: string; createdAt: number }): Branch {
  if (!Number.isInteger(step) || step < 0 || step > parent.headStep)
    throw new BranchError(`Cannot branch at step ${step}: "${parent.name}" has only reached step ${parent.headStep}`)
  return {
    id: opts.id,
    name: opts.name,
    color: opts.color,
    parentId: parent.id,
    forkStep: step,
    createdAt: opts.createdAt,
    revisions: parent.revisions.filter((r) => r.fromStep <= step),
    interventions: parent.interventions.filter((iv) => iv.step <= step),
    headStep: step,
    checkpoints: parent.checkpoints.filter((c) => c.step <= step),
  }
}

/**
 * Change the model going forward from the branch head. At step 0 this rewrites the world's
 * starting definition; later it adds a revision so earlier history stays exactly as it was.
 */
export function revise(branch: Branch, model: WorldModel, note: string): Branch {
  const h = branch.headStep
  const kept = branch.revisions.filter((r) => r.fromStep < h)
  return { ...branch, revisions: [...kept, { fromStep: h, model, note }] }
}

export function addIntervention(branch: Branch, iv: Intervention): Branch {
  if (iv.step !== branch.headStep) throw new BranchError(`Interventions can only be recorded at the head step (${branch.headStep}); branch to change the past`)
  return { ...branch, interventions: [...branch.interventions, iv] }
}

export function addCheckpoint(branch: Branch, cp: Checkpoint): Branch {
  if (cp.step < 0 || cp.step > branch.headStep) throw new BranchError(`Checkpoint step ${cp.step} is outside this branch's history`)
  return { ...branch, checkpoints: [...branch.checkpoints.filter((c) => c.step !== cp.step), cp].sort((a, b) => a.step - b.step) }
}

export function removeCheckpoint(branch: Branch, id: Id): Branch {
  return { ...branch, checkpoints: branch.checkpoints.filter((c) => c.id !== id) }
}

/**
 * Rewind: discard everything after `step` on this branch. Inputs recorded *at* `step` (edits made
 * while the head was there) are kept; inputs from later steps are dropped. Other branches are
 * untouched.
 */
export function rewind(branch: Branch, step: number): Branch {
  if (!Number.isInteger(step) || step < 0 || step > branch.headStep) throw new BranchError(`Cannot rewind to step ${step}`)
  return {
    ...branch,
    headStep: step,
    revisions: branch.revisions.filter((r, i) => i === 0 || r.fromStep <= step),
    interventions: branch.interventions.filter((iv) => iv.step <= step),
    checkpoints: branch.checkpoints.filter((c) => c.step <= step),
  }
}
