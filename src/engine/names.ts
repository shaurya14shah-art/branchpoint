import type { Ruler } from './model'
import type { Rng } from './rng'

/** Seeded ruler generation. Same RNG state → same ruler, so histories stay reproducible. */

const START = ['Al', 'Be', 'Cor', 'Da', 'El', 'Fen', 'Gar', 'Hal', 'Is', 'Ka', 'Lu', 'Mor', 'Ny', 'Os', 'Per', 'Ry', 'Sel', 'Tor', 'Ul', 'Vey', 'Wen', 'Ys', 'Zan', 'Ash', 'Bryn', 'Cael']
const MID = ['', '', 'a', 'e', 'i', 'o', 'ra', 'le', 'mi', 'dra', 'go', 'the']
const END = ['ric', 'wyn', 'mar', 'dis', 'ra', 'ion', 'eth', 'oth', 'is', 'ane', 'ulf', 'mir', 'ys', 'en', 'ard', 'ia']
const TITLES = ['High Chief', 'Warden', 'Archon', 'Matriarch', 'Patriarch', 'Speaker', 'Thane', 'Regent', 'Prince', 'Queen', 'King', 'Doge']

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)] as T

export function epithetFor(boldness: number, wisdom: number): string {
  if (boldness > 0.12 && wisdom < -0.06) return 'the Reckless'
  if (boldness > 0.12) return 'the Bold'
  if (boldness < -0.12 && wisdom > 0.06) return 'the Peacemaker'
  if (boldness < -0.12) return 'the Timid'
  if (wisdom > 0.12) return 'the Wise'
  if (wisdom < -0.12) return 'the Unready'
  return 'the Steady'
}

export function generateRuler(rng: Rng, step: number, minAge = 24, ageSpan = 30): Ruler {
  const name = pick(rng, START) + pick(rng, MID) + pick(rng, END)
  const title = pick(rng, TITLES)
  const age = minAge + Math.floor(rng.next() * ageSpan)
  const boldness = Math.round((rng.next() * 0.6 - 0.3) * 100) / 100
  const wisdom = Math.round((rng.next() * 0.6 - 0.3) * 100) / 100
  return { name, title, age, since: step, boldness, wisdom, epithet: epithetFor(boldness, wisdom) }
}

export function rulerLabel(r: Ruler): string {
  return `${r.title} ${r.name} ${r.epithet}`
}
