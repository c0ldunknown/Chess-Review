# Chess Review — Conventions

> Shared rules for all AI agents working on this project.

## Project
Chess analysis tool that adds natural language move analysis on top of Stockfish evaluations. Replaces chess.com's game review with richer, more insightful analysis.

## Specifications
All planning and specification documents live in `specs/`. This is the canonical source of truth for project requirements, architecture, and plans.

- `specs/product/` — Vision, scope, glossary
- `specs/tech-architecture/` — Tech stack, security, test, design plans
- `specs/epics/` — Epic capsules with stories and tasks
- `specs/bugs/` — Bug reports and registry
- `specs/adr/` — Architecture Decision Records

## Commands
| Action | Command |
|--------|---------|
| Run    | Open `index.html` in browser |

## Defensive Code Categories

The following defensive patterns are expected throughout the codebase:

### Timeout
All async operations must have a timeout. Stockfish analysis, CDN loads, and any external resource fetch must be bounded by a timeout that aborts and reports failure rather than hanging indefinitely.

### Graceful Degradation
If Stockfish CDN is unavailable or fails to load, the app must still render the board, allow PGN navigation, and show a clear message that analysis is unavailable. No blank screens or broken states.

## Always Green / Shift Left

The cost of finding a defect grows 10x each stage it escapes (1-10-100 rule). Catch issues as early as possible.

- **Preflight is green** when all available checks pass (test + lint + build).
- **CI is green** when the remote PR checks pass.
- Agents must never proceed past a red gate. Stalled gates must be diagnosed and resolved before forward progress.

## Discovered Defects

When a defect is discovered during work (not the task being worked on):

1. If it's a **trivial data-only fix** with no logic risk → `quick-fix`
2. Otherwise → `investigate-bug` → `fix-bug`
3. Always commit the fix separately from the feature work
4. Log the defect in `specs/bugs/registry.yaml`

## Banned Dismissive Phrases

The following phrases are never acceptable when a gate is red or a defect is found:

| Phrase | Why it's banned |
|--------|-----------------|
| "This is pre-existing" | Doesn't matter — fix or log it |
| "Unrelated to this session" | Doesn't matter — fix or log it |
| "Not introduced by my changes" | Doesn't matter — fix or log it |
| "Out of scope" | Red gates are always in scope |