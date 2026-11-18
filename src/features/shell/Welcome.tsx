import { FilePlus2, Map as MapIcon, Upload } from 'lucide-react'
import { appStore, useApp } from '../../state/store'
import { SHATTERED_ISLES } from '../../examples/shatteredIsles'

export function Welcome({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  const projects = useApp((s) => s.projects)
  const corrupt = useApp((s) => s.corrupt)
  return (
    <main className="welcome">
      <div className="welcome-inner">
        <h1>Branchpoint</h1>
        <p className="welcome-lede">Build a world, define its rules, simulate it, then branch its history and see exactly why each future turned out differently.</p>
        <div className="welcome-actions">
          <button type="button" className="welcome-card primary" onClick={() => appStore.getState().openExample()}>
            <MapIcon size={18} />
            <strong>Open {SHATTERED_ISLES.name}</strong>
            <span>Three factions bound by grain, timber and iron. A drought is eight steps away.</span>
          </button>
          <button type="button" className="welcome-card" onClick={onNew}>
            <FilePlus2 size={18} />
            <strong>New world</strong>
            <span>Start from your own factions and resources.</span>
          </button>
          <button type="button" className="welcome-card" onClick={onImport}>
            <Upload size={18} />
            <strong>Import</strong>
            <span>Load a .branchpoint.json export.</span>
          </button>
        </div>
        {projects.length > 0 && (
          <section className="welcome-recent">
            <h2>Saved worlds</h2>
            <ul>
              {projects.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => appStore.getState().openProject(p.id)}>
                    <strong>{p.name}</strong>
                    <span className="muted small">
                      {p.branchCount} branch{p.branchCount === 1 ? '' : 'es'} · {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {corrupt.length > 0 && <p className="note crit">{corrupt.length} saved world(s) could not be read. Open “Worlds” from inside a world to remove them.</p>}
        <p className="welcome-foot muted small">Everything runs and saves locally in this browser. The simulation is deterministic: same rules, same seed, same history.</p>
      </div>
    </main>
  )
}
