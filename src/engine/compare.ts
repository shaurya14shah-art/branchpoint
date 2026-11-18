import type { Id, SimEvent, WorldModel, WorldState } from './model'
import { relationKey } from './model'
import { factionLocations, factionPopulation, factionStock, totalPopulation, totalStock } from './metrics'
import type { Timeline } from './history/replay'

/**
 * Everything here derives from replayed history. Nothing is sampled, smoothed or invented.
 */

export type SeriesMetric =
  | { kind: 'population' }
  | { kind: 'factionPopulation'; factionId: Id }
  | { kind: 'stock'; resourceId: Id }
  | { kind: 'factionStock'; factionId: Id; resourceId: Id }
  | { kind: 'locationStock'; locationId: Id; resourceId: Id }
  | { kind: 'stability'; factionId: Id }
  | { kind: 'relation'; a: Id; b: Id }
  | { kind: 'tech'; factionId: Id }
  | { kind: 'settlements'; factionId: Id }

export function readSeriesMetric(m: SeriesMetric, s: WorldState): number {
  switch (m.kind) {
    case 'population':
      return totalPopulation(s)
    case 'factionPopulation':
      return factionPopulation(s, m.factionId)
    case 'stock':
      return totalStock(s, m.resourceId)
    case 'factionStock':
      return factionStock(s, m.factionId, m.resourceId)
    case 'locationStock':
      return s.locations[m.locationId]?.stock[m.resourceId] ?? 0
    case 'stability':
      return s.factions[m.factionId]?.stability ?? 0
    case 'relation':
      return s.relations[relationKey(m.a, m.b)] ?? 0
    case 'tech':
      return s.factions[m.factionId]?.tech ?? 1
    case 'settlements':
      return factionLocations(s, m.factionId).length
  }
}

export function series(tl: Timeline, m: SeriesMetric): number[] {
  return tl.states.map((s) => readSeriesMetric(m, s))
}

export interface DiffRow {
  key: string
  label: string
  group: string
  values: number[] // one per compared timeline, at its own head
  spread: number // max − min
}

/** Final-state comparison across N branches, each at its own head. */
export function finalStateRows(model: WorldModel, finals: WorldState[]): DiffRow[] {
  const rows: DiffRow[] = []
  const push = (group: string, key: string, label: string, read: (s: WorldState) => number) => {
    const values = finals.map(read)
    rows.push({ key, group, label, values, spread: Math.max(...values) - Math.min(...values) })
  }
  push('World', 'pop', 'Total population', totalPopulation)
  for (const r of model.resources) push('World', `stock:${r.id}`, `Total ${r.name}`, (s) => totalStock(s, r.id))
  for (const f of model.factions) {
    push(f.name, `fpop:${f.id}`, 'Population', (s) => factionPopulation(s, f.id))
    push(f.name, `stab:${f.id}`, 'Stability', (s) => s.factions[f.id]?.stability ?? 0)
    push(f.name, `locs:${f.id}`, 'Locations held', (s) => Object.values(s.locations).filter((l) => l.ownerId === f.id).length)
    push(f.name, `tech:${f.id}`, 'Innovation', (s) => s.factions[f.id]?.tech ?? 1)
    for (const r of model.resources) push(f.name, `fstock:${f.id}:${r.id}`, r.name, (s) => factionStock(s, f.id, r.id))
  }
  for (let i = 0; i < model.factions.length; i++)
    for (let j = i + 1; j < model.factions.length; j++) {
      const a = model.factions[i]
      const b = model.factions[j]
      if (!a || !b) continue
      push('Relations', `rel:${relationKey(a.id, b.id)}`, `${a.name} ↔ ${b.name}`, (s) => s.relations[relationKey(a.id, b.id)] ?? 0)
    }
  return rows
}

export function eventSignature(e: SimEvent): string {
  return [e.step, e.kind, e.ruleId ?? '', e.scheduledEventId ?? '', e.interventionId ?? '', e.message].join('|')
}

