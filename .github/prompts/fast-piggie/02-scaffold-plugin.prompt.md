Scaffold the complete file structure for a new game plugin called
**Fast Piggie** inside `app/games/fast-piggie/`.

## Context

The project uses a game-plugin architecture. Every game lives entirely inside
`app/games/<game-name>/` and must follow the structure defined in
`app/games/_template/`. The plugin registry (`app/games/registry.js`) scans
for `manifest.json` files and skips any directory whose name starts with `_`.

Fast Piggie is a visual-attention game. Players see N guinea pig images
arranged in a circle of equal wedge zones for a brief period. N-1 images are
identical ("common"); one is subtly different ("outlier"). After the images
disappear, the player clicks the wedge where the outlier was. Correct answer =
green flash + success sound; wrong answer = red flash + failure sound.
Difficulty auto-scales: every 3 correct answers adds 2 more wedges (max 14)
and reduces the display time by 200ms (floor 500ms), starting at 6 wedges /
2000ms.

## Files to create

### `app/games/fast-piggie/manifest.json`

```json
{
  "id": "fast-piggie",
  "name": "Fast Piggie",
  "description": "Spot the different guinea pig before they disappear!",
  "version": "0.1.0",
  "entryPoint": "index.js",
  "thumbnail": "images/thumbnail.png",
  "author": "BrainSpeed Exercises"
}
```

### `app/games/fast-piggie/images/`

Create three placeholder SVG files (safe to commit, no binary blobs):

- `guinea-pig-common.png` — a simple SVG written as a PNG stand-in (or a
  minimal valid 1×1 PNG). A colored circle with a label "GP-A" is sufficient.
- `guinea-pig-outlier.png` — same format, different color / label "GP-B".
- `thumbnail.png` — same format, label "Fast Piggie".

> These will be replaced with real guinea pig photos once the plugin is
> working. Keep them small (< 1 KB each).

### `app/games/fast-piggie/game.js`

Stub only — export the function signatures with empty bodies / placeholder
returns so the module is syntactically valid. The real implementation is in a
later prompt.

```js
// Stub — implementation added in next prompt
export function initGame() {}
export function startGame() {}
export function stopGame() {
  return {};
}
export function generateRound() {
  return {};
}
export function checkAnswer() {
  return false;
}
export function calculateWedgeIndex() {
  return -1;
}
export function addScore() {}
export function getScore() {
  return 0;
}
export function getRoundsPlayed() {
  return 0;
}
export function getCurrentDifficulty() {
  return {};
}
export function isRunning() {
  return false;
}
```

### `app/games/fast-piggie/index.js`

Stub only — export the plugin contract so the registry can import it:

```js
// Stub — implementation added in a later prompt
export default {
  name: "Fast Piggie",
  init() {},
  start() {},
  stop() {
    return {};
  },
  reset() {},
};
```

### `app/games/fast-piggie/interface.html`

Minimal stub (valid WCAG-AA fragment, no `<html>`/`<head>`/`<body>` tags):

```html
<section class="fast-piggie" aria-label="Fast Piggie game">
  <h2>Fast Piggie</h2>
  <p>Loading…</p>
</section>
```

### `app/games/fast-piggie/style.css`

Empty stub with a single comment:

```css
/* Fast Piggie game styles — populated in a later prompt */
```

### `app/games/fast-piggie/tests/game.test.js`

Minimal stub that imports the module (so Jest detects it). Tests are added in
a later prompt:

```js
import { initGame } from "../game.js";

describe("fast-piggie/game.js stubs", () => {
  it("exports initGame", () => {
    expect(typeof initGame).toBe("function");
  });
});
```

### `app/games/fast-piggie/tests/index.test.js`

Minimal stub:

```js
import plugin from "../index.js";

describe("fast-piggie/index.js stubs", () => {
  it("exports plugin object", () => {
    expect(typeof plugin).toBe("object");
  });
});
```

## Constraints

- All files must use ES Module syntax (`import`/`export`).
- Do not modify any files outside `app/games/fast-piggie/`.
- Placeholder images must be committed files (not gitignored).

## Verification

After scaffolding:

- `npm run lint` must pass with 0 errors.
- `npm test` must pass — the stub test files should be discovered and pass.
