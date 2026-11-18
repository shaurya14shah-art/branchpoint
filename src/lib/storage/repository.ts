import { parseProject, ProjectFormatError } from './format'
import { metaOf, type Project, type ProjectMeta } from './project'

/**
 * Storage seam. The app talks only to this interface, so a cloud implementation can be added
 * without touching the engine or the UI.
 */
export interface ProjectRepository {
  list(): Promise<{ projects: ProjectMeta[]; corrupt: { id: string; error: string }[] }>
  load(id: string): Promise<Project>
  save(project: Project): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'StorageError'
  }
}

const DB = 'branchpoint'
const STORE = 'projects'

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(new StorageError(r.error?.message ?? 'IndexedDB request failed', r.error))
  })
}

export class IndexedDbRepository implements ProjectRepository {
  private db: Promise<IDBDatabase> | null = null

  constructor(private readonly factory: IDBFactory = globalThis.indexedDB) {}

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new StorageError('IndexedDB is not available in this browser'))
    this.db ??= new Promise((resolve, reject) => {
      const r = this.factory.open(DB, 1)
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(new StorageError(r.error?.message ?? 'Could not open the local database', r.error))
      r.onblocked = () => reject(new StorageError('The local database is blocked by another tab'))
    })
    return this.db
  }

  private async store(mode: IDBTransactionMode) {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE)
  }

  async list() {
    const all = (await req((await this.store('readonly')).getAll())) as unknown[]
    const projects: ProjectMeta[] = []
    const corrupt: { id: string; error: string }[] = []
    for (const raw of all) {
      try {
        projects.push(metaOf(parseProject(raw)))
      } catch (e) {
        const id = raw && typeof raw === 'object' && 'id' in raw ? String((raw as { id: unknown }).id) : '(unknown)'
        corrupt.push({ id, error: e instanceof ProjectFormatError ? e.message : String(e) })
      }
    }
    projects.sort((a, b) => b.updatedAt - a.updatedAt)
    return { projects, corrupt }
  }

  async load(id: string): Promise<Project> {
    const raw: unknown = await req((await this.store('readonly')).get(id))
    if (raw === undefined) throw new StorageError(`No saved world with id "${id}"`)
    return parseProject(raw)
  }

  async save(project: Project): Promise<void> {
    await req((await this.store('readwrite')).put(project))
  }

  async remove(id: string): Promise<void> {
    await req((await this.store('readwrite')).delete(id))
  }

  async clear(): Promise<void> {
    await req((await this.store('readwrite')).clear())
  }

  /** Test/recovery hook: write raw, unvalidated data. */
  async putRaw(value: unknown): Promise<void> {
    await req((await this.store('readwrite')).put(value))
  }
}
