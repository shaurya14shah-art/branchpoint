import { useState, type ReactNode } from 'react'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { DEFAULT_TRAITS, type Id } from '../../engine/model'
import { RULES, orderRules } from '../../engine/rules/registry'
import { fmt } from '../../engine/format'
import { factionPopulation } from '../../engine/metrics'
import { appStore, useApp, type Selection } from '../../state/store'
import { useWorld, type WorldView } from '../../state/useWorld'
import { newId } from '../../state/ids'
import { FACTION_COLORS, RESOURCE_PRESETS } from '../../examples/blank'
import { editor } from '../world-editor/edit'

type Kind = Exclude<Selection['kind'], 'event'>

function Group({ title, count, children, onAdd, addLabel, defaultOpen = true }: { title: string; count: number; children: ReactNode; onAdd?: () => void; addLabel?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="side-group">
      <div className="side-group-head">
        <button type="button" className="side-group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronRight size={12} className={open ? 'rot' : ''} />
          {title}
          <span className="side-count">{count}</span>
        </button>
        {onAdd && (
          <button type="button" className="icon-btn side-add" aria-label={addLabel} data-tip={addLabel} onClick={onAdd}>
            <Plus size={13} />
          </button>
        )}
      </div>
      {open && <ul className="side-list">{children}</ul>}
    </div>
  )
}

function Item({ kind, id, label, meta, color, ring, dim }: { kind: Kind; id: Id; label: string; meta?: ReactNode; color?: string; ring?: boolean; dim?: boolean }) {
  const sel = useApp((s) => s.selection)
  const active = sel?.kind === kind && sel.id === id
  return (
    <li>
      <button type="button" className={`side-item ${active ? 'is-selected' : ''} ${dim ? 'is-dim' : ''}`} aria-current={active} onClick={() => appStore.getState().select({ kind, id })}>
        {color && <span className={ring ? 'legend-ring' : 'legend-bar'} style={ring ? { borderColor: color } : { background: color }} />}
        <span className="side-label">{label}</span>
        {meta !== undefined && <span className="side-meta">{meta}</span>}
      </button>
    </li>
  )
}

export function Sidebar() {
  const w = useWorld()
  const [q, setQ] = useState('')
  if (!w) return null
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase())
  const ed = editor(w)
  const add = (fn: () => void) => (ed.canEdit ? fn : undefined)

  return (
    <nav className="sidebar" aria-label="World contents">
      <div className="side-search">
        <Search size={13} />
        <input className="input bare" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter entities" />
      </div>
      <div className="side-scroll">
        <Group title="Factions" count={w.model.factions.length} addLabel="Add faction" onAdd={add(() => addFaction(w))}>
          {w.model.factions.filter((f) => match(f.name)).map((f) => (
            <Item key={f.id} kind="faction" id={f.id} label={f.name} color={f.color} ring meta={w.state ? fmt(factionPopulation(w.state, f.id)) : undefined} />
          ))}
        </Group>
        <Group title="Settlements" count={w.model.locations.length}>
          {w.model.locations.filter((l) => match(l.name) || match(l.region)).map((l) => {
            const owner = w.index.factions.get(w.state?.locations[l.id]?.ownerId ?? l.initialOwnerId)
            return <Item key={l.id} kind="location" id={l.id} label={l.name} color={owner?.color} ring meta={w.state?.locations[l.id] ? fmt(w.state.locations[l.id]!.population) : 'new'} />
          })}
        </Group>
        <Group title="Trade routes" count={w.model.routes.length} defaultOpen={false}>
          {w.model.routes.filter((r) => match(r.name)).map((r) => {
            const st = w.state?.routes[r.id]
            return <Item key={r.id} kind="route" id={r.id} label={r.name} color={w.index.resources.get(r.resourceId)?.color} dim={st ? !st.active : false} meta={st ? (st.lastTransferred ? fmt(st.lastTransferred) : st.active ? '·' : 'closed') : 'new'} />
          })}
        </Group>
        <Group title="Resources" count={w.model.resources.length} addLabel="Add resource" onAdd={add(() => addResource(w))}>
          {w.model.resources.filter((r) => match(r.name)).map((r) => (
            <Item key={r.id} kind="resource" id={r.id} label={r.name} color={r.color} />
          ))}
        </Group>
        <Group title="Rules" count={w.model.rules.length} addLabel="Add rule" onAdd={add(() => appStore.getState().setView('rules'))}>
          {orderRules(w.model.rules).filter((r) => match(r.name)).map((r) => (
            <Item key={r.id} kind="rule" id={r.id} label={r.name} dim={!r.enabled} meta={RULES[r.type].label.split(' ')[0]} />
          ))}
        </Group>
        <Group title="Scheduled events" count={w.model.events.length} defaultOpen={false}>
          {[...w.model.events].sort((a, b) => a.step - b.step).filter((e) => match(e.name)).map((e) => (
            <Item key={e.id} kind="scheduled" id={e.id} label={e.name} meta={`@${e.step}`} dim={e.step <= w.head && !w.timeline?.events[e.step]?.some((x) => x.scheduledEventId === e.id)} />
          ))}
        </Group>
      </div>
    </nav>
  )
}

function addFaction(w: WorldView) {
  const id = newId('faction')
  const color = FACTION_COLORS[w.model.factions.length % FACTION_COLORS.length] ?? '#888888'
  if (editor(w).update((m) => ({ ...m, factions: [...m.factions, { id, name: `Faction ${m.factions.length + 1}`, color, description: '', initialStability: 60, traits: { ...DEFAULT_TRAITS } }] }), 'Add faction'))
    appStore.getState().select({ kind: 'faction', id })
}

function addResource(w: WorldView) {
  const id = newId('res')
  const preset = RESOURCE_PRESETS.find((p) => !w.model.resources.some((r) => r.name === p.name)) ?? { name: `Resource ${w.model.resources.length + 1}`, color: '#9a9a9a' }
  if (editor(w).update((m) => ({ ...m, resources: [...m.resources, { id, name: preset.name, color: preset.color, description: '' }] }), 'Add resource'))
    appStore.getState().select({ kind: 'resource', id })
}
