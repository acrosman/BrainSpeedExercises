Implement the full plugin lifecycle in `app/games/fast-piggie/index.js`,
wiring together the game logic, canvas rendering, and audio helpers that were
added in previous prompts.

## Context

`index.js` already contains:

- Named exports: `loadImages`, `drawBoard`, `clearImages`, `highlightWedge`,
  `createAudioContext`, `playSuccessSound`, `playFailureSound`
- A stub default export: `{ name, init, start, stop, reset }`

This prompt replaces the default-export stub with a full implementation.
Do not remove or rename any of the named exports.

The plugin contract requires the default export to be an object with exactly:
`{ name, init(container), start(), stop(), reset() }`

---

## Module-level state variables

Add these at the top of the file (alongside `_audioCtx`):

```js
// DOM references — populated by init()
let _canvas = null;
let _ctx = null;
let _continueBtn = null;
let _stopBtn = null;
let _statsEl = null;
let _scoreEl = null;
let _roundEl = null;
let _feedbackEl = null;
let _flashEl = null;

// Game state
let _images = null; // [commonImage, outlierImage]
let _currentRound = null; // { wedgeCount, displayDurationMs, outlierWedgeIndex }
let _clickEnabled = false;
let _selectedWedge = -1; // for keyboard navigation
let _roundTimer = null; // setTimeout handle
```

---

## Helper: `_updateStats()`

Private function. Update the stats bar DOM:

```js
function _updateStats() {
  if (_scoreEl) _scoreEl.textContent = game.getScore();
  if (_roundEl) _roundEl.textContent = game.getRoundsPlayed();
}
```

---

## Helper: `_triggerFlash(type)`

Private function. Add the flash class, then remove it after the animation
completes (500ms + a small buffer):

```js
function _triggerFlash(type) {
  if (!_flashEl) return;
  _flashEl.classList.remove("fp-flash--correct", "fp-flash--wrong");
  // Force reflow so re-adding the same class restarts the animation
  void _flashEl.offsetWidth; // eslint-disable-line no-void
  _flashEl.classList.add(
    type === "correct" ? "fp-flash--correct" : "fp-flash--wrong",
  );
  setTimeout(() => {
    _flashEl.classList.remove("fp-flash--correct", "fp-flash--wrong");
  }, 600);
}
```

---

## Helper: `_runRound()`

Private function. Execute one round:

```js
function _runRound() {
  if (!game.isRunning()) return;

  _clickEnabled = false;
  _selectedWedge = -1;
  _currentRound = game.generateRound(game.getRoundsPlayed());

  const { wedgeCount, displayDurationMs, outlierWedgeIndex } = _currentRound;
  const { width, height } = _canvas;

  // Show images
  drawBoard(_ctx, width, height, wedgeCount, _images, outlierWedgeIndex, true);

  // Hide images after displayDurationMs, then enable clicking
  _roundTimer = setTimeout(() => {
    clearImages(_ctx, width, height, wedgeCount);
    _clickEnabled = true;
    _canvas.focus();
    // Reset keyboard selection
    _selectedWedge = 0;
    _highlightKeyboardSelection();
  }, displayDurationMs);
}
```

---

## Helper: `_highlightKeyboardSelection()`

Private function. When keyboard navigation is active, highlight the currently
selected wedge with a neutral blue indicator:

```js
function _highlightKeyboardSelection() {
  if (!_currentRound || _selectedWedge < 0) return;
  const { wedgeCount } = _currentRound;
  const { width, height } = _canvas;
  clearImages(_ctx, width, height, wedgeCount);
  highlightWedge(
    _ctx,
    width,
    height,
    _selectedWedge,
    wedgeCount,
    "rgba(0, 95, 204, 0.35)",
  );
}
```

---

## Helper: `_handleKeydown(event)`

Private function. Implement keyboard navigation on the canvas:

```js
function _handleKeydown(event) {
  if (!_clickEnabled || !_currentRound) return;
  const { wedgeCount } = _currentRound;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    _selectedWedge = (_selectedWedge + 1) % wedgeCount;
    _highlightKeyboardSelection();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    _selectedWedge = (_selectedWedge - 1 + wedgeCount) % wedgeCount;
    _highlightKeyboardSelection();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (_selectedWedge >= 0) _resolveRound(_selectedWedge);
  }
}
```

---

## Helper: `_handleClick(event)`

Private function. Resolve a round from a mouse click:

```js
function _handleClick(event) {
  if (!_clickEnabled || !_currentRound) return;

  const rect = _canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // Scale click coords to canvas drawing buffer
  const scaleX = _canvas.width / rect.width;
  const scaleY = _canvas.height / rect.height;

  const { wedgeCount } = _currentRound;
  const cx = _canvas.width / 2;
  const cy = _canvas.height / 2;
  const radius = Math.min(_canvas.width, _canvas.height) / 2 - 10;

  const wedge = game.calculateWedgeIndex(
    clickX * scaleX,
    clickY * scaleY,
    cx,
    cy,
    radius,
    wedgeCount,
  );

  if (wedge === -1) return; // Outside circle — ignore

  _resolveRound(wedge);
}
```

