import { useMemo, useState } from 'react'
import { BookOpen, Crown, Flame, Handshake, Lightbulb, Shield, Skull, Sparkles, Swords } from 'lucide-react'
import type { EventKind, SimEvent } from '../../engine/model'
import { factionLocations } from '../../engine/metrics'
import { rulerLabel } from '../../engine/names'
import { warsOf, alliesOf } from '../../engine/society'
import { useWorld } from '../../state/useWorld'
import { appStore } from '../../state/store'
import { EmptyState, Segmented, Stat } from '../../components/ui'

type Filter = 'all' | 'war' | 'rulers' | 'fortune'

const GROUP: Partial<Record<EventKind, Filter>> = {
  war: 'war',
  peace: 'war',
  alliance: 'war',
  conquest: 'war',
  decision: 'war',
  succession: 'rulers',
  innovation: 'rulers',
  plague: 'fortune',
  fortune: 'fortune',
  scheduled: 'fortune',
  threshold: 'war',
}

const ICON: Partial<Record<EventKind, React.ReactNode>> = {
  war: <Swords size={13} />,
  conquest: <Shield size={13} />,
  peace: <Handshake size={13} />,
  alliance: <Handshake size={13} />,
  succession: <Crown size={13} />,
  innovation: <Lightbulb size={13} />,
  plague: <Skull size={13} />,
  fortune: <Sparkles size={13} />,
  scheduled: <Flame size={13} />,
}

/** A readable history of the active branch, assembled only from recorded events. */
export function ChronicleView() {
  const w = useWorld()
  const [filter, setFilter] = useState<Filter>('all')
  const timeline = w?.timeline
  const entries = useMemo(() => {
    if (!timeline) return []
    const out: SimEvent[] = []
    for (const e of timeline.events.flat()) {
      if (!GROUP[e.kind]) continue
      if (e.kind === 'decision' && e.severity !== 'critical') continue
      if (e.kind === 'plague' && e.severity !== 'critical') continue
      out.push(e)
    }
    return out
  }, [timeline])
  if (!w) return null
  const count = (k: EventKind) => entries.filter((e) => e.kind === k).length
  const shown = entries.filter((e) => filter === 'all' || GROUP[e.kind] === filter)
  const byStep = new Map<number, SimEvent[]>()
  for (const e of shown) byStep.set(e.step, [...(byStep.get(e.step) ?? []), e])
  const steps = [...byStep.keys()].sort((a, b) => b - a)
  const s = w.state

  return (
    <div className="page chronicle">
      <header className="page-head">
        <div>
          <h1>Chronicle of {w.model.name}</h1>
          <p className="muted">
            The story of “{w.branch.name}” as recorded by the engine — every line is an event you can trace. Branch the world and each timeline writes a different chronicle.
          </p>
        </div>
      </header>

      <div className="stats-row">
        <Stat label="Wars declared" value={count('war')} />
        <Stat label="Conquests & revolts" value={count('conquest')} />
        <Stat label="Successions" value={count('succession')} />
        <Stat label="Outbreaks" value={count('plague')} />
        <Stat label="Innovations" value={count('innovation')} />
      </div>

      {s && (
        <div className="realm-grid">
          {w.model.factions.map((f) => {
            const st = s.factions[f.id]
            if (!st) return null
            const held = factionLocations(s, f.id).length
            const wars = warsOf(s, f.id)
            const allies = alliesOf(s, f.id)
            return (
              <button key={f.id} type="button" className={`realm ${held === 0 ? 'is-fallen' : ''}`} onClick={() => appStore.getState().select({ kind: 'faction', id: f.id })}>
                <div className="realm-head">
                  <span className="legend-ring" style={{ borderColor: f.color }} />
                  <strong>{f.name}</strong>
                </div>
                <div className="realm-ruler">{held === 0 ? 'Fallen — its people live under foreign rule' : rulerLabel(st.ruler)}</div>
                <div className="muted small">
                  {held} settlement{held === 1 ? '' : 's'} · stability {Math.round(st.stability)} · innovation ×{st.tech.toFixed(2)}
                </div>
                {(wars.length > 0 || allies.length > 0) && (
                  <div className="small">
                    {wars.length > 0 && <span className="neg">At war with {wars.map((x) => w.index.name(x)).join(', ')}. </span>}
                    {allies.length > 0 && <span className="pos">Allied with {allies.map((x) => w.index.name(x)).join(', ')}.</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="chronicle-bar">
        <Segmented<Filter>
          label="Chronicle filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'war', label: 'War & diplomacy' },
            { value: 'rulers', label: 'Rulers & ideas' },
            { value: 'fortune', label: 'Plague & fortune' },
          ]}
        />
      </div>

      {steps.length === 0 ? (
        <EmptyState icon={<BookOpen size={20} />} title="Nothing worth recording yet">
          {w.head === 0 ? 'Advance the simulation — rulers will scheme, harvests fail and wars begin.' : 'Only routine production and trade so far. Keep going, or press Space to play.'}
        </EmptyState>
      ) : (
        <ol className="chron">
          {steps.map((step) => (
            <li key={step} className="chron-step">
              <div className="chron-year">
                <span className="mono">{step}</span>
              </div>
              <div className="chron-entries">
                {(byStep.get(step) ?? []).map((e) => (
                  <button key={e.id} type="button" className={`chron-entry k-${e.kind}`} onClick={() => appStore.getState().select({ kind: 'event', id: e.id, branchId: w.branch.id })}>
                    <span className="chron-icon">{ICON[e.kind] ?? <Swords size={13} />}</span>
                    <span>{e.message}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
