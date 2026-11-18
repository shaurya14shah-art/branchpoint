import type { WorldModel } from '../engine/model'

/**
 * The Shattered Isles — three interdependent factions across four islands.
 *
 *   Thornwood Clans   (Thornreach)  grain + timber surplus, need iron for tools
 *   Tidewater League  (Saltspire)   fishing + shipping hub, need timber for the fleet
 *   Ember Concord     (Cinderfall)  iron surplus, cannot feed themselves
 *
 * Every number here is consumed by a rule the engine actually implements. Running the world as
 * shipped produces a drought at step 8 that stresses the grain chain; Ember's hunger response is
 * a raid on Thornreach, which sours relations and can close the Grain Road.
 */
export const SHATTERED_ISLES: WorldModel = {
  id: 'shattered-isles',
  name: 'The Shattered Isles',
  description:
    'Three factions bound by grain, timber and iron across a broken archipelago. The Tidewater League ships everything; the Ember Concord cannot feed itself; the Thornwood Clans cannot work their fields without Ember iron.',
  seed: 1729,
  resources: [
    { id: 'grain', name: 'Grain', color: '#9fb56b', description: 'Staple food. Spoils slowly in storage.' },
    { id: 'timber', name: 'Timber', color: '#b08a5c', description: 'Hull planking and fuel. The Tidewater fleet burns through it.' },
    { id: 'iron', name: 'Iron', color: '#93a1b3', description: 'Tools and blades. Thornwood farms need a steady supply.' },
  ],
  factions: [
    { id: 'thornwood', name: 'Thornwood Clans', color: '#b89a4e', description: 'Farming clans of the western forests. Proud, slow to anger, slower to forgive.', initialStability: 68, traits: { aggression: 0.35, ambition: 0.55, caution: 0.6, mercantile: 0.45 } },
    { id: 'tidewater', name: 'Tidewater League', color: '#4f9f9b', description: 'A merchant league that controls the sea lanes. Profit first, war last.', initialStability: 72, traits: { aggression: 0.2, ambition: 0.6, caution: 0.55, mercantile: 0.9 } },
    { id: 'ember', name: 'Ember Concord', color: '#c4574f', description: 'Forge-cities on the volcanic eastern isle. Rich in iron, short of bread, quick to the blade.', initialStability: 60, traits: { aggression: 0.7, ambition: 0.6, caution: 0.3, mercantile: 0.35 } },
  ],
  locations: [
    { id: 'hollowmere', name: 'Hollowmere', region: 'Thornreach', description: 'Terraced grain valleys.', initialOwnerId: 'thornwood', initialPopulation: 900, initialStock: { grain: 520, timber: 120, iron: 60 } },
    { id: 'briarwatch', name: 'Briarwatch', region: 'Thornreach', description: 'Logging camps under old-growth thorn.', initialOwnerId: 'thornwood', initialPopulation: 520, initialStock: { grain: 220, timber: 380, iron: 40 } },
    { id: 'fenhallow', name: 'Fenhallow', region: 'Thornreach', description: 'Wet lowland farms on the southern shore.', initialOwnerId: 'thornwood', initialPopulation: 380, initialStock: { grain: 260, timber: 40, iron: 20 } },
    { id: 'port-vesper', name: 'Port Vesper', region: 'Saltspire', description: 'The League’s harbour capital.', initialOwnerId: 'tidewater', initialPopulation: 1100, initialStock: { grain: 380, timber: 160, iron: 80 } },
    { id: 'gullrock', name: 'Gullrock', region: 'Saltspire', description: 'Fishing village and shipyard.', initialOwnerId: 'tidewater', initialPopulation: 420, initialStock: { grain: 140, timber: 90, iron: 10 } },
    { id: 'lantern-rock', name: 'Lantern Rock', region: 'The Teeth', description: 'Lighthouse outpost on the southern reef.', initialOwnerId: 'tidewater', initialPopulation: 160, initialStock: { grain: 60, timber: 30 } },
    { id: 'ashkeep', name: 'Ashkeep', region: 'Cinderfall', description: 'Forge-citadel beneath the caldera.', initialOwnerId: 'ember', initialPopulation: 980, initialStock: { grain: 260, timber: 40, iron: 360 } },
    { id: 'slagmouth', name: 'Slagmouth', region: 'Cinderfall', description: 'Mining town on the lava coast.', initialOwnerId: 'ember', initialPopulation: 560, initialStock: { grain: 120, iron: 300 } },
  ],
  routes: [
    { id: 'grain-road', name: 'Grain Road', fromId: 'hollowmere', toId: 'port-vesper', resourceId: 'grain', amount: 80, minRelation: -10, initiallyActive: true },
    { id: 'ember-run', name: 'Ember Run', fromId: 'port-vesper', toId: 'ashkeep', resourceId: 'grain', amount: 70, minRelation: -20, initiallyActive: true },
    { id: 'iron-barges', name: 'Iron Barges', fromId: 'slagmouth', toId: 'port-vesper', resourceId: 'iron', amount: 30, minRelation: -20, initiallyActive: true },
    { id: 'tool-trade', name: 'Tool Trade', fromId: 'port-vesper', toId: 'hollowmere', resourceId: 'iron', amount: 20, minRelation: -10, initiallyActive: true },
    { id: 'timber-fleet', name: 'Timber Fleet', fromId: 'briarwatch', toId: 'gullrock', resourceId: 'timber', amount: 40, minRelation: -10, initiallyActive: true },
    { id: 'ash-ferry', name: 'Ash Ferry', fromId: 'ashkeep', toId: 'slagmouth', resourceId: 'grain', amount: 25, minRelation: -100, initiallyActive: true },
    { id: 'fen-carts', name: 'Fen Carts', fromId: 'fenhallow', toId: 'hollowmere', resourceId: 'grain', amount: 25, minRelation: -100, initiallyActive: true },
    { id: 'reef-supply', name: 'Reef Supply', fromId: 'port-vesper', toId: 'lantern-rock', resourceId: 'grain', amount: 12, minRelation: -100, initiallyActive: true },
  ],
  relations: [
    { a: 'thornwood', b: 'tidewater', value: 35 },
    { a: 'tidewater', b: 'ember', value: 20 },
    { a: 'thornwood', b: 'ember', value: -12 },
  ],
  rules: [
    { id: 'r-order', name: 'Return to order', type: 'drift', enabled: true, priority: 0, factionIds: 'all', target: 65, rate: 0.08 },
    { id: 'r-harvest', name: 'Thornreach harvest', type: 'produce', enabled: true, priority: 10, scope: { kind: 'region', region: 'Thornreach' }, resourceId: 'grain', amount: 15, perCapita: true, variance: 0.12 },
    { id: 'r-fishing', name: 'Saltspire fisheries', type: 'produce', enabled: true, priority: 10, scope: { kind: 'region', region: 'Saltspire' }, resourceId: 'grain', amount: 8, perCapita: true, variance: 0.2 },
    { id: 'r-ember-farms', name: 'Cinderfall terraces', type: 'produce', enabled: true, priority: 10, scope: { kind: 'region', region: 'Cinderfall' }, resourceId: 'grain', amount: 4, perCapita: true, variance: 0.1 },
    { id: 'r-reef-fishing', name: 'Reef fishing', type: 'produce', enabled: true, priority: 10, scope: { kind: 'region', region: 'The Teeth' }, resourceId: 'grain', amount: 8, perCapita: true, variance: 0.25 },
    { id: 'r-logging', name: 'Briarwatch logging', type: 'produce', enabled: true, priority: 11, scope: { kind: 'location', id: 'briarwatch' }, resourceId: 'timber', amount: 45, perCapita: false, variance: 0 },
    { id: 'r-mining', name: 'Cinderfall mines', type: 'produce', enabled: true, priority: 11, scope: { kind: 'region', region: 'Cinderfall' }, resourceId: 'iron', amount: 20, perCapita: false, variance: 0 },
    { id: 'r-trade', name: 'Sea trade', type: 'trade', enabled: true, priority: 20, routeIds: 'all', reserve: 40, relationGain: 0.5 },
    { id: 'r-eat', name: 'Feed the people', type: 'consume', enabled: true, priority: 30, scope: { kind: 'all' }, resourceId: 'grain', amount: 8, perCapita: true, shortageStabilityDelta: -6, shortagePopulationLoss: 0.08 },
    { id: 'r-tools', name: 'Plough wear', type: 'consume', enabled: true, priority: 31, scope: { kind: 'location', id: 'hollowmere' }, resourceId: 'iron', amount: 1.4, perCapita: true, shortageStabilityDelta: -2, shortagePopulationLoss: 0 },
    { id: 'r-fleet', name: 'Fleet upkeep', type: 'consume', enabled: true, priority: 32, scope: { kind: 'location', id: 'gullrock' }, resourceId: 'timber', amount: 32, perCapita: false, shortageStabilityDelta: -4, shortagePopulationLoss: 0 },
    { id: 'r-spoil', name: 'Grain spoilage', type: 'decay', enabled: true, priority: 40, scope: { kind: 'all' }, resourceId: 'grain', rate: 0.03 },
    { id: 'r-growth', name: 'Well-fed growth', type: 'growth', enabled: true, priority: 50, scope: { kind: 'all' }, resourceId: 'grain', surplusPerCapita: 25, rate: 0.015 },
    { id: 'r-rulers', name: 'Rulers & succession', type: 'succession', enabled: true, priority: 1, stepsPerYear: 1, crisisStability: 12 },
    { id: 'r-fortune', name: 'Fortune', type: 'fortune', enabled: true, priority: 5, foodResourceId: 'grain', chance: 0.3, intensity: 1 },
    { id: 'r-migration', name: 'Migration', type: 'migration', enabled: true, priority: 45, foodResourceId: 'grain', rate: 0.05 },
    { id: 'r-plague', name: 'Plague', type: 'contagion', enabled: true, priority: 46, foodResourceId: 'grain', outbreakChance: 0.006, spreadChance: 0.3, mortality: 0.04, duration: 5 },
    { id: 'r-decisions', name: 'Faction decisions', type: 'agency', enabled: true, priority: 55, foodResourceId: 'grain', investResourceId: 'iron', activity: 0.7, temperament: 1 },
    { id: 'r-war', name: 'Warfare', type: 'warfare', enabled: true, priority: 58, armsResourceId: 'iron', casualtyRate: 0.06, conquestRatio: 1.35, exhaustionLimit: 75 },
    {
      id: 'r-gullrock-secedes',
      name: 'Gullrock secession',
      type: 'threshold',
      enabled: true,
      priority: 62,
      condition: { metric: { kind: 'stability', factionId: 'tidewater' }, op: '<', value: 30 },
      effects: [
        { kind: 'setOwner', locationId: 'gullrock', factionId: 'thornwood' },
        { kind: 'adjustRelation', a: 'thornwood', b: 'tidewater', delta: -20 },
      ],
      eventLabel: 'Gullrock declares for the Thornwood Clans',
      cooldown: 1000,
    },
  ],
  events: [
    {
      id: 'ev-drought',
      name: 'The Long Drought',
      description: 'Rain fails over Thornreach.',
      step: 8,
      effects: [
        { kind: 'addModifier', locationId: 'hollowmere', resourceId: 'grain', factor: 0.35, duration: 6, label: 'Drought' },
        { kind: 'addModifier', locationId: 'fenhallow', resourceId: 'grain', factor: 0.5, duration: 6, label: 'Drought' },
        { kind: 'adjustStability', factionId: 'thornwood', delta: -8 },
      ],
    },
    {
      id: 'ev-ashfall',
      name: 'Ashfall',
      description: 'The caldera stirs; ash buries the Ember terraces.',
      step: 18,
      effects: [
        { kind: 'addModifier', locationId: 'ashkeep', resourceId: 'grain', factor: 0.1, duration: 6, label: 'Ashfall' },
        { kind: 'addModifier', locationId: 'slagmouth', resourceId: 'grain', factor: 0.4, duration: 6, label: 'Ashfall' },
        { kind: 'adjustStability', factionId: 'ember', delta: -10 },
      ],
    },
  ],
}

/** Map coordinates (canvas space 1000 × 640). Layout is presentation, not simulation. */
export const SHATTERED_ISLES_LAYOUT: Record<string, { x: number; y: number }> = {
  briarwatch: { x: 250, y: 170 },
  hollowmere: { x: 190, y: 315 },
  fenhallow: { x: 245, y: 470 },
  'gullrock': { x: 540, y: 205 },
  'port-vesper': { x: 500, y: 340 },
  'lantern-rock': { x: 520, y: 540 },
  ashkeep: { x: 790, y: 300 },
  slagmouth: { x: 830, y: 455 },
}
