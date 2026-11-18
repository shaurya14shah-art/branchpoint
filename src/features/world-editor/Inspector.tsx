import { X } from 'lucide-react'
import { useApp, appStore } from '../../state/store'
import { useWorld } from '../../state/useWorld'
import { FactionInspector, LocationInspector, ResourceInspector, RouteInspector, WorldOverview } from './EntityInspectors'
import { RuleInspector, ScheduledEventInspector } from '../rules/RuleInspector'
import { EventInspector } from '../events/EventInspector'
import { ReadOnlyBanner } from './common'

const KIND_LABEL = { location: 'Settlement', faction: 'Faction', route: 'Trade route', resource: 'Resource', rule: 'Rule', scheduled: 'Scheduled event', event: 'Event' } as const

export function Inspector() {
  const w = useWorld()
  const sel = useApp((s) => s.selection)
  if (!w) return null
  const title = !sel ? w.model.name : sel.kind === 'event' ? `Event ${sel.id}` : sel.kind === 'scheduled' ? (w.model.events.find((e) => e.id === sel.id)?.name ?? sel.id) : w.index.name(sel.id)
  return (
    <aside className="inspector" aria-label="Inspector">
      <header className="inspector-head">
        <div className="inspector-kind">{sel ? KIND_LABEL[sel.kind] : 'World'}</div>
        <h2 className="inspector-title">{title}</h2>
        {sel && (
          <button type="button" className="icon-btn" aria-label="Close inspector (Esc)" onClick={() => appStore.getState().select(null)}>
            <X size={14} />
          </button>
        )}
      </header>
      <div className="inspector-body">
        {sel?.kind !== 'event' && <ReadOnlyBanner w={w} />}
        {!sel && <WorldOverview w={w} />}
        {sel?.kind === 'location' && <LocationInspector key={sel.id} w={w} id={sel.id} />}
        {sel?.kind === 'faction' && <FactionInspector key={sel.id} w={w} id={sel.id} />}
        {sel?.kind === 'route' && <RouteInspector key={sel.id} w={w} id={sel.id} />}
        {sel?.kind === 'resource' && <ResourceInspector key={sel.id} w={w} id={sel.id} />}
        {sel?.kind === 'rule' && <RuleInspector key={sel.id} w={w} id={sel.id} />}
        {sel?.kind === 'scheduled' && <ScheduledEventInspector key={sel.id} w={w} id={sel.id} />}
        {sel?.kind === 'event' && <EventInspector key={`${sel.branchId}:${sel.id}`} w={w} id={sel.id} branchId={sel.branchId} />}
      </div>
    </aside>
  )
}
