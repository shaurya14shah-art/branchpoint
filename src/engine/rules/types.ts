import type { Rule } from '../model'
import type { StepContext } from '../context'
import type { ModelIndex } from '../modelIndex'
import type { RefChecker } from '../refs'

/**
 * Contract for a rule type. Adding a rule type means writing one of these, adding its schema,
 * and registering it in registry.ts. The simulation loop does not change.
 */
export interface RuleImpl<R extends Rule> {
  type: R['type']
  label: string
  summary: string
  /** Semantic validation (structure is already checked by the schema). */
  validate(rule: R, refs: RefChecker, path: string): void
  /** Apply the rule to the step's draft state, emitting events for every change. */
  apply(rule: R, ctx: StepContext): void
  /** Plain-language description generated from the rule's actual parameters. */
  describe(rule: R, ix: ModelIndex): string
}
