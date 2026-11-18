# Branchpoint — implementation plan

## Repository findings

- `project-dirac-delta/` is the **Agent Epsilon** Electron app (plain JS + Vite) plus a sibling
  `deep-space/` Three.js sandbox. Neither contains anything reusable for a deterministic world
  simulator, and the root `package.json` is owned by the Electron build.
- Decision: Branchpoint lives in its own self-contained subproject, `branchpoint/`, following the
  same pattern as `deep-space/` (own `package.json`, own dev port). Nothing outside this folder is
  modified except a `branchpoint` entry in `../.claude/launch.json`.
- Stack: **Vite + React 19 + strict TypeScript**, Zustand for UI state, Zod for schemas, Vitest
  (+ jsdom, Testing Library, fake-indexeddb) for tests, ESLint (typescript-eslint). Vite was chosen
  over Next.js because the app is local-first and client-heavy; the only server need (optional AI
  with a secret key) is served by a ~100-line Node server/Vite middleware, see `server/`.

## Architecture (one line each)

| Path | Responsibility |
| --- | --- |
| `src/engine/` | Pure, deterministic simulation. No React, no DOM, no `Math.random`. |
| `src/engine/model.ts` | Domain types: world model (definitions + rules + scheduled events) and world state. |
| `src/engine/schema.ts` | Zod schemas for every persisted shape. |
| `src/engine/validate.ts` | Structural + semantic validation (references, ranges, duplicates). |
| `src/engine/rules/` | One file per rule type, registered in `registry.ts`. |
| `src/engine/effects.ts` | Shared effect vocabulary used by threshold rules, scheduled events, interventions. |
| `src/engine/simulate.ts` | `simulateStep(state, model, interventions) → { state, events }`. |
| `src/engine/history/` | Branches, revisions, replay/materialisation, checkpoints, model diffs. |
| `src/engine/compare.ts` | Series, final-state diffs, divergent events, milestones (all from real history). |
| `src/examples/` | The Shattered Isles + blank-world generator. |
| `src/lib/storage/` | IndexedDB repository, versioned import/export. |
| `src/state/` | Zustand store: project, branch timelines cache, selection, playback. |
| `src/features/*` | World canvas, inspector, rules, events, timeline, comparison, creation, AI. |
| `src/components/` | Design-system primitives. |

## Key decisions

1. **Event-sourced timelines.** A branch is `{ revisions, interventions, headStep }`. States are
   never persisted; they are recomputed by replay, which is cheap and doubles as a continuous
   determinism check. A child branch copies its parent's revisions/interventions up to the fork
   step, so branches share nothing mutable and a parent can be truncated without breaking children.
2. **Sequential update semantics.** Within a step, rules run in `(priority, id)` order; each rule
   observes changes made by earlier rules in the same step. This guarantees conservation for
   transfers (no double spending). Tested explicitly.
3. **Revisions.** Editing rules/entities on a branch whose head is at step `s` creates a revision
   effective for transitions from `s` onward; history before `s` is untouched.
4. **Interventions.** Editing a *current value* (e.g. a stockpile) at step `s > 0` is recorded as an
   intervention applied at step `s` — it is part of the branch and is replayed. Changing the past
   requires branching.
5. **Integer quantities.** Stocks and populations are integers (rounded with `Math.round` at each
   effect). Stability/relations are bounded domains (0..100, −100..100); clamping is recorded in the
   event, never silent.
6. **Layout is not simulation.** Map coordinates live in `project.layout`, not in the model.

## Milestones

- [x] M1 — engine, rules, validation, Shattered Isles, core tests
- [x] M2 — workspace (canvas, sidebar, inspector, controls, event log), persistence
- [x] M3 — checkpoints, branching, branch-specific edits, comparison, isolation tests
- [x] M4 — import/export, creation flow, error handling, a11y pass, workflow tests, prod build
- [x] M5 — optional AI (server-side key): describe → validated proposal → review → apply;
      branch-difference summaries grounded in computed comparison data. Model `claude-opus-5-5`
      with structured output and server-side refusal fallback (`fallbacks: "default"`).
      Not yet exercised against the live API in this repo (no key configured); offline paths are tested.

## Emergent dynamics (v2)

The world now evolves on its own instead of following fixed flows. Six rule types, all seeded and
deterministic, each emitting traceable events (decisions carry a `detail` with their score breakdown):

| Rule | What it adds |
| --- | --- |
| `agency` (Faction decisions) | Each faction scores raid / war / peace / alliance / join ally's war / aid / embargo / reopen trade / restore order / innovate from its **traits** blended with its **ruler**, hunger, strength and relations. |
| `warfare` | One battle per war per step: casualties, arms consumption, exhaustion, conquest (with home-ground defence and siege cooldown), negotiated peace + 12-step truce. Occupied settlements remember their `culture` and may **revolt**, even reviving a fallen faction. |
| `succession` | Rulers age, die or are deposed; heirs get new boldness/wisdom which shifts decisions. |
| `contagion` | Outbreaks from crowding + hunger, spreading along routes that carried goods; mortality; immunity. |
| `migration` | People follow routes toward food, stability, innovation, health and peace (cross-border if friendly). |
| `fortune` | Seeded deck: harvests, storms, breakthroughs, rich seams, omens, assassinations, settlers. |

Innovation (`tech`) multiplies production and military strength. Trade halts during war; allies
ignore route relation minimums. Format v2 adds `FactionDef.traits` (v1 files migrate with defaults).
The **Chronicle** view (4) renders the branch's history from these events.

## Verification status

- 64 automated tests (incl. `tests/dynamics.test.ts`) (engine, branching/diff/compare, storage + import/export, store workflow,
  rendered-app smoke test, AI draft validation). `npm run typecheck`, `lint`, `build` pass.
- Manually exercised in the browser: load example, step, scrub history, branch, branch-only rule
  edit, intervention, compare (divergence, chart, final state, milestones, differing events),
  event trace, reload persistence.

## Known limitations / next steps

- Single simulation type (faction economy). The rule registry is the extension point.
- Replay cost is O(steps) on load; fine for thousands of steps on this model size. Snapshot
  caching to IndexedDB is the next optimisation if worlds grow.
- No cloud sync; `lib/storage/repository.ts` is the seam for it.
- Branches started on the same world share no storage; a world with many long branches stores
  only inputs, so export files stay small, but every branch is replayed on open.
- No undo stack for model edits within a step (rewind / branching cover most needs).
- Mobile layout is usable for viewing but the editor is designed for desktop widths.
