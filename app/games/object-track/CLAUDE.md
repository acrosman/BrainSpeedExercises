# Object Track (`object-track`)

A multiple-object tracking (MOT) task. Identical circles appear in an arena and some of them
are highlighted as targets. The highlights then disappear and all circles move and bounce off
each other. When they stop, the player selects the circles that were targets.

CSS classes and element IDs use the `mot-` prefix. The root class is `.mot-game`, not
`.object-track`.

## Round phases (`index.js`)

`beginRound()` → **marking** (targets highlighted for `MARKING_DURATION_MS`, 2000) →
`endMarkingPhase()` → **tracking** (a rAF loop that calls `game.tickPhysics(delta, bounds)`,
running for the level's `trackingDurationMs`) → **response** (`enterResponsePhase()`) →
**feedback** (`FEEDBACK_DURATION_MS`, 1500) → next round.

In the response phase, clicking circles toggles them on and off. The answer is **submitted
automatically** once the number selected equals the number of targets, so there is no Submit
button. A round is correct only when every selected circle is a target and no target was missed.

## Physics (`game.js`)

All physics is pure: `createCircles` (no overlap at spawn, up to `MAX_SPAWN_ATTEMPTS`),
`updateCirclePositions` (move and bounce off walls), and `resolveCircleCollisions` (elastic
collisions between circles). Each takes an array of circles and returns a new one. Only
`initRound` and `tickPhysics` change the module-level `circles`. Circle radius is 30 px.

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

## Saved fields

`score` (rounds correct), `sessionDurationMs`, and `level`.
