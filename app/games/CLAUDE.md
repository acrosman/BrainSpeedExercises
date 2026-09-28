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
4. On `app:before-quit`, the shell calls `stop()` on the active plugin, so `stop()` can run
   when no session is in progress. `game.stopGame()` throws if the game is not running, so
   `index.js` checks `game.isRunning()` first, returns an idle result, and saves nothing.
   Games that count trials also skip saving when `trialsCompleted` is 0.
5. To leave a game, call `returnToMainMenu()` from `../../components/gameUtils.js`. It
   dispatches `bsx:return-to-main-menu` on `window`. The shell then refreshes the game cards
   with the new scores.

## Required files

```
<id>/
├── manifest.json     id, name, description, version, entryPoint, thumbnail, author
├── index.js          Controller: DOM wiring, timers, events. Default export is the plugin API
├── game.js           Game state and rules, plus GAME_ID from the manifest. No DOM access
├── interface.html    HTML fragment (no <html>/<body>); root is a <section>
├── style.css         Styles for this game only. Prefix every class with a short game prefix
├── images/           thumbnail + stimuli
└── tests/            game.test.js, index.test.js (+ one test file per extra module)
```

`manifest.id` must match the directory name. It is the only place a game's ID is written.
`game.js` reads it and exports it as `GAME_ID`:

```js
import manifest from './manifest.json' with { type: 'json' };

/** Game ID, read from manifest.json, used for saved progress and the tutorial flag. */
export const GAME_ID = manifest.id;
```

Every `saveScore`, `loadGameScore`, `games:listImages`, and tutorial `gameId` uses
`game.GAME_ID`. Never write the ID as a string literal in game code. `tests/game.test.js`
checks that `GAME_ID` equals `manifest.id`. Tests that mock `game.js` supply `GAME_ID` in the
mock.

Paths to images at runtime are relative to `app/index.html`, for example
`games/<id>/images/foo.png`.

Plugin API (default export of `index.js`): `{ name, init, start, stop, reset }`.
`stop()` returns the result object. `reset()` returns to the welcome state without reloading the
HTML.

## Common game conventions

Games use the shared services in `app/components/`. Their APIs are in
[../components/CLAUDE.md](../components/CLAUDE.md).

- **game.js holds the rules.** It keeps module-level state, which `initGame()` resets.
  `startGame()` and `stopGame()` bracket a session, and `stopGame()` returns the result object.
  Getters (`getScore`, `getLevel`, `getSpeedHistory`, and so on) expose state. `index.js` never
  changes game state directly.
- **Adaptive difficulty:** `updateAdaptiveDifficultyState` from `adaptiveDifficultyService.js`.
  The house rule is 3 correct in a row → one step harder, 3 wrong in a row → two steps easier.
  Change difficulty by editing the game's level table or formula, not with special cases.
- **Speed history:** push the game's speed metric to a `speedHistory` array after each trial,
  and draw it with `renderTrendChart` in the shared `.game-trend` markup.
- **Session timing:** `startTimer(onTick)` in `start()`; `stopTimer()` in `stop()` gives
  `sessionDurationMs`.
- **Audio:** only through `audioService.js`. Never create an `AudioContext` in a game.
- **Saving:** `saveScore(game.GAME_ID, result, extraFields?)` in `stop()`. Never call
  `progress:save` directly. Record in the game's `CLAUDE.md` which fields it saves.
- **Precise stimulus timing:** stimuli shown for tens of milliseconds are driven with
  `requestAnimationFrame` and `performance.now()`, not `setTimeout`. Cancel every rAF handle
  and timeout in `stop()` and `reset()`.
- **Keyboard handlers on `document`** outlive the game: the shell only replaces the
  container's HTML, and the module stays cached. A handler must do nothing, and must not call
  `preventDefault()`, unless a session (or practice round) is running. Remove it before adding
  it in `init()`, or attach it on start and detach it on stop. Call `preventDefault()` only for
  the keys the game uses.
- **Images found at runtime:** `window.api.invoke('games:listImages', { gameId, subfolder })`
  lists a subfolder so new images need no code change. Keep a fallback for an empty list.

## Tutorials (optional)

A game's first-run tutorial lives in `<id>/tutorial/` and runs on the shared tutorial
framework. `index.js` only supplies practice controls and calls the launcher. The framework and
the steps to add a tutorial are in [../components/CLAUDE.md](../components/CLAUDE.md). Each
tutorial is documented in `<id>/tutorial/CLAUDE.md`.

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
- Feedback and score changes go to an `aria-live="polite"` region, usually through an
  `announce(message)` helper in `index.js`.

## Testing games

- `tests/game.test.js` covers every export of `game.js`. Use `jest.useFakeTimers()` for timed
  logic and mock `Math.random` where layouts are random.
- `tests/index.test.js` imports the plugin after mocking its imported services with
  `jest.unstable_mockModule` (at least `scoreService`, `audioService`, and `timerService`).
  Build the DOM from the real `interface.html`, or a minimal copy of it, and call `init`.
  Assert on DOM state, `saveScore` calls, and the lifecycle (`start` → `stop` → `reset`).
- Stub `requestAnimationFrame`, `performance.now`, and canvas `getContext` in jsdom when a
  game needs them.
- Every game except `_template/` counts toward the 100% function-coverage requirement.
