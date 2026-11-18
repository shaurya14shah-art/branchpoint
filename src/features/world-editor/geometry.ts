export interface P {
  x: number
  y: number
}

/** Andrew's monotone chain convex hull. */
export function convexHull(points: P[]): P[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length <= 2) return pts
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: P[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: P[] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

export function hullPath(points: P[]): string {
  const h = convexHull(points)
  if (h.length === 0) return ''
  if (h.length === 1) return `M${h[0]!.x},${h[0]!.y} L${h[0]!.x + 0.01},${h[0]!.y}`
  return `M${h.map((p) => `${p.x},${p.y}`).join(' L')} Z`
}

/** Quadratic curve between two points, bowed to one side so opposite routes don't overlap. */
export function routeCurve(a: P, b: P, bow = 0.16) {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const c = { x: mx - dy * bow, y: my + dx * bow }
  const at = (t: number) => ({
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
  })
  const tangent = (t: number) => ({ x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x), y: 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y) })
  return { d: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`, at, tangent }
}

export function hashUnit(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}
