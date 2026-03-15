You are building the renderer-process UI for an Electron desktop app called
BrainSpeedExercises. The app lets players choose a brain-speed training game
from a central selection screen and then play it. The project uses ES Modules
("type": "module" in package.json), ESLint (Airbnb-base rules), Jest for
100% function-coverage testing, and must meet WCAG 2.2 Level AA.

## Files to create or update

### 1. app/index.html — Shell HTML for the Electron BrowserWindow
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

### 2. app/style.css — App-level stylesheet
- Style the skip-navigation link so it is visible on focus but off-screen
  otherwise.
- Provide a responsive CSS Grid layout for the game-selector section
  (auto-fill columns, min 240 px).
- Set a color scheme with at least 4.5:1 contrast ratio for body text.
- Include visible :focus-visible outlines on all interactive elements.

### 3. app/components/gameCard.js — Pure function that returns an HTMLElement
- Signature: `export function createGameCard(manifest) { ... }`
- `manifest` shape: `{ id, name, description, thumbnail }`.
- Returns a `<article>` element with a focusable `<button>` that emits a
  custom DOM event `game:select` with `detail: { gameId: manifest.id }`.
- Include an `<img>` with a non-empty `alt` attribute derived from the
  game name.
- All text must be inside elements with sufficient contrast.

### 4. app/interface.js — Renderer-process entry module
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

### 5. app/components/gameCard.test.js — Jest unit tests for createGameCard
- Mock `document` using jsdom (Jest default environment).
- Test: renders an `<article>` element.
- Test: button fires `game:select` with correct `detail.gameId`.
- Test: `<img>` has a non-empty `alt` attribute.
- Test: throws (or returns null) when `manifest` is missing required fields.
- Achieve 100% function coverage on `gameCard.js`.

## Constraints
- No third-party UI frameworks (no React, Vue, etc.).
- No inline event handlers in HTML (`onclick="..."`).
- Use `const`/`let`, never `var`.
- Single quotes, trailing commas, semicolons — match Airbnb ESLint rules.
- All interactive elements must have a visible label accessible to screen
  readers.
