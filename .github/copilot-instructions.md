# BrainSpeedExercises — Project Instructions

## Purpose

BrainSpeedExercises is an Electron desktop application that delivers a series of brain-speed training games. Players pick a game from a central selection screen, play it, and have their progress saved automatically. The codebase is structured so that each game is a self-contained plugin, making it easy to add, remove, or update games without touching the core application.

---

## Technology Stack

| Concern                  | Choice                                      | Notes                                       |
| ------------------------ | ------------------------------------------- | ------------------------------------------- |
| Application shell        | [Electron](https://www.electronjs.org/)     | Latest stable — see `package.json`          |
| JavaScript module format | ES Modules (`"type": "module"`)             | Already set in `package.json`               |
| Unit / integration tests | [Jest](https://jestjs.io/)                  | 100% function coverage required             |
| Linting                  | [ESLint](https://eslint.org/) (flat config) | Airbnb-style rules; see `.eslint.config.js` |
| Accessibility standard   | WCAG 2.2 Level AA                           | Required for all UI                         |
| Progress persistence     | Node `fs` (JSON flat-file) via IPC          | No external database required               |

> **Dependency policy:** All NPM packages are updated regularly. Pin to a major-version range (e.g. `"^38"`) rather than exact versions, and run `npm audit` on every PR.

---

## Repository Layout

```
BrainSpeedExercises/
├── main.js                   # Electron main-process entry point
├── package.json
├── .eslint.config.js         # ESLint flat config (shared rules)
├── jest.config.js            # Jest root config
├── README.md
│
├── .github/
│   ├── copilot-instructions.md   # ← this file
│   └── prompts/                  # AI/Copilot prompts for each feature
│
├── app/                      # Renderer-process root
│   ├── preload.js            # Context-bridge (security layer)
│   ├── index.html            # Shell HTML loaded by Electron
│   ├── interface.js          # App-level renderer JS (game selector)
│   ├── style.css             # App-level styles
│   │
│   ├── components/           # Reusable UI components (pure functions)
│   │   └── gameCard.js       # Renders a single game tile on the selector
│   │
│   ├── progress/             # Save / load progress subsystem
│   │   ├── progressManager.js
│   │   └── progressManager.test.js
│   │
│   └── games/                # ── Game plugin directory ──────────────
│       └── <game-name>/      # One sub-folder per game (see below)
│
└── assets/                   # Shared images / fonts / global CSS
    └── icons/
```

### Game Plugin Folder Structure

Every game lives entirely inside `app/games/<game-name>/` and is completely self-contained:

```
app/games/<game-name>/
├── manifest.json             # Metadata loaded by the plugin registry
├── index.js                  # Public API: { name, init, start, stop, reset }
├── game.js                   # Core game logic (pure, easily testable)
├── interface.html            # HTML fragment injected into the game container
├── style.css                 # Scoped styles for this game
├── images/                   # Game-specific image assets
│   └── ...
└── tests/
    ├── game.test.js          # Unit tests for game.js
    └── index.test.js         # Integration tests for the plugin API
```

---

## Architecture

### 1 — Main Process (`main.js`)

Responsibilities:

- Create and manage `BrowserWindow` instances.
- Register all IPC handlers (`ipcMain.handle`).
- Load the game plugin registry at startup.
- Proxy save/load requests from the renderer to the progress manager.

### 2 — Preload Script (`app/preload.js`)

Exposes a strict allowlist of IPC channels via `contextBridge`. No Electron internals are exposed directly to the renderer. New channels must be explicitly added to both the `send` and `receive` allowlists.

Valid channels (extend as needed):

| Channel         | Direction       | Purpose                                  |
| --------------- | --------------- | ---------------------------------------- |
| `games:list`    | renderer → main | Request list of available game manifests |
| `games:load`    | renderer → main | Load a specific game by ID               |
| `progress:save` | renderer → main | Persist player progress                  |
| `progress:load` | renderer → main | Retrieve player progress                 |

### 3 — Renderer Process (`app/interface.js`)

- On `DOMContentLoaded`, requests the game list via `window.api.invoke('games:list')`.
- Renders a WCAG-AA-compliant game-selection screen (see §6 below).
- When a game is chosen, requests its HTML fragment and injects it into a `<main id="game-container">` element.
- Calls `plugin.init()` then `plugin.start()` on the loaded game module.

### 4 — Game Plugin Registry

The registry (`app/games/registry.js`) is loaded by the main process at startup:

```
startup
  └─ scanGamesDirectory()          // reads app/games/*/manifest.json
       └─ returns GameManifest[]   // passed to renderer on request
```

When the renderer asks to load a game by ID, the main process:

1. Resolves the entry-point path from the manifest.
2. Dynamically imports the game module (`import()`).
3. Sends the game's HTML fragment path back to the renderer.
4. The renderer fetches the HTML fragment and injects it.

### 5 — Progress System (`app/progress/progressManager.js`)

- Stores progress as a JSON file in Electron's `app.getPath('userData')`.
- Public API (called over IPC — never directly from the renderer):
  - `loadProgress(playerId)` → `Promise<ProgressData>`
  - `saveProgress(playerId, data)` → `Promise<void>`
  - `resetProgress(playerId)` → `Promise<void>`
- `ProgressData` shape:

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

---

## Linting

The project uses ESLint 9+ with the **flat config** format (`.eslint.config.js`).

Rules summary:

- Airbnb-style base: `eslint-config-airbnb-base`
- Enforce `const`/`let` (no `var`)
- Single quotes, trailing commas, semicolons required
- `no-console` warnings in renderer code; allowed in main process
- Max line length: 100 characters
- All files under `app/` and root JS files are linted; `node_modules/` is excluded

Run linting: `npm run lint`

Fix auto-fixable issues: `npm run lint:fix`

---

## Testing

### Framework: Jest

All tests use the jest framework. The root `jest.config.js` sets up the testing environment, including moduleNameMapper for asset imports and a custom test environment that mocks Electron APIs.

Use the vscode built-in test runner whenever possible.

### Coverage Requirements

- **100% function coverage** is enforced via Jest's `coverageThreshold` in `jest.config.js`.
- Branches, lines, and statements targets are set to 80% minimum.
- Tests live alongside the code they test (e.g. `progressManager.test.js` sits next to `progressManager.js`; game tests live in `app/games/<game-name>/tests/`).

### What to Test

| Module                | What to cover                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `progressManager.js`  | `loadProgress`, `saveProgress`, `resetProgress` — happy path + edge cases (missing file, corrupt JSON) |
| `registry.js`         | `scanGamesDirectory` — found manifests, missing directory, malformed manifest                          |
| `game.js` (per game)  | All exported functions; use mock timers for timed events                                               |
| `index.js` (per game) | Plugin lifecycle: `init`, `start`, `stop`, `reset`                                                     |
| `components/*.js`     | Render output for valid and invalid input                                                              |

### Mocking Electron

The Jest config maps Electron's Node modules to lightweight mocks in `__mocks__/electron.js`. Never import Electron APIs directly in renderer-side code — always use the `window.api` bridge.

---

## Accessibility (WCAG 2.2 AA)

All UI — including each game's `interface.html` — must meet WCAG 2.2 Level AA. Key requirements:

- **1.4.3 Contrast**: Text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large).
- **2.1.1 Keyboard**: All interactive elements reachable and operable by keyboard.
- **2.4.3 Focus Order**: Logical focus order; visible focus indicator on every focusable element.
- **2.4.6 Headings**: Descriptive headings that reflect page structure.
- **2.5.3 Label in Name**: Button/control visible label matches its accessible name.
- **4.1.2 Name, Role, Value**: All custom interactive components use appropriate ARIA roles, states, and properties.
- **4.1.3 Status Messages**: Dynamic results and score updates use `aria-live` regions.

Use semantic HTML elements (`<button>`, `<nav>`, `<main>`, `<section>`, `<article>`) before reaching for ARIA.

---

## Security

Follow Electron's security checklist for every change:

1. `nodeIntegration: false`
2. `contextIsolation: true`
3. No `eval()` or `new Function()` in renderer code.
4. Content-Security-Policy header set in `index.html` (`default-src 'self'`).
5. All new IPC channels must be added to the allowlist in `preload.js`.
6. Run `npm audit` before every merge.

---

## Development Workflow

1. `npm install` — install dependencies.
2. `npm run lint` — check code style.
3. `npm test` — run the full test suite (must pass with 100% function coverage).
4. `npm start` — launch the Electron app in development mode.

For adding a new game, see the **Game Plugin Architecture** prompt in `.github/prompts/`.
