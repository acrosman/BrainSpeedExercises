# Plan: Fast Piggie Game Plugin

Two guinea pig images arranged in a circle of equal wedge zones. N-1 wedges show a "common" guinea pig; one wedge shows the "outlier." Images flash briefly, disappear — player clicks the correct wedge. Correct = green flash + tone; wrong = red flash + tone. Difficulty auto-scales: every 3 correct answers → +2 wedges (cap 14), −200ms display time (floor 500ms), starting at 6 wedges / 2000ms.

Implementation follows the existing plugin architecture. Before anything else, a pre-existing bug must be fixed.

> **Pre-existing bug (Phase 1 prerequisite):** `main.js` `games:load` handler returns `{ htmlPath }` but `interface.js` reads `result.html` — no game can load until this is fixed.

---

## Phase 1 — Bug Fix & Scaffold

> Must complete before anything else.

### Prompt 1 — Fix `games:load` IPC bug

In `main.js`, after resolving the game manifest, read the `interface.html` file from disk and return `{ manifest, html: <string> }` so the renderer receives HTML content (not a path). Update `interface.js` to use `result.html` consistently.

### Prompt 2 — Scaffold `app/games/fast-piggie/`

Create:

- `manifest.json` — `id: "fast-piggie"`, `name: "Fast Piggie"`, `description`, `entryPoint: "index.js"`, `thumbnail: "images/thumbnail.png"`, `version`, `author`
- `images/` folder with three placeholder files: `guinea-pig-common.png`, `guinea-pig-outlier.png`, `thumbnail.png`
- Empty stubs: `game.js`, `index.js`, `interface.html`, `style.css`, `tests/game.test.js`, `tests/index.test.js`

---

## Phase 2 — Game Logic

### Prompt 3 — Implement `game.js`

Pure functions only — no DOM access. Exports:

- `initGame()` — reset `score=0`, `roundsPlayed=0`, `running=false`
- `startGame()` — set `running=true`, record `startTime`
- `stopGame()` — set `running=false`, return `{ score, roundsPlayed, duration }`
- `generateRound(roundNumber)` — returns `{ wedgeCount, displayDurationMs, outlierWedgeIndex }` using difficulty formula; `outlierWedgeIndex` is random within `[0, wedgeCount)`
- `checkAnswer(clickedWedge, outlierWedge)` — returns boolean
- `calculateWedgeIndex(clickX, clickY, centerX, centerY, radius, wedgeCount)` — uses `Math.atan2` + angle normalization; returns wedge index (0-based) or `-1` if outside circle
- `addScore()`, `getScore()`, `getRoundsPlayed()`, `getCurrentDifficulty()`, `isRunning()`

**Difficulty formula:**

- Start: 6 wedges, 2000ms
- Every 3 correct answers: +2 wedges (max 14), −200ms (floor 500ms)

### Prompt 4 — Write `tests/game.test.js`

100% function coverage. Cover:

- `initGame` resets all state
- `startGame` / `stopGame` state transitions and returned shape
- `generateRound` at round numbers 0, 3, 6, 30 — verify wedgeCount and displayDurationMs (including caps/floors)
- `generateRound` outlierWedgeIndex always within `[0, wedgeCount)`
- `checkAnswer` correct, incorrect, boundary cases
- `calculateWedgeIndex` — click in each wedge, click outside radius (returns -1), center click
- Score and round counting

---

## Phase 3 — Interface

### Prompt 5 — Create `interface.html`

WCAG-AA HTML fragment (no `<html>`, `<head>`, `<body>` tags). Contents:

- `<section class="fast-piggie">` with `<h2>Fast Piggie</h2>`
- `<div class="fp-stats" aria-live="polite">` — round counter + score display
- `<canvas id="fp-canvas" tabindex="0" role="img" aria-label="Game board — click the wedge where the different guinea pig appeared">`
- `<div role="status" aria-live="assertive" class="fp-feedback sr-only">` — screen reader feedback
- `<div class="fp-controls">` with:
  - `<button id="fp-continue-btn" class="fp-btn" hidden>Continue</button>`
  - `<button id="fp-stop-btn" class="fp-btn">End Game</button>`

### Prompt 6 — Create `style.css`

Scoped to `.fast-piggie` and `fp-` prefixes:

- Flex column layout, centered canvas
- Canvas visual styling (border, background)
- `.fp-flash-correct` and `.fp-flash-wrong` keyframe animations for full-section overlay
- WCAG AA contrast for all text (≥4.5:1)
- `focus-visible` styles on canvas and buttons
- `hidden` attribute respected (no CSS override)

---

## Phase 4 — Canvas Rendering & Audio

### Prompt 7 — Canvas rendering helpers in `index.js`

- `loadImages(commonSrc, outlierSrc)` → `Promise<[HTMLImageElement, HTMLImageElement]>`
- `drawBoard(ctx, width, height, wedgeCount, images, outlierIndex, showImages)` — draw N equal wedge sectors; place scaled image in each wedge's center area; wedge 0 starts at top (−π/2), proceeds clockwise
- `clearImages(ctx, width, height, wedgeCount)` — redraw wedge outlines only (no images)
- `highlightWedge(ctx, width, height, wedgeIndex, wedgeCount, color)` — fill wedge with semi-transparent color to indicate selection

### Prompt 8 — Web Audio API sounds in `index.js`

