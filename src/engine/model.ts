/**
 * Domain model for Branchpoint.
 *
 * A `WorldModel` is the *definition* of a world: entity definitions with their initial values,
 * the rules that drive change, and scheduled events. It is versioned per branch (see history/).
 *
 * A `WorldState` is the *value* of the world at a discrete step. States are immutable once
 * produced; the engine always returns new objects.
 */

export type Id = string

export interface ResourceDef {
  id: Id
  name: string
  color: string
  description: string
}

/** Personality, each 0..1. Drives faction decisions; blended with the current ruler's temperament. */
export interface FactionTraits {
  aggression: number // appetite for raids and war
  ambition: number // drive to invest and grow
  caution: number // reluctance to take risks, eagerness for peace
  mercantile: number // preference for trade, aid and alliances
}

export interface FactionDef {
  id: Id
  name: string
  color: string
  description: string
  initialStability: number // 0..100
  traits: FactionTraits
}

export interface LocationDef {
  id: Id
  name: string
  region: string // island / area grouping, used by the canvas
  description: string
  initialOwnerId: Id
  initialPopulation: number
  initialStock: Record<Id, number>
}

export interface TradeRouteDef {
  id: Id
  name: string
  fromId: Id
  toId: Id
  resourceId: Id
  amount: number // per step
  minRelation: number // −100..100, route halts below this relation between owners
  initiallyActive: boolean
}

export interface RelationDef {
  a: Id
  b: Id
  value: number // −100..100
}

// ── Scopes & conditions ──────────────────────────────────────────────────────

export type Scope =
  | { kind: 'all' }
  | { kind: 'location'; id: Id }
  | { kind: 'faction'; id: Id } // every location currently owned by the faction
  | { kind: 'region'; region: string }

export type Metric =
  | { kind: 'stock'; locationId: Id; resourceId: Id }
  | { kind: 'factionStock'; factionId: Id; resourceId: Id }
  | { kind: 'population'; locationId: Id }
  | { kind: 'factionPopulation'; factionId: Id }
  | { kind: 'stability'; factionId: Id }
  | { kind: 'relation'; a: Id; b: Id }

export type Comparator = '<' | '<=' | '>' | '>='

export interface Condition {
  metric: Metric
  op: Comparator
  value: number
}

// ── Effects (shared by threshold rules, scheduled events and interventions) ──

export type Effect =
  | { kind: 'adjustStock'; locationId: Id; resourceId: Id; delta: number }
  | { kind: 'setStock'; locationId: Id; resourceId: Id; value: number }
  | { kind: 'adjustPopulation'; locationId: Id; delta: number }
  | { kind: 'setPopulation'; locationId: Id; value: number }
  | { kind: 'adjustStability'; factionId: Id; delta: number }
  | { kind: 'setStability'; factionId: Id; value: number }
  | { kind: 'adjustRelation'; a: Id; b: Id; delta: number }
  | { kind: 'setRouteActive'; routeId: Id; active: boolean }
  | { kind: 'setOwner'; locationId: Id; factionId: Id }
  | { kind: 'addModifier'; locationId: Id; resourceId: Id; factor: number; duration: number; label: string }
  | { kind: 'setWar'; a: Id; b: Id; active: boolean }
  | { kind: 'setAlliance'; a: Id; b: Id; active: boolean }
  | { kind: 'adjustTech'; factionId: Id; delta: number }
  | { kind: 'startPlague'; locationId: Id; duration: number }

// ── Rules ────────────────────────────────────────────────────────────────────

interface RuleBase {
  id: Id
  name: string
  enabled: boolean
  priority: number // lower runs first; ties broken by id
}

export interface ProduceRule extends RuleBase {
  type: 'produce'
  scope: Scope
  resourceId: Id
  amount: number
  perCapita: boolean // amount is per 100 population when true
  variance: number // 0..0.5, seeded random ± fraction
}

