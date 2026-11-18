/**
 * Seeded PRNG (mulberry32). The generator state is a uint32 stored in WorldState.rng so that a
 * state fully determines every future random draw. Never use Math.random in the engine.
 */
export class Rng {
  constructor(private s: number) {
    this.s = s >>> 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let r = Math.imul(this.s ^ (this.s >>> 15), this.s | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }

  get state(): number {
    return this.s
  }
}

/** Derive the initial RNG state from a world seed (so seed 0 is still well mixed). */
export function seedState(seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}
