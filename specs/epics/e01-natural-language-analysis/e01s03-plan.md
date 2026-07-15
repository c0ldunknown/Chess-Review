### Story e01s03: Config toggle for mistakes + model swapping — Implementation Steps

**type:** feat
**risk:** P2
**context:** domain
**Context:** The user wants easy experimentation: toggle mistake explanations on/off with a single flag, and swap the OpenRouter model without code changes.

## Steps

1. **Add `server/.env` with `MODEL_NAME` and `EXPLAIN_MISTAKES`** — `MODEL_NAME=deepseek/deepseek-chat` (or whatever the correct OpenRouter slug is), `EXPLAIN_MISTAKES=true`. Also add `OPENROUTER_API_KEY` if not already there → verify: `grep -q 'MODEL_NAME' server/.env && grep -q 'EXPLAIN_MISTAKES' server/.env && echo 'ENV_CONFIGURED'`

2. **Read `MODEL_NAME` from env in the Express server** — Use `process.env.MODEL_NAME` in the OpenRouter API call body → verify: `grep -q 'process.env.MODEL_NAME' server/index.js && echo 'MODEL_ENV_READ'`

3. **Read `EXPLAIN_MISTAKES` flag from env** — The proxy endpoint checks this flag; if false, it returns an error or empty response for mistake classifications → verify: `grep -q 'EXPLAIN_MISTAKES' server/index.js && echo 'MISTAKES_FLAG_READ'`

4. **Create `server/.env.example`** — Document all env vars with placeholder values, no secrets → verify: `test -f server/.env.example && echo 'EXAMPLE_ENV_EXISTS'`

5. **Add `server/.env` to `.gitignore`** — Prevent accidental commit of API keys → verify: `grep -q 'server/.env' .gitignore && echo 'GITIGNORED'`

## Verification Script

1. Set `EXPLAIN_MISTAKES=false` in `.env`, restart server
2. Load a game with mistakes, navigate to a mistake — panel should show no explanation
3. Navigate to a blunder — panel should still show explanation
4. Change `MODEL_NAME` to a different OpenRouter model, restart
5. Navigate to a blunder — explanation should return from the new model

## Out of scope

- UI toggle for mistakes (user edits .env directly)
- Multiple model fallback/retry
- Rate limiting

## Risks

- **P2**: Wrong model name in ENV causes silent failure → add a quick validation check on startup, log the model being used
- **P2**: .env missing or misconfigured → server should log a clear error message on startup