# Object Track (`object-track`)

A multiple-object tracking (MOT) task. Identical circles appear in an arena and some of them
are highlighted as targets. The highlights then disappear and all circles move and bounce off
each other. When they stop, the player selects the circles that were targets.

CSS classes and element IDs use the `mot-` prefix. The root class is `.mot-game`, not
`.object-track`.

## Screen and stimulus surfaces

The stats row uses the shared `.game-hud` classes next to `.mot-game__stats` and
`.mot-game__stats-live` (see [../CLAUDE.md](../CLAUDE.md)). The phase label is forest
(`--btn-primary-bg`, 6.7:1 on paper).

Stimulus surfaces keep their own colors and never take theme tokens. Nearly every color literal
in `style.css` belongs to one of them:

- `.mot-game__arena`: the `#1a2744` arena, its `images/bg/` backgrounds, its
  `--stim-arena-border` frame, and `--stim-radius-lg` corners.
- `.mot-circle`: the ball gradients (`--mot-c-*` palettes from `CIRCLE_PALETTES`) and the state
  glows and rings for target reveal, selected, correct, and missed (`#ff9900`, `#ffe066`,
  `#ffd700`, `#22c55e`, `#ef4444`).

## Round phases (`index.js`)

`beginRound()` builds the level's circles with `game.createRoundCircles` and hands them to
`playRound(roundCircles, trackingDurationMs)`, which runs the phases: **marking** (targets
highlighted for `MARKING_DURATION_MS`, 2000) → `endMarkingPhase()` → **tracking** (a rAF loop
that replaces `_roundCircles` with `game.stepCircles(...)` each frame, for
`trackingDurationMs`) → **response** (`enterResponsePhase()`) → **feedback**
(`FEEDBACK_DURATION_MS`, 1500) → next round. `stopRound()` cancels a round at any phase.

`index.js` owns the circles of the round in progress (`_roundCircles`), so `playRound` can play
any set of circles without touching session state.

In the response phase, clicking circles toggles them on and off. The answer is **submitted
automatically** once the number selected equals the number of targets, so there is no Submit
button. A round is correct only when every selected circle is a target and no target was missed.

Circles are native `<button type="button">` elements with `aria-pressed`, so Enter and Space
fire the same delegated arena `click` handler that the mouse uses. Keep them as buttons rather
than `div role="button"`, which would need its own key handling.

## Physics (`game.js`)

All physics is pure: `createCircles` (no overlap at spawn, up to `MAX_SPAWN_ATTEMPTS`),
`updateCirclePositions` (move and bounce off walls), and `resolveCircleCollisions` (elastic
collisions between circles). Each takes an array of circles and returns a new one.
`createRoundCircles(level, width, height)` combines `createCircles` and `selectTargets` for a
level, and `stepCircles(circles, deltaMs, bounds)` runs one frame of motion and collisions.
`game.js` keeps no circles in its own state. Circle radius is 30 px.

## Difficulty

`getLevelConfig(level)`, with no maximum level:

| Setting            | Formula                                      |
| ------------------ | -------------------------------------------- |
| Circles            | `min(8 + floor(level / 3), 14)`              |
| Targets            | `min(3 + floor(level / 5), 6)`               |
| Speed (px/s)       | `250 + 15 × level`                           |
| Tracking time (ms) | `min(5000 + 500 × floor(level / 2), 10000)`  |

The speed history and trend chart track px/s. Unlike other games, higher values mean harder.

## Assets

Arena backgrounds come from `images/bg/`, which is read at init through `games:listImages` into
`ARENA_BACKGROUNDS`. One is picked at random for each round. To add a background, drop a
PNG/JPEG into that folder; no code change is needed. Circle colors come from `CIRCLE_PALETTES`.

## Tutorial

See [tutorial/CLAUDE.md](tutorial/CLAUDE.md). `game.createPracticeRound(width, height)` returns
`{ circles, trackingDurationMs }` for a level 0 round without changing state.

## Saved fields

`score` (rounds correct), `sessionDurationMs`, and `level`.
