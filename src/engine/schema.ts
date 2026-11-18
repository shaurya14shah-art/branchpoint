import { z } from 'zod'
import type { Condition, Effect, Intervention, Rule, Scope, WorldModel } from './model'

/**
 * Structural schemas. Semantic checks (references, duplicates, ranges that depend on other
 * entities) live in validate.ts. Every shape that is persisted, imported, or produced by AI is
 * parsed through these before it reaches the engine.
 */

const id = z.string().min(1).max(64)
const finite = z.number().finite()
const nonNeg = finite.min(0)
const int = z.number().int()
const name = z.string().min(1).max(80)
const text = z.string().max(2000)
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a #rrggbb colour')

export const scopeSchema: z.ZodType<Scope> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('location'), id }),
  z.object({ kind: z.literal('faction'), id }),
  z.object({ kind: z.literal('region'), region: z.string().min(1) }),
])

const metricSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stock'), locationId: id, resourceId: id }),
  z.object({ kind: z.literal('factionStock'), factionId: id, resourceId: id }),
  z.object({ kind: z.literal('population'), locationId: id }),
  z.object({ kind: z.literal('factionPopulation'), factionId: id }),
  z.object({ kind: z.literal('stability'), factionId: id }),
  z.object({ kind: z.literal('relation'), a: id, b: id }),
])

export const conditionSchema: z.ZodType<Condition> = z.object({
  metric: metricSchema,
  op: z.enum(['<', '<=', '>', '>=']),
  value: finite,
})

export const effectSchema: z.ZodType<Effect> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('adjustStock'), locationId: id, resourceId: id, delta: finite }),
  z.object({ kind: z.literal('setStock'), locationId: id, resourceId: id, value: nonNeg }),
  z.object({ kind: z.literal('adjustPopulation'), locationId: id, delta: finite }),
  z.object({ kind: z.literal('setPopulation'), locationId: id, value: nonNeg }),
  z.object({ kind: z.literal('adjustStability'), factionId: id, delta: finite }),
  z.object({ kind: z.literal('setStability'), factionId: id, value: finite.min(0).max(100) }),
  z.object({ kind: z.literal('adjustRelation'), a: id, b: id, delta: finite }),
  z.object({ kind: z.literal('setRouteActive'), routeId: id, active: z.boolean() }),
  z.object({ kind: z.literal('setOwner'), locationId: id, factionId: id }),
  z.object({
    kind: z.literal('addModifier'),
    locationId: id,
    resourceId: id,
    factor: finite.min(0).max(10),
    duration: int.min(1).max(1000),
    label: name,
  }),
  z.object({ kind: z.literal('setWar'), a: id, b: id, active: z.boolean() }),
  z.object({ kind: z.literal('setAlliance'), a: id, b: id, active: z.boolean() }),
  z.object({ kind: z.literal('adjustTech'), factionId: id, delta: finite.min(-5).max(5) }),
  z.object({ kind: z.literal('startPlague'), locationId: id, duration: int.min(1).max(100) }),
])

const ruleBase = { id, name, enabled: z.boolean(), priority: int.min(-1000).max(1000) }

const unit = finite.min(0).max(1)

export const traitsSchema = z.object({ aggression: unit, ambition: unit, caution: unit, mercantile: unit })

export const ruleSchema: z.ZodType<Rule> = z.discriminatedUnion('type', [
  z.object({ ...ruleBase, type: z.literal('agency'), foodResourceId: id, investResourceId: id, activity: unit, temperament: finite.min(0).max(2) }),
  z.object({ ...ruleBase, type: z.literal('warfare'), armsResourceId: id, casualtyRate: finite.min(0).max(0.2), conquestRatio: finite.min(1).max(5), exhaustionLimit: finite.min(10).max(100) }),
  z.object({ ...ruleBase, type: z.literal('contagion'), foodResourceId: id, outbreakChance: finite.min(0).max(0.2), spreadChance: unit, mortality: finite.min(0).max(0.3), duration: int.min(1).max(50) }),
  z.object({ ...ruleBase, type: z.literal('migration'), foodResourceId: id, rate: finite.min(0).max(0.2) }),
  z.object({ ...ruleBase, type: z.literal('fortune'), foodResourceId: id, chance: unit, intensity: finite.min(0.5).max(2) }),
  z.object({ ...ruleBase, type: z.literal('succession'), stepsPerYear: int.min(1).max(12), crisisStability: finite.min(0).max(50) }),
  z.object({
    ...ruleBase,
    type: z.literal('drift'),
    factionIds: z.union([z.literal('all'), z.array(id)]),
    target: finite.min(0).max(100),
    rate: finite.min(0).max(1),
  }),
  z.object({
    ...ruleBase,
    type: z.literal('produce'),
    scope: scopeSchema,
    resourceId: id,
    amount: nonNeg,
    perCapita: z.boolean(),
    variance: finite.min(0).max(0.5),
  }),
  z.object({
    ...ruleBase,
    type: z.literal('consume'),
    scope: scopeSchema,
    resourceId: id,
    amount: nonNeg,
    perCapita: z.boolean(),
    shortageStabilityDelta: finite.min(-100).max(100),
    shortagePopulationLoss: finite.min(0).max(1),
  }),
  z.object({
    ...ruleBase,
    type: z.literal('trade'),
    routeIds: z.union([z.literal('all'), z.array(id)]),
    reserve: nonNeg,
    relationGain: finite.min(-100).max(100),
  }),
  z.object({
    ...ruleBase,
    type: z.literal('growth'),
    scope: scopeSchema,
    resourceId: id,
    surplusPerCapita: nonNeg,
    rate: finite.min(0).max(1),
  }),
  z.object({
    ...ruleBase,
    type: z.literal('decay'),
    scope: scopeSchema,
    resourceId: id,
    rate: finite.min(0).max(1),
  }),
  z.object({
    ...ruleBase,
    type: z.literal('threshold'),
    condition: conditionSchema,
    effects: z.array(effectSchema).min(1).max(20),
    eventLabel: name,
    cooldown: int.min(0).max(10000),
  }),
])

export const worldModelSchema: z.ZodType<WorldModel> = z.object({
  id,
  name,
  description: text,
  seed: int.min(0).max(0xffffffff),
  resources: z.array(z.object({ id, name, color, description: text })).max(32),
  factions: z
    .array(z.object({ id, name, color, description: text, initialStability: finite.min(0).max(100), traits: traitsSchema }))
    .max(32),
  locations: z
    .array(
      z.object({
        id,
        name,
        region: z.string().max(80),
        description: text,
        initialOwnerId: id,
        initialPopulation: nonNeg,
        initialStock: z.record(z.string(), nonNeg),
      }),
    )
    .max(200),
  routes: z
    .array(
      z.object({
        id,
        name,
        fromId: id,
        toId: id,
        resourceId: id,
        amount: nonNeg,
        minRelation: finite.min(-100).max(100),
        initiallyActive: z.boolean(),
      }),
    )
    .max(500),
  relations: z.array(z.object({ a: id, b: id, value: finite.min(-100).max(100) })).max(1000),
  rules: z.array(ruleSchema).max(200),
  events: z
    .array(z.object({ id, name, description: text, step: int.min(1).max(100000), effects: z.array(effectSchema).max(20) }))
    .max(500),
})

export const interventionSchema: z.ZodType<Intervention> = z.object({
  id,
  step: int.min(0),
  label: name,
  effects: z.array(effectSchema).min(1),
})
