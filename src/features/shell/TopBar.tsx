import { BookOpen, ChevronDown, Download, FilePlus2, FolderOpen, GitCompareArrows, Keyboard, ListTree, Map as MapIcon, RotateCcw, ScrollText, Sparkles, Upload } from 'lucide-react'
import { useState } from 'react'
import { appStore, useApp, type View } from '../../state/store'
import { useWorld } from '../../state/useWorld'
import { Menu } from '../../components/Menu'
import { ConfirmDialog } from '../../components/Dialog'
import { Kbd } from '../../components/ui'
import { downloadText } from './WorldsDialog'

const VIEWS: { id: View; label: string; icon: React.ReactNode; key: string }[] = [
  { id: 'world', label: 'World', icon: <MapIcon size={14} />, key: '1' },
  { id: 'rules', label: 'Rules', icon: <ListTree size={14} />, key: '2' },
  { id: 'events', label: 'Events', icon: <ScrollText size={14} />, key: '3' },
  { id: 'chronicle', label: 'Chronicle', icon: <BookOpen size={14} />, key: '4' },
  { id: 'compare', label: 'Compare', icon: <GitCompareArrows size={14} />, key: '5' },
]

export function TopBar({ onNew, onWorlds, onImport, onShortcuts, onAi, aiAvailable }: { onNew: () => void; onWorlds: () => void; onImport: () => void; onShortcuts: () => void; onAi: () => void; aiAvailable: boolean }) {
  const w = useWorld()
  const view = useApp((s) => s.view)
  const saving = useApp((s) => s.saving)
  const [confirmReset, setConfirmReset] = useState(false)
  const s = appStore.getState()

  return (
    <header className="topbar">
      <div className="brand" aria-label="Branchpoint">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path d="M4 2v14M4 9c0-3 2-4 5-4h5M9 5l-1.5 0" stroke="var(--accent)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <circle cx="14" cy="5" r="2" fill="var(--bg-0)" stroke="var(--accent)" strokeWidth="1.4" />
          <circle cx="4" cy="16" r="1.6" fill="var(--accent)" />
        </svg>
        <span>Branchpoint</span>
      </div>
      {w && (
        <Menu
          label="World menu"
          trigger={(p) => (
            <button {...p} type="button" className="world-switch">
              <span className="world-name">{w.project.name}</span>
              <span className="branch-pill">
                <span className="lane-dot" style={{ background: w.branch.color }} />
                {w.branch.name}
              </span>
              <ChevronDown size={13} />
            </button>
          )}
          items={[
            { label: 'New world…', icon: <FilePlus2 size={13} />, onSelect: onNew },
            { label: 'Open / manage worlds…', icon: <FolderOpen size={13} />, onSelect: onWorlds },
            'separator',
            {
              label: 'Export this world',
              icon: <Download size={13} />,
              onSelect: () => {
                const out = s.exportProject()
                if (out) downloadText(out.filename, out.text)
              },
            },
            { label: 'Import world…', icon: <Upload size={13} />, onSelect: onImport },
            'separator',
            { label: 'Reset world…', icon: <RotateCcw size={13} />, danger: true, onSelect: () => setConfirmReset(true) },
          ]}
        />
      )}
      {w && (
        <nav className="views" role="tablist" aria-label="Views">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'is-active' : ''} onClick={() => s.setView(v.id)} title={`${v.label} (${v.key})`}>
              {v.icon}
              {v.label}
            </button>
          ))}
        </nav>
      )}
      <div className="topbar-spacer" />
      {w && <span className={`save-state save-${saving}`} aria-live="polite">{saving === 'pending' ? 'Saving…' : saving === 'saved' ? 'Saved locally' : saving === 'error' ? 'Not saved' : ''}</span>}
      {aiAvailable && w && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onAi}>
          <Sparkles size={13} />
          <span>Assist</span>
        </button>
      )}
      <button type="button" className="icon-btn" aria-label="Keyboard shortcuts" data-tip="Shortcuts  ?" onClick={onShortcuts}>
        <Keyboard size={15} />
      </button>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        danger
        title="Reset this world?"
        confirmLabel="Reset world"
        body={<p>All branches, checkpoints, interventions and later rule changes are discarded. The world returns to its original starting model with a single <em>Main</em> timeline at step 0. Export first if you want to keep this history.</p>}
        onConfirm={() => s.resetProject()}
      />
    </header>
  )
}

export function ShortcutList() {
  const rows: [string, string][] = [
    ['Space', 'Play / pause'],
    ['→', 'Advance one step'],
    ['⇧ →', 'Advance ten steps'],
    ['← / ⇧ ←', 'Scrub back through history'],
    ['B', 'Branch from the displayed step'],
    ['C', 'Checkpoint the displayed step'],
    ['1 – 5', 'World · Rules · Events · Chronicle · Compare'],
    ['V / R / L', 'Map tools: select · connect route · add settlement'],
    ['Esc', 'Clear selection / close dialog'],
    ['?', 'This list'],
  ]
  return (
    <table className="table shortcuts">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>
              <Kbd>{k}</Kbd>
            </td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
