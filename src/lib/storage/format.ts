import { z } from 'zod'
import { interventionSchema, worldModelSchema } from '../../engine/schema'
import { semanticIssues, validateInterventions, type ValidationIssue } from '../../engine/validate'
import { SCHEMA_VERSION, type Project } from './project'
import { DEFAULT_TRAITS } from '../../engine/model'

const branchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  parentId: z.string().nullable(),
  forkStep: z.number().int().min(0),
  createdAt: z.number(),
  revisions: z.array(z.object({ fromStep: z.number().int().min(0), model: worldModelSchema, note: z.string().max(200) })).min(1),
  interventions: z.array(interventionSchema),
  headStep: z.number().int().min(0).max(100000),
  checkpoints: z.array(z.object({ id: z.string().min(1), step: z.number().int().min(0), label: z.string().max(80) })),
})

export const projectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().max(2000),
  createdAt: z.number(),
  updatedAt: z.number(),
  activeBranchId: z.string().min(1),
  branches: z.array(branchSchema).min(1),
  layout: z.record(z.string(), z.object({ x: z.number().finite(), y: z.number().finite() })),
})

export const EXPORT_FORMAT = 'branchpoint.world'

export class ProjectFormatError extends Error {
  constructor(message: string, readonly issues: ValidationIssue[] = []) {
    super(message)
    this.name = 'ProjectFormatError'
  }
}

/**
 * Migrations from older persisted versions to SCHEMA_VERSION.
 *   v1 → v2: factions gained `traits` (personality). Older worlds get the neutral default.
 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const v = raw.schemaVersion
  if (v === SCHEMA_VERSION) return raw
  if (v === 1) return migrate(v1to2(raw))
  if (typeof v === 'number' && v > SCHEMA_VERSION)
    throw new ProjectFormatError(`This world was saved by a newer version of Branchpoint (format v${v}); this build reads up to v${SCHEMA_VERSION}.`)
  throw new ProjectFormatError(`Unrecognised world format version: ${String(v)}`)
}

/** Validate untrusted data (storage, import) as a Project: structure, references, and branch integrity. */
export function parseProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new ProjectFormatError('Expected a world object')
  const migrated = migrate(raw as Record<string, unknown>)
  const parsed = projectSchema.safeParse(migrated)
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.slice(0, 20).map((i) => ({ severity: 'error', path: i.path.join('.'), message: i.message }))
    throw new ProjectFormatError('The world file is malformed', issues)
  }
  const p = parsed.data as Project
  const issues: ValidationIssue[] = []
  const ids = new Set(p.branches.map((b) => b.id))
  if (ids.size !== p.branches.length) issues.push({ severity: 'error', path: 'branches', message: 'duplicate branch ids' })
  if (!ids.has(p.activeBranchId)) issues.push({ severity: 'error', path: 'activeBranchId', message: 'active branch does not exist' })
  p.branches.forEach((b, i) => {
    if (b.parentId !== null && !ids.has(b.parentId)) issues.push({ severity: 'warning', path: `branches[${i}].parentId`, message: 'parent branch is missing; lineage will show as detached' })
    if (b.revisions[0]?.fromStep !== 0) issues.push({ severity: 'error', path: `branches[${i}].revisions[0]`, message: 'first revision must start at step 0' })
    b.revisions.forEach((r, j) => {
      for (const issue of semanticIssues(r.model)) if (issue.severity === 'error') issues.push({ ...issue, path: `branches[${i}].revisions[${j}].model.${issue.path}` })
    })
    for (const issue of validateInterventions(b.revisions.at(-1)!.model, b.interventions)) issues.push({ ...issue, path: `branches[${i}].${issue.path}` })
    for (const iv of b.interventions) if (iv.step > b.headStep) issues.push({ severity: 'error', path: `branches[${i}].interventions`, message: `intervention "${iv.id}" is beyond the branch head` })
  })
  const errors = issues.filter((i) => i.severity === 'error')
  if (errors.length) throw new ProjectFormatError('The world contains invalid data', errors)
  return p
}

export function serializeProject(p: Project, exportedAt: string): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: SCHEMA_VERSION, exportedAt, project: p }, null, 2)
}

export function deserializeProject(text: string): Project {
  // Accepts exports from any earlier format version; parseProject migrates them.
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new ProjectFormatError(`Not valid JSON: ${(e as Error).message}`)
  }
  if (!data || typeof data !== 'object') throw new ProjectFormatError('Expected a Branchpoint world export')
  const env = data as Record<string, unknown>
  if (env.format !== EXPORT_FORMAT) throw new ProjectFormatError(`Not a Branchpoint world export (format: ${String(env.format ?? 'missing')})`)
  return parseProject(env.project)
}

function v1to2(raw: Record<string, unknown>): Record<string, unknown> {
  const branches = Array.isArray(raw.branches) ? raw.branches : []
  return {
    ...raw,
    schemaVersion: 2,
    branches: branches.map((b: unknown) => {
      if (!b || typeof b !== 'object') return b
      const br = b as Record<string, unknown>
      const revisions = Array.isArray(br.revisions) ? br.revisions : []
      return {
        ...br,
        revisions: revisions.map((r: unknown) => {
          if (!r || typeof r !== 'object') return r
          const rev = r as Record<string, unknown>
          const model = rev.model as Record<string, unknown> | undefined
          if (!model || !Array.isArray(model.factions)) return rev
          return { ...rev, model: { ...model, factions: model.factions.map((f: unknown) => (f && typeof f === 'object' && !('traits' in f) ? { ...f, traits: { ...DEFAULT_TRAITS } } : f)) } }
        }),
      }
    }),
  }
}
