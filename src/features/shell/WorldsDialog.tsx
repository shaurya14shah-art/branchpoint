import { useRef, useState } from 'react'
import { Copy, Download, FolderOpen, Pencil, Trash2, Upload } from 'lucide-react'
import { appStore, useApp } from '../../state/store'
import { Dialog, ConfirmDialog, PromptDialog } from '../../components/Dialog'
import { Button } from '../../components/ui'
import type { ProjectMeta } from '../../lib/storage/project'

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useImport() {
  const ref = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null)
  const input = (
    <input
      ref={ref}
      type="file"
      accept=".json,application/json"
      hidden
      onChange={async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        if (file.size > 20 * 1024 * 1024) return setError({ message: 'File is larger than 20 MB', issues: [] })
        const res = await appStore.getState().importProject(await file.text())
        if (!res.ok) setError({ message: res.error, issues: res.issues })
      }}
    />
  )
  const dialog = (
    <Dialog open={error !== null} onClose={() => setError(null)} title="Import failed" footer={<Button onClick={() => setError(null)}>Close</Button>}>
      <p className="prose">{error?.message}</p>
      {error && error.issues.length > 0 && (
        <ul className="issue-list">
          {error.issues.map((i, k) => (
            <li key={k}>
              <code>{i}</code>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Nothing was changed. Branchpoint only imports files it can fully validate.</p>
    </Dialog>
  )
  return { open: () => ref.current?.click(), input, dialog }
}

export function WorldsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projects = useApp((s) => s.projects)
  const corrupt = useApp((s) => s.corrupt)
  const current = useApp((s) => s.project?.id)
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null)
  const [deleting, setDeleting] = useState<ProjectMeta | null>(null)
  const imp = useImport()
  const s = appStore.getState()

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Worlds"
        width={640}
        footer={
          <>
            <Button icon={<Upload size={13} />} onClick={imp.open}>
              Import…
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <p className="muted small">Saved in this browser (IndexedDB). Export a world to back it up or move it.</p>
        <ul className="world-list">
          {projects.map((p) => (
            <li key={p.id} className={p.id === current ? 'is-current' : ''}>
              <div className="world-main">
                <strong>{p.name}</strong>
                <span className="muted small">
                  {p.branchCount} branch{p.branchCount === 1 ? '' : 'es'} · edited {new Date(p.updatedAt).toLocaleString()}
                </span>
              </div>
              <div className="world-actions">
                <Button
                  size="sm"
                  icon={<FolderOpen size={13} />}
                  disabled={p.id === current}
                  onClick={async () => {
                    await s.openProject(p.id)
                    onClose()
                  }}
                >
                  Open
                </Button>
                <button type="button" className="icon-btn" aria-label={`Rename ${p.name}`} data-tip="Rename" onClick={() => setRenaming(p)}>
                  <Pencil size={13} />
                </button>
                <button type="button" className="icon-btn" aria-label={`Duplicate ${p.name}`} data-tip="Duplicate" onClick={() => s.duplicateProject(p.id)}>
                  <Copy size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Export ${p.name}`}
                  data-tip="Export"
                  onClick={async () => {
                    if (p.id !== current) await s.openProject(p.id)
                    const out = appStore.getState().exportProject()
                    if (out) downloadText(out.filename, out.text)
                  }}
                >
                  <Download size={13} />
                </button>
                <button type="button" className="icon-btn danger" aria-label={`Delete ${p.name}`} data-tip="Delete" onClick={() => setDeleting(p)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
          {projects.length === 0 && <li className="muted">No saved worlds.</li>}
        </ul>
        {corrupt.length > 0 && (
          <div className="note crit">
            {corrupt.length} saved world{corrupt.length === 1 ? '' : 's'} could not be read ({corrupt.map((c) => c.error).join('; ')}).
            {corrupt.map((c) => (
              <Button key={c.id} size="sm" variant="danger" onClick={() => s.deleteCorrupt(c.id)}>
                Remove {c.id}
              </Button>
            ))}
          </div>
        )}
      </Dialog>
      {imp.input}
      {imp.dialog}
      <PromptDialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename world"
        label="Name"
        initial={renaming?.name ?? ''}
        confirmLabel="Rename"
        onSubmit={(v) => renaming && s.renameProjectById(renaming.id, v)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        danger
        title={`Delete “${deleting?.name}”?`}
        confirmLabel="Delete permanently"
        body={<p>All branches, checkpoints and history of this world will be removed from this browser. This cannot be undone — export it first if you might want it back.</p>}
        onConfirm={() => deleting && s.deleteProject(deleting.id)}
      />
    </>
  )
}
