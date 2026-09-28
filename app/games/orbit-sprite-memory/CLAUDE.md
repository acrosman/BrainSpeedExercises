# Orbit Sprite Memory (`orbit-sprite-memory`)

A task that trains memory for spatial sequences. Sprites flash one at a time at positions around
a circle. One target sprite appears exactly 3 times, and distractor sprites appear once or twice
each. The player then selects the 3 positions where the target appeared.

CSS classes and element IDs use the `osm-` prefix. The root class is `.orbit-memory`.

## Round generation (`game.js`)

`createRound(level)` does the following:

1. Picks a target and `getDistractorCount(level)` distractors (`2 + level`, at most 7) from the
   8 sprites.
2. `buildPlaybackSequence` shows the target 3 times and each distractor once, then gives the
   first `level` distractors a second showing. The sequence is capped at `MAX_POSITION_COUNT`
   (12) and shuffled.
3. `assignPositions` gives every step its own position. The number of positions on the circle
   always equals the number of steps, so the circle gets more crowded as the level rises.

`evaluateSelection` requires an exact match with `primaryPositions`.

## Sprites

`images/sprites.png` is a 4×2 sheet (`SPRITE_COLUMNS` × `SPRITE_ROWS`). Sprite IDs 0–7 map to
background positions through `getSpriteBackgroundPosition()` in `index.js`. If you change the
sheet layout, update those constants and `TOTAL_SPRITES` together.

## Difficulty and flow

- Each sprite shows for `1100 − 90 × level` ms, with a floor of 250 ms. The standard 3-up
  (+1) / 3-down (−2) staircase applies.
- `startRound()` hands the level's round to `playRound(round)`, which sets the target preview
  and plays any round without touching session state. `stopRound()` cancels a round at any
  phase and clears the board.
- Playback (`startPlayback`) is followed by the choice buttons (`renderChoiceButtons`, placed
  with `getCircleCoordinates`). The answer is **submitted automatically** when the third
  position is chosen, and the player cannot select more than 3.
- After each answer, `showRoundReveal` shows all positions for `REVEAL_ALL_MS` (700), and the
  next round starts after `NEXT_ROUND_DELAY_MS` (900).

## Best stats

The welcome and end panels show the best score and best level. `level` is stored 0-based and
displayed +1.

- `saveScore(...).then(updateBestStats)` refreshes them after each session.
- `loadBestStatsFromProgress()` fills them in from `loadGameScore` when the game is initialized
  and on reset.

## Tutorial

See [tutorial/CLAUDE.md](tutorial/CLAUDE.md). `game.createPracticeRound()` returns a level 0
round without changing state.

## Saved fields

`score` (rounds correct), `sessionDurationMs`, and `level`. `lowestDisplayTime` is the display
time at the level reached.

## Other notes

`index.js` re-exports `returnToMainMenu` from `gameUtils.js`. Tests depend on that export.
