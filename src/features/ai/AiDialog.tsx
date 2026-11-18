import { useState } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { ruleImpl } from '../../engine/rules/registry'
import { indexModel } from '../../engine/modelIndex'
import type { DraftResult } from '../../lib/ai/draft'
import { appStore } from '../../state/store'
import { Dialog } from '../../components/Dialog'
import { Badge, Button, Field, NumberInput } from '../../components/ui'
import { requestDraft } from './api'

export { useAiStatus } from './api'

const EXAMPLE = 'A frozen archipelago where three clans compete for whale oil, peat and iron. The Ironhold clan mines but cannot feed itself; the Seal Coast clans hunt but need tools. Winters bring famines every few years, and an old blood feud makes raids likely when food runs short.'

/** Describe → draft (server) → validate (here) → review → explicit approval → create world. */
export function AiDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [description, setDescription] = useState('')
  const [seed, setSeed] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftResult | null>(null)

  const reset = () => {
    setDraft(null)
    setError(null)
  }
  const close = () => {
    reset()
    onClose()
  }
  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      setDraft(await requestDraft(description, seed))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const approve = async () => {
    if (!draft?.ok) return
    await appStore.getState().createProject(draft.model, draft.layout)
    close()
  }

  const ix = draft ? indexModel(draft.model) : null
  const errors = draft?.issues.filter((i) => i.severity === 'error') ?? []

  return (
    <Dialog
      open={open}
      onClose={close}
      title={draft ? 'Review proposed world' : 'Describe a world'}
      width={680}
      footer={
        draft ? (
          <>
            <Button variant="ghost" onClick={reset}>
              Back to description
            </Button>
            <Button variant="primary" disabled={!draft.ok} onClick={approve} title={draft.ok ? undefined : 'Fix: regenerate — the proposal has validation errors'}>
              Approve & create world
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Sparkles size={13} />} disabled={busy || description.trim().length < 20} onClick={generate}>
              {busy ? 'Drafting…' : 'Draft model'}
            </Button>
          </>
        )
      }
    >
      {!draft ? (
        <div className="stack-4">
          <p className="prose">Claude drafts entities and rules using Branchpoint’s rule types only — no code. The draft is validated, shown to you in full, and nothing is created until you approve it. The simulation itself never uses AI.</p>
          <Field label="Description">
            {(id) => <textarea id={id} className="input" rows={7} maxLength={8000} value={description} placeholder={EXAMPLE} onChange={(e) => setDescription(e.target.value)} disabled={busy} />}
          </Field>
          <div className="row-2">
            <Button size="sm" variant="ghost" onClick={() => setDescription(EXAMPLE)} disabled={busy}>
              Use example
            </Button>
            <Field label="Seed" inline>
              {(id) => <NumberInput id={id} min={0} max={4294967295} value={seed} onCommit={(v) => setSeed(Math.round(v))} />}
            </Field>
          </div>
          {busy && <p className="muted small" role="status">Drafting can take up to a minute.</p>}
          {error && (
            <p className="note crit" role="alert">
              <AlertTriangle size={13} /> {error}
            </p>
          )}
        </div>
      ) : (
        ix && (
          <div className="stack-4 ai-review">
            <div>
              <strong>{draft.model.name}</strong>
              <p className="prose">{draft.model.description}</p>
            </div>
            {errors.length > 0 ? (
              <div className="note crit" role="alert">
                The proposal failed validation and cannot be applied:
                <ul className="issue-list">
                  {errors.slice(0, 12).map((i, k) => (
                    <li key={k}>
                      <code>{i.path}</code> {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="note">Passed schema and reference validation. Review it below; you can edit everything after creation.</p>
            )}
            <section>
              <h3 className="review-h">Factions · {draft.model.factions.length}</h3>
              <ul className="plain-list">
                {draft.model.factions.map((f) => (
                  <li key={f.id}>
                    <span className="legend-ring" style={{ borderColor: f.color }} /> <strong>{f.name}</strong> <span className="muted">— {f.description}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="review-h">Settlements · {draft.model.locations.length}</h3>
              <ul className="plain-list">
                {draft.model.locations.map((l) => (
                  <li key={l.id}>
                    {l.name} <span className="muted">({l.region}, {ix.name(l.initialOwnerId)}, pop {l.initialPopulation})</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="review-h">Rules · {draft.model.rules.length}</h3>
              <ul className="plain-list">
                {draft.model.rules.map((r) => {
                  let text: string
                  try {
                    text = ruleImpl(r).describe(r, ix)
                  } catch {
                    text = '(cannot describe — invalid references)'
                  }
                  return (
                    <li key={r.id}>
                      <Badge>{r.type}</Badge> <strong>{r.name}</strong> <span className="muted">{text}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
            <p className="muted small">
              {draft.model.routes.length} trade routes · {draft.model.resources.length} resources · {draft.model.events.length} scheduled events
            </p>
          </div>
        )
      )}
    </Dialog>
  )
}
