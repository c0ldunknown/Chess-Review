### Story e02s03: Render deployment — Implementation Steps

**type:** feat
**risk:** P2
**context:** infra
**Context:** Create a `render.yaml` config so Render auto-deploys the app from GitHub. Push to `main`, configure the environment variables in Render's dashboard, and verify the app is live at `chess-review.onrender.com`.

## Steps

1. Create `render.yaml` at the repo root with the web service config:
   - name: `chess-review`
   - env: `node`
   - buildCommand: `npm install` (installs server dependencies from `server/package.json`)
   - startCommand: `node server/index.js`
   - healthCheckPath: `/`
   - envVars: `OPENROUTER_API_KEY`, `MODEL_NAME`, `EXPLAIN_MISTAKES`, `PORT`
   → verify: `test -f render.yaml && grep -q 'service\|startCommand\|buildCommand' render.yaml`

2. Ensure `.env` is in `.gitignore` (do not commit API keys). → verify: `grep -q '\.env' .gitignore || echo ".gitignore missing .env entry"`

3. Verify the `server/package.json` has the correct start script (`"start": "node index.js"`) and that `npm install` works cleanly from the server directory. → verify: `cd server && npm install --dry-run 2>&1 | head -3`

4. Commit all changes to the current branch, then push to `main`. → verify: `git log --oneline -5 && git branch --show-current | grep -q main || echo "Not on main — confirm merge strategy"`

5. Configure Render via dashboard:
   - New Web Service → connect GitHub repo
   - Branch: `main`
   - Render detects `render.yaml` automatically
   - Set env vars in Render dashboard: `OPENROUTER_API_KEY`, `MODEL_NAME` (deepseek/deepseek-chat), `EXPLAIN_MISTAKES` (true), `PORT` (10000)
   - Deploy
   → verify: `curl -s https://chess-review.onrender.com | grep -q 'Chess Review'`

## Verification Script (Step-by-Step)

1. Push to `main` on GitHub
2. Open Render dashboard, create Web Service from repo
3. Wait for deploy to complete
4. Open `https://chess-review.onrender.com`
5. Load the debug game
6. Click Analyze Game — Stockfish runs, evaluations show
7. Navigate to a blunder — explanation panel loads text (proxy → OpenRouter)
8. Share the URL with a friend — they can use it without any setup

## Out of scope

- Custom domain (chess-review.onrender.com is fine)
- CI/CD beyond Render auto-deploy
- SSL config (Render provides it automatically)

## Risks

- P1: Render spins down after inactivity on free tier → ~30s cold start on first visit. Acceptable for low-traffic use.
- P2: API key must be manually entered in Render dashboard (not in repo). If misplaced, proxy returns 500. Add a note in render.yaml as env comment.
- P2: `server/package.json` is inside `server/` — Render's build command may need `cd server && npm install`. Test this.
