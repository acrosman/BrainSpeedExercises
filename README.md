# BrainSpeedExercises

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

1. Copy `app/games/_template/` to `app/games/<your-game-name>/`.
2. Edit `manifest.json` — set a unique `id`, `name`, `description`, and `thumbnail`.
3. Implement game logic in `game.js` (pure functions, no DOM access) and the plugin lifecycle (`init`, `start`, `stop`, `reset`) in `index.js`.
4. Write the game's HTML markup in `interface.html` and scoped styles in `style.css`.
5. Add full Jest tests in `tests/` — all functions must be covered.
6. Run `npm test` and `npm run lint` — both must pass before committing.

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
