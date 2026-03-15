You are building the game plugin system for an Electron app called
BrainSpeedExercises. The app uses ES Modules, ESLint (Airbnb-base), and Jest
with 100% function coverage. Games are isolated plugins loaded dynamically.

## Files to create or update

### 1. app/games/registry.js — Main-process module
- Export `async function scanGamesDirectory(gamesPath)`:
  - Reads all sub-directories of `gamesPath`.
  - For each sub-directory, reads and JSON-parses `manifest.json`.
  - Returns an array of validated manifest objects.
  - Skips (with a console.warn) any entry whose manifest is missing
    required fields (`id`, `name`, `description`, `entryPoint`).
  - Rejects if `gamesPath` does not exist.
- Export `async function loadGame(gamesPath, gameId)`:
  - Finds the manifest whose `id` matches `gameId`.
  - Dynamically imports the game's entry-point module.
  - Returns `{ manifest, plugin }` where `plugin` is the module's
    default export.
  - Rejects with a descriptive error if the game ID is not found.

### 2. app/games/registry.test.js — Jest tests
- Mock `fs/promises` and dynamic `import()`.
- Test `scanGamesDirectory`: returns manifests for valid games, skips
  invalid manifests with a warning, rejects when directory missing.
- Test `loadGame`: returns plugin for known ID, rejects for unknown ID.
- Achieve 100% function coverage.

### 3. app/games/_template/ — Starter template for new games
Not loaded at runtime; serves as documentation and scaffold.

- `manifest.json` — filled with placeholder values and inline comments
  explaining each field.
- `index.js` — exports `{ name, init, start, stop, reset }`:
  - `init(container)` — receives the DOM element to render into; sets up
    the game but does not start timers.
  - `start()` — starts the game loop / timers.
  - `stop()` — pauses or ends the game; returns a result object.
  - `reset()` — returns the game to its initial state.
- `game.js` — pure game-logic module (no DOM access; easily unit-tested).
- `interface.html` — HTML fragment (no `<html>`, `<head>`, or `<body>`
  tags) that will be injected into `#game-container`.
- `style.css` — scoped styles; prefix all selectors with a game-specific
  class (e.g. `.game-template`).
- `images/thumb.png` — placeholder thumbnail (any 200×140 image).
- `tests/game.test.js` — Jest tests for `game.js` (100% function coverage).
- `tests/index.test.js` — Jest tests for the plugin lifecycle.

### 4. main.js (update) — Add IPC handlers
- `ipcMain.handle('games:list', async () => scanGamesDirectory(...))` —
  returns the array of manifests.
- `ipcMain.handle('games:load', async (event, gameId) => loadGame(...))` —
  returns the manifest; the HTML fragment is loaded by the renderer
  using a `file://` URL constructed from the app path.

### 5. app/preload.js (update)
- Add `'games:list'` and `'games:load'` to the `invoke` allowlist.

## Plugin contract
Every game module's default export must implement exactly:
```js
export default {
  name: 'string',
  init(container) {},   // returns void
  start() {},           // returns void
  stop() {},            // returns { score, duration } or similar
  reset() {},           // returns void
};
```

## Constraints
- Never use `require()` — ES Modules only.
- Games must not import from each other.
- Game code must never call `ipcRenderer` directly — all communication
  goes through `window.api`.
- Match Airbnb ESLint rules.
