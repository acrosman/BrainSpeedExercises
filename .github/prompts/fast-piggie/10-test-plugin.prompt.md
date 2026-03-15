Write the full Jest integration test suite for `app/games/fast-piggie/index.js`.
Replace the stub in `app/games/fast-piggie/tests/index.test.js`.

## Context

The project uses Jest with `jsdom`, ES Modules (no Babel transform), and
enforces **100% function coverage** across all files under `app/` (excluding
`_template`).

`index.js` exports:

- **Named exports** (rendering + audio helpers): `loadImages`, `drawBoard`,
  `clearImages`, `highlightWedge`, `createAudioContext`, `playSuccessSound`,
  `playFailureSound`
- **Default export** (plugin contract): `{ name, init, start, stop, reset }`

The plugin depends on `./game.js` (imported as `* as game`) and uses the Web
Audio API and `HTMLCanvasElement`. Both must be mocked in tests.

---

## Mocking strategy

### 1 — Mock `../game.js`

Use `jest.mock('../game.js', ...)` with a manual factory to return stub
functions for every export:

```js
jest.mock("../game.js", () => ({
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({ score: 3, roundsPlayed: 5, duration: 12000 })),
  generateRound: jest.fn(() => ({
    wedgeCount: 6,
    displayDurationMs: 2000,
    outlierWedgeIndex: 2,
  })),
  checkAnswer: jest.fn(() => true),
  calculateWedgeIndex: jest.fn(() => 2),
  addScore: jest.fn(),
  getScore: jest.fn(() => 3),
  getRoundsPlayed: jest.fn(() => 5),
  getCurrentDifficulty: jest.fn(() => ({
    wedgeCount: 6,
    displayDurationMs: 2000,
  })),
  isRunning: jest.fn(() => true),
}));
```

### 2 — Mock `HTMLCanvasElement.getContext`

In `beforeEach`, assign a minimal 2D context stub to all canvas elements via
`jest.spyOn` or direct `HTMLCanvasElement.prototype` assignment:

```js
const ctx2d = {
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  arc: jest.fn(),
  closePath: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  drawImage: jest.fn(),
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 0,
  save: jest.fn(),
  restore: jest.fn(),
  linearRampToValueAtTime: jest.fn(),
};

HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx2d);
```

### 3 — Mock `Image`

`jsdom` does not load images. Trigger `onload` synchronously in tests by
overriding the global `Image` class:

```js
globalThis.Image = class {
  set src(_) {
    if (this.onload) this.onload();
  }
};
```

### 4 — Mock `AudioContext`

```js
const mockGain = {
  connect: jest.fn(),
  gain: {
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
  },
};
const mockOsc = {
  connect: jest.fn(),
  type: "",
  frequency: { setValueAtTime: jest.fn() },
  start: jest.fn(),
  stop: jest.fn(),
};
const mockAudioCtx = {
  currentTime: 0,
  destination: {},
  createGain: jest.fn(() => mockGain),
  createOscillator: jest.fn(() => mockOsc),
};
globalThis.AudioContext = jest.fn(() => mockAudioCtx);
globalThis.window = {
  ...globalThis.window,
  AudioContext: globalThis.AudioContext,
};
```

### 5 — DOM container helper

Build a minimal container that mirrors `interface.html` so `init()` can find
all required elements:

```js
function buildContainer() {
  const div = document.createElement("div");
  div.innerHTML = `
    <section class="fast-piggie">
      <canvas id="fp-canvas" width="500" height="500"></canvas>
      <div class="fp-stats">
        <span class="fp-stat">Round: <strong id="fp-round-count">0</strong></span>
        <span class="fp-stat">Score: <strong id="fp-score">0</strong></span>
      </div>
      <div id="fp-feedback" role="status" aria-live="assertive" class="fp-feedback sr-only"></div>
      <div id="fp-flash" class="fp-flash"></div>
      <div class="fp-controls">
        <button id="fp-continue-btn" class="fp-btn" hidden>Continue</button>
        <button id="fp-stop-btn" class="fp-btn fp-btn--secondary">End Game</button>
      </div>
    </section>
  `;
  return div;
}
```

