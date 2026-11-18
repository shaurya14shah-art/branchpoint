import type { SimEvent, WorldState } from '../model'
import { initialStep, simulateStep } from '../simulate'
import { formatIssues, semanticIssues } from '../validate'
import { SimulationError } from '../ops'
import { type Branch, interventionsAt, modelAt } from './branch'

/** Materialised history of a branch: states[s] and the events produced while reaching step s. */
export interface Timeline {
  branchId: string
  states: WorldState[]
  events: SimEvent[][]
}

function assertValid(branch: Branch) {
  for (const r of branch.revisions) {
    const errors = semanticIssues(r.model).filter((i) => i.severity === 'error')
    if (errors.length) throw new SimulationError(`Model revision at step ${r.fromStep} of "${branch.name}" is invalid:\n${formatIssues(errors)}`)
  }
}

/** Rebuild a branch's full history from its inputs. Deterministic. */
export function replay(branch: Branch): Timeline {
  assertValid(branch)
  const first = initialStep(modelAt(branch, 0), interventionsAt(branch, 0))
  return extendTo({ branchId: branch.id, states: [first.state], events: [first.events] }, branch, branch.headStep, false)
}

/**
 * Extend (or trim) an existing timeline to `branch.headStep`, reusing every state it already has.
 * Callers must only reuse a timeline whose inputs for those steps are unchanged.
 */
export function extendTo(tl: Timeline, branch: Branch, head = branch.headStep, validate = true): Timeline {
  if (validate) assertValid(branch)
  const states = tl.states.slice(0, head + 1)
  const events = tl.events.slice(0, head + 1)
  for (let s = states.length; s <= head; s++) {
    const prev = states[s - 1]
    if (!prev) throw new SimulationError(`Missing state ${s - 1}`)
    const r = simulateStep(prev, modelAt(branch, s - 1), interventionsAt(branch, s))
    states.push(r.state)
    events.push(r.events)
  }
  return { branchId: branch.id, states, events }
}

/** Recompute only the head state (after an intervention or a step-0 model edit at the head). */
export function recomputeHead(tl: Timeline, branch: Branch): Timeline {
  const h = branch.headStep
  if (h === 0) return replay(branch)
  return extendTo({ ...tl, states: tl.states.slice(0, h), events: tl.events.slice(0, h) }, branch, h, false)
}

/** A fork's timeline is a prefix of its parent's — share the immutable states. */
export function forkTimeline(parent: Timeline, child: Branch): Timeline {
  return { branchId: child.id, states: parent.states.slice(0, child.forkStep + 1), events: parent.events.slice(0, child.forkStep + 1) }
}

export function allEvents(tl: Timeline): SimEvent[] {
  return tl.events.flat()
}
