import type { EventKind, Id, Change, Severity, SimEvent, WorldModel, WorldState } from './model'
import type { ModelIndex } from './modelIndex'
import type { Rng } from './rng'

export interface EventDraft {
  kind: EventKind
  severity: Severity
  message: string
  ruleId?: Id
  scheduledEventId?: Id
  interventionId?: Id
  entityIds: Id[]
  changes: Change[]
  detail?: string
}

/** Everything a rule or effect needs during one transition. `state` is the step's private draft. */
export interface StepContext {
  model: WorldModel
  index: ModelIndex
  state: WorldState
  /** The published previous state (read-only), for edge-triggered reporting. */
  prev: WorldState
  step: number
  rng: Rng
  emit(event: EventDraft): SimEvent
}

export function createEmitter(step: number, sink: SimEvent[]) {
  return (draft: EventDraft): SimEvent => {
    const event: SimEvent = { id: `${step}.${sink.length}`, step, ...draft, entityIds: unique(draft.entityIds) }
    sink.push(event)
    return event
  }
}

function unique(ids: Id[]): Id[] {
  return [...new Set(ids)]
}
