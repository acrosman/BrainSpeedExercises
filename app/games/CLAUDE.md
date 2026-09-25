# Game plugins

Each subdirectory is one self-contained game, and each has its own `CLAUDE.md` for details
specific to that game. Directories starting with `_` (for example `_template/`) are skipped by
the registry. Start new games by copying `_template/`.

## How a game gets loaded

1. `registry.js` (main process) runs `scanGamesDirectory`. It reads every `<id>/manifest.json`
   and skips entries that are missing required fields.
2. When the player picks a game, `games:load` returns `{ manifest, html }`, where `html` is the
   raw `interface.html`.
3. `app/interface.js` injects the HTML into the game container, adds `<id>/style.css`, imports
   `./games/<id>/<entryPoint>`, and calls **only `init(container)`**. The game starts itself when
   the player presses its Start button.
4. On `app:before-quit`, the shell calls `stop()` on the active plugin. `stop()` can therefore
   run when no session is in progress. Every `game.stopGame()` throws if the game is not
   running, so `index.js` checks `game.isRunning()` first and builds an idle result instead.
   It also avoids saving an empty session (`sound-sweep` and `directional-processing` only
   save when `trialsCompleted > 0`).
5. To leave a game, call `returnToMainMenu()` from `../../components/gameUtils.js`. It
   dispatches `bsx:return-to-main-menu` on `window`. The shell then refreshes the game cards
   with the new scores.

## Required files

```
<id>/
├── manifest.json     id, name, description, version, entryPoint, thumbnail, author
├── index.js          Controller: DOM wiring, timers, events. Default export is the plugin API
├── game.js           Game state and rules. No DOM access
├── interface.html    HTML fragment (no <html>/<body>); root is a <section>
├── style.css         Styles for this game only. Prefix every class with a short game prefix
├── images/           thumbnail + stimuli
└── tests/            game.test.js, index.test.js (+ one test file per extra module)
```

`manifest.id` must match the directory name and every `GAME_ID` / `saveScore` ID in the code.
Paths to images at runtime are relative to `app/index.html`, for example
`games/<id>/images/foo.png`.

Plugin API (default export of `index.js`): `{ name, init, start, stop, reset }`.
`stop()` returns the result object. `reset()` returns to the welcome state without reloading the
HTML.

## Common game conventions

- **game.js holds the rules.** It keeps module-level state, which `initGame()` resets.
  `startGame()` and `stopGame()` bracket a session, and `stopGame()` returns the result object.
  Getters (`getScore`, `getLevel`, `getSpeedHistory`, and so on) expose state. `index.js` never
  changes game state directly.
- **Adaptive difficulty** uses `updateAdaptiveDifficultyState` from
  `components/adaptiveDifficultyService.js`. The house rule is 3 correct in a row makes the game
  one step harder, and 3 wrong in a row makes it two steps easier. The function handles only the
  counters and clamping. The caller decides what "value" means (level index, milliseconds, and
  so on) and the sign of `harderStep` and `easierStep`.
- **Speed history.** Each game pushes its speed metric to a `speedHistory` array after each
  trial. `index.js` renders it with `renderTrendChart({ lineEl, emptyEl, latestEl }, history,
  current)` from `components/trendChartService.js`, using the shared `.game-trend` markup.
- **Session timing.** Call `timerService.startTimer(onTick)` in `start()`. In `stop()`,
  `timerService.stopTimer()` returns `sessionDurationMs`. Show elapsed time with
  `formatDuration`.
- **Audio.** Use `components/audioService.js` (`playSuccessSound`, `playFailureSound`,
  `playFeedbackSound(bool)`, and so on). Never create an `AudioContext` inside a game.
- **Saving.** Call `saveScore(gameId, result, extraFields?)` from
  `components/scoreService.js` inside `stop()`. Never call `progress:save` directly.
  - Standard fields are merged for you: `score` → `highScore` (max), `sessionDurationMs` →
    `dailyTime[today]` (sum), `level` → `highestLevel` (max), and `lowestDisplayTime` (min).
    `sessionsPlayed` and `lastPlayed` are always updated.
  - For fields that only this game stores, pass `extraFields` as `(prevRecord) => ({ ... })`
    when the value must be merged with the old one, or as a plain object to overwrite.
  - `saveScore` resolves to the updated record, or `null` on failure.
