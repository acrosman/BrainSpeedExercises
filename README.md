# Brain Speed Exercises

![Testing Status](https://github.com/acrosman/BrainSpeedExercises/actions/workflows/test.yml/badge.svg)
![Lint Status](https://github.com/acrosman/BrainSpeedExercises/actions/workflows/lint.yml/badge.svg)
![CodeQL Status](https://github.com/acrosman/BrainSpeedExercises/actions/workflows/codeql-analysis.yml/badge.svg)

A desktop application for brain-speed training — pick a game, play it, and track your progress over time. Inspired by the research in [this study on dementia](https://www.npr.org/2026/02/18/nx-s1-5716010/brain-training-exercise-cut-dementia-risk-decades).

## Features

- Central game-selection screen with a keyboard-navigable game grid
- Plugin-based game architecture — each game is fully self-contained in its own folder
- Automatic progress saving per player (JSON file persistence via Electron's `userData` path)
- WCAG 2.2 Level AA accessibility throughout the UI
- 100% function test coverage enforced by Jest on every pull request
- ESLint (Airbnb-base) linting required on all code

## Prerequisites

- Node.js ≥ 24 LTS
- npm ≥ 10

## Installation

```bash
git clone https://github.com/acrosman/BrainSpeedExercises.git
cd BrainSpeedExercises
npm install
```

## Running the App

```bash
npm start
```

## Running Tests

```bash
npm test                  # run all tests
npm run test:coverage     # with coverage report (100% function coverage required)
```

## Linting

```bash
npm run lint              # check for style issues
npm run lint:fix          # auto-fix fixable issues
```

## Architecture Overview

BrainSpeedExercises is an Electron application split into a **main process** (`main.js`) and a **renderer process** (`app/`). The main process owns all privileged operations: loading game manifests, reading and writing progress files, and registering IPC handlers. The renderer process handles all UI, communicating with the main process exclusively through the typed IPC channel allowlist exposed by `app/preload.js`.

Games are **plugins**: each game lives entirely in `app/games/<game-name>/` and is discovered at runtime by a manifest scanner. The renderer requests the game list over IPC, displays a selection screen, then dynamically loads the chosen game's HTML fragment and JavaScript module into a container element. Progress is persisted to a per-player JSON file in Electron's `userData` directory and is never exposed directly to renderer code.

See [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) for the full architecture reference.

## Adding a New Game

### Quick start

```bash
cp -r app/games/_template app/games/my-game-name
```

Then work through each file described below.

---

### Folder structure

Every game is a self-contained directory under `app/games/`. Directories whose names start with `_` are internal and are never loaded by the registry.

```
app/games/<game-name>/
├── manifest.json       # Required metadata loaded by the registry
├── index.js            # Plugin public API: { name, init, start, stop, reset }
├── game.js             # Pure game logic — no DOM access
├── interface.html      # HTML fragment injected into the game container
├── style.css           # Scoped styles (prefix all selectors with your game's class)
├── images/             # Game-specific image assets
│   ├── thumb.png       # Thumbnail shown on the selection screen (required)
│   └── ...             # Any other images your game needs
└── tests/
    ├── game.test.js    # Unit tests for game.js
    └── index.test.js   # Integration tests for the plugin API
```

Use a short, lowercase, hyphen-separated name for the folder (e.g. `fast-piggie`, `memory-match`). This name does not need to match the `id` in the manifest, but keeping them consistent is strongly recommended.

---

### `manifest.json`

The registry requires four fields. Any directory whose manifest is missing one of them is skipped at startup with a console warning.

```json
{
  "id": "my-game-name",
  "name": "My Game Name",
  "description": "One or two sentences shown on the game-selection screen.",
  "version": "1.0.0",
  "entryPoint": "index.js",
  "thumbnail": "images/thumb.png",
  "author": "Your Name"
}
```

| Field         | Required | Notes                                                                                       |
| ------------- | -------- | ------------------------------------------------------------------------------------------- |
| `id`          | yes      | Unique slug; used as the key in saved progress data. Use the same value as the folder name. |
| `name`        | yes      | Human-readable title shown on the game card.                                                |
| `description` | yes      | Short description shown on the game card.                                                   |
| `entryPoint`  | yes      | Relative path to the plugin module — almost always `"index.js"`.                            |
| `version`     | no       | Semantic version string.                                                                    |
| `thumbnail`   | no       | Relative path to the card thumbnail image. Defaults to a placeholder if omitted.            |
| `author`      | no       | Free-form author credit.                                                                    |

---

### `game.js` — pure game logic

Keep all game state and logic in this file. **No DOM access.** Every function should be a plain, easily unit-testable export.

Minimum expected exports:

```js
export function initGame() {
  /* reset all state */
}
export function startGame() {
  /* begin the game loop */
}
export function stopGame() {
  /* end the game; return { score, roundsPlayed, duration } */
}
export function getScore() {
  /* return current score */
}
export function isRunning() {
  /* return boolean */
}
```

Add whatever additional exports your game needs (e.g. `generateRound`, `checkAnswer`, `addScore`).

---

### `index.js` — plugin lifecycle

This file is dynamically imported by the main process. It must export a default object with exactly these four methods plus a `name` string:

```js
export default {
  name: "My Game Name", // matches manifest.json "name"

  init(container) {
    // Called once after interface.html has been injected.
    // Query DOM elements, attach event listeners.
    // Do NOT start timers here.
  },

  start() {
    // Start the game. Called by the shell when the player clicks Play.
  },

  stop() {
    // End the game. Must return the result object from game.stopGame().
    // Save progress here via window.api.invoke('progress:save', ...) if needed.
    // Guard the window.api call: if (typeof window !== 'undefined' && window.api)
    return result;
  },

  reset() {
    // Return to initial state without reloading interface.html.
  },
};
```

Named exports (rendering helpers, audio helpers, etc.) are allowed and should be tested directly.

---

### `interface.html` — HTML fragment

This file is an HTML **fragment** — do not include `<html>`, `<head>`, or `<body>` tags. It is injected directly into `<main id="game-container">` by the renderer.

Important conventions:

- Wrap everything in a single `<section>` with a class matching your game folder name (e.g. `class="my-game-name"`).
- Use an `aria-labelledby` attribute on the section pointing to your heading's `id`.
- Add `role="status"` and `aria-live="assertive"` (or `"polite"`) to any element that displays dynamic feedback such as scores or round results.
- Use `<button>` elements for all interactive controls; avoid `<div>` or `<span>` click targets.

---

### `style.css` — scoped styles

Prefix **every selector** with your game's root class to avoid collisions with other games or the shell:

```css
/* Good */
.my-game-name { … }
.my-game-name__board { … }

/* Bad — will leak into other pages */
button { … }
canvas { … }
```

---

### `images/` — game assets

Place all image files inside `images/` within your game folder.

| File                  | Purpose                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| `thumb.png`           | Thumbnail on the game-selection card. Aim for a square image, roughly 200 × 200 px. |
| Any other PNG/JPG/SVG | Sprites, backgrounds, or icons used during gameplay.                                |

To load images at runtime from `index.js`, build the base URL relative to the module:

```js
const base = new URL("./images/", import.meta.url).href;
const img = new Image();
img.src = `${base}my-sprite.png`;
```

This works correctly in both the Electron renderer and the test environment.

---

### Tests

Every function in `game.js` and `index.js` must be covered. The project enforces **100% function coverage** via Jest's `coverageThreshold`.

**`tests/game.test.js`** — import and call every exported function directly; no DOM or mocking needed.

**`tests/index.test.js`** — use `jest.unstable_mockModule('../game.js', factory)` followed by `await import('../index.js')` to isolate the plugin from real game logic (see `app/games/fast-piggie/tests/index.test.js` for a full example).

```js
// Correct ESM mocking pattern (no Babel transform)
jest.unstable_mockModule("../game.js", () => ({
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({ score: 0, roundsPlayed: 0, duration: 0 })),
  getScore: jest.fn(() => 0),
  isRunning: jest.fn(() => true),
}));

const plugin = (await import("../index.js")).default;
```

---

### Checklist before opening a pull request

- [ ] `manifest.json` has a unique `id` that matches the folder name.
- [ ] All CSS selectors are prefixed with the game's root class.
- [ ] `interface.html` has no `<html>`/`<head>`/`<body>` tags.
- [ ] `index.js` guards any `window.api` calls with `typeof window !== 'undefined' && window.api`.
- [ ] `npm test` passes with 100% function coverage on both `game.js` and `index.js`.
- [ ] `npm run lint` passes with 0 errors.
- [ ] All interactive elements are keyboard-accessible and meet WCAG 2.2 AA contrast.

## Accessibility

All UI in this project targets **WCAG 2.2 Level AA**. This means every interactive element is reachable by keyboard, all text meets color-contrast requirements (≥ 4.5:1 for normal text), custom widgets carry appropriate ARIA roles and properties, and dynamic results such as scores use `aria-live` regions so screen-reader users receive updates without losing their place. See [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) for the full checklist.

## Security

The Electron window is hardened with `contextIsolation: true`, `nodeIntegration: false`, a strict `default-src 'self'` Content Security Policy, and a navigation/redirect block. All IPC communication goes through an explicit channel allowlist in `app/preload.js`. Run `npm audit` before every merge to catch supply-chain vulnerabilities.

## Contributing

See [`contributing.md`](./contributing.md) for guidelines. All pull requests must:

- include tests for every new or changed function,
- pass `npm run lint` with no errors, and
- pass `npm run test:coverage` with function coverage at 100%.

## License

MIT
