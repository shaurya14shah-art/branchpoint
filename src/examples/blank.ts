import { DEFAULT_TRAITS, type FactionTraits, type Rule, type WorldModel } from '../engine/model'
import type { Point } from '../lib/storage/project'

export interface BlankWorldInput {
  name: string
  description: string
  seed: number
  factions: { name: string; color: string }[]
  resources: { name: string; color: string }[] // the first resource is the staple food
  population: number
  startingFood: number
}

export const FACTION_COLORS = ['#c4574f', '#4f9f9b', '#b89a4e', '#8b7cc0', '#6f9e5a', '#c07a4f']
export const RESOURCE_PRESETS = [
  { name: 'Food', color: '#9fb56b' },
  { name: 'Timber', color: '#b08a5c' },
  { name: 'Iron', color: '#93a1b3' },
  { name: 'Stone', color: '#a39e93' },
  { name: 'Silver', color: '#c9c3a8' },
]

/** Distinct starting personalities so even a blank world has tension. */
const PERSONALITIES: FactionTraits[] = [
  { aggression: 0.65, ambition: 0.5, caution: 0.3, mercantile: 0.35 },
  { aggression: 0.25, ambition: 0.6, caution: 0.55, mercantile: 0.85 },
  { aggression: 0.4, ambition: 0.75, caution: 0.6, mercantile: 0.45 },
  { aggression: 0.55, ambition: 0.4, caution: 0.45, mercantile: 0.6 },
  { aggression: 0.3, ambition: 0.35, caution: 0.8, mercantile: 0.5 },
  { aggression: 0.8, ambition: 0.6, caution: 0.2, mercantile: 0.2 },
]

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x'
}

function uniqueSlug(base: string, used: Set<string>): string {
  let id = slug(base)
  for (let i = 2; used.has(id); i++) id = `${slug(base)}-${i}`
  used.add(id)
  return id
}

/**
 * A minimal, valid faction economy: one settlement per faction, a staple that is produced and
 * eaten, growth while fed, and stability that recovers toward a baseline. Users extend it from
 * the editor.
 */
export function blankWorld(input: BlankWorldInput): { model: WorldModel; layout: Record<string, Point> } {
  const used = new Set<string>()
  const resources = input.resources.map((r) => ({ id: uniqueSlug(r.name, used), name: r.name, color: r.color, description: '' }))
  const factions = input.factions.map((f, i) => ({ id: uniqueSlug(f.name, used), name: f.name, color: f.color, description: '', initialStability: 60, traits: PERSONALITIES[i % PERSONALITIES.length] ?? DEFAULT_TRAITS }))
  const food = resources[0]
  const layout: Record<string, Point> = {}
  const locations = factions.map((f, i) => {
    const id = uniqueSlug(`${f.name} hold`, used)
    const angle = (i / Math.max(1, factions.length)) * Math.PI * 2 - Math.PI / 2
    layout[id] = { x: 500 + Math.cos(angle) * 230, y: 320 + Math.sin(angle) * 170 }
    return {
      id,
      name: `${f.name} Hold`,
      region: `${f.name} lands`,
      description: '',
      initialOwnerId: f.id,
      initialPopulation: input.population,
      initialStock: food ? { [food.id]: input.startingFood } : {},
    }
  })
  const rules: Rule[] = food
    ? [
        { id: 'r-drift', name: 'Return to order', type: 'drift', enabled: true, priority: 0, factionIds: 'all', target: 60, rate: 0.1 },
        { id: 'r-produce', name: `${food.name} production`, type: 'produce', enabled: true, priority: 10, scope: { kind: 'all' }, resourceId: food.id, amount: 10, perCapita: true, variance: 0.1 },
        { id: 'r-trade', name: 'Trade', type: 'trade', enabled: true, priority: 20, routeIds: 'all', reserve: 20, relationGain: 0.5 },
        { id: 'r-consume', name: `Eat ${food.name.toLowerCase()}`, type: 'consume', enabled: true, priority: 30, scope: { kind: 'all' }, resourceId: food.id, amount: 9, perCapita: true, shortageStabilityDelta: -5, shortagePopulationLoss: 0.1 },
        { id: 'r-growth', name: 'Growth', type: 'growth', enabled: true, priority: 50, scope: { kind: 'all' }, resourceId: food.id, surplusPerCapita: 20, rate: 0.01 },
        { id: 'r-rulers', name: 'Rulers & succession', type: 'succession', enabled: true, priority: 1, stepsPerYear: 1, crisisStability: 10 },
        { id: 'r-fortune', name: 'Fortune', type: 'fortune', enabled: true, priority: 5, foodResourceId: food.id, chance: 0.25, intensity: 1 },
        { id: 'r-migration', name: 'Migration', type: 'migration', enabled: true, priority: 45, foodResourceId: food.id, rate: 0.04 },
        { id: 'r-plague', name: 'Plague', type: 'contagion', enabled: true, priority: 46, foodResourceId: food.id, outbreakChance: 0.005, spreadChance: 0.3, mortality: 0.04, duration: 5 },
        { id: 'r-decisions', name: 'Faction decisions', type: 'agency', enabled: true, priority: 55, foodResourceId: food.id, investResourceId: (resources[1] ?? food).id, activity: 0.55, temperament: 1 },
        { id: 'r-war', name: 'Warfare', type: 'warfare', enabled: true, priority: 58, armsResourceId: (resources[2] ?? resources[1] ?? food).id, casualtyRate: 0.06, conquestRatio: 1.6, exhaustionLimit: 60 },
      ]
    : []
  return {
    model: {
      id: uniqueSlug(input.name, new Set()),
      name: input.name,
      description: input.description,
      seed: input.seed >>> 0,
      resources,
      factions,
      locations,
      routes: [],
      relations: [],
      rules,
      events: [],
    },
    layout,
  }
}
