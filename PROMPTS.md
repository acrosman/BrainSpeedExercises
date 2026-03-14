# BrainSpeedExercises — AI / Copilot Prompts

Use these prompts with GitHub Copilot Chat, Copilot Workspace, or any LLM-assisted coding tool to build each major feature of the project. Each prompt is self-contained — it includes the context the AI needs to produce output consistent with the architecture described in `INSTRUCTIONS.md`.

---

## Prompt 1 — Initial Interface Setup

```
You are building the renderer-process UI for an Electron desktop app called
BrainSpeedExercises. The app lets players choose a brain-speed training game
from a central selection screen and then play it. The project uses ES Modules
("type": "module" in package.json), ESLint (Airbnb-base rules), Jest for
100% function-coverage testing, and must meet WCAG 2.2 Level AA.

### Files to create or update

1. **app/index.html** — Shell HTML for the Electron BrowserWindow.
   - Include `<meta charset="UTF-8">`.
   - Include a strict Content-Security-Policy meta tag:
     `default-src 'self'; script-src 'self'`
   - Use semantic elements: `<header>`, `<main id="game-container">`,
     `<nav aria-label="Game selection">`, `<footer>`.
   - Provide a `<section id="game-selector" aria-label="Available games">`
     inside `<main>` for the initial game grid.
   - Include a skip-navigation link (`<a href="#game-selector" class="skip-link">
     Skip to games</a>`) as the first element in `<body>`.
   - Load `./interface.js` as a module script.
   - Load `./style.css` as a stylesheet.

2. **app/style.css** — App-level stylesheet.
   - Style the skip-navigation link so it is visible on focus but off-screen
     otherwise.
   - Provide a responsive CSS Grid layout for the game-selector section
     (auto-fill columns, min 240 px).
   - Set a colour scheme with at least 4.5:1 contrast ratio for body text.
   - Include visible :focus-visible outlines on all interactive elements.

3. **app/components/gameCard.js** — Pure function that returns an HTMLElement.
   - Signature: `export function createGameCard(manifest) { ... }`
   - `manifest` shape: `{ id, name, description, thumbnail }`.
   - Returns a `<article>` element with a focusable `<button>` that emits a
     custom DOM event `game:select` with `detail: { gameId: manifest.id }`.
   - Include an `<img>` with a non-empty `alt` attribute derived from the
     game name.
   - All text must be inside elements with sufficient contrast.

4. **app/interface.js** — Renderer-process entry module.
   - On DOMContentLoaded, call `window.api.invoke('games:list')` to get the
     list of game manifests.
   - For each manifest, call `createGameCard(manifest)` and append the result
     to `#game-selector`.
   - Listen for the `game:select` custom event on `#game-selector` (event
     delegation).
   - When a game is selected, call `window.api.invoke('games:load', gameId)`,
     clear `#game-selector`, inject the returned HTML fragment into
     `#game-container`, and announce the loaded game name to screen readers
     via an `aria-live="polite"` region.

5. **app/components/gameCard.test.js** — Jest unit tests for `createGameCard`.
   - Mock `document` using jsdom (Jest default environment).
   - Test: renders an `<article>` element.
   - Test: button fires `game:select` with correct `detail.gameId`.
   - Test: `<img>` has a non-empty `alt` attribute.
   - Test: throws (or returns null) when `manifest` is missing required fields.
   - Achieve 100% function coverage on `gameCard.js`.

### Constraints
- No third-party UI frameworks (no React, Vue, etc.).
- No inline event handlers in HTML (`onclick="..."`).
- Use `const`/`let`, never `var`.
- Single quotes, trailing commas, semicolons — match Airbnb ESLint rules.
- All interactive elements must have a visible label accessible to screen
  readers.
```

---

## Prompt 2 — Save Progress Framework

```
You are adding a progress-persistence subsystem to an Electron app called
BrainSpeedExercises. The app uses ES Modules, ESLint (Airbnb-base), and Jest
with 100% function coverage. The renderer communicates with the main process
exclusively via the contextBridge IPC API defined in app/preload.js.

