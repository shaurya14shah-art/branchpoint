import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minus, MousePointer2, Plus, Spline, MapPinPlus } from 'lucide-react'
import type { Id, LocationDef, TradeRouteDef } from '../../engine/model'
import { fmt } from '../../engine/format'
import { getRelation } from '../../engine/ops'
import { appStore, useApp } from '../../state/store'
import { useWorld, type WorldView } from '../../state/useWorld'
import { newId } from '../../state/ids'
import { IconButton } from '../../components/ui'
import { hashUnit, hullPath, routeCurve, type P } from './geometry'

const W = 1000
const H = 640
type Tool = 'select' | 'connect' | 'add'

export function WorldCanvas() {
  const w = useWorld()
  const selection = useApp((s) => s.selection)
  const svgRef = useRef<SVGSVGElement>(null)
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 })
  const [tool, setTool] = useState<Tool>('select')
  const [drag, setDrag] = useState<{ id: Id; start: P; pos: P; moved: boolean } | null>(null)
  const [link, setLink] = useState<{ from: Id; to: P; over: Id | null } | null>(null)
  const [pan, setPan] = useState<{ start: P; cam: typeof cam; moved: boolean } | null>(null)
  const [hoverRoute, setHoverRoute] = useState<Id | null>(null)

  const layout = useMemo(() => {
    const out: Record<Id, P> = {}
    if (!w) return out
    w.model.locations.forEach((l, i) => {
      out[l.id] = w.project.layout[l.id] ?? { x: 120 + ((i * 137) % 760), y: 120 + ((i * 89) % 400) }
    })
    if (drag) out[drag.id] = drag.pos
    return out
  }, [w, drag])

  if (!w) return null

  const toWorld = (clientX: number, clientY: number): P => {
    const svg = svgRef.current
    const m = svg?.getScreenCTM()
    if (!svg || !m) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  const zoomBy = (factor: number, around: P = { x: cam.x + W / cam.k / 2, y: cam.y + H / cam.k / 2 }) => {
    const k = Math.min(4, Math.max(0.5, cam.k * factor))
    const f = cam.k / k
    setCam({ k, x: around.x - (around.x - cam.x) * f, y: around.y - (around.y - cam.y) * f })
  }

  const readOnly = w.readOnly
  const sel = selection
  const select = (s: typeof selection) => appStore.getState().select(s)

  const onBgPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const pt = toWorld(e.clientX, e.clientY)
    if (tool === 'add' && !readOnly) return addLocation(w, pt)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setPan({ start: { x: e.clientX, y: e.clientY }, cam, moved: false })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (pan) {
      const r = svgRef.current?.getBoundingClientRect()
      if (!r) return
      const scale = W / cam.k / r.width
      const dx = (e.clientX - pan.start.x) * scale
      const dy = (e.clientY - pan.start.y) * scale
      setCam({ ...pan.cam, x: pan.cam.x - dx, y: pan.cam.y - dy })
      if (Math.abs(dx) + Math.abs(dy) > 2 && !pan.moved) setPan({ ...pan, moved: true })
    } else if (drag) {
      const p = toWorld(e.clientX, e.clientY)
      setDrag({ ...drag, pos: p, moved: drag.moved || Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 3 })
    } else if (link) {
      setLink({ ...link, to: toWorld(e.clientX, e.clientY) })
    }
  }

  const onPointerUp = () => {
    if (pan) {
      if (!pan.moved) select(null)
      setPan(null)
    }
    if (drag) {
      if (drag.moved) appStore.getState().moveLocation(drag.id, drag.pos)
      else select({ kind: 'location', id: drag.id })
      setDrag(null)
    }
    if (link) {
      if (link.over && link.over !== link.from) createRoute(w, link.from, link.over)
      setLink(null)
    }
  }

  const onNodePointerDown = (e: React.PointerEvent, id: Id) => {
    e.stopPropagation()
    if (e.button !== 0) return
    ;(svgRef.current as Element | null)?.setPointerCapture(e.pointerId)
    const p = toWorld(e.clientX, e.clientY)
    if (tool === 'connect' && !readOnly) setLink({ from: id, to: p, over: null })
    else setDrag({ id, start: p, pos: layout[id] ?? p, moved: false })
  }

  const fit = () => setCam({ x: 0, y: 0, k: 1 })

  // ── derived drawing data ──
  const regions = new Map<string, P[]>()
  for (const l of w.model.locations) {
    const p = layout[l.id]
    if (!p) continue
    const key = l.region || l.id
    regions.set(key, [...(regions.get(key) ?? []), p])
  }
  const notableAt = new Map<Id, 'warn' | 'crit' | 'notable'>()
  for (const e of w.events) {
    if (e.severity === 'info') continue
    const tone = e.severity === 'critical' ? 'crit' : e.severity === 'warning' ? 'warn' : 'notable'
    for (const id of e.entityIds) if (w.index.locations.has(id) && notableAt.get(id) !== 'crit') notableAt.set(id, tone)
  }
  const maxPop = Math.max(1, ...Object.values(w.state?.locations ?? {}).map((l) => l.population))

  return (
    <div className={`canvas-wrap tool-${tool}`}>
      <svg
        ref={svgRef}
        className="canvas"
        viewBox={`${cam.x} ${cam.y} ${W / cam.k} ${H / cam.k}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, toWorld(e.clientX, e.clientY))}
        aria-label={`Map of ${w.model.name}`}
      >
        <defs>
          <pattern id="ocean-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="var(--line-1)" strokeWidth="0.6" />
          </pattern>
          <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
        </defs>
        <rect x={-2000} y={-2000} width={5000} height={5000} fill="var(--ocean-0)" onPointerDown={onBgPointerDown} />
        <rect x={-2000} y={-2000} width={5000} height={5000} fill="url(#ocean-grid)" pointerEvents="none" />

        {/* islands: rounded hull per region plus seeded lobes for an irregular coastline */}
        <g pointerEvents="none">
          {[0, 1].map((layer) =>
            [...regions].map(([region, pts]) => {
              const d = hullPath(pts)
              const pad = 44 + hashUnit(region) * 14
              const grow = layer === 0 ? 1.5 : 0
              const fill = layer === 0 ? 'var(--land-line)' : 'var(--land)'
              return (
                <g key={`${layer}-${region}`}>
                  <path d={d} fill={fill} stroke={fill} strokeWidth={(pad + grow) * 2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.flatMap((p, i) =>
                    [0, 1, 2].map((k) => {
                      const h = hashUnit(`${region}:${i}:${k}`)
                      const a = h * Math.PI * 2
                      const dist = pad * (0.5 + hashUnit(`${region}:${k}:${i}`) * 0.45)
                      return <circle key={`${i}-${k}`} cx={p.x + Math.cos(a) * dist} cy={p.y + Math.sin(a) * dist} r={pad * (0.42 + h * 0.3) + grow} fill={fill} />
                    }),
                  )}
                </g>
              )
            }),
          )}
          {[...regions].map(([region, pts]) => {
            const top = Math.min(...pts.map((p) => p.y))
            const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
            return (
              <text key={region} x={cx} y={top - 52} className="map-region" textAnchor="middle">
                {region.toUpperCase()}
              </text>
            )
          })}
        </g>

        {/* routes */}
        <g>
          {w.model.routes.map((r) => (
            <RouteShape key={r.id} route={r} w={w} layout={layout} selected={sel?.kind === 'route' && sel.id === r.id} hovered={hoverRoute === r.id} onHover={setHoverRoute} />
          ))}
        </g>

        {/* diplomacy: wars and alliances between factions' largest settlements */}
        <Diplomacy w={w} layout={layout} />

        {link && layout[link.from] && <line x1={layout[link.from]!.x} y1={layout[link.from]!.y} x2={link.to.x} y2={link.to.y} className="link-preview" />}

        {/* locations */}
        <g>
          {w.model.locations.map((l) => (
            <LocationNode
              key={l.id}
              loc={l}
              w={w}
              p={layout[l.id] ?? { x: 0, y: 0 }}
              maxPop={maxPop}
              selected={sel?.kind === 'location' && sel.id === l.id}
              factionSelected={sel?.kind === 'faction' && w.state?.locations[l.id]?.ownerId === sel.id}
              tone={notableAt.get(l.id)}
              linkTarget={link?.over === l.id}
              onPointerDown={(e) => onNodePointerDown(e, l.id)}
              onPointerEnter={() => link && setLink({ ...link, over: l.id })}
              onPointerLeave={() => link && setLink({ ...link, over: null })}
            />
          ))}
        </g>
        <rect x={-2000} y={-2000} width={5000} height={5000} fill="url(#vignette)" pointerEvents="none" />
      </svg>

      <div className="canvas-tools" role="toolbar" aria-label="Map tools">
        <IconButton label="Select & move" shortcut="V" icon={<MousePointer2 size={14} />} active={tool === 'select'} onClick={() => setTool('select')} />
        <IconButton label="Connect: drag between settlements to add a trade route" shortcut="R" icon={<Spline size={14} />} active={tool === 'connect'} disabled={readOnly} onClick={() => setTool('connect')} />
        <IconButton label="Add settlement: click the map" shortcut="L" icon={<MapPinPlus size={14} />} active={tool === 'add'} disabled={readOnly || w.model.factions.length === 0} onClick={() => setTool('add')} />
      </div>
      {tool !== 'select' && <div className="canvas-hint">{tool === 'connect' ? 'Drag from one settlement to another to open a trade route.' : 'Click anywhere on the map to found a settlement.'}</div>}

      <div className="canvas-zoom" role="toolbar" aria-label="Zoom">
        <IconButton label="Zoom in" icon={<Plus size={14} />} onClick={() => zoomBy(1.25)} />
        <IconButton label="Zoom out" icon={<Minus size={14} />} onClick={() => zoomBy(0.8)} />
        <IconButton label="Fit world" icon={<Maximize2 size={13} />} onClick={fit} />
      </div>

      <Legend w={w} />
      <ToolKeys setTool={setTool} />
    </div>
  )
}

function ToolKeys({ setTool }: { setTool: (t: Tool) => void }) {
  // Lightweight single-key tool switching; ignored while typing.
  useKeys((k) => {
    if (k === 'v') setTool('select')
    if (k === 'r') setTool('connect')
    if (k === 'l') setTool('add')
  })
  return null
}

function useKeys(fn: (key: string) => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable], dialog[open]')) return
      fn(e.key.toLowerCase())
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fn])
}

function LocationNode({ loc, w, p, maxPop, selected, factionSelected, tone, linkTarget, onPointerDown, onPointerEnter, onPointerLeave }: {
  loc: LocationDef
  w: WorldView
  p: P
  maxPop: number
  selected: boolean
  factionSelected: boolean
  tone?: 'warn' | 'crit' | 'notable'
  linkTarget: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
}) {
  const st = w.state?.locations[loc.id]
  const pending = !st
  const owner = w.index.factions.get(st?.ownerId ?? loc.initialOwnerId)
  const color = owner?.color ?? '#888888'
  const pop = st?.population ?? loc.initialPopulation
  const r = 7 + Math.sqrt(pop / maxPop) * 11
  const mods = st?.modifiers ?? []
  const label = `${loc.name}, ${owner?.name ?? 'unowned'}, population ${fmt(pop)}${pending ? ' (joins next step)' : ''}`
  return (
    <g
      className={`loc ${selected ? 'is-selected' : ''} ${pending ? 'is-pending' : ''}`}
      transform={`translate(${p.x},${p.y})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          appStore.getState().select({ kind: 'location', id: loc.id })
        }
      }}
    >
      <title>{label}</title>
      {(selected || linkTarget) && <circle r={r + 7} className="loc-sel" />}
      {factionSelected && !selected && <circle r={r + 5} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1} />}
      {tone && <circle r={r + 3.5} className={`loc-alert tone-${tone}`} />}
      <circle r={r} fill="var(--bg-2)" stroke={color} strokeWidth={1.8} strokeDasharray={pending ? '3 2' : undefined} />
      <circle r={r - 3} fill={color} fillOpacity={0.16} />
      <circle r={2} fill={color} />
      <text y={r + 14} className="loc-name" textAnchor="middle">
        {loc.name}
      </text>
      <text y={r + 26} className="loc-pop" textAnchor="middle">
        {pending ? 'joins next step' : fmt(pop)}
      </text>
      <g transform={`translate(${-((w.model.resources.length * 9) / 2)},${r + 31})`}>
        {w.model.resources.map((res, i) => {
          const v = st?.stock[res.id] ?? 0
          const h = v <= 0 ? 0 : Math.min(14, 2 + Math.log10(1 + v) * 4)
          return (
            <g key={res.id} transform={`translate(${i * 9},0)`}>
              <rect width={6} height={14} fill="var(--bg-3)" rx={1} />
              <rect y={14 - h} width={6} height={h} fill={res.color} rx={1} opacity={0.9} />
              <title>{`${res.name}: ${fmt(v)}`}</title>
            </g>
          )
        })}
      </g>
      {st && st.ownerId !== st.culture && (
        <circle r={r + 2} fill="none" stroke={w.index.factions.get(st.culture)?.color ?? '#888'} strokeWidth={1.2} strokeDasharray="1.5 2.5">
          <title>{`Occupied — ${w.index.name(st.culture)} people; may revolt`}</title>
        </circle>
      )}
      {st && st.plague > 0 && <circle r={r + 9} className="loc-plague" />}
      {(mods.length > 0 || (st && st.plague > 0)) && (
        <text y={-r - 8} className="loc-mod" textAnchor="middle">
          {[...(st && st.plague > 0 ? ['Plague'] : []), ...new Set(mods.map((m) => m.label))].join(' · ')}
        </text>
      )}
    </g>
  )
}

