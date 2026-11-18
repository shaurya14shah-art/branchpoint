import { useMemo } from 'react'
import type { SimEvent, WorldModel, WorldState } from '../engine/model'
import { headModel, modelAt, type Branch } from '../engine/history/branch'
import type { Timeline } from '../engine/history/replay'
import { indexModel, type ModelIndex } from '../engine/modelIndex'
import type { Project } from '../lib/storage/project'
import { useApp } from './store'

export interface WorldView {
  project: Project
  branch: Branch
  timeline: Timeline | null
  /** The step being displayed (head unless the user is scrubbing history). */
  step: number
  head: number
  readOnly: boolean
  model: WorldModel
  headModel: WorldModel
  index: ModelIndex
  state: WorldState | null
  events: SimEvent[]
  simError: string | null
}

/** Derived, memoised view of the active branch at the displayed step. */
export function useWorld(): WorldView | null {
  const project = useApp((s) => s.project)
  const timelines = useApp((s) => s.timelines)
  const simErrors = useApp((s) => s.simErrors)
  const viewStep = useApp((s) => s.viewStep)
  return useMemo(() => {
    if (!project) return null
    const branch = project.branches.find((b) => b.id === project.activeBranchId) ?? project.branches[0]
    if (!branch) return null
    const timeline = timelines[branch.id] ?? null
    const step = viewStep ?? branch.headStep
    const model = viewStep === null ? headModel(branch) : modelAt(branch, step)
    return {
      project,
      branch,
      timeline,
      step,
      head: branch.headStep,
      readOnly: viewStep !== null,
      model,
      headModel: headModel(branch),
      index: indexModel(model),
      state: timeline?.states[step] ?? null,
      events: timeline?.events[step] ?? [],
      simError: simErrors[branch.id] ?? null,
    }
  }, [project, timelines, simErrors, viewStep])
}
