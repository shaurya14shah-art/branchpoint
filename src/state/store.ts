import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { Effect, WorldModel } from '../engine/model'
import * as H from '../engine/history/branch'
import { extendTo, forkTimeline, recomputeHead, replay, type Timeline } from '../engine/history/replay'
import { semanticIssues } from '../engine/validate'
import { worldModelSchema } from '../engine/schema'
import { SHATTERED_ISLES, SHATTERED_ISLES_LAYOUT } from '../examples/shatteredIsles'
import { deserializeProject, serializeProject } from '../lib/storage/format'
import { IndexedDbRepository, type ProjectRepository } from '../lib/storage/repository'
import { SCHEMA_VERSION, type Point, type Project, type ProjectMeta } from '../lib/storage/project'
import { BRANCH_COLORS, newId } from './ids'

export type View = 'world' | 'rules' | 'events' | 'chronicle' | 'compare'

export type Selection =
  | { kind: 'location' | 'faction' | 'route' | 'resource' | 'rule' | 'scheduled'; id: string }
  | { kind: 'event'; id: string; branchId: string }

export interface Notice {
  id: string
  tone: 'info' | 'error' | 'success'
  message: string
  detail?: string
}

export interface AppState {
  status: 'booting' | 'ready' | 'fatal'
  fatal: string | null
  projects: ProjectMeta[]
  corrupt: { id: string; error: string }[]
  project: Project | null
  timelines: Record<string, Timeline>
  simErrors: Record<string, string>
  viewStep: number | null // null = follow head of the active branch
  selection: Selection | null
  view: View
  playing: boolean
  speed: number // steps per second
  compareIds: string[]
  notices: Notice[]
  saving: 'idle' | 'pending' | 'saved' | 'error'
}

export interface Actions {
  init(): Promise<void>
  refreshList(): Promise<void>
  openProject(id: string): Promise<void>
  closeProject(): void
  createProject(model: WorldModel, layout: Record<string, Point>, description?: string): Promise<void>
  openExample(): Promise<void>
  renameProject(name: string): void
  renameProjectById(id: string, name: string): Promise<void>
  duplicateProject(id: string): Promise<void>
  deleteProject(id: string): Promise<void>
  deleteCorrupt(id: string): Promise<void>
  exportProject(): { filename: string; text: string } | null
  importProject(text: string): Promise<{ ok: true } | { ok: false; error: string; issues: string[] }>
  resetProject(): void

  step(n?: number): void
  setPlaying(p: boolean): void
  setSpeed(s: number): void
  setViewStep(s: number | null): void

  addCheckpoint(label: string): void
  removeCheckpoint(id: string): void
  rewindTo(step: number): void
  branchFrom(step: number, name?: string): string | null
  switchBranch(id: string): void
  renameBranch(id: string, name: string): void
  deleteBranch(id: string): void

  updateModel(fn: (m: WorldModel) => WorldModel, note: string): boolean
  intervene(label: string, effects: Effect[]): void
  moveLocation(id: string, p: Point): void

  select(sel: Selection | null): void
  setView(v: View): void
  setCompare(ids: string[]): void
  notify(n: Omit<Notice, 'id'>): void
  dismiss(id: string): void
}

export type Store = AppState & Actions

const MAX_STEPS = 5000

