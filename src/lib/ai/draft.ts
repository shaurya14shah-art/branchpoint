import { z } from 'zod'
import type { Effect, Rule, Scope, WorldModel } from '../../engine/model'
import { validateModel, type ValidationIssue } from '../../engine/validate'

/**
 * The shape an AI model is asked to produce. It is deliberately simpler than WorldModel (arrays
 * instead of records, no numeric constraints) so it maps cleanly onto JSON-schema structured
 * output. A draft is never trusted: `draftToModel` converts it and the result goes through the
 * same full validation as an import, then the user must approve it.
 */

const scope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('location'), id: z.string() }),
  z.object({ kind: z.literal('faction'), id: z.string() }),
  z.object({ kind: z.literal('region'), region: z.string() }),
])

const metric = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stock'), locationId: z.string(), resourceId: z.string() }),
  z.object({ kind: z.literal('factionStock'), factionId: z.string(), resourceId: z.string() }),
  z.object({ kind: z.literal('population'), locationId: z.string() }),
  z.object({ kind: z.literal('factionPopulation'), factionId: z.string() }),
  z.object({ kind: z.literal('stability'), factionId: z.string() }),
  z.object({ kind: z.literal('relation'), a: z.string(), b: z.string() }),
])

const effect = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('adjustStock'), locationId: z.string(), resourceId: z.string(), delta: z.number() }),
  z.object({ kind: z.literal('adjustPopulation'), locationId: z.string(), delta: z.number() }),
  z.object({ kind: z.literal('adjustStability'), factionId: z.string(), delta: z.number() }),
  z.object({ kind: z.literal('adjustRelation'), a: z.string(), b: z.string(), delta: z.number() }),
  z.object({ kind: z.literal('setRouteActive'), routeId: z.string(), active: z.boolean() }),
  z.object({ kind: z.literal('setOwner'), locationId: z.string(), factionId: z.string() }),
  z.object({ kind: z.literal('addModifier'), locationId: z.string(), resourceId: z.string(), factor: z.number(), duration: z.number(), label: z.string() }),
])

const base = { id: z.string(), name: z.string(), priority: z.number() }
const rule = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('drift'), target: z.number(), rate: z.number() }),
  z.object({ ...base, type: z.literal('agency'), foodResourceId: z.string(), investResourceId: z.string(), activity: z.number(), temperament: z.number() }),
  z.object({ ...base, type: z.literal('warfare'), armsResourceId: z.string(), casualtyRate: z.number(), conquestRatio: z.number(), exhaustionLimit: z.number() }),
  z.object({ ...base, type: z.literal('contagion'), foodResourceId: z.string(), outbreakChance: z.number(), spreadChance: z.number(), mortality: z.number(), duration: z.number() }),
  z.object({ ...base, type: z.literal('migration'), foodResourceId: z.string(), rate: z.number() }),
  z.object({ ...base, type: z.literal('fortune'), foodResourceId: z.string(), chance: z.number(), intensity: z.number() }),
  z.object({ ...base, type: z.literal('succession'), stepsPerYear: z.number(), crisisStability: z.number() }),
  z.object({ ...base, type: z.literal('produce'), scope, resourceId: z.string(), amount: z.number(), perCapita: z.boolean(), variance: z.number() }),
  z.object({ ...base, type: z.literal('consume'), scope, resourceId: z.string(), amount: z.number(), perCapita: z.boolean(), shortageStabilityDelta: z.number(), shortagePopulationLoss: z.number() }),
  z.object({ ...base, type: z.literal('trade'), reserve: z.number(), relationGain: z.number() }),
  z.object({ ...base, type: z.literal('growth'), scope, resourceId: z.string(), surplusPerCapita: z.number(), rate: z.number() }),
  z.object({ ...base, type: z.literal('decay'), scope, resourceId: z.string(), rate: z.number() }),
  z.object({ ...base, type: z.literal('threshold'), condition: z.object({ metric, op: z.enum(['<', '<=', '>', '>=']), value: z.number() }), effects: z.array(effect), eventLabel: z.string(), cooldown: z.number() }),
])

