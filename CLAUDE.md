# BrainSpeedExercises

Electron desktop app that delivers brain-speed training games. The player picks a game from a
selection screen, plays it, and their progress is saved locally. Each game is a self-contained
plugin under `app/games/`.

Instructions are split across `CLAUDE.md` files, each next to the code it covers:

- [app/CLAUDE.md](app/CLAUDE.md): the renderer shell, styles, preload, and progress storage.
- [app/components/CLAUDE.md](app/components/CLAUDE.md): every shared component and the
  tutorial framework.
- [app/games/CLAUDE.md](app/games/CLAUDE.md): the plugin contract and conventions every game
  follows.
- `app/games/<id>/CLAUDE.md` and `app/games/<id>/tutorial/CLAUDE.md`: one game, or its tutorial.

## General Practices

- Sign every commit, issue, issue comment, and pull request description you write, so it is
  clear what you created.
- Prefer small, focused commits that are easy to review.
- `CLAUDE.md` files describe how the code works and how to write it. Put each fact in the most
  specific file that covers it; a detail about one game goes in that game's file, not a general
  one. Update the matching `CLAUDE.md` when you change the code it describes.
- Record bugs, gaps, and follow-ups as GitHub issues on `acrosman/BrainSpeedExercises`, never
  as "known issue" notes in a `CLAUDE.md`. Search for an existing issue first.

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

After any change to `package.json` or `package-lock.json`, run `rm -rf node_modules && npm ci`
before committing. CI installs with `npm ci`, which fails when the lockfile is out of sync, even
if lint and tests pass against the existing `node_modules`.

### Driving the app from a script

To check a change in the running app (for example with Playwright's `_electron`, installed
outside the project):

- Unset `ELECTRON_RUN_AS_NODE` (`env -u ELECTRON_RUN_AS_NODE ...`). VS Code sets it, and it
  makes Electron run as plain Node, which fails with `bad option: --remote-debugging-port`.
- Launch the binary from `node -p "require('electron')"` with the project directory and
  `--user-data-dir=<temp dir>`, so progress is written there and not over the player's real
  saves. Confirm with `app.evaluate(({ app }) => app.getPath('userData'))` before playing.
- Open a game by clicking the `.game-card` whose text contains the game's name.

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
app/index.html           Shell page and its CSP
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
  `default-src 'self'; script-src 'self'`.
- Every new IPC channel must be added to the allowlist in `app/preload.js`.
