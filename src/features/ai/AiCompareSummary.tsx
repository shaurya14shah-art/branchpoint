import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { Branch } from '../../engine/history/branch'
import { headModel } from '../../engine/history/branch'
import { divergence, type ModelChange } from '../../engine/history/diff'
import { milestones, type DiffRow } from '../../engine/compare'
import type { CompareFacts } from '../../lib/ai/draft'
import { useApp } from '../../state/store'
import { Button, Section } from '../../components/ui'
import { requestSummary, useAiStatus } from './api'

function changeText(c: ModelChange): string {
  if (c.change !== 'changed') return `${c.change} ${c.kind} "${c.name}"`
  return `changed ${c.kind} "${c.name}": ${c.fields.map((f) => `${f.field} ${JSON.stringify(f.before)} -> ${JSON.stringify(f.after)}`).join('; ')}`.slice(0, 500)
}

/** Optional narrative summary, generated only from the computed comparison shown above it. */
export function AiCompareSummary({ reference, others, rows }: { reference: Branch; others: Branch[]; rows: DiffRow[] }) {
  const ai = useAiStatus()
  const timelines = useApp((s) => s.timelines)
  const world = useApp((s) => s.project?.name ?? '')
  const [state, setState] = useState<{ busy: boolean; text?: string; error?: string; key?: string }>({ busy: false })
  if (!ai.available) return null
  const key = [reference, ...others].map((b) => `${b.id}@${b.headStep}`).join(',')

  const run = async () => {
    setState({ busy: true })
    const facts: CompareFacts = {
      world,
      reference: { name: reference.name, headStep: reference.headStep },
      others: others.map((b) => {
        const d = divergence(reference, b)
        return { name: b.name, headStep: b.headStep, divergenceStep: d.step, inputChanges: [...d.modelChanges.map(changeText), ...d.interventionsOnlyB.map((i) => `intervention at step ${i.step}: ${i.label}`), ...d.interventionsOnlyA.map((i) => `intervention only on reference at step ${i.step}: ${i.label}`)].slice(0, 40) }
      }),
      finalState: rows.filter((r) => r.spread !== 0).slice(0, 200).map((r) => ({ group: r.group, label: r.label, values: r.values })),
      milestones: [reference, ...others].map((b) => ({ branch: b.name, items: (timelines[b.id] ? milestones(timelines[b.id]!, headModel(b)) : []).slice(0, 60).map((m) => `step ${m.step}: ${m.label}`) })),
    }
    try {
      const r = await requestSummary(facts)
      setState({ busy: false, text: r.summary, key })
    } catch (e) {
      setState({ busy: false, error: (e as Error).message })
    }
  }

  return (
    <Section title={<><Sparkles size={12} /> Narrative summary (optional)</>} actions={<Button size="sm" onClick={run} disabled={state.busy}>{state.busy ? 'Summarising…' : state.text ? 'Regenerate' : 'Summarise with Claude'}</Button>}>
      {state.text ? (
        <>
          <p className="prose">{state.text}</p>
          <p className="muted small">
            Generated from the computed facts above{state.key !== key ? ' — the branches have changed since; regenerate' : ''}. It is an interpretation, not evidence: the event log and the input differences are the source of truth.
          </p>
        </>
      ) : state.error ? (
        <p className="note crit" role="alert">{state.error}</p>
      ) : (
        <p className="muted small">Sends only the comparison facts on this page (input changes, final-state numbers, milestones) to the server.</p>
      )}
    </Section>
  )
}
