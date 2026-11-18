import type { Rule, WorldModel } from '../src/engine/model'

/** A tiny two-faction world for precise unit tests. */
export function tinyWorld(rules: Rule[] = [], patch: Partial<WorldModel> = {}): WorldModel {
  return {
    id: 'tiny',
    name: 'Tiny',
    description: '',
    seed: 7,
    resources: [
      { id: 'food', name: 'Food', color: '#88aa66', description: '' },
      { id: 'ore', name: 'Ore', color: '#8899aa', description: '' },
    ],
    factions: [
      { id: 'red', name: 'Red', color: '#cc5555', description: '', initialStability: 50, traits: { aggression: 0.5, ambition: 0.5, caution: 0.5, mercantile: 0.5 } },
      { id: 'blue', name: 'Blue', color: '#5577cc', description: '', initialStability: 50, traits: { aggression: 0.5, ambition: 0.5, caution: 0.5, mercantile: 0.5 } },
    ],
    locations: [
      { id: 'a', name: 'A', region: 'West', description: '', initialOwnerId: 'red', initialPopulation: 100, initialStock: { food: 100 } },
      { id: 'b', name: 'B', region: 'East', description: '', initialOwnerId: 'blue', initialPopulation: 100, initialStock: { food: 10 } },
    ],
    routes: [{ id: 'ab', name: 'A→B', fromId: 'a', toId: 'b', resourceId: 'food', amount: 30, minRelation: 0, initiallyActive: true }],
    relations: [{ a: 'red', b: 'blue', value: 10 }],
    rules,
    events: [],
    ...patch,
  }
}

export const R = {
  produce: (over: Partial<Extract<Rule, { type: 'produce' }>> = {}): Rule => ({
    id: 'p', name: 'Produce', type: 'produce', enabled: true, priority: 10, scope: { kind: 'all' }, resourceId: 'food', amount: 10, perCapita: false, variance: 0, ...over,
  }),
  consume: (over: Partial<Extract<Rule, { type: 'consume' }>> = {}): Rule => ({
    id: 'c', name: 'Consume', type: 'consume', enabled: true, priority: 30, scope: { kind: 'all' }, resourceId: 'food', amount: 20, perCapita: false, shortageStabilityDelta: -5, shortagePopulationLoss: 0.5, ...over,
  }),
  trade: (over: Partial<Extract<Rule, { type: 'trade' }>> = {}): Rule => ({
    id: 't', name: 'Trade', type: 'trade', enabled: true, priority: 20, routeIds: 'all', reserve: 0, relationGain: 1, ...over,
  }),
}