export interface EventDiff {
  step: number
  onlyA: SimEvent[]
  onlyB: SimEvent[]
}

/** Events present in one timeline but not the other, per step, from `fromStep` to the shorter head. */
export function divergentEvents(a: Timeline, b: Timeline, fromStep = 0): EventDiff[] {
  const out: EventDiff[] = []
  const last = Math.min(a.events.length, b.events.length) - 1
  for (let s = Math.max(0, fromStep); s <= last; s++) {
    const ea = a.events[s] ?? []
    const eb = b.events[s] ?? []
    const sa = new Set(ea.map(eventSignature))
    const sb = new Set(eb.map(eventSignature))
    const onlyA = ea.filter((e) => !sb.has(eventSignature(e)) && e.severity !== 'info')
    const onlyB = eb.filter((e) => !sa.has(eventSignature(e)) && e.severity !== 'info')
    if (onlyA.length || onlyB.length) out.push({ step: s, onlyA, onlyB })
  }
  return out
}

export interface Milestone {
  step: number
  label: string
  kind: 'first-shortage' | 'threshold' | 'scheduled' | 'route-halted' | 'owner-change' | 'peak-population' | 'intervention' | 'war' | 'peace' | 'alliance' | 'succession' | 'plague'
  eventId?: string
}

/** Important moments, derived from the event log and state history. */
export function milestones(tl: Timeline, model: WorldModel): Milestone[] {
  const out: Milestone[] = []
  const firstShortage = new Set<Id>()
  const haltedRoutes = new Set<Id>()
  const name = (id: Id) =>
    model.locations.find((l) => l.id === id)?.name ?? model.factions.find((f) => f.id === id)?.name ?? model.routes.find((r) => r.id === id)?.name ?? id
  for (const e of tl.events.flat()) {
    if (e.kind === 'shortage') {
      const loc = e.entityIds[0]
      const owner = e.entityIds[1]
      if (owner && !firstShortage.has(owner)) {
        firstShortage.add(owner)
        out.push({ step: e.step, kind: 'first-shortage', label: `First shortage for ${name(owner)} (${loc ? name(loc) : '?'})`, eventId: e.id })
      }
    } else if (e.kind === 'threshold') out.push({ step: e.step, kind: 'threshold', label: e.message.split(' — ')[0] ?? e.message, eventId: e.id })
    else if (e.kind === 'scheduled') out.push({ step: e.step, kind: 'scheduled', label: e.message.split(' — ')[0] ?? e.message, eventId: e.id })
    else if (e.kind === 'intervention') out.push({ step: e.step, kind: 'intervention', label: e.message, eventId: e.id })
    else if (e.kind === 'war' || e.kind === 'peace' || e.kind === 'alliance' || e.kind === 'succession') out.push({ step: e.step, kind: e.kind, label: e.message.replace(/ \(.*?\)/, ''), eventId: e.id })
    else if (e.kind === 'plague' && e.severity === 'critical') out.push({ step: e.step, kind: 'plague', label: e.message, eventId: e.id })
    else if (e.kind === 'trade-blocked' && e.message.includes('relations')) {
      const route = e.entityIds[0]
      if (route && !haltedRoutes.has(route)) {
        haltedRoutes.add(route)
        out.push({ step: e.step, kind: 'route-halted', label: `${name(route)} halted by poor relations`, eventId: e.id })
      }
    }
    for (const c of e.changes)
      if (c.target.kind === 'owner' && c.before !== c.after && typeof c.after === 'string')
        out.push({ step: e.step, kind: 'owner-change', label: `${name(c.target.locationId)} passes to ${name(c.after)}`, eventId: e.id })
  }
  if (tl.states.length > 2) {
    const pops = tl.states.map(totalPopulation)
    const peak = Math.max(...pops)
    const at = pops.indexOf(peak)
    if (at > 0 && at < pops.length - 1) out.push({ step: at, kind: 'peak-population', label: `Population peaks at ${peak.toLocaleString('en-US')}` })
  }
  return out.sort((x, y) => x.step - y.step)
}