export interface ConsumeRule extends RuleBase {
  type: 'consume'
  scope: Scope
  resourceId: Id
  amount: number
  perCapita: boolean // amount is per 100 population when true
  shortageStabilityDelta: number // applied to owner faction per location in shortage (usually ≤ 0)
  shortagePopulationLoss: number // fraction 0..1 of the unmet need lost as population
}

export interface TradeRule extends RuleBase {
  type: 'trade'
  routeIds: Id[] | 'all'
  reserve: number // source keeps at least this much
  relationGain: number // relation change between owners per successful transfer (different owners only)
}

export interface GrowthRule extends RuleBase {
  type: 'growth'
  scope: Scope
  resourceId: Id // the resource that must be in surplus (usually food)
  surplusPerCapita: number // stock per 100 pop required to grow
  rate: number // fractional growth per step, e.g. 0.03
}

export interface DecayRule extends RuleBase {
  type: 'decay'
  scope: Scope
  resourceId: Id
  rate: number // 0..1 fraction lost per step
}

export interface ThresholdRule extends RuleBase {
  type: 'threshold'
  condition: Condition
  effects: Effect[]
  eventLabel: string
  cooldown: number // steps before it can fire again; 0 = every step while true
}

export interface DriftRule extends RuleBase {
  type: 'drift'
  factionIds: Id[] | 'all'
  target: number // stability each faction relaxes toward
  rate: number // 0..1 fraction of the gap closed per step
}

/** Factions choose one action per step by scoring options against their traits and situation. */
export interface AgencyRule extends RuleBase {
  type: 'agency'
  foodResourceId: Id // what hunger is measured in
  investResourceId: Id // what investment in innovation costs
  activity: number // 0..1 chance a faction acts in a given step
  temperament: number // 0..2 scales how extreme decisions get (raid size, war appetite)
}

/** Resolves wars: battles, casualties, exhaustion, conquest, and negotiated peace. */
export interface WarfareRule extends RuleBase {
  type: 'warfare'
  armsResourceId: Id // consumed by armies; having it makes them stronger
  casualtyRate: number // 0..0.2 share of the weaker side's front lost per battle
  conquestRatio: number // strength ratio needed to take a settlement
  exhaustionLimit: number // war ends when a side reaches this exhaustion
}

/** Disease outbreaks seeded by crowding and hunger, spreading along active trade routes. */
export interface ContagionRule extends RuleBase {
  type: 'contagion'
  foodResourceId: Id
  outbreakChance: number // base chance per settlement per step
  spreadChance: number // chance per active route per step
  mortality: number // share of population lost per step while infected
  duration: number // steps an outbreak lasts
}

/** People move along routes from hungry, unstable, sick places toward prosperous ones. */
export interface MigrationRule extends RuleBase {
  type: 'migration'
  foodResourceId: Id
  rate: number // 0..0.2 share of a settlement's population that may move per step
}

/** Seeded random fortunes and disasters, drawn from a fixed deck. */
export interface FortuneRule extends RuleBase {
  type: 'fortune'
  foodResourceId: Id
  chance: number // chance per step that something happens somewhere
  intensity: number // 0.5..2 scales magnitudes
}

/** Rulers age, die, and are succeeded; each brings a new temperament. */
export interface SuccessionRule extends RuleBase {
  type: 'succession'
  stepsPerYear: number // how many steps make one year of a ruler's life
  crisisStability: number // stability lost on succession (scaled by the heir's legitimacy)
}

export type Rule = DriftRule | AgencyRule | WarfareRule | ContagionRule | MigrationRule | FortuneRule | SuccessionRule | ProduceRule | ConsumeRule | TradeRule | GrowthRule | DecayRule | ThresholdRule
export type RuleType = Rule['type']

export interface ScheduledEvent {
  id: Id
  name: string
  description: string
  step: number // fires during the transition into this step
  effects: Effect[]
}

export interface WorldModel {
  id: Id
  name: string
  description: string
  seed: number
  resources: ResourceDef[]
  factions: FactionDef[]
  locations: LocationDef[]
  routes: TradeRouteDef[]
  relations: RelationDef[]
  rules: Rule[]
  events: ScheduledEvent[]
}

