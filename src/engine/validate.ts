import type { Intervention, WorldModel } from './model'
import { relationKey } from './model'
import { interventionSchema, worldModelSchema } from './schema'
import { RefChecker, type ValidationIssue } from './refs'
import { ruleImpl } from './rules/registry'

export type { ValidationIssue } from './refs'

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

/**
 * Full validation: structure (schema) then semantics (references, duplicates, consistency).
 * `ok` is false when any *error* is present; warnings never block simulation.
 */
export function validateModel(input: unknown): ValidationResult & { model?: WorldModel } {
  const parsed = worldModelSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ severity: 'error', path: i.path.join('.') || '(root)', message: i.message })),
    }
  }
  const model = parsed.data
  const issues = semanticIssues(model)
  return { ok: !issues.some((i) => i.severity === 'error'), issues, model }
}

export function semanticIssues(model: WorldModel): ValidationIssue[] {
  const refs = new RefChecker(model)

  // Ids are unique across every entity kind so that event entityIds are unambiguous.
  const seen = new Map<string, string>()
  const collections = [
    ['resources', model.resources],
    ['factions', model.factions],
    ['locations', model.locations],
    ['routes', model.routes],
    ['rules', model.rules],
    ['events', model.events],
  ] as const
  for (const [kind, list] of collections) {
    list.forEach((e, i) => {
      const prev = seen.get(e.id)
      if (prev) refs.error(`${kind}[${i}].id`, `id "${e.id}" is already used by ${prev}`)
      else seen.set(e.id, `${kind}[${i}]`)
    })
  }

  model.locations.forEach((l, i) => {
    const p = `locations[${i}]`
    refs.faction(l.initialOwnerId, `${p}.initialOwnerId`)
    for (const r of Object.keys(l.initialStock)) refs.resource(r, `${p}.initialStock.${r}`)
  })

  model.routes.forEach((r, i) => {
    const p = `routes[${i}]`
    refs.location(r.fromId, `${p}.fromId`)
    refs.location(r.toId, `${p}.toId`)
    refs.resource(r.resourceId, `${p}.resourceId`)
    if (r.fromId === r.toId) refs.error(p, 'a trade route must connect two different locations')
  })

  const pairs = new Set<string>()
  model.relations.forEach((r, i) => {
    const p = `relations[${i}]`
    refs.faction(r.a, `${p}.a`)
    refs.faction(r.b, `${p}.b`)
    if (r.a === r.b) refs.error(p, 'a relation needs two different factions')
    const key = relationKey(r.a, r.b)
    if (pairs.has(key)) refs.error(p, `relation ${r.a} ↔ ${r.b} is defined twice`)
    pairs.add(key)
  })

  model.rules.forEach((rule, i) => ruleImpl(rule).validate(rule, refs, `rules[${i}]`))

  model.events.forEach((ev, i) => {
    ev.effects.forEach((e, j) => refs.effect(e, `events[${i}].effects[${j}]`))
    if (ev.effects.length === 0) refs.warn(`events[${i}]`, 'event has no effects')
  })

  if (model.locations.length === 0) refs.warn('locations', 'the world has no locations — nothing will happen')
  if (model.rules.filter((r) => r.enabled).length === 0) refs.warn('rules', 'no enabled rules — steps will not change anything')

  return refs.issues
}

export function validateInterventions(model: WorldModel, interventions: Intervention[]): ValidationIssue[] {
  const refs = new RefChecker(model)
  interventions.forEach((iv, i) => {
    const parsed = interventionSchema.safeParse(iv)
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        refs.error(`interventions[${i}].${issue.path.join('.')}`, issue.message)
      return
    }
    iv.effects.forEach((e, j) => refs.effect(e, `interventions[${i}].effects[${j}]`))
  })
  return refs.issues
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.severity === 'error' ? '✕' : '!'} ${i.path}: ${i.message}`).join('\n')
}
