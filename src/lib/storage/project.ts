import type { Branch } from '../../engine/history/branch'

export const SCHEMA_VERSION = 2

export interface Point {
  x: number
  y: number
}

/** A saved world: its branches (event-sourced inputs) plus presentation-only layout. */
export interface Project {
  schemaVersion: typeof SCHEMA_VERSION
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  activeBranchId: string
  branches: Branch[]
  layout: Record<string, Point>
}

export interface ProjectMeta {
  id: string
  name: string
  description: string
  updatedAt: number
  branchCount: number
}

export function metaOf(p: Project): ProjectMeta {
  return { id: p.id, name: p.name, description: p.description, updatedAt: p.updatedAt, branchCount: p.branches.length }
}