// ── State ────────────────────────────────────────────────────────────────────

export interface Modifier {
  id: Id
  resourceId: Id
  factor: number
  remaining: number
  label: string
}

export interface LocationState {
  ownerId: Id
  population: number
  stock: Record<Id, number>
  modifiers: Modifier[]
  culture: Id // the faction whose people these are (initial owner); occupied when ownerId differs
  plague: number // steps of outbreak remaining; 0 = healthy
  immunity: number // steps of post-plague immunity remaining
}

export interface Ruler {
  name: string
  title: string
  age: number // years
  since: number // step of accession
  boldness: number // −0.3..0.3 added to aggression
  wisdom: number // −0.3..0.3 added to ambition/caution
  epithet: string
}

export interface FactionState {
  stability: number
  tech: number // productivity multiplier from innovation, starts at 1
  exhaustion: number // war weariness 0..100
  ruler: Ruler
}

export interface Pact {
  since: number
}

export interface RouteState {
  active: boolean
  lastTransferred: number
}

export interface WorldState {
  step: number
  rng: number // uint32 seeded RNG state
  locations: Record<Id, LocationState>
  factions: Record<Id, FactionState>
  routes: Record<Id, RouteState>
  relations: Record<string, number> // key = relationKey(a, b)
  wars: Record<string, Pact> // key = relationKey(a, b)
  alliances: Record<string, Pact>
  truces: Record<string, number> // key = relationKey(a, b) → step until which war cannot be declared
  ruleCooldowns: Record<Id, number> // rule id → step when it may fire again
}

// ── Events ───────────────────────────────────────────────────────────────────

export type ChangeTarget =
  | { kind: 'stock'; locationId: Id; resourceId: Id }
  | { kind: 'population'; locationId: Id }
  | { kind: 'stability'; factionId: Id }
  | { kind: 'relation'; a: Id; b: Id }
  | { kind: 'routeActive'; routeId: Id }
  | { kind: 'owner'; locationId: Id }
  | { kind: 'modifier'; locationId: Id; resourceId: Id }
  | { kind: 'tech'; factionId: Id }
  | { kind: 'exhaustion'; factionId: Id }
  | { kind: 'plague'; locationId: Id }
  | { kind: 'war'; a: Id; b: Id }
  | { kind: 'alliance'; a: Id; b: Id }
  | { kind: 'ruler'; factionId: Id }

export interface Change {
  target: ChangeTarget
  before: number | string | boolean
  after: number | string | boolean
  note?: string // e.g. "clamped to 0..100", "requested 40, only 12 available"
}

export type EventKind =
  | 'production'
  | 'consumption'
  | 'shortage'
  | 'trade'
  | 'trade-blocked'
  | 'growth'
  | 'decline'
  | 'decay'
  | 'threshold'
  | 'scheduled'
  | 'intervention'
  | 'modifier-expired'
  | 'rule-skipped'
  | 'revision'
  | 'decision'
  | 'war'
  | 'peace'
  | 'alliance'
  | 'battle'
  | 'conquest'
  | 'plague'
  | 'migration'
  | 'fortune'
  | 'succession'
  | 'innovation'

export type Severity = 'info' | 'notable' | 'warning' | 'critical'

export interface SimEvent {
  id: string // `${step}.${seq}` — unique within a branch
  step: number
  kind: EventKind
  severity: Severity
  message: string
  ruleId?: Id
  scheduledEventId?: Id
  interventionId?: Id
  entityIds: Id[]
  changes: Change[]
  /** Why it happened, in words (e.g. the factors behind a faction's decision). */
  detail?: string
}

export interface Intervention {
  id: Id
  step: number
  label: string
  effects: Effect[]
}

export function relationKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export const STABILITY_RANGE = [0, 100] as const
export const RELATION_RANGE = [-100, 100] as const

export const DEFAULT_TRAITS: FactionTraits = { aggression: 0.4, ambition: 0.5, caution: 0.5, mercantile: 0.5 }