---

## Test cases required

Use `jest.useFakeTimers()` in `beforeEach` and `jest.useRealTimers()` in
`afterEach` to control `setTimeout` in `_runRound`.

### Plugin contract

- Default export is an object.
- Default export has properties `name`, `init`, `start`, `stop`, `reset`.
- `name` is the string `'Fast Piggie'`.
- `init`, `start`, `stop`, `reset` are functions.

### Named exports

- `loadImages` is a function and returns a Promise.
- `drawBoard`, `clearImages`, `highlightWedge` are functions.
- `createAudioContext`, `playSuccessSound`, `playFailureSound` are functions.

### `init(container)`

- Does not throw when called with a valid container.
- Queries `#fp-canvas` from the container (uses `container.querySelector`,
  not `document.querySelector`).
- Binds a `click` listener to the canvas.
- Binds a `keydown` listener to the canvas.
- Binds a `click` listener to `#fp-continue-btn`.
- Binds a `click` listener to `#fp-stop-btn`.

### `start()`

- Calls `game.startGame()`.
- Calls `game.generateRound(game.getRoundsPlayed())` (via `_runRound`).
- Sets `#fp-continue-btn` hidden.

### `stop()`

- Calls `game.stopGame()`.
- Returns the object from `game.stopGame()`.
- Sets `#fp-feedback` text content to a non-empty string.
- Sets `#fp-stop-btn` hidden.

### `reset()`

- Calls `game.initGame()`.
- Sets `#fp-continue-btn` hidden.
- Shows `#fp-stop-btn` (not hidden).
- Clears `#fp-feedback` text content to `''`.
- Calls `ctx.clearRect(0, 0, 500, 500)`.

### `_handleClick` (tested via canvas click events)

**Correct answer branch** (`game.checkAnswer` returns `true`,
`game.calculateWedgeIndex` returns `2`):

- `game.addScore()` is called.
- `playSuccessSound` is called (verify `AudioContext` mock was used).
- `#fp-continue-btn` becomes visible (not hidden).
- `#fp-feedback` text content contains "Correct" (case-insensitive).
- `#fp-flash` has class `fp-flash--correct` added (checked before timeout
  removes it).

**Wrong answer branch** (`game.checkAnswer` returns `false`):

- `game.addScore()` is NOT called.
- `playFailureSound` is called.
- `#fp-continue-btn` becomes visible.
- `#fp-feedback` text content contains "not quite" or "different"
  (case-insensitive).
- `#fp-flash` has class `fp-flash--wrong`.

**Outside circle** (`game.calculateWedgeIndex` returns `-1`):

- `game.checkAnswer` is NOT called.
- `#fp-continue-btn` remains hidden.

### `_handleKeydown` (tested via canvas keydown events)

Preconditions: `init`, `start` called; `jest.runAllTimers()` to advance past
`displayDurationMs` so `_clickEnabled` is `true`.

- `ArrowRight` increments `_selectedWedge` (indirect: verify `clearImages`
  called on canvas context).
- `Enter` calls `_resolveRound` (verify `game.checkAnswer` called).
- `ArrowRight` calls `event.preventDefault()`.

---

## Constraints

- Import the plugin as: `import plugin, { loadImages, drawBoard, clearImages, highlightWedge, createAudioContext, playSuccessSound, playFailureSound } from '../index.js';`
- Call `plugin.reset()` in `afterEach` to clean up module-level state between
  tests (or re-import; reset is cleaner).
- 100% function coverage on `index.js` is required — ensure every private
  helper is exercised through the public API.
- Use `jest.useFakeTimers()` so `_runRound`'s `setTimeout` is controllable.

## Verification

- `npm test` must pass with **100% function coverage** on both `game.js` and
  `index.js`.
- `npm run lint` must pass with 0 errors.
