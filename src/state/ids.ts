/** Id generation for UI-created entities (outside the engine, so non-determinism is fine here). */
export function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)
  return `${prefix}-${rand}`
}

export const BRANCH_COLORS = ['#d9d5cc', '#6fa8d6', '#d9a066', '#a993d6', '#7fbf8f', '#d67f96', '#c9c26a']
