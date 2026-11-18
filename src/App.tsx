import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { appStore, useApp, activeBranchOf } from './state/store'
import { useWorld } from './state/useWorld'
import { TopBar, ShortcutList } from './features/shell/TopBar'
import { Sidebar } from './features/shell/Sidebar'
import { Welcome } from './features/shell/Welcome'
import { Notices } from './features/shell/Notices'
import { WorldsDialog, useImport } from './features/shell/WorldsDialog'
import { WorldCanvas } from './features/world-editor/WorldCanvas'
import { Inspector } from './features/world-editor/Inspector'
import { RulesView } from './features/rules/RulesView'
import { EventsView } from './features/events/EventsView'
import { CompareView } from './features/comparison/CompareView'
import { ChronicleView } from './features/chronicle/ChronicleView'
import { TimelineDock } from './features/timelines/TimelineDock'
import { usePlayback } from './features/simulation/usePlayback'
import { NewWorldDialog } from './features/creation/NewWorldDialog'
import { AiDialog, useAiStatus } from './features/ai/AiDialog'
import { Dialog, PromptDialog } from './components/Dialog'

export function App() {
  const status = useApp((s) => s.status)
  const fatal = useApp((s) => s.fatal)
  const project = useApp((s) => s.project)
  const [newOpen, setNewOpen] = useState(false)
  const [worldsOpen, setWorldsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [branchPrompt, setBranchPrompt] = useState<number | null>(null)
  const [cpPrompt, setCpPrompt] = useState<number | null>(null)
  const ai = useAiStatus()
  const imp = useImport()
  usePlayback()

  useEffect(() => {
    void appStore.getState().init()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (t.closest('input, textarea, select, [contenteditable], dialog[open]')) return
      const s = appStore.getState()
      if (e.key === '?') {
        e.preventDefault()
        return setShortcutsOpen(true)
      }
      if (!s.project) return
      const b = activeBranchOf(s)
      if (!b) return
      const shown = s.viewStep ?? b.headStep
      if (e.key === ' ' && !t.closest('button')) {
        e.preventDefault()
        s.setPlaying(!s.playing)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (s.viewStep !== null) s.setViewStep(Math.min(b.headStep, s.viewStep + (e.shiftKey ? 10 : 1)))
        else if (!s.playing) s.step(e.shiftKey ? 10 : 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        s.setViewStep(Math.max(0, shown - (e.shiftKey ? 10 : 1)))
      } else if (e.key === 'Escape') s.select(null)
      else if (e.key === 'b') {
        // preventDefault so the key doesn't also type into the dialog's freshly focused input
        e.preventDefault()
        setBranchPrompt(shown)
      } else if (e.key === 'c') {
        e.preventDefault()
        setCpPrompt(shown)
      }
      else if (e.key >= '1' && e.key <= '5') s.setView((['world', 'rules', 'events', 'chronicle', 'compare'] as const)[Number(e.key) - 1]!)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (status === 'booting') return <div className="boot" aria-busy="true" />
  if (status === 'fatal')
    return (
      <div className="boot">
        <div className="fatal">
          <AlertTriangle size={18} />
          <h1>Local storage is unavailable</h1>
          <p>{fatal}</p>
          <p className="muted">Branchpoint saves worlds in IndexedDB. Private browsing modes or blocked site data can prevent this.</p>
        </div>
      </div>
    )

  const dialogs = (
    <>
      <NewWorldDialog open={newOpen} onClose={() => setNewOpen(false)} onAi={() => setAiOpen(true)} aiAvailable={ai.available} />
      <WorldsDialog open={worldsOpen} onClose={() => setWorldsOpen(false)} />
      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" width={460}>
        <ShortcutList />
      </Dialog>
      <AiDialog open={aiOpen} onClose={() => setAiOpen(false)} />
      <PromptDialog open={branchPrompt !== null} onClose={() => setBranchPrompt(null)} title={`Branch from step ${branchPrompt ?? 0}`} label="Branch name" initial={`What if… (${branchPrompt ?? 0})`} confirmLabel="Create branch" onSubmit={(v) => appStore.getState().branchFrom(branchPrompt ?? 0, v)} />
      <PromptDialog open={cpPrompt !== null} onClose={() => setCpPrompt(null)} title={`Checkpoint at step ${cpPrompt ?? 0}`} label="Label" initial={`Step ${cpPrompt ?? 0}`} confirmLabel="Save checkpoint" onSubmit={(v) => appStore.getState().addCheckpoint(v)} />
      {imp.input}
      {imp.dialog}
      <Notices />
    </>
  )

  if (!project)
    return (
      <>
        <Welcome onNew={() => setNewOpen(true)} onImport={imp.open} />
        {dialogs}
      </>
    )

  return (
    <div className="app">
      <TopBar onNew={() => setNewOpen(true)} onWorlds={() => setWorldsOpen(true)} onImport={imp.open} onShortcuts={() => setShortcutsOpen(true)} onAi={() => setAiOpen(true)} aiAvailable={ai.available} />
      <Workspace />
      {dialogs}
    </div>
  )
}

function Workspace() {
  const view = useApp((s) => s.view)
  const w = useWorld()
  const [sidebar, setSidebar] = useState(true)
  return (
    <div className={`workspace ${sidebar ? '' : 'no-sidebar'}`}>
      {sidebar && <Sidebar />}
      <main className="main" aria-label={`${view} view`}>
        <button type="button" className="sidebar-toggle" aria-label={sidebar ? 'Hide sidebar' : 'Show sidebar'} onClick={() => setSidebar(!sidebar)}>
          {sidebar ? '‹' : '›'}
        </button>
        {w?.simError && (
          <div className="banner banner-error" role="alert">
            <AlertTriangle size={14} />
            <div>
              <strong>This branch cannot be simulated.</strong>
              <pre>{w.simError}</pre>
              Fix the model on this branch (Rules / inspector), or switch to another branch.
            </div>
          </div>
        )}
        {view === 'world' && <WorldCanvas />}
        {view === 'rules' && <RulesView />}
        {view === 'events' && <EventsView />}
        {view === 'chronicle' && <ChronicleView />}
        {view === 'compare' && <CompareView />}
      </main>
      <Inspector />
      <TimelineDock />
    </div>
  )
}
