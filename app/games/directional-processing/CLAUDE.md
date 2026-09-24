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
- `index.js`: runs the trial cycle: stimulus (rAF, animating phase at `PHASE_SPEED_RAD_PER_MS`)
  → mask (`MASK_DURATION_MS` 150) → short pause → response enabled → feedback flash.

## Difficulty

`LEVELS` in `game.js` has 10 entries. Each one lowers `displayDurationMs` (500 → 40 ms), and
from level 3 on it also lowers `contrast` (1.0 → 0.3). `level` is an index into `LEVELS`. Change
difficulty by editing that table, not by adding special-case logic.

## Saved fields

`score`, `level`, and `sessionDurationMs`, plus `lastTrialsCompleted` as a plain-object
`extraFields`. The game saves only when `trialsCompleted > 0`.

## Controls

Arrow keys, or the four on-screen direction buttons. Responses are ignored until the mask ends
(`_responseEnabled`). Arrow keys call `preventDefault()` only while the game is running.

## Tests

`tests/gabor.test.js` covers the renderer. Stub `canvas.getContext('2d')` (`createImageData`,
`putImageData`, `fillRect`) in jsdom.
