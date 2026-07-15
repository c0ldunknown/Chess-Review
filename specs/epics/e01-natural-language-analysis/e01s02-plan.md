### Story e01s02: Jump-to-error navigation — Implementation Steps

**type:** feat
**risk:** P1
**context:** domain
**Context:** Once the explanation panel works, the user needs a quick way to jump between errors. Add prev/next buttons that skip to the nearest blunder or mistake in the move history.

## Steps

1. **Add prev/next error buttons to `index.html`** — Two new `ctrl-btn` elements in the `.game-controls` div: `#prevErrorBtn` (◀◀) and `#nextErrorBtn` (▶▶) with appropriate aria-labels → verify: `grep -q 'prevErrorBtn\|nextErrorBtn' index.html && echo 'BUTTONS_EXIST'`

2. **Add `R.goToPrevError` and `R.goToNextError` functions to `board.js`** — These scan `R.moveHistory` backward/forward from `R.currentMoveIndex` to find the next move with classification `blunder` or `mistake` (respecting `R.explainMistakes` flag). Call `R.goToMove()` on the found index → verify: `grep -q 'goToPrevError\|goToNextError' board.js && echo 'NAV_FUNCTIONS_EXIST'`

3. **Wire button click handlers in `script.js`** — `$('#prevErrorBtn').on('click', function () { R.goToPrevError(); })` and similarly for next → verify: `grep -q 'prevErrorBtn' script.js && echo 'BUTTONS_WIRED'`

4. **Add keyboard shortcuts** — Shift+ArrowLeft for prev error, Shift+ArrowRight for next error in the `keydown` handler → verify: `grep -q 'shiftKey' script.js && echo 'KEYBOARD_WIRED'`

5. **Style error-skip buttons** — Add `.ctrl-btn-error` style to `components.css` with a subtle red/orange accent to distinguish from normal nav buttons → verify: `grep -q 'ctrl-btn-error' components.css && echo 'BUTTONS_STYLED'`

6. **Disable error buttons when no errors exist** — In `R.updateNavState`, also check if there are any blunders/mistakes in the move history and disable the error buttons accordingly → verify: `grep -q 'prevErrorBtn\|nextErrorBtn' board.js && echo 'NAV_STATE_UPDATED'`

## Verification Script

1. Load a game with known blunders
2. Click the error-skip button — should jump to the next blunder
3. Panel should show the explanation for that blunder
4. Shift+ArrowRight/Left should trigger the same behavior
5. If no errors exist, buttons should be disabled

## Out of scope

- Mistake toggle (e01s03)
- Model swapping (e01s03)

## Risks

- **P1**: Edge case where no errors exist in the game → buttons should be disabled, not crash
- **P2**: Circular navigation (past last error wraps to first) → keep it simple, no wrap for now (match existing nav behavior)