### Story e01s01: Proxy server + explanation panel end-to-end — Implementation Steps

**type:** feat
**risk:** P0
**context:** domain
**Context:** The thinnest vertical slice that proves the full pipeline works: Express proxy receives a move's classification data, calls OpenRouter, returns a concise explanation. The frontend calls this endpoint when the user navigates to a blunder/mistake and displays the result in a new panel next to the board.

**Dependencies:** None (new `server/` directory, new panel in `index.html`)

## Steps

1. **Create `server/` directory with Express skeleton** — `server/package.json`, `server/index.js` with a basic Express app listening on port 3001, CORS enabled for local frontend → verify: `cd server && npm install && node -e "require('./index.js')" & sleep 1 && curl -s http://localhost:3001/ | grep -q 'running' && echo 'SERVER_OK'`

2. **Add POST /api/explain endpoint** — Accepts `{ fen, move, bestMove, classification }`, returns `{ explanation: "..." }`. For now, return a hardcoded test explanation to prove the route works → verify: `curl -s -X POST http://localhost:3001/api/explain -H 'Content-Type: application/json' -d '{"move":"Nxf7","classification":"blunder"}' | grep -q 'explanation' && echo 'ENDPOINT_OK'`

3. **Add OpenRouter integration** — Install `node-fetch` or use built-in fetch (Node 18+). Construct the prompt, call OpenRouter API with DeepSeek V4 Flash model, pipe response back. Read API key from `process.env.OPENROUTER_API_KEY` → verify: `grep -q 'openrouter' server/index.js && echo 'OPENROUTER_INTEGRATED'`

4. **Create `.env` file with OPENROUTER_API_KEY** — Provide `server/.env` with placeholder key, add `server/.env` to `.gitignore` → verify: `test -f server/.env && grep -q 'OPENROUTER_API_KEY' server/.env && echo 'ENV_EXISTS'`

5. **Add explanation panel div to `index.html`** — After the `board-container` div, add a new `<div id="explanationPanel" class="explanation-panel hidden">` with a heading and text container → verify: `grep -q 'explanation-panel' index.html && echo 'PANEL_EXISTS'`

6. **Add panel styles to `components.css`** — Dark theme styling matching the existing design: background, padding, border, text color, hidden class → verify: `grep -q 'explanation-panel' components.css && echo 'PANEL_STYLED'`

7. **Add `explanationCache` and `explainMistakes` to `state.js`** — `explanationCache: {}`, `explainMistakes: true` → verify: `grep -q 'explanationCache' state.js && echo 'STATE_ADDED'`

8. **Wire explanation fetch + display in `script.js`** — When navigating to a move that is a blunder (or mistake, if `explainMistakes` is true), check cache first, then call `POST /api/explain`, display in panel. For non-error moves, hide panel. Add a `R.updateExplanationPanel` function → verify: `grep -q '/api/explain' script.js && echo 'EXPLANATION_WIRED'`

9. **Update `R.goToMove` in `board.js` to call explanation update** — After rendering overlays, call `R.updateExplanationPanel()` → verify: `grep -q 'updateExplanationPanel' board.js && echo 'GO_TO_MOVE_WIRED'`

## Verification Script

1. Start the server: `cd server && node index.js`
2. Open `http://localhost:3001/` — should see "server running"
3. `curl -X POST http://localhost:3001/api/explain -H 'Content-Type: application/json' -d '{"move":"Nxf7","classification":"blunder"}'` — should get JSON with explanation
4. Open `http://localhost:8000/` — load a PGN, run analysis
5. Navigate to a blunder — explanation panel should appear with text
6. Navigate to a good move — panel should hide

## Out of scope

- Jump-to-error navigation (e01s02)
- Mistake toggle flag (e01s03)
- Model swapping via env (e01s03)
- Rate limiting, auth, hosted deployment

## Risks

- **P0**: User's OpenRouter API key might have insufficient credits or be misconfigured → detect by returning a clear error message from the proxy
- **P0**: DeepSeek V4 Flash model name might differ on OpenRouter → make model configurable via env from the start
- **P1**: CORS errors if port mismatch between frontend (8000) and proxy (3001) → configure CORS middleware early
- **P1**: Explanation panel might break layout on mobile → test responsive breakpoint