function RouteShape({ route, w, layout, selected, hovered, onHover }: { route: TradeRouteDef; w: WorldView; layout: Record<Id, P>; selected: boolean; hovered: boolean; onHover: (id: Id | null) => void }) {
  const a = layout[route.fromId]
  const b = layout[route.toId]
  if (!a || !b) return null
  const res = w.index.resources.get(route.resourceId)
  const rs = w.state?.routes[route.id]
  const from = w.state?.locations[route.fromId]
  const to = w.state?.locations[route.toId]
  const blockedByRelation = !!(from && to && from.ownerId !== to.ownerId && w.state && getRelation(w.state, from.ownerId, to.ownerId) < route.minRelation)
  const moved = rs?.lastTransferred ?? 0
  const status = !rs ? 'pending' : !rs.active ? 'closed' : blockedByRelation ? 'blocked' : moved > 0 ? 'flowing' : 'idle'
  // Pull endpoints in so arrows don't sit under the nodes.
  const shrink = (p: P, q: P, d: number) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
    return { x: p.x + ((q.x - p.x) / len) * d, y: p.y + ((q.y - p.y) / len) * d }
  }
  const curve = routeCurve(shrink(a, b, 20), shrink(b, a, 22))
  const mid = curve.at(0.55)
  const tan = curve.tangent(0.55)
  const angle = (Math.atan2(tan.y, tan.x) * 180) / Math.PI
  const width = 1 + Math.min(4, route.amount / 25)
  const color = res?.color ?? '#999999'
  const label = `${route.name}: ${fmt(route.amount)} ${res?.name ?? route.resourceId} per step, ${status}${moved ? `, moved ${fmt(moved)} this step` : ''}`
  return (
    <g
      className={`route st-${status} ${selected ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={(e) => {
        e.stopPropagation()
        appStore.getState().select({ kind: 'route', id: route.id })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          appStore.getState().select({ kind: 'route', id: route.id })
        }
      }}
      onPointerEnter={() => onHover(route.id)}
      onPointerLeave={() => onHover(null)}
    >
      <title>{label}</title>
      <path d={curve.d} className="route-hit" />
      {selected && <path d={curve.d} className="route-halo" strokeWidth={width + 6} />}
      <path d={curve.d} className="route-line" stroke={color} strokeWidth={width} />
      {status === 'flowing' && <path d={curve.d} className="route-flow" stroke={color} strokeWidth={Math.max(1, width - 0.5)} />}
      <g transform={`translate(${mid.x},${mid.y}) rotate(${angle})`}>
        <path d="M-4,-3.5 L3,0 L-4,3.5" fill="none" stroke={color} strokeWidth={1.4} className="route-arrow" />
      </g>
      {(status === 'blocked' || status === 'closed') && (
        <g transform={`translate(${mid.x},${mid.y - 10})`}>
          <circle r={6} fill="var(--bg-1)" stroke="var(--crit)" strokeWidth={1} />
          <path d="M-2.5,-2.5 L2.5,2.5 M2.5,-2.5 L-2.5,2.5" stroke="var(--crit)" strokeWidth={1.2} />
        </g>
      )}
      {(hovered || selected) && (
        <text x={mid.x} y={mid.y + 16} className="route-label" textAnchor="middle">
          {status === 'flowing' ? `${fmt(moved)} / ${fmt(route.amount)}` : status} {res?.name.toLowerCase()}
        </text>
      )}
    </g>
  )
}

function Diplomacy({ w, layout }: { w: WorldView; layout: Record<Id, P> }) {
  const s = w.state
  if (!s) return null
  const capital = (f: Id): P | null => {
    let best: Id | null = null
    for (const [id, l] of Object.entries(s.locations)) if (l.ownerId === f && (!best || l.population > (s.locations[best]?.population ?? 0))) best = id
    return best ? (layout[best] ?? null) : null
  }
  const lines = [
    ...Object.keys(s.wars).map((k) => ({ k, kind: 'war' as const })),
    ...Object.keys(s.alliances).map((k) => ({ k, kind: 'ally' as const })),
  ]
  return (
    <g pointerEvents="none">
      {lines.map(({ k, kind }) => {
        const [a, b] = k.split('|') as [Id, Id]
        const pa = capital(a)
        const pb = capital(b)
        if (!pa || !pb) return null
        const mx = (pa.x + pb.x) / 2
        const my = (pa.y + pb.y) / 2 - 40
        return (
          <g key={`${kind}${k}`} className={`diplo diplo-${kind}`}>
            <path d={`M${pa.x},${pa.y} Q${mx},${my - 40} ${pb.x},${pb.y}`} />
            <text x={mx} y={my - 16} textAnchor="middle">
              {kind === 'war' ? `WAR · ${w.index.name(a)} – ${w.index.name(b)}` : `ALLIANCE`}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function Legend({ w }: { w: WorldView }) {
  return (
    <div className="legend" aria-label="Legend">
      <div className="legend-group">
        {w.model.factions.map((f) => (
          <button key={f.id} type="button" className="legend-item" onClick={() => appStore.getState().select({ kind: 'faction', id: f.id })}>
            <span className="legend-ring" style={{ borderColor: f.color }} />
            {f.name}
          </button>
        ))}
      </div>
      <div className="legend-group">
        {w.model.resources.map((r) => (
          <button key={r.id} type="button" className="legend-item" onClick={() => appStore.getState().select({ kind: 'resource', id: r.id })}>
            <span className="legend-bar" style={{ background: r.color }} />
            {r.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── canvas-originated model edits ──

function createRoute(w: WorldView, fromId: Id, toId: Id) {
  const res = w.model.resources[0]
  if (!res) return appStore.getState().notify({ tone: 'error', message: 'Add a resource before creating trade routes' })
  const id = newId('route')
  const a = w.index.name(fromId)
  const b = w.index.name(toId)
  const ok = appStore.getState().updateModel(
    (m) => ({ ...m, routes: [...m.routes, { id, name: `${a} → ${b}`, fromId, toId, resourceId: res.id, amount: 20, minRelation: -20, initiallyActive: true }] }),
    `Add route ${a} → ${b}`,
  )
  if (!ok) return
  appStore.getState().select({ kind: 'route', id })
  if (!w.model.rules.some((r) => r.type === 'trade' && r.enabled))
    appStore.getState().notify({ tone: 'info', message: 'Route added. No trade rule is enabled yet, so nothing will move until you add one in Rules.' })
}

function addLocation(w: WorldView, p: P) {
  const owner = w.model.factions[0]
  if (!owner) return
  // Join the nearest region if close enough, otherwise found a new one.
  let region = 'Uncharted'
  let best = 140
  for (const l of w.model.locations) {
    const q = w.project.layout[l.id]
    if (!q) continue
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (d < best) {
      best = d
      region = l.region
    }
  }
  const id = newId('loc')
  const ok = appStore.getState().updateModel(
    (m) => ({ ...m, locations: [...m.locations, { id, name: 'New settlement', region, description: '', initialOwnerId: owner.id, initialPopulation: 100, initialStock: {} }] }),
    'Found settlement',
  )
  if (!ok) return
  appStore.getState().moveLocation(id, p)
  appStore.getState().select({ kind: 'location', id })
}
