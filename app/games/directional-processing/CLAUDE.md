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
- `index.js`: runs the trial cycle: stimulus (rAF, animating phase at `PHASE_SPEED_RAD_PER_MS`)
  → mask (`MASK_DURATION_MS` 150) → short pause → response enabled → feedback flash.
- `tutorial/`: the first-run tutorial. `tutorial.js` lists the step HTML files and the coach
  text for practice rounds (`PRACTICE_TEXT`). `start()` runs them through
  `runGuidedTutorialIfNeeded`, and Replay Tutorial through `runGuidedTutorial`, before the
  session begins.

## Tutorial practice rounds

After the slides, `playPracticeTrial` plays up to two trials from `generatePracticeTrial()`
through the same `runStimulusPhase` → mask → response code as the real game. The session is
never started, so `game.isRunning()` stays `false`. `handleDirectionResponse` sends practice
answers to `finishPracticeTrial`, which shows the usual feedback (sound, announcement, flash,
and the correct-button highlight after a miss) but skips `recordTrial`, the stats, the trend
chart, and the next trial. In the guided first round, `runStimulusPhase`'s `onStimulusEnd`
callback scrolls the correct direction button into view (the pad can sit below the fold, and
the coach is sticky) and rings it (`shape: 'box'`). The coach text names the direction and its
arrow key, since the marker is not announced. The practice signal's `abort` runs
`endPractice`, which cancels the animation frames and timers. End Game during practice
(`stop()` with no session) cancels the tutorial and returns to the welcome panel without
saving.

## Difficulty

`LEVELS` in `game.js` has 10 entries. Each one lowers `displayDurationMs` (500 → 40 ms), and
from level 3 on it also lowers `contrast` (1.0 → 0.3). `level` is an index into `LEVELS`. Change
difficulty by editing that table, not by adding special-case logic.

## Saved fields

`score`, `level`, and `sessionDurationMs`, plus `lastTrialsCompleted` as a plain-object
`extraFields`. The game saves only when a session is running and `trialsCompleted > 0`.
`stop()` with no session returns an idle result and leaves the screen alone.

## Controls

Arrow keys, or the four on-screen direction buttons. Responses are ignored until the mask ends
(`_responseEnabled`). Arrow keys call `preventDefault()` only while the game is running or a
practice trial is in progress.

## Tests

`tests/gabor.test.js` covers the renderer. Stub `canvas.getContext('2d')` (`createImageData`,
`putImageData`, `fillRect`) in jsdom.
