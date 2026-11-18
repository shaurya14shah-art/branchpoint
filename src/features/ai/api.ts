import { useSyncExternalStore } from 'react'
import { draftToModel, worldDraftSchema, type CompareFacts, type DraftResult } from '../../lib/ai/draft'
import { worldModelSchema } from '../../engine/schema'

/** Client for the optional server-side AI endpoints. Absence of the server is a normal state. */

let status: { available: boolean; checked: boolean } = { available: false, checked: false }
const listeners = new Set<() => void>()
let started = false

function check() {
  if (started) return
  started = true
  fetch('/api/ai/status')
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j: { available?: boolean }) => (status = { available: !!j.available, checked: true }))
    .catch(() => (status = { available: false, checked: true }))
    .finally(() => listeners.forEach((l) => l()))
}

export function useAiStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      check()
      return () => listeners.delete(l)
    },
    () => status,
    () => status,
  )
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as { error?: string }
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`)
  return j as T
}

/**
 * Ask the server for a draft. The response is treated as untrusted: the model is re-validated here
 * with the same schema + semantic checks used for imports.
 */
export async function requestDraft(description: string, seed: number): Promise<DraftResult> {
  const raw = await post<DraftResult>('/api/ai/draft', { description, seed })
  const structural = worldModelSchema.safeParse(raw.model)
  if (!structural.success) {
    // Fall back to re-deriving from the draft shape if possible; otherwise report.
    const asDraft = worldDraftSchema.safeParse(raw.model)
    if (asDraft.success) return draftToModel(asDraft.data, seed)
    return { model: raw.model, layout: raw.layout ?? {}, ok: false, issues: structural.error.issues.slice(0, 20).map((i) => ({ severity: 'error', path: i.path.join('.'), message: i.message })) }
  }
  const { validateModel } = await import('../../engine/validate')
  const v = validateModel(structural.data)
  return { model: structural.data, layout: raw.layout ?? {}, ok: v.ok, issues: v.issues }
}

export function requestSummary(facts: CompareFacts): Promise<{ summary: string; model: string }> {
  return post('/api/ai/summarize', { facts })
}
