# Directional Processing (`directional-processing`)

A visual motion-discrimination task. A drifting Gabor patch flashes briefly and is followed by a
mask. The player reports the direction of motion (up, down, left, or right). The design follows
the speed-of-processing training used in the ACTIVE study.

## Files

- `gabor.js`: a standalone canvas renderer that does not depend on this game. Keep it that way
  so it can be reused. `computeGaborPixels` does the pixel math and is testable without a
  canvas. `drawGabor` and `drawMask` paint onto a `<canvas>`. `DIRECTION_PARAMS` maps each
  direction to the grating orientation and drift sign. `COLOR_FAMILIES` / `pickColorFamily()`
  vary the patch hue from trial to trial.
- `game.js`: the level table and the staircase. It knows nothing about rendering.
  `generatePracticeTrial()` returns a random direction at `LEVELS[0]` without changing state.
- `index.js`: runs the trial cycle: stimulus (rAF, animating phase at
  `gabor.PHASE_SPEED_RAD_PER_MS`) → mask (`MASK_DURATION_MS` 150) → short pause → response
  enabled → feedback flash.
- `tutorial/`: the first-run tutorial. See [tutorial/CLAUDE.md](tutorial/CLAUDE.md).

## Difficulty

`LEVELS` in `game.js` has 10 entries. Each one lowers `displayDurationMs` (500 → 40 ms), and
from level 3 on it also lowers `contrast` (1.0 → 0.3). `level` is an index into `LEVELS`.

## Saved fields

`score`, `level`, and `sessionDurationMs`, plus `lastTrialsCompleted` as a plain-object
`extraFields`. The game saves only when `trialsCompleted > 0`.

## Screen and stimulus surfaces

The stats row uses the shared `.game-hud` classes next to `.dp-stats` and `.dp-stats-live` (see
[../CLAUDE.md](../CLAUDE.md)). The welcome and end panels take their look from `.game-welcome`
and `.game-end-panel`, so `.dp-panel` sets only spacing. `#dp-game-area` is the same card as the
welcome panel; the end panel stays bare because its results ledger is already a card.

The direction keys (`.dp-dir-btn`) are notebook keys: card paper, a `--border-strong` edge,
`--radius-md`, and a 2px bottom edge that flattens on `:active`. The direction keys keep their
fixed 100×56 size. A disabled key lies flat on `--bg-sunken` with `--text-subtle` labels rather
than fading. After a miss, `.dp-dir-btn--correct` marks the right key with the
`--feedback-correct-*` tokens; the pad is disabled by then, so that rule outranks the disabled
look. `.dp-dir-btn--selected` uses `--selected-bg` with a `--focus-ring` border; nothing uses
`--selected` yet. Other in-game actions use the shared `.game-btn--primary` and
`.game-btn--secondary`.

Stimulus surfaces keep their own colors and never take theme tokens:

- `.dp-canvas`: the `rgb(128, 128, 128)` background, its `--stim-cell-border` frame, and
  `--stim-radius-lg` corners.
- Everything `gabor.js` draws on the canvas: the patch colors from `COLOR_FAMILIES` and the mask
  fill.
- `.dp-stage--flash-correct` and `.dp-stage--flash-wrong`: the `::after` flash colors.

## Controls

Arrow keys, or the four on-screen direction buttons. Responses are ignored until the mask ends
(`_responseEnabled`). Arrow keys call `preventDefault()` only while the game is running or a
practice trial is in progress.

## Tests

`tests/gabor.test.js` covers the renderer. Stub `canvas.getContext('2d')` (`createImageData`,
`putImageData`, `fillRect`) in jsdom.
