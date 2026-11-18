/** JSON serialisation with sorted object keys — used for structural equality of plain data. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
    }
    return v
  })
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return a === b || stableStringify(a) === stableStringify(b)
}

/** Recursively freeze plain data (used in tests and dev builds to prove immutability). */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as object)) deepFreeze(v)
  }
  return value
}
