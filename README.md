# Branchpoint

A visual, deterministic simulation environment for worldbuilders and indie game designers:
**create a world → define its rules → simulate → branch → compare → understand why.**

```bash
npm install
npm run dev            # http://localhost:5250
```

Open **The Shattered Isles**, press → to advance (⇧→ for ten steps, Space to play), press **B** to
branch from the displayed step, change a rule or a value on the branch, advance it, then open
**Compare** (5), or read the **Chronicle** (4) of what happened. Every number on screen comes from replaying the engine; every change is in the
**Event log** (3) with the rule that caused it.

## How it works

- `src/engine/` — pure TypeScript simulation. `simulateStep(state, model, interventions)` is
  deterministic (seeded RNG in the state), never mutates its inputs, and records a structured event
  for every change. Rules run sequentially in `(priority, id)` order; see `simulate.ts`.
- Rule types: production, consumption (with shortages), trade (reserves, relation-gated routes),
  population growth, spoilage, stability drift, threshold events — plus emergent dynamics: faction
  decisions driven by personality and rulers, warfare with conquest and revolts, succession,
  plague, migration and seeded fortune. No user code is ever executed.
- Branches are event-sourced: they store model revisions + interventions, and history is rebuilt
  by replay. Forks share the parent's prefix by reference; nothing mutable is shared.
- Worlds persist in IndexedDB and export/import as versioned, validated JSON.

## Optional AI

Set `ANTHROPIC_API_KEY` in the environment of `npm run dev` or `npm run serve` to enable:
drafting a world from a description (validated, reviewed, and only applied on approval) and a
narrative summary of a comparison grounded in the computed facts. The key stays on the server.
Without it, everything else works unchanged.

## Scripts

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run serve` (production,
port 5251). See `AGENTS.md` for conventions and `plan.md` for architecture decisions.
