# Field of View (`field-of-view`)

A Useful Field of View (UFOV)-style task that trains divided attention. Each trial briefly shows
a grid with a kitten in the center and a cat toy on the outer ring. A full-field mask follows.
The player must then do two things: identify which kitten was in the center (the sitting
`primary-kitten` or the leaping `secondary-kitten`), and click the grid cell where the toy
appeared. A trial counts as correct only when **both** answers are right.

## Files

The controller is split across several modules:

- `game.js`: SOA staircase, trial layout (`createTrialLayout()`), accuracy buffer, and threshold
  history. `createPracticeTrial()` returns `{ layout, soaMs }` for a 3×3 layout at
  `START_SOA_MS` without changing state.
- `render.js`: formatting helpers and DOM rendering. `labelForIcon` names each stimulus the way
  players see it ("Sitting kitten", "Yarn ball"), and `cellPosition` turns a cell index into
  its one-based row and column. Every function takes its elements as arguments, and the
  module has no state of its own. Add new rendering code here, not in `index.js`.
- `progress.js`: wraps `saveScore`, saving under `game.GAME_ID`.
- `index.js`: the trial cycle and lifecycle.
- `tutorial/`: the first-run tutorial. See [tutorial/CLAUDE.md](tutorial/CLAUDE.md).

## Trial timing

Stimulus shown for the current SOA (rAF-timed) → mask `images/Field.png` for 120 ms → response
phase. After feedback, a 350 ms gap separates trials. The difficulty value is the SOA itself, in
milliseconds:

- Starts at 500 ms and is clamped between 16.67 and 1000 ms. Each step is one 60 Hz frame
  (16.67 ms).
- 3 correct in a row lowers the SOA by one frame. 3 wrong in a row raises it by two frames.
- The grid is 3×3 while the SOA is above 300 ms and 5×5 at or below it
  (`getGridSizeForCurrentSoa`), so the toy can appear farther out as the player improves.

Timing values are fractional. Round them only for display, with `render.formatMs`.

## Saved fields

`score` is `round(1000 / thresholdMs)`. `lowestDisplayTime` is the threshold in milliseconds.
Through `extraFields`: `bestThresholdMs` (kept for older saves), `lastThresholdMs`,
`lastRecentAccuracy`, the full `thresholdHistory`, and `trialsCompleted`. The game saves only
when `trialsCompleted > 0`, and does not save `level`.

## Controls

All responses use native buttons: two kitten buttons (`aria-pressed`) and the location grid built
by `render.renderLocationGrid`. There is no custom key handler. The response is submitted
automatically once both a kitten and a location are selected.