- `createAudioContext()` → `AudioContext` (lazy, first call only)
- `playSuccessSound(audioCtx)` — two ascending tones (440Hz → 660Hz, ~0.15s each)
- `playFailureSound(audioCtx)` — two descending tones (330Hz → 220Hz, ~0.15s each)
- Both use `OscillatorNode` → `GainNode` → `audioCtx.destination` with gentle envelope (ramp gain up/down to avoid clicks)

---

## Phase 5 — Plugin API & Game Loop

### Prompt 9 — Implement full plugin in `index.js`

Exported default object: `{ name, init, start, stop, reset }`

- **`init(container)`** — inject `interface.html` content via `innerHTML`; cache DOM refs (canvas, ctx, continueBtn, stopBtn, statsEl, feedbackEl); preload images; bind canvas click → `handleClick()`; bind continueBtn click → `runRound()`; bind stopBtn click → `stop()`
- **`start()`** — `game.startGame()`, `updateStats()`, `runRound()`
- **`stop()`** — `const result = game.stopGame()`; display final score in feedbackEl; hide canvas, continueBtn, stopBtn; return `result`
- **`reset()`** — `game.initGame()`; clear canvas; show stopBtn, hide continueBtn; reset statsEl; return to ready state
- **`runRound()`** — `game.generateRound(game.getRoundsPlayed())` → `drawBoard(...)` with images → after `displayDurationMs`: `clearImages(...)`, enable clicks; store `currentRound` for use in `handleClick`
- **`handleClick(event)`**:
  - If clicks disabled, return
  - Compute `rect = canvas.getBoundingClientRect()`
  - `wedge = game.calculateWedgeIndex(clientX - rect.left, clientY - rect.top, cx, cy, r, wedgeCount)`
  - If `wedge === -1`, ignore (outside circle)
  - Disable further clicks
  - `correct = game.checkAnswer(wedge, currentRound.outlierWedgeIndex)`
  - Correct: `game.addScore()`, highlight correct wedge green, `playSuccessSound`, flash `.fp-flash-correct`
  - Wrong: highlight clicked wedge red, highlight correct wedge yellow (reveal), `playFailureSound`, flash `.fp-flash-wrong`
  - Announce result in `feedbackEl` (aria-live assertive)
  - Show continueBtn; `updateStats()`

---

## Phase 6 — Integration Tests

### Prompt 10 — Write `tests/index.test.js`

- Mock `game.js` module entirely
- Stub `canvas.getContext` to return a minimal 2D context object
- Mock `Image` with `onload` trigger
- Mock `AudioContext` and its node chain
- Cover:
  - Plugin contract: default export has `{ name, init, start, stop, reset }`
  - `init` inserts DOM and binds events
  - `start` calls `game.startGame` and starts the round
  - `stop` calls `game.stopGame` and returns the result object
  - `reset` calls `game.initGame` and restores UI state
  - `handleClick` correct branch: score incremented, green flash applied, success sound called
  - `handleClick` incorrect branch: red flash applied, failure sound called, correct wedge revealed
  - Clicks outside the circle radius are ignored
  - `feedbackEl` aria-live content updated after each click

---

## Phase 7 — Progress Integration & Final Review

### Prompt 11 — Progress integration + final polish

In `stop()`:

- Call `window.api.invoke('progress:load', 'default')` → existing progress
- Merge game stats for id `fast-piggie`: `highScore = Math.max(existing.highScore, newScore)`, `sessionsPlayed++`, `lastPlayed = new Date().toISOString()`
- Call `window.api.invoke('progress:save', 'default', mergedProgress)`
- Guard with `typeof window !== 'undefined' && window.api` for test environment safety

Final verification:

- `npm run lint` — 0 errors, 0 warnings
- `npm test` — all pass, 100% function coverage

---

## Relevant Files

- `app/games/_template/` — Full reference for all plugin files
- `main.js` — `games:load` handler (has bug — see Phase 1)
- `app/interface.js` — Renderer game loader (reads `result.html`)
- `app/preload.js` — IPC allowlist (no changes needed)
- `app/index.html` — CSP (`canvas` + Web Audio API are `'self'`-compatible, no changes needed)

---

## Decisions

| Topic        | Decision                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Images       | Two guinea pig PNGs (`guinea-pig-common.png` / `guinea-pig-outlier.png`); placeholders committed until real assets arrive |
| Click target | Wedge zone only (no extra tolerance padding); `Math.atan2` + radius check                                                 |
| Scoring      | +1 per correct answer                                                                                                     |
| Round flow   | Player presses Continue button to advance                                                                                 |
| Audio        | Web Audio API synthesized tones; no audio files needed                                                                    |
| Difficulty   | Every 3 correct → +2 wedges (cap 14), −200ms (floor 500ms); start: 6 wedges / 2000ms                                      |

---

## Open Questions

1. **Placeholder image format** — Committed minimal PNG files vs. SVG data URIs embedded in JS. SVG data URIs avoid binary files in the repo and are immediately usable; PNGs are easier to swap when real images arrive. Recommendation: SVG data URIs until real images are ready, then swap to real PNG files.

2. **Canvas keyboard accessibility (WCAG 2.1.1)** — A `<canvas>` element is not inherently keyboard-navigable. To meet requirement 2.1.1, the canvas needs custom keyboard handling: tab to canvas, arrow keys to cycle wedge selection, Enter/Space to confirm the selection. Should this be in-scope for Prompt 9, or handled as a separate Phase 8 prompt?

3. **Bug fix approach (Prompt 1)** — The cleanest fix is to read the HTML file in `main.js` and return the content string over IPC. The alternative — renderer uses `fetch()` on the file path — would require adding a custom protocol or relaxing CSP. The IPC approach is recommended and consistent with the existing security model.
