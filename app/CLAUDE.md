# app/

The renderer shell, shared components, styles, and the preload and progress modules. Everything
here except `preload.js` and `progress/` runs in the renderer. Game plugins are documented in
[games/CLAUDE.md](games/CLAUDE.md).

## Shell page (`index.html`)

Static structure that `interface.js` wires up by ID:

- A "Skip to games" link targeting `#game-selector`. Any rebuilt selector must keep that ID.
- `<header>`, `<nav aria-label="Game selection">`, and `<footer>`.
- `<main id="game-container">`: holds `<section id="game-selector">` on the menu. While a game
  is running, it holds the game's HTML instead.
- `#play-time-bar`: today's total play time and the `#view-history-btn` button. It is hidden
  while a game is running.
- `#history-panel`: the History modal. It contains `#history-panel-body`, which is rebuilt on
  every open, the close button, and the Clear History confirmation zone
  (`#clear-history-confirm`).

The CSP meta tag is `default-src 'self'; script-src 'self'`, so no inline scripts or styles can
be injected. Build DOM nodes instead, as `gameCard.js` and `historyView.js` do.

## Renderer shell (`interface.js`)

On `DOMContentLoaded` it:

1. Creates a shared `sr-only` `aria-live` announcer used for shell-level messages.
2. Registers the `app:before-quit` handler. It awaits `activePlugin.stop()`, then invokes
   `app:quit-ready`.
3. Loads progress for the `'default'` player and the game manifests, and renders one
   `createGameCard` per manifest.
4. Listens for `game:select` (dispatched by a game card). It removes the selector, hides the
   play-time bar, and loads the game (`loadAndInitGame`).
5. Listens for `bsx:return-to-main-menu`. It clears the container, removes the game's
   stylesheet (`#active-game-stylesheet`), rebuilds `#game-selector` **inside
   `#game-container`**, reloads progress and manifests, and refreshes the cards, play-time bar,
   and History button handler.

When you change the menu, remember that the selector is created twice: once from
`index.html` and again in the return-to-menu handler. Both paths must end up identical,
including the `game:select` listener.

Keep `interface.js` limited to connecting pieces together. Put rendering in `components/`.

## Components (`components/`)

Each module is plain functions plus module state, with no classes. Tests live in
`components/tests/`.

| Module | Used by | Role |
| --- | --- | --- |
| `gameCard.js` | shell | `createGameCard(manifest, progress)` builds an `<article>` that dispatches `game:select`. It shows high score, level (+1), minimum display time, and time played today |
| `historyView.js` | shell | `buildHistoryPanel(progress, manifests)`: a total play-time chart, a per-game bar chart (with a "show older days" toggle after `INITIAL_VISIBLE_DAYS`), and a data table |
| `scoreService.js` | games, shell | Save and load game results; `clearHistory()` backs the Clear History button |
| `timerService.js` | games, cards | Session timer, plus `formatDuration` and `getTodayDateString` (the `dailyTime` key) |
| `logService.js` | everything | `logger.*`, which sends log lines to the main process |
| `tutorialService.js` | games | Tutorial slides, the seen flag, and `runGuidedTutorial` (slides, then live practice rounds) |
| `tutorialCoach.js` | tutorialService | Practice-round coach banner, round prompt, and target marker |
| `audioService.js` | games | One shared `AudioContext` and all sound effects, including sweep synthesis |
| `adaptiveDifficultyService.js` | games | Staircase counter math |
| `trendChartService.js` | games | In-game SVG trend line |
| `gameUtils.js` | games | `returnToMainMenu()` |

How games use these services is covered in [games/CLAUDE.md](games/CLAUDE.md). When a behavior
is needed by more than one game, add it here as a service rather than copying it between games.

Components must not call Electron or Node APIs. Anything persistent goes through
`window.api.invoke`, usually via `scoreService`. Each component should also check for a missing
`window.api` so it can be tested in jsdom.

## Modal pattern (History panel)

`openHistoryPanel` rebuilds the panel body and then shows it. It sets `inert` and
`aria-hidden="true"` on every other `body > *`, and moves focus to the close button.
`closeHistoryPanel` reverses both. The panel closes on the close button, a backdrop click, or
Escape. Clear History first shows an inline confirmation; confirming it clears the data and then
fires `bsx:return-to-main-menu` so the menu rebuilds. Build any new modal the same way.

## Styles (`style.css`, `styles/`)

`style.css` only `@import`s the sub-files, in this order: `variables` → `base` → `layout` →
`game-card` → `history` → `game-shared`.

| File | Contents |
| --- | --- |
| `variables.css` | All design tokens: backgrounds, text, borders, focus ring, buttons, status colors, results table, trend chart, tutorial marker, radii, transitions, and chart colors |
| `base.css` | Reset, body defaults, `.sr-only`, global focus ring |
| `layout.css` | Header, nav, main, footer, game-selector grid |
| `game-card.css` | Game tiles and the play-time bar |
| `history.css` | History modal, charts, table |
| `game-shared.css` | Shared game panels, buttons, trend chart, tutorial overlay, practice coach and marker |

- Use `var(--token)` instead of hard-coded colors, radii, or transitions. When you add a token
  to `variables.css`, record its contrast ratio in a comment, as the text tokens do. All
  pairings must meet WCAG AA.
- History chart series use `--chart-color-0` through `--chart-color-9`, applied through
  `history-chart__bar--color-N` classes. Games beyond ten reuse the colors from the start.
  To add slots, change the CSS and `COLOR_SLOT_COUNT` in `historyView.js` together.
- Game-specific styles belong in the game's own `style.css`. The shell adds it when the game
  loads and removes it when the player leaves.

## Preload (`preload.js`)

This is a CommonJS module. It exposes exactly two functions:

- `window.api.invoke(channel, data)`: rejects with `Blocked IPC channel` if the channel is not in
  its allowlist.
- `window.api.receive(channel, cb)`: registers a one-time `ipcRenderer.once` listener, and
  silently ignores channels that are not in its receive allowlist.

Do not expose anything else on `window.api`.

## Progress persistence (`progress/progressManager.js`)

This runs in the main process only. It is reached through the `progress:*` IPC handlers.

- Each player's file is `<userData>/<playerId>.json`. `validatePlayerId` rejects empty IDs and
  any ID containing `..`, `/`, or `\`. Keep that check on every entry point.
- `loadProgress` returns a default `{ playerId, lastUpdated, games: {} }` when the file does not
  exist, and **throws** on corrupt JSON. The shell treats a failed load as empty progress.
- `saveProgress` stamps `lastUpdated`, writes `<file>.tmp`, and renames it over the old file so
  a crash cannot leave a half-written file. Keep writes atomic.
- `resetProgress` deletes the file and does not treat a missing file as an error.
