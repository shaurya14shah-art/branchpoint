# AGENTS.md — conventions for Branchpoint

Read `plan.md` first for architecture and decisions.

## Commands

```
npm run dev        # http://localhost:5250
npm test           # vitest (engine, history, storage, workflow)
npm run typecheck
npm run lint
npm run build      # tsc + vite build (client → dist/, AI server handler → dist-server/)
npm run serve      # serves dist + optional /api/ai (needs ANTHROPIC_API_KEY in env)
```

All four of test / typecheck / lint / build must pass before a change is considered done.

## Architecture rules

- `src/engine/**` is pure TypeScript: no React, no DOM, no I/O, no `Date.now()`, no `Math.random()`
  (lint-enforced). Randomness comes from the seeded RNG carried in `WorldState.rng`.
- The engine never mutates its inputs. `simulateStep` clones the previous state and returns a new
  one. Tests deep-freeze inputs to prove it.
- UI code never computes simulation outcomes. Charts, diffs and explanations read from replayed
  history (`engine/history`, `engine/compare`).
- Every state change produces a structured `SimEvent` with rule/event id, entity ids and
  before/after values. Do not change values without recording why.
- New rule type = new file in `src/engine/rules/`, a schema entry in `schema.ts`, registration in
  `registry.ts`, a case in `RuleParams` + `ruleTemplate` (`features/rules/editors.tsx`), and tests. Nothing else should change.
- Persisted shapes are Zod-validated on read. Bump `SCHEMA_VERSION` and add a migration in
  `lib/storage/format.ts` when a persisted shape changes.
- AI output is untrusted: it must pass the same schema + semantic validation as imports and requires
  explicit user approval. API keys stay server-side (`server/`), never `VITE_*`.

## Code style

- Strict TS, no `any`, no non-null assertions in engine code; prefer discriminated unions.
- Small components; business logic lives in the store or engine, not in JSX.
- Styling: CSS variables in `src/styles/tokens.css`; component styles in `src/styles/app.css`.
  Charcoal surfaces, hairline borders, semantic accents only. No gradients-for-decoration.
- Accessibility: every interactive element is reachable by keyboard and has an accessible name.

## Testing

- Engine/history/storage: unit tests in `tests/`.
- AI: `tests/ai.test.ts` covers draft conversion/validation and endpoint behaviour without a key.
  Live model calls are not exercised by the suite.
- Workflows: `tests/workflow.test.ts` drives the store end to end (load → step → branch → edit →
  compare → export/import). `tests/app.test.tsx` smoke-tests the rendered app.