export function createAppStore(repo: ProjectRepository = new IndexedDbRepository(), opts: { saveDelay?: number } = {}): StoreApi<Store> {
  const saveDelay = opts.saveDelay ?? 400
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  return createStore<Store>()((set, get) => {
    const notify = (n: Omit<Notice, 'id'>) => {
      const id = newId('n')
      set((s) => ({ notices: [...s.notices.slice(-3), { ...n, id }] }))
      if (n.tone !== 'error') setTimeout(() => get().dismiss(id), 4000)
    }

    const persist = (project: Project) => {
      set({ saving: 'pending' })
      if (saveTimer) clearTimeout(saveTimer)
      const run = async () => {
        try {
          await repo.save(project)
          set({ saving: 'saved' })
          void get().refreshList()
        } catch (e) {
          set({ saving: 'error' })
          notify({ tone: 'error', message: 'Could not save to local storage', detail: (e as Error).message })
        }
      }
      if (saveDelay === 0) void run()
      else saveTimer = setTimeout(run, saveDelay)
    }

    /** Commit a new project value: bump updatedAt, persist. */
    const commit = (project: Project, extra: Partial<AppState> = {}) => {
      const next = { ...project, updatedAt: Date.now() }
      set({ project: next, ...extra })
      persist(next)
      return next
    }

    const active = (): H.Branch | null => {
      const p = get().project
      return p?.branches.find((b) => b.id === p.activeBranchId) ?? null
    }

    const timelineFor = (branch: H.Branch): Timeline | null => {
      const cached = get().timelines[branch.id]
      if (cached && cached.states.length === branch.headStep + 1) return cached
      try {
        const tl = cached ? extendTo(cached, branch) : replay(branch)
        set((s) => ({ timelines: { ...s.timelines, [branch.id]: tl }, simErrors: omit(s.simErrors, branch.id) }))
        return tl
      } catch (e) {
        set((s) => ({ simErrors: { ...s.simErrors, [branch.id]: (e as Error).message }, playing: false }))
        return null
      }
    }

    const setBranch = (b: H.Branch, tl?: Timeline | null, extra: Partial<AppState> = {}) => {
      const p = get().project
      if (!p) return
      const branches = p.branches.map((x) => (x.id === b.id ? b : x))
      if (!branches.includes(b)) branches.push(b)
      commit({ ...p, branches }, { ...extra, ...(tl ? { timelines: { ...get().timelines, ...(extra.timelines ?? {}), [b.id]: tl } } : {}) })
      if (!tl) timelineFor(b)
    }

    const loadProject = (project: Project) => {
      set({ project, timelines: {}, simErrors: {}, viewStep: null, selection: null, playing: false, compareIds: [project.activeBranchId] })
      for (const b of project.branches) timelineFor(b)
    }

    return {
      status: 'booting',
      fatal: null,
      projects: [],
      corrupt: [],
      project: null,
      timelines: {},
      simErrors: {},
      viewStep: null,
      selection: null,
      view: 'world',
      playing: false,
      speed: 2,
      compareIds: [],
      notices: [],
      saving: 'idle',

      async init() {
        try {
          await get().refreshList()
          set({ status: 'ready' })
          const last = readLastOpened()
          const target = get().projects.find((p) => p.id === last)
          if (target) await get().openProject(target.id)
        } catch (e) {
          set({ status: 'fatal', fatal: (e as Error).message })
        }
      },

      async refreshList() {
        const { projects, corrupt } = await repo.list()
        set({ projects, corrupt })
      },

      async openProject(id) {
        try {
          loadProject(await repo.load(id))
          writeLastOpened(id)
        } catch (e) {
          notify({ tone: 'error', message: 'This world could not be opened', detail: (e as Error).message })
        }
      },

      closeProject() {
        set({ project: null, timelines: {}, simErrors: {}, selection: null, playing: false, viewStep: null })
        writeLastOpened(null)
      },

      async createProject(model, layout, description) {
        const now = Date.now()
        const branch = H.createRootBranch(model, { id: newId('br'), color: BRANCH_COLORS[0] ?? '#ffffff', createdAt: now })
        const project: Project = {
          schemaVersion: SCHEMA_VERSION,
          id: newId('world'),
          name: model.name,
          description: description ?? model.description,
          createdAt: now,
          updatedAt: now,
          activeBranchId: branch.id,
          branches: [branch],
          layout,
        }
        await repo.save(project)
        await get().refreshList()
        loadProject(project)
        writeLastOpened(project.id)
      },

      async openExample() {
        await get().createProject(structuredClone(SHATTERED_ISLES), structuredClone(SHATTERED_ISLES_LAYOUT))
      },

      renameProject(name) {
        const p = get().project
        const trimmed = name.trim().slice(0, 80)
        if (!p || !trimmed) return
        commit({ ...p, name: trimmed })
      },

      async renameProjectById(id, name) {
        const trimmed = name.trim().slice(0, 80)
        if (!trimmed) return
        if (get().project?.id === id) return get().renameProject(trimmed)
        try {
          const p = await repo.load(id)
          await repo.save({ ...p, name: trimmed, updatedAt: Date.now() })
          await get().refreshList()
        } catch (e) {
          notify({ tone: 'error', message: 'Could not rename world', detail: (e as Error).message })
        }
      },

      async duplicateProject(id) {
        try {
          const src = await repo.load(id)
          const now = Date.now()
          await repo.save({ ...structuredClone(src), id: newId('world'), name: `${src.name} (copy)`.slice(0, 80), createdAt: now, updatedAt: now })
          await get().refreshList()
          notify({ tone: 'success', message: `Duplicated “${src.name}”` })
        } catch (e) {
          notify({ tone: 'error', message: 'Could not duplicate world', detail: (e as Error).message })
        }
      },

      async deleteProject(id) {
        await repo.remove(id)
        if (get().project?.id === id) get().closeProject()
        await get().refreshList()
      },

      async deleteCorrupt(id) {
        await repo.remove(id)
        await get().refreshList()
      },

      exportProject() {
        const p = get().project
        if (!p) return null
        return { filename: `${p.name.replace(/[^\w-]+/g, '-').toLowerCase()}.branchpoint.json`, text: serializeProject(p, new Date().toISOString()) }
      },

      async importProject(text) {
        try {
          const parsed = deserializeProject(text)
          const exists = get().projects.some((m) => m.id === parsed.id)
          const project: Project = exists ? { ...parsed, id: newId('world'), name: `${parsed.name} (imported)`.slice(0, 80) } : parsed
          await repo.save(project)
          await get().refreshList()
          loadProject(project)
          writeLastOpened(project.id)
          notify({ tone: 'success', message: `Imported “${project.name}”` })
          return { ok: true }
        } catch (e) {
          const err = e as Error & { issues?: { path: string; message: string }[] }
          return { ok: false, error: err.message, issues: (err.issues ?? []).map((i) => `${i.path}: ${i.message}`) }
        }
      },

      resetProject() {
        const p = get().project
        const main = p?.branches.find((b) => b.parentId === null) ?? p?.branches[0]
        if (!p || !main) return
        const first = main.revisions[0]
        if (!first) return
        const fresh = H.createRootBranch(first.model, { id: newId('br'), name: 'Main', color: BRANCH_COLORS[0] ?? '#ffffff', createdAt: Date.now() })
        commit({ ...p, branches: [fresh], activeBranchId: fresh.id }, { timelines: {}, simErrors: {}, viewStep: null, selection: null, playing: false, compareIds: [fresh.id] })
        timelineFor(fresh)
      },

      step(n = 1) {
        const b = active()
        if (!b) return
        if (get().simErrors[b.id]) return set({ playing: false })
        if (b.headStep + n > MAX_STEPS) {
          set({ playing: false })
          return notify({ tone: 'info', message: `Branches are limited to ${MAX_STEPS} steps in this release` })
        }
        const next = H.advance(b, n)
        const cached = get().timelines[b.id]
        try {
          const tl = cached ? extendTo(cached, next, next.headStep, false) : replay(next)
          setBranch(next, tl, { viewStep: null })
        } catch (e) {
          set((s) => ({ playing: false, simErrors: { ...s.simErrors, [b.id]: (e as Error).message } }))
        }
      },

      setPlaying(playing) {
        set({ playing, viewStep: playing ? null : get().viewStep })
      },
      setSpeed(speed) {
        set({ speed })
      },
      setViewStep(s) {
        const b = active()
        if (!b) return
        set({ viewStep: s === null || s >= b.headStep ? null : Math.max(0, Math.round(s)), playing: false })
      },

      addCheckpoint(label) {
        const b = active()
        if (!b) return
        const step = get().viewStep ?? b.headStep
        setBranch(H.addCheckpoint(b, { id: newId('cp'), step, label: label.trim() || `Step ${step}` }), get().timelines[b.id])
        notify({ tone: 'success', message: `Checkpoint saved at step ${step}` })
      },

      removeCheckpoint(id) {
        const b = active()
        if (b) setBranch(H.removeCheckpoint(b, id), get().timelines[b.id])
      },

      rewindTo(step) {
        const b = active()
        if (!b) return
        const next = H.rewind(b, step)
        const cached = get().timelines[b.id]
        const tl = cached ? { ...cached, states: cached.states.slice(0, step + 1), events: cached.events.slice(0, step + 1) } : null
        setBranch(next, tl, { viewStep: null, playing: false })
      },

      branchFrom(step, name) {
        const p = get().project
        const parent = active()
        if (!p || !parent) return null
        const parentTl = timelineFor(parent)
        if (!parentTl) return null
        const color = BRANCH_COLORS[p.branches.length % BRANCH_COLORS.length] ?? '#ffffff'
        const child = H.fork(parent, step, { id: newId('br'), name: name?.trim() || `Branch ${p.branches.length}`, color, createdAt: Date.now() })
        const tl = forkTimeline(parentTl, child)
        commit(
          { ...p, branches: [...p.branches, child], activeBranchId: child.id },
          { timelines: { ...get().timelines, [child.id]: tl }, viewStep: null, playing: false, compareIds: uniq([parent.id, child.id, ...get().compareIds]).slice(0, 4) },
        )
        notify({ tone: 'success', message: `Created “${child.name}” from step ${step}` })
        return child.id
      },

      switchBranch(id) {
        const p = get().project
        if (!p || !p.branches.some((b) => b.id === id)) return
        commit({ ...p, activeBranchId: id }, { viewStep: null, playing: false })
        const b = p.branches.find((x) => x.id === id)
        if (b) timelineFor(b)
      },

      renameBranch(id, name) {
        const p = get().project
        const trimmed = name.trim().slice(0, 80)
        if (!p || !trimmed) return
        commit({ ...p, branches: p.branches.map((b) => (b.id === id ? { ...b, name: trimmed } : b)) })
      },

      deleteBranch(id) {
        const p = get().project
        if (!p || p.branches.length <= 1) return
        const victim = p.branches.find((b) => b.id === id)
        if (!victim) return
        // Children are independent (they carry their own inputs); re-parent them for lineage display.
        const branches = p.branches.filter((b) => b.id !== id).map((b) => (b.parentId === id ? { ...b, parentId: victim.parentId } : b))
        const activeBranchId = p.activeBranchId === id ? (victim.parentId && branches.some((b) => b.id === victim.parentId) ? victim.parentId : branches[0]!.id) : p.activeBranchId
        commit({ ...p, branches, activeBranchId }, { timelines: omit(get().timelines, id), compareIds: get().compareIds.filter((x) => x !== id), viewStep: null })
      },

      updateModel(fn, note) {
        const b = active()
        if (!b) return false
        if (get().viewStep !== null) {
          notify({ tone: 'info', message: 'History is read-only. Return to the head step or branch from here to make changes.' })
          return false
        }
        const current = H.headModel(b)
        const nextModel = fn(current)
        const structural = worldModelSchema.safeParse(nextModel)
        if (!structural.success) {
          notify({ tone: 'error', message: 'That change is not valid', detail: structural.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n') })
          return false
        }
        const errors = semanticIssues(nextModel).filter((i) => i.severity === 'error')
        if (errors.length) {
          notify({ tone: 'error', message: 'That change would break the model', detail: errors.map((i) => `${i.path}: ${i.message}`).join('\n') })
          return false
        }
        const next = H.revise(b, nextModel, note)
        const cached = get().timelines[b.id]
        // At step 0 the starting state depends on the model, so replay; otherwise history is unchanged.
        setBranch(next, b.headStep === 0 || !cached ? replay(next) : cached)
        return true
      },

      intervene(label, effects) {
        const b = active()
        if (!b) return
        if (get().viewStep !== null) return notify({ tone: 'info', message: 'Interventions apply at the head step.' })
        const next = H.addIntervention(b, { id: newId('iv'), step: b.headStep, label, effects })
        const cached = get().timelines[b.id]
        try {
          setBranch(next, cached ? recomputeHead(cached, next) : replay(next))
        } catch (e) {
          notify({ tone: 'error', message: 'Intervention failed', detail: (e as Error).message })
        }
      },

      moveLocation(id, pt) {
        const p = get().project
        if (!p) return
        const x = Math.round(Math.min(980, Math.max(20, pt.x)))
        const y = Math.round(Math.min(620, Math.max(20, pt.y)))
        commit({ ...p, layout: { ...p.layout, [id]: { x, y } } })
      },

      select(selection) {
        set({ selection })
      },
      setView(view) {
        set({ view })
      },
      setCompare(compareIds) {
        set({ compareIds: compareIds.slice(0, 4) })
      },
      notify,
      dismiss(id) {
        set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
      },
    }
  })
}

function omit<T>(o: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _drop, ...rest } = o
  return rest
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

const LAST_KEY = 'branchpoint:last-opened'
function readLastOpened(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}
function writeLastOpened(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id)
    else localStorage.removeItem(LAST_KEY)
  } catch {
    /* per-viewer convenience only */
  }
}

// ── App singleton + selectors ────────────────────────────────────────────────

export const appStore = createAppStore()

export function useApp<T>(selector: (s: Store) => T): T {
  return useStore(appStore, selector)
}

export function activeBranchOf(s: AppState): H.Branch | null {
  return s.project?.branches.find((b) => b.id === s.project?.activeBranchId) ?? null
}
