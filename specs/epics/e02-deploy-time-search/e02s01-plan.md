### Story e02s01: Time-based Stockfish search — Implementation Steps

**type:** feat
**risk:** P1
**context:** domain
**Context:** Add a search mode toggle (Depth | Time) to the analysis controls. When in Time mode, Stockfish receives `go movetime N` instead of `go depth N`, giving consistent per-position analysis times. The dropdown adapts its values and the per-position timeout uses `movetime + 5s` instead of the current 30s cap.

## Steps

1. Add search mode support to ChessAnalysis class. Add a `searchMode` property ('depth' | 'time') and update `analyzePosition()` to send `go movetime N` when mode is 'time'. → verify: `grep -q 'searchMode\|movetime' analysis.js`

2. Add the depth/time radio toggle to index.html in the analysis controls section (inside `.analysis-controls`). Two radio inputs with `name="searchMode"`, values `"depth"` and `"time"`. Default selected: `"time"`. → verify: `grep -q 'radio.*searchMode\|searchTime\|searchDepth' server/public/index.html 2>/dev/null || grep -q 'radio.*searchMode\|searchTime\|searchDepth' index.html`

3. Add dynamic dropdown behavior in script.js. On toggle change, repopulate the depth select options:
   - Depth mode: 10, 12, 15 (default), 18, 20
   - Time mode: 2, 5, 8 (default), 15, 30 (with "s" label)
   Store the active mode and selected value for the engine call. → verify: `grep -q 'searchMode\|movetime\|time.*mode\|toggle\|search.*mode' script.js`

4. Update `runNextAnalysisQueueItem()` in script.js to pass the search mode and value to the engine. When in time mode, set per-position timeout to `movetime_ms + 5000`. → verify: `grep -q '5000\|timeout\|movetime' script.js`

5. Update `startFullAnalysis()` to read the current mode and value from the UI before queuing positions. → verify: `grep -q 'searchMode\|analyzePosition' script.js`

## Verification Script (Step-by-Step)

1. Open the app (`python3 -m http.server` or `node server/index.js` once e02s02 is done)
2. Load the debug game
3. See the Depth/Time toggle in the analysis controls, defaulting to Time
4. Dropdown shows: 2s, 5s, 8s, 15s, 30s — 8s selected
5. Click Analyze Game — each position takes roughly 8 seconds
6. Switch toggle to Depth — dropdown changes to: 10, 12, 15, 18, 20
7. Click Analyze Game — position times vary (some fast, some slow)
8. Both modes produce sensible evaluations and classifications

## Out of scope

- WASM Stockfish (future perf improvement)
- Changing the timeout or analysis UX beyond what's listed

## Risks

- P1: Time mode could mask positions that need deeper search. Mitigation: depth mode preserved for comparison.
- P2: If movetime+N timeout fires before Stockfish finishes, the eval is partial. This matches Lichess behavior.
