import type { ReactNode } from 'react'
import { History } from 'lucide-react'
import type { Id, SimEvent } from '../../engine/model'
import type { WorldView } from '../../state/useWorld'
import { appStore } from '../../state/store'
import { Button } from '../../components/ui'

export function ReadOnlyBanner({ w }: { w: WorldView }) {
  if (!w.readOnly) return null
  return (
    <div className="banner banner-history" role="status">
      <History size={14} />
      <div>
        <strong>Viewing step {w.step}</strong> of {w.head}. History is read-only.
        <div className="banner-actions">
          <Button size="sm" variant="ghost" onClick={() => appStore.getState().setViewStep(null)}>
            Return to head
          </Button>
          <Button size="sm" onClick={() => appStore.getState().branchFrom(w.step)}>
            Branch from step {w.step}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function EditModeNote({ w }: { w: WorldView }) {
  if (w.readOnly) return null
  return w.head === 0 ? (
    <p className="note">Step 0 — edits change the world’s starting values.</p>
  ) : (
    <p className="note">
      Step {w.head} — changing a current value records an <em>intervention</em> on “{w.branch.name}”. Earlier history is unchanged.
    </p>
  )
}

export function KV({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className="kv-v">{children}</span>
    </div>
  )
}

export function EntityLink({ id, w, kind }: { id: Id; w: WorldView; kind: 'location' | 'faction' | 'route' | 'resource' | 'rule' | 'scheduled' }) {
  const color = kind === 'faction' ? w.index.factions.get(id)?.color : kind === 'resource' ? w.index.resources.get(id)?.color : undefined
  return (
    <button type="button" className="entity-link" onClick={() => appStore.getState().select({ kind, id })}>
      {color && <span className="chart-dot" style={{ background: color }} />}
      {w.index.name(id)}
    </button>
  )
}

export function kindOf(id: Id, w: WorldView): 'location' | 'faction' | 'route' | 'resource' | 'rule' | 'scheduled' | null {
  if (w.index.locations.has(id)) return 'location'
  if (w.index.factions.has(id)) return 'faction'
  if (w.index.routes.has(id)) return 'route'
  if (w.index.resources.has(id)) return 'resource'
  if (w.index.rules.has(id)) return 'rule'
  if (w.model.events.some((e) => e.id === id)) return 'scheduled'
  return null
}

const SEV_TONE: Record<SimEvent['severity'], string> = { info: 'var(--text-4)', notable: 'var(--notable)', warning: 'var(--warn)', critical: 'var(--crit)' }

export function EventRow({ e, w, compact }: { e: SimEvent; w: WorldView; compact?: boolean }) {
  return (
    <button type="button" className={`event-row sev-${e.severity} ${compact ? 'is-compact' : ''}`} onClick={() => appStore.getState().select({ kind: 'event', id: e.id, branchId: w.branch.id })}>
      <span className="event-dot" style={{ background: SEV_TONE[e.severity] }} />
      <span className="event-step">{e.step}</span>
      <span className="event-msg">{e.message}</span>
    </button>
  )
}

/** Events touching `id` in the window ending at the viewed step, newest first. */
export function recentEventsFor(w: WorldView, id: Id, window = 6, limit = 8): SimEvent[] {
  if (!w.timeline) return []
  const out: SimEvent[] = []
  for (let s = w.step; s >= Math.max(0, w.step - window) && out.length < limit; s--)
    for (const e of [...(w.timeline.events[s] ?? [])].reverse()) if (e.entityIds.includes(id) || e.ruleId === id || e.scheduledEventId === id) out.push(e)
  return out.slice(0, limit)
}