- **Precise stimulus timing.** Games that flash stimuli for tens of milliseconds
  (`directional-processing`, `field-of-view`, `object-track`) drive them with
  `requestAnimationFrame` and `performance.now()`, not `setTimeout`. Cancel every rAF handle
  and timeout in `stop()` and `reset()`.
- **Keyboard handlers on `document`** stay attached after the player leaves the game. The shell
  only replaces the container's HTML, and the module stays cached. Handlers must therefore do
  nothing (and must not call `preventDefault()`) unless `game.isRunning()` is true. Remove the
  handler before adding it in `init()`, or detach it on stop (`card-rat`). Call
  `preventDefault()` only on the keys the game uses, and only while a session runs.
- **Images discovered at runtime.** To use whatever files are in an image subfolder, call
  `window.api.invoke('games:listImages', { gameId, subfolder })`. Always have a fallback for an
  empty list.

## Tutorials (optional)

`components/tutorialService.js` shows a multi-step overlay. Whether the player has seen it is
stored under `progress.tutorials[gameId]`.

- Steps are `{ title, content }`, where `content` is an HTML string.
- `loadTutorialSteps(definitions)` builds steps from `{ title, contentPath }` definitions whose
  content is an HTML fragment file. It caches each file and shows fallback text if one fails
  to load (`clearTutorialMarkupCache()` resets the cache in tests).
- `showTutorialIfNeeded(gameId, steps, container, onComplete)` shows the overlay only the first
  time. Otherwise it calls `onComplete` immediately. `showTutorial(...)` always shows it, which
  suits a "How to play" replay button.
- Overlay styles live in `.tutorial-overlay*` in `app/styles/game-shared.css`. Do not restyle
  them per game.

`card-rat`, `directional-processing`, and `fast-piggie` use a tutorial. Copy their pattern: step
HTML files in `<id>/tutorial/` plus a `tutorial.js` whose `getTutorialSteps()` passes their
definitions to `loadTutorialSteps`, an annotated
`images/tutorialScreenshot.png`, a "Replay Tutorial" button on the welcome panel, and an async
`start()` that loads the steps and calls `showTutorialIfNeeded` with a function that begins the
session. Guard against a second launch while one is loading or an overlay is open.

## Shared screen markup

Shared classes are defined in `app/styles/game-shared.css`. Do not duplicate them in a game's
`style.css`, and do not put game-specific classes on the shared buttons.

- The `<h2>` game title sits directly in the `<section>`, outside the panels.
- **Welcome panel** `.game-welcome`: starts with `<h3>How to Play</h3>`, then one sentence
  stating the goal, then a `<ul>` or `<ol>` of steps. Do not mention implementation details such
  as asset file names. The Start button is `game-btn game-btn--primary`.
- **In-game "End Game" button:** `game-btn game-btn--secondary`.
- **End panel** `.game-end-panel` with `<h2>Session Ended</h2>`. Results go in
  `<dl class="game-results">`, one `<div class="game-results__row">` per result, containing
  `<dt class="game-results__label">` and `<dd class="game-results__value" id="...">`.
  `index.js` fills each `<dd>` with `textContent`. Put the buttons in
  `.game-end-panel__actions`: "Play Again" is `game-btn--primary` and "Return to Menu" is
  `game-btn--secondary`.
- Feedback and score changes go to an `aria-live="polite"` region. Most games have an
  `announce(message)` helper that writes to it.

## Testing games

- `tests/game.test.js` covers every export of `game.js`. Use `jest.useFakeTimers()` for timed
  logic and mock `Math.random` where layouts are random.
- `tests/index.test.js` imports the plugin after mocking its imported services with
  `jest.unstable_mockModule` (at least `scoreService`, `audioService`, and `timerService`).
  Build the DOM from the real `interface.html`, or a minimal copy of it, and call `init`.
  Assert on DOM state, `saveScore` calls, and the lifecycle (`start` → `stop` → `reset`).
- Stub `requestAnimationFrame`, `performance.now`, and canvas `getContext` in jsdom when a
  game needs them.
- `_template/` is excluded from coverage. Every other game counts toward the 100%
  function-coverage requirement.
