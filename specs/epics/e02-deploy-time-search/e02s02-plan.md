### Story e02s02: Single-service Express with static files — Implementation Steps

**type:** refactor
**risk:** P1
**context:** infra
**Context:** Restructure the project so Express serves both the API and the static frontend files from a single `public/` directory. API URLs become relative (`/api/explain`). Replace the hardcoded example PGN in the textarea with a placeholder and a "Load debug game" button. The local dev workflow collapses from two terminals to one.

## Steps

1. Create `server/public/` directory. Move all frontend files from repo root into it: `index.html`, `analysis.js`, `board.js`, `chart.js`, `state.js`, `script.js`, `style.css`, `components.css`. → verify: `test -f server/public/index.html && test -f server/public/script.js && test -f server/public/style.css`

2. Update `server/index.js`: Add `app.use(express.static(path.join(__dirname, 'public')))` after `app.use(cors())`. Import `path` module at the top. → verify: `grep -q "express.static.*public" server/index.js && grep -q "require('path')" server/index.js`

3. Update all script and stylesheet `<link>` and `<script src>` paths in `server/public/index.html` to use relative paths (e.g., `script.js` instead of `../script.js`). Remove any `/` or `../` prefixes. → verify: `grep -q 'src="script.js"\|src="analysis.js"\|src="board.js"\|href="style.css"' server/public/index.html`

4. Update the AJAX URL in `server/public/script.js`: Change `http://localhost:3001/api/explain` to `/api/explain` (relative). → verify: `grep -q "'/api/explain'" server/public/script.js && ! grep -q 'localhost:3001' server/public/script.js`

5. Replace the hardcoded example PGN in `server/public/index.html` textarea with placeholder text: `placeholder="Paste a PGN here to analyze..."` and clear the inner text. Add a small button or link below the textarea: "Load debug game" that, when clicked, fills in the example PGN from a JS variable. → verify: `grep -q 'placeholder\|Paste a PGN\|debug.*game\|load.*example' server/public/index.html`

6. Add the example PGN string as a JS variable in `server/public/script.js` (or a new small block in the HTML `<script>` tag), and wire the "Load debug game" click handler to set the textarea value and trigger load. → verify: `grep -q 'debug\|example\|loadExample\|examplePgn\|demoPgn' server/public/script.js`

7. Verify the new local dev workflow: kill any running servers, run `node server/index.js`, open `http://localhost:3001`. Full app loads, PGN input works, Stockfish analysis runs, /api/explain works. → verify: `node server/index.js & sleep 2 && curl -s http://localhost:3001 | grep -q 'Chess Review' && kill %1 2>/dev/null`

## Verification Script (Step-by-Step)

1. `cd server && node index.js`
2. Open `http://localhost:3001` in browser
3. App loads — board, controls, PGN input all present
4. Textarea shows placeholder: "Paste a PGN here to analyze..."
5. Click "Load debug game" — example PGN fills in, game loads
6. Click Analyze Game — Stockfish runs, eval updates
7. Navigate to a blunder — explanation panel shows text from proxy

## Out of scope

- Changing how the proxy works or the explanation API format
- Any visual redesign

## Risks

- P1: Moving files breaks relative paths. Mitigation: step 3 verifies all script/src paths.
- P2: "Load debug game" button may need CSS styling to not look out of place.
