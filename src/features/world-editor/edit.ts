import type { Effect, WorldModel } from '../../engine/model'
import { appStore } from '../../state/store'
import type { WorldView } from '../../state/useWorld'

/**
 * Editing policy, in one place:
 *  - viewing history          → read-only
 *  - head at step 0           → edit the model's starting values directly
 *  - head beyond step 0       → definitions are revised from the head; *current values* are
 *                               changed through interventions recorded on the branch
 */
export function editor(w: WorldView) {
  const s = appStore.getState()
  return {
    canEdit: !w.readOnly,
    atStart: w.head === 0,
    update: (fn: (m: WorldModel) => WorldModel, note: string) => s.updateModel(fn, note),
    intervene: (label: string, effects: Effect[]) => s.intervene(label, effects),
  }
}

export function replaceById<T extends { id: string }>(list: T[], id: string, fn: (x: T) => T): T[] {
  return list.map((x) => (x.id === id ? fn(x) : x))
}