---

## Helper: `_resolveRound(wedge)`

Private function. Evaluate the player's choice and show feedback:

```js
function _resolveRound(wedge) {
  _clickEnabled = false;

  const { wedgeCount, outlierWedgeIndex } = _currentRound;
  const { width, height } = _canvas;
  const correct = game.checkAnswer(wedge, outlierWedgeIndex);

  const audioCtx = createAudioContext();

  if (correct) {
    game.addScore();
    highlightWedge(
      _ctx,
      width,
      height,
      wedge,
      wedgeCount,
      "rgba(40, 167, 69, 0.45)",
    );
    playSuccessSound(audioCtx);
    _triggerFlash("correct");
    _feedbackEl.textContent = "Correct! Well spotted.";
  } else {
    highlightWedge(
      _ctx,
      width,
      height,
      wedge,
      wedgeCount,
      "rgba(220, 53, 69, 0.45)",
    );
    // Reveal the correct wedge in yellow
    highlightWedge(
      _ctx,
      width,
      height,
      outlierWedgeIndex,
      wedgeCount,
      "rgba(255, 193, 7, 0.65)",
    );
    playFailureSound(audioCtx);
    _triggerFlash("wrong");
    _feedbackEl.textContent =
      "Not quite — the different piggie is highlighted.";
  }

  _updateStats();
  _continueBtn.hidden = false;
}
```

---

## Default export implementation

Replace the stub default export with:

```js
export default {
  name: "Fast Piggie",

  init(container) {
    // Inject HTML fragment (populated by main process via games:load)
    // The container already has the HTML injected by interface.js before
    // init() is called, so we only need to cache references.
    _canvas = container.querySelector("#fp-canvas");
    _ctx = _canvas.getContext("2d");
    _continueBtn = container.querySelector("#fp-continue-btn");
    _stopBtn = container.querySelector("#fp-stop-btn");
    _statsEl = container.querySelector(".fp-stats");
    _scoreEl = container.querySelector("#fp-score");
    _roundEl = container.querySelector("#fp-round-count");
    _feedbackEl = container.querySelector("#fp-feedback");
    _flashEl = container.querySelector("#fp-flash");

    // Pre-load images
    const base = new URL("../fast-piggie/images/", import.meta.url).href;
    loadImages(`${base}guinea-pig-common.png`, `${base}guinea-pig-outlier.png`)
      .then((imgs) => {
        _images = imgs;
      })
      .catch(() => {
        // Images failed to load — the game can still run without them
        _images = [null, null];
      });

    // Bind events
    _canvas.addEventListener("click", _handleClick);
    _canvas.addEventListener("keydown", _handleKeydown);
    _continueBtn.addEventListener("click", () => _runRound());
    _stopBtn.addEventListener("click", () => this.stop());
  },

  start() {
    game.startGame();
    _updateStats();
    _continueBtn.hidden = true;
    _runRound();
  },

  stop() {
    if (_roundTimer) {
      clearTimeout(_roundTimer);
      _roundTimer = null;
    }
    _clickEnabled = false;
    const result = game.stopGame();
    _feedbackEl.textContent = `Game over! Final score: ${result.score} in ${result.roundsPlayed} rounds.`;
    _continueBtn.hidden = true;
    _stopBtn.hidden = true;
    return result;
  },

  reset() {
    if (_roundTimer) {
      clearTimeout(_roundTimer);
      _roundTimer = null;
    }
    game.initGame();
    _clickEnabled = false;
    _currentRound = null;
    _selectedWedge = -1;
    if (_ctx && _canvas) {
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    }
    _updateStats();
    _feedbackEl.textContent = "";
    _continueBtn.hidden = true;
    _stopBtn.hidden = false;
  },
};
```

---

## Imports to add at the top of `index.js`

```js
import * as game from "./game.js";
```

The rendering and audio helpers are already in the same file; no additional
imports are needed for them.

---

## Constraints

- Do not remove any of the named exports added in previous prompts.
- Do not directly access `window.api` in this prompt — progress saving is
  added in a later prompt.
- `_resolveRound` increments `game.addScore()` only on a correct answer.
- All DOM queries use `container.querySelector`, not `document.querySelector`,
  so the plugin is scoped to its container.

## Verification

- `npm run lint` must pass with 0 errors.
- `npm test` must pass (no regressions).
- Manually launching `npm start` and selecting "Fast Piggie" should load the
  game, show the canvas, and play one round.
