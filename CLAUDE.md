# BrainSpeedExercises

Electron desktop app that delivers brain-speed training games. The player picks a game from a
selection screen, plays it, and their progress is saved locally. Each game is a self-contained
plugin under `app/games/`. See [app/CLAUDE.md](app/CLAUDE.md) for the renderer shell,
components, styles, preload, and progress storage, and [app/games/CLAUDE.md](app/games/CLAUDE.md)
for the plugin contract and the shared services games use.

## General Practices

* Take credit for your work. Make sure you sign all commit comments, commits, issues, and pull request descriptions so it is clear what you created.
* When in doubt commit work into simple clean commits that are easy to review.

## Commands

```bash
npm install
npm start              # launch the app
npm run lint           # ESLint (flat config, eslint.config.js)
npm run lint:fix
npm test               # Jest (runs with --experimental-vm-modules for native ESM)
npm test -- app/games/fast-piggie   # run a subset of tests by path
npm run test:coverage  # enforces the coverage thresholds below
npm run make           # build installers with Electron Forge (forge.config.cjs)
```

Before calling work done, run `npm run lint` and `npm test`. Run `npm audit` before merging.

## Stack

- Electron (see `package.json`), ES Modules everywhere (`"type": "module"`) except
  `app/preload.js` (CommonJS) and `forge.config.cjs`.
- Jest 30 + jsdom. No Babel transform (`transform: {}`), so mock ESM modules with
  `jest.unstable_mockModule(...)` followed by a dynamic `await import(...)`.
- `electron-log` for logging. Progress is a JSON file in `app.getPath('userData')`; no database.
- Dependencies are pinned to major ranges (for example `"^44"`), not exact versions.

## Layout

```
main.js                  Main process: window creation, all ipcMain.handle registrations
app/preload.js           contextBridge: window.api.invoke / window.api.receive with allowlists
app/index.html           Shell page (CSP: default-src 'self')
app/interface.js         Renderer: game selector, game loading, history view, quit handling
app/style.css            Only @imports app/styles/*.css (edit the sub-files, not this one)
app/styles/              variables, base, layout, game-card, history, game-shared
app/components/          Shared renderer services and UI (tests in app/components/tests/)
app/progress/            progressManager.js: load/save/reset of the progress JSON (main process)
app/games/               Game plugins plus registry.js (main-process manifest scanner)
__mocks__/               electron.js and electron-log.js mocks for Jest
scripts/build-icons.js   Icon generation (console output allowed here)
```

## Process boundaries and IPC

The renderer never touches Electron or Node APIs directly. Everything goes through
`window.api`, which `app/preload.js` exposes with channel allowlists.

| Channel            | Kind                    | Purpose                                         |
| ------------------ | ----------------------- | ----------------------------------------------- |
| `games:list`       | invoke                  | Manifests of all valid games                    |
| `games:load`       | invoke                  | `{ manifest, html }` for one game ID            |
| `games:listImages` | invoke                  | Sorted PNG/JPEG names in `app/games/<id>/images/<subfolder>` |
| `progress:load`    | invoke                  | Load a player's progress                        |
| `progress:save`    | invoke                  | Save a player's progress                        |
| `progress:reset`   | invoke                  | Clear a player's progress                       |
| `log:send`         | invoke                  | Forward a renderer log line to `electron-log`   |
| `app:quit-ready`   | invoke                  | Renderer finished saving; main may exit         |
| `app:before-quit`  | receive (main → renderer) | Main asks the renderer to stop the active game  |

To add a channel, register the handler in `main.js` and add the name to the correct allowlist
in `app/preload.js`. Treat renderer payloads as untrusted (see `normalizeRendererLogPayload`
in `main.js`).

Progress file shape:

```json
{
  "playerId": "default",
  "lastUpdated": "ISO-8601",
  "games": { "<game-id>": { "highScore": 0, "sessionsPlayed": 0, "lastPlayed": "ISO-8601" } },
  "tutorials": { "<game-id>": true }
}
```

Per-game records also hold `highestLevel`, `lowestDisplayTime`, `dailyTime`, and game-specific
fields written through the Score Service.

## Code standards

- JSDoc on every file (`@file` header) and every function. US English spelling.
- ESLint rules: `js.configs.recommended` plus `const`/`let` only, single quotes,
  semicolons, trailing commas on multiline, max line length 100.
- `no-console` is an error everywhere except `scripts/`, `forge.config.cjs`, and tests.
  - Main-process files: `import log from 'electron-log'`.
  - Renderer files: `import { logger } from '<relative>/components/logService.js'` and call
    `logger.error|warn|info|verbose|debug`. Never call `window.api.invoke('log:send', ...)`
    directly.
- Prefer small helpers over repeated blocks. Look at existing code and follow its patterns
  before you add new code. If a pattern is unclear, ask.
- Keep files focused. Past about 1000 lines, split modules out (for example `render.js`). Past
  2000 lines, a file needs splitting.

## Testing

- Every new function needs tests. `jest.config.js` requires **100% function coverage** and 80%
  branches, lines, and statements across `app/**/*.js` (excluding `app/games/_template/`).
- Tests sit next to the code they test (`progressManager.test.js`), in `app/components/tests/`,
  or in `app/games/<id>/tests/`.
- Default environment is jsdom. Use `/** @jest-environment node */` for main-process modules and
  mock `electron-log` with `jest.unstable_mockModule` (see `app/games/registry.test.js`).
- For renderer code, stub `globalThis.window.api.invoke` with `jest.fn()` and assert on the
  channel and payload.

## Accessibility (WCAG 2.2 AA)

All UI must meet WCAG 2.2 AA:

- Contrast of at least 4.5:1 for normal text and 3:1 for large text.
- Everything is keyboard operable, with a logical focus order and a visible focus indicator.
- Headings describe the structure. A control's visible label matches its accessible name.
- Use semantic elements (`<button>`, `<main>`, `<section>`, `<dl>`) before ARIA. Custom
  widgets expose the correct role, state, and value.
- Dynamic results and score changes are announced through `aria-live` regions.

## Security

- `nodeIntegration: false` and `contextIsolation: true`. Keep both.
- No `eval` or `new Function` in the renderer. Keep the CSP in `app/index.html` at
  `default-src 'self'`.
- Every new IPC channel must be added to the allowlist in `app/preload.js`.
