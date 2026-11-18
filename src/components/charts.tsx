import { useMemo, useRef, useState } from 'react'
import { fmt } from '../engine/format'

export interface Series {
  id: string
  label: string
  color: string
  values: number[] // index = step
  dashed?: boolean
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const span = max - min
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const norm = step0 / mag
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

/**
 * Multi-series line chart over simulation steps. Every point is a real recorded value;
 * series of different lengths simply end at their branch's head.
 */
export function LineChart({ series, height = 220, markers = [], yLabel, highlightStep }: { series: Series[]; height?: number; markers?: { step: number; label: string; color?: string }[]; yLabel?: string; highlightStep?: number | null }) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const width = 720
  const pad = { l: 52, r: 16, t: 14, b: 26 }
  const maxStep = Math.max(1, ...series.map((s) => s.values.length - 1))
  const { lo, hi, ticks } = useMemo(() => {
    const all = series.flatMap((s) => s.values)
    // Fit the data (not zero) so divergence is visible; pad 8% so lines don't touch the frame.
    let lo = Math.min(...all)
    let hi = Math.max(...all)
    const pad = (hi - lo) * 0.08 || Math.max(1, Math.abs(hi) * 0.05)
    lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad
    hi = hi + pad
    const ticks = niceTicks(lo, hi)
    lo = Math.min(lo, ticks[0] ?? lo)
    hi = Math.max(hi, ticks.at(-1) ?? hi)
    return { lo, hi, ticks }
  }, [series])
  const x = (s: number) => pad.l + (s / maxStep) * (width - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b)
  const xTicks = niceTicks(0, maxStep, 8).filter((t) => Number.isInteger(t))

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * width
    const s = Math.round(((px - pad.l) / (width - pad.l - pad.r)) * maxStep)
    setHover(Math.max(0, Math.min(maxStep, s)))
  }

  return (
    <div className="chart">
      <svg ref={ref} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${yLabel ?? 'Value'} over steps for ${series.map((s) => s.label).join(', ')}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.l - 8} y={y(t)} className="chart-tick" textAnchor="end" dominantBaseline="middle">
              {fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={height - 8} className="chart-tick" textAnchor="middle">
            {t}
          </text>
        ))}
        {markers.map((m, i) => (
          <g key={i}>
            <line x1={x(m.step)} x2={x(m.step)} y1={pad.t} y2={height - pad.b} className="chart-marker" style={{ stroke: m.color }} />
            <text x={x(m.step) + 4} y={pad.t + 10 + i * 12} className="chart-marker-label" style={{ fill: m.color }}>
              {m.label}
            </text>
          </g>
        ))}
        {highlightStep != null && <line x1={x(highlightStep)} x2={x(highlightStep)} y1={pad.t} y2={height - pad.b} className="chart-now" />}
        {series.map((s) => (
          <polyline key={s.id} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dashed ? '4 3' : undefined} strokeLinejoin="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} className="chart-cross" />
            {series.map((s) => {
              const v = s.values[hover]
              return v === undefined ? null : <circle key={s.id} cx={x(hover)} cy={y(v)} r={3} fill={s.color} stroke="var(--bg-1)" strokeWidth={1.5} />
            })}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / width) * 100}%` }}>
          <div className="chart-tip-step">Step {hover}</div>
          {series.map((s) => (
            <div key={s.id} className="chart-tip-row">
              <span className="chart-dot" style={{ background: s.color }} />
              <span className="chart-tip-label">{s.label}</span>
              <span className="chart-tip-val">{s.values[hover] === undefined ? '—' : fmt(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.id}>
            <span className="chart-dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Sparkline({ values, color = 'var(--text-2)', width = 120, height = 26, upTo }: { values: number[]; color?: string; width?: number; height?: number; upTo?: number }) {
  if (values.length < 2) return <span className="spark-empty">not enough history</span>
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const n = values.length - 1
  const pts = values.map((v, i) => `${(i / n) * (width - 2) + 1},${height - 2 - ((v - lo) / span) * (height - 4)}`)
  const cut = upTo !== undefined ? (upTo / n) * (width - 2) + 1 : null
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
      {cut !== null && <line x1={cut} x2={cut} y1={0} y2={height} stroke="var(--text-3)" strokeDasharray="2 2" />}
    </svg>
  )
}