### Files to create or update

1. **app/progress/progressManager.js** — Main-process module (Node.js only).
   - Import `fs/promises` and `path` from Node core; import
     `app` from `electron`.
   - Export three async functions:
     - `loadProgress(playerId)` — reads
       `<userData>/<playerId>.json`; returns a default ProgressData object
       if the file does not exist.
     - `saveProgress(playerId, data)` — writes the JSON file atomically
       (write to a `.tmp` file, then rename).
     - `resetProgress(playerId)` — deletes the player's JSON file if it
       exists; resolves without error if it does not.
   - ProgressData shape:
     ```json
     {
       "playerId": "string",
       "lastUpdated": "ISO-8601 timestamp",
       "games": {
         "<game-id>": {
           "highScore": 0,
           "sessionsPlayed": 0,
           "lastPlayed": "ISO-8601 timestamp"
         }
       }
     }
     ```
   - Validate `playerId` — reject with a descriptive Error if it is empty,
     not a string, or contains path-traversal characters (`..`, `/`, `\`).

2. **app/progress/progressManager.test.js** — Jest tests.
   - Mock `fs/promises` and `electron` (use `__mocks__/electron.js`).
   - Test `loadProgress`: returns default object when file missing (ENOENT),
     returns parsed data when file exists, rejects on corrupt JSON.
   - Test `saveProgress`: calls `writeFile` on `.tmp` path then `rename`,
     sets `lastUpdated` to current ISO timestamp.
   - Test `resetProgress`: calls `unlink`, resolves silently when file
     missing (ENOENT), rejects on other fs errors.
   - Test input validation: rejects for empty string, non-string, and
     path-traversal values.
   - Achieve 100% function coverage.

3. **main.js** (update) — Register IPC handlers.
   - Add `ipcMain.handle('progress:save', async (event, { playerId, data }) => ...)`
   - Add `ipcMain.handle('progress:load', async (event, { playerId }) => ...)`
   - Add `ipcMain.handle('progress:reset', async (event, { playerId }) => ...)`
   - Import progressManager functions at the top of the file.

4. **app/preload.js** (update) — Add new channels to the allowlist.
   - Add `'progress:save'`, `'progress:load'`, `'progress:reset'` to the
     `invoke` channel allowlist (switch from `send`/`receive` to
     `ipcRenderer.invoke` for two-way communication).

### Constraints
- Never write files outside `app.getPath('userData')`.
- Do not expose the file-system path to the renderer.
- Use `const`/`let`, never `var`.
- Match Airbnb ESLint rules.
```

---

## Prompt 3 — Game Plugin Architecture

```
You are building the game plugin system for an Electron app called
BrainSpeedExercises. The app uses ES Modules, ESLint (Airbnb-base), and Jest
with 100% function coverage. Games are isolated plugins loaded dynamically.

### Files to create or update

1. **app/games/registry.js** — Main-process module.
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

2. **app/games/registry.test.js** — Jest tests.
   - Mock `fs/promises` and dynamic `import()`.
   - Test `scanGamesDirectory`: returns manifests for valid games, skips
     invalid manifests with a warning, rejects when directory missing.
   - Test `loadGame`: returns plugin for known ID, rejects for unknown ID.
   - Achieve 100% function coverage.

3. **app/games/_template/** — Starter template for new games (not loaded at
   runtime; serves as documentation and scaffold).
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
   - `tests/game.test.js` — Jest tests for `game.js` (100% function
     coverage).
   - `tests/index.test.js` — Jest tests for the plugin lifecycle.

4. **main.js** (update) — Add IPC handlers.
   - `ipcMain.handle('games:list', async () => scanGamesDirectory(...))` —
     returns the array of manifests.
   - `ipcMain.handle('games:load', async (event, gameId) => loadGame(...))`
     — returns the manifest; the HTML fragment is loaded by the renderer
     using a `file://` URL constructed from the app path.

5. **app/preload.js** (update) — Add `'games:list'` and `'games:load'` to
   the `invoke` allowlist.

### Plugin contract
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

### Constraints
- Never use `require()` — ES Modules only.
- Games must not import from each other.
- Game code must never call `ipcRenderer` directly — all communication
  goes through `window.api`.
- Match Airbnb ESLint rules.
```

---

## Prompt 4 — Testing Framework Setup

```
You are configuring the testing infrastructure for an Electron app called
BrainSpeedExercises. The project uses ES Modules ("type": "module"), ESLint
(Airbnb-base flat config), and Jest. The goal is 100% function coverage on
all modules at all times.

### Files to create or update

1. **package.json** (update scripts and devDependencies).
   - Add to `devDependencies` (use latest major-version ranges):
     - `"jest": "^29"`
     - `"jest-environment-jsdom": "^29"`
     - `"@jest/globals": "^29"`
     - `"babel-jest": "^29"`
     - `"@babel/core": "^7"`
     - `"@babel/preset-env": "^7"`
   - Update `scripts`:
     - `"test": "node --experimental-vm-modules node_modules/.bin/jest"`
     - `"test:watch": "node --experimental-vm-modules node_modules/.bin/jest --watch"`
     - `"test:coverage": "node --experimental-vm-modules node_modules/.bin/jest --coverage"`
     - `"lint": "eslint ."`
     - `"lint:fix": "eslint . --fix"`

2. **jest.config.js** — root Jest configuration.
   - Use `"transform": {}` and `"extensionsToTreatAsEsm": [".js"]` to
     support native ES Modules via `--experimental-vm-modules`.
   - Set `testEnvironment` to `'jsdom'` for renderer-side tests; use an
     inline `@jest-environment node` docblock for main-process test files.
   - Set `coverageThreshold`:
     ```json
     { "global": { "functions": 100, "branches": 80,
                   "lines": 80, "statements": 80 } }
     ```
   - `collectCoverageFrom`: `["app/**/*.js", "!app/games/_template/**",
     "!**/*.test.js"]`
   - `testMatch`: `["**/*.test.js"]`

3. **__mocks__/electron.js** — Lightweight mock for Electron's main-process
   modules used in tests.
   - Mock `app.getPath` to return `/tmp/test-userdata`.
   - Mock `ipcMain.handle` and `ipcMain.on` as `jest.fn()`.
   - Mock `BrowserWindow` as a class with `loadURL`, `on`, `webContents.send`
     as `jest.fn()` methods.
   - Export as a named object matching Electron's export shape.

4. **.babelrc** (or `babel.config.json`) — Babel configuration for Jest
   transforms (only — not for the app itself).
   - Target current Node.js version.
   - Enable `@babel/preset-env` with `modules: 'auto'`.

5. **app/components/gameCard.test.js** — Example test file demonstrating
   the pattern all tests should follow:
   - Import using ES Module `import` syntax.
   - Use `describe` / `it` blocks.
   - Clean up DOM state in `afterEach`.
   - Check function coverage with `--coverage`.

### Coverage enforcement
Add a pre-commit or CI step that fails if function coverage drops below
100%:
```
npm run test:coverage -- --passWithNoTests
```
This command should be run in CI on every pull request.

### Constraints
- Do not use CommonJS (`require`).
- The Jest mock for Electron must not import from `electron` itself.
- Match Airbnb ESLint rules in all test files.
```

---

## Prompt 5 — README File

```
You are writing the README.md for an Electron desktop app called
BrainSpeedExercises. Replace the current README (which is from the upstream
starter template) with one that accurately describes this project.

### README must include the following sections

1. **Project title and one-sentence description.**

2. **Features** — bullet list:
   - Central game-selection screen
   - Plugin-based game architecture (each game is self-contained)
   - Automatic progress saving (per player, JSON persistence)
   - WCAG 2.2 Level AA accessibility
   - 100% function test coverage enforced by Jest
   - ESLint (Airbnb-base) linting enforced on all code

3. **Prerequisites** — Node.js ≥ 20 LTS, npm ≥ 10.

4. **Installation**
   ```bash
   git clone <repo-url>
   cd BrainSpeedExercises
   npm install
   ```

5. **Running the app**
   ```bash
   npm start
   ```

6. **Running tests**
   ```bash
   npm test                 # run all tests
   npm run test:coverage    # with coverage report (must be 100% functions)
   ```

7. **Linting**
   ```bash
   npm run lint             # check
   npm run lint:fix         # auto-fix
   ```

8. **Architecture overview** — 3–5 sentences describing the main process,
   renderer process, game plugin system, and progress persistence. Reference
   INSTRUCTIONS.md for full detail.

9. **Adding a new game** — numbered steps:
   1. Copy `app/games/_template/` to `app/games/<your-game-name>/`.
   2. Edit `manifest.json` — set a unique `id`, `name`, `description`,
      and `thumbnail`.
   3. Implement game logic in `game.js` and the plugin lifecycle in
      `index.js`.
   4. Write HTML markup in `interface.html` and styles in `style.css`.
   5. Add full Jest tests in `tests/`.
   6. Run `npm test` and `npm run lint` — both must pass before committing.

10. **Accessibility** — one paragraph explaining the WCAG 2.2 AA commitment
    and the key checks (keyboard navigation, colour contrast, ARIA live
    regions, semantic HTML).

11. **Security** — one paragraph describing the Electron security hardening
    in place (contextIsolation, no nodeIntegration, CSP, IPC allowlist).

12. **Contributing** — link to `contributing.md`; note that all PRs must
    include tests and pass lint + coverage thresholds.

13. **License** — MIT.

### Style
- Use standard Markdown with ATX headings (`##`).
- Code blocks must specify the language (` ```bash `, ` ```json `, etc.).
- Keep it concise — a developer should be able to read it in under 5 minutes.
- Do not include any content from the original upstream starter template.
```

---

## Prompt 6 — Accessibility Audit Checklist

```
You are performing an accessibility review of every HTML file and JavaScript
file that manipulates the DOM in the BrainSpeedExercises Electron app.
The target standard is WCAG 2.2 Level AA.

For each file listed, produce:
1. A checklist of WCAG 2.2 AA criteria relevant to that file.
2. A list of any violations found with line numbers.
3. Code patches to fix each violation.

Files to review:
- app/index.html
- app/style.css
- app/components/gameCard.js
- app/interface.js
- app/games/*/interface.html   (each game)
- app/games/*/style.css        (each game)
- app/games/*/index.js         (DOM-manipulation portions)

### Key criteria to check in every file
- 1.1.1 Non-text content: every `<img>` has a meaningful `alt`.
- 1.3.1 Info and relationships: headings, lists, and tables use semantic
  markup.
- 1.4.1 Use of colour: information is not conveyed by colour alone.
- 1.4.3 Contrast: normal text ≥ 4.5:1, large text ≥ 3:1.
- 2.1.1 Keyboard: all interactive controls reachable via Tab / arrow keys.
- 2.4.3 Focus order: focus moves in a logical sequence.
- 2.4.7 Focus visible: keyboard focus indicator is visible.
- 2.5.3 Label in name: visible label is contained in the accessible name.
- 4.1.2 Name, role, value: all custom widgets expose correct ARIA attributes.
- 4.1.3 Status messages: score updates and results use `aria-live`.

### Output format
For each violation, output a unified diff patch that can be applied with
`git apply`. Do not rewrite files wholesale — make the minimum changes needed.
```

---

*These prompts are designed to be used incrementally — start with Prompt 1 and
work through them in order, running `npm run lint` and `npm test` after each
step before moving to the next.*