export const worldDraftSchema = z.object({
  name: z.string(),
  description: z.string(),
  resources: z.array(z.object({ id: z.string(), name: z.string(), color: z.string(), description: z.string() })),
  factions: z.array(z.object({ id: z.string(), name: z.string(), color: z.string(), description: z.string(), initialStability: z.number(), traits: z.object({ aggression: z.number(), ambition: z.number(), caution: z.number(), mercantile: z.number() }) })),
  locations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      region: z.string(),
      description: z.string(),
      ownerId: z.string(),
      population: z.number(),
      x: z.number(),
      y: z.number(),
      stock: z.array(z.object({ resourceId: z.string(), amount: z.number() })),
    }),
  ),
  routes: z.array(z.object({ id: z.string(), name: z.string(), fromId: z.string(), toId: z.string(), resourceId: z.string(), amount: z.number(), minRelation: z.number() })),
  relations: z.array(z.object({ a: z.string(), b: z.string(), value: z.number() })),
  rules: z.array(rule),
  events: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), step: z.number(), effects: z.array(effect) })),
})

export type WorldDraft = z.infer<typeof worldDraftSchema>

export interface DraftResult {
  model: WorldModel
  layout: Record<string, { x: number; y: number }>
  issues: ValidationIssue[]
  ok: boolean
}

/** Convert and fully validate a draft. Never throws on bad content; reports issues instead. */
export function draftToModel(draft: WorldDraft, seed = 1): DraftResult {
  const clampXY = (v: number, hi: number) => Math.min(hi - 40, Math.max(40, Math.round(v)))
  const layout: DraftResult['layout'] = {}
  for (const l of draft.locations) layout[l.id] = { x: clampXY(l.x, 1000), y: clampXY(l.y, 640) }
  const model: WorldModel = {
    id: draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'ai-world',
    name: draft.name.slice(0, 80) || 'Untitled world',
    description: draft.description.slice(0, 2000),
    seed,
    resources: draft.resources,
    factions: draft.factions,
    locations: draft.locations.map((l) => ({
      id: l.id,
      name: l.name,
      region: l.region,
      description: l.description,
      initialOwnerId: l.ownerId,
      initialPopulation: Math.round(l.population),
      initialStock: Object.fromEntries(l.stock.map((s) => [s.resourceId, Math.round(s.amount)])),
    })),
    routes: draft.routes.map((r) => ({ ...r, initiallyActive: true })),
    relations: draft.relations,
    rules: draft.rules.map((r): Rule => {
      const common = { enabled: true, priority: Math.round(r.priority) }
      switch (r.type) {
        case 'drift':
          return { ...r, ...common, factionIds: 'all' }
        case 'trade':
          return { ...r, ...common, routeIds: 'all' }
        case 'threshold':
          return { ...r, ...common, cooldown: Math.round(r.cooldown), effects: r.effects.map(fixEffect) }
        case 'contagion':
          return { ...r, ...common, duration: Math.max(1, Math.round(r.duration)) }
        case 'succession':
          return { ...r, ...common, stepsPerYear: Math.max(1, Math.round(r.stepsPerYear)) }
        default:
          return { ...r, ...common, ...('scope' in r ? { scope: r.scope as Scope } : {}) } as Rule
      }
    }),
    events: draft.events.map((e) => ({ ...e, step: Math.max(1, Math.round(e.step)), effects: e.effects.map(fixEffect) })),
  }
  const v = validateModel(model)
  return { model, layout, issues: v.issues, ok: v.ok }
}

function fixEffect(e: z.infer<typeof effect>): Effect {
  return e.kind === 'addModifier' ? { ...e, duration: Math.max(1, Math.round(e.duration)) } : e
}

/** Grounding data for a branch-difference summary. Built on the client from computed comparisons. */
export const compareFactsSchema = z.object({
  world: z.string().max(200),
  reference: z.object({ name: z.string().max(80), headStep: z.number() }),
  others: z
    .array(
      z.object({
        name: z.string().max(80),
        headStep: z.number(),
        divergenceStep: z.number().nullable(),
        inputChanges: z.array(z.string().max(500)).max(40),
      }),
    )
    .max(3),
  finalState: z.array(z.object({ group: z.string().max(80), label: z.string().max(120), values: z.array(z.number()) })).max(200),
  milestones: z.array(z.object({ branch: z.string().max(80), items: z.array(z.string().max(200)).max(60) })).max(4),
})

export type CompareFacts = z.infer<typeof compareFactsSchema>
