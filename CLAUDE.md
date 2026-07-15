# Chess Review — Claude Code

Read CONVENTIONS.md before any git or GitHub operation.

## Project
Chess analysis tool that adds natural language move analysis on top of Stockfish evaluations. Replaces chess.com's game review with richer, more insightful analysis.

Stack: Vanilla JS, browser-based (no build step), CDN libraries (chessboard.js, chess.js, Chart.js, jQuery, Stockfish.js via Worker)

## Commands
| Action | Command |
|--------|---------|
| Run    | Open `index.html` in browser (or `python3 -m http.server 8000`) |
| Test   | N/A |
| Build  | N/A |
| Lint   | N/A |
| Preflight | N/A |

## Architecture
`index.html` (UI shell) + `script.js` (UI logic, board rendering, navigation, overlays) + `analysis.js` (ChessAnalysis class wrapping Stockfish.js Worker) + `style.css` (dark theme). ChessAnalysis class → Stockfish.js Worker → eval data → script.js updates board, overlays, chart, and move summary.

## Conventions
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

## Never
- Never dismiss reproducible gate failures as pre-existing or out of scope
- Never proceed on red Preflight or red CI — invoke quick-fix or fix-bug first
- Never modify the Stockfish CDN URL without explicit confirmation

## Agent Rules
- **Workflow Mandate:** You MUST use the bigpowers skills (e.g. `plan-work`, `develop-tdd`, `orchestrate-project`) to perform tasks. DO NOT write code directly in response to a user prompt like "build this feature".
- **Always Green:** Preflight and CI must be green before forward work. Reproducible gate failures require **fix-or-log** (quick-fix → fix-bug) per CONVENTIONS § Discovered Defects.
- Read specs/ before writing code.
- All planning and specifications MUST be written to `specs/` (`product/SCOPE_LATEST.yaml`, `release-plan.yaml`, `epics/`) before any code is generated.
- Write the minimum code that solves the stated problem. Nothing extra.
- Run tests after every change. Show evidence before declaring done.
- One clarifying question beats a wrong assumption baked into 200 lines.