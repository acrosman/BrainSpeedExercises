# Fast Piggie (`fast-piggie`)

A visual search task under time pressure. Guinea Pig images flash briefly in the wedges of a
circular wheel drawn on a `<canvas>`. One of them is the outlier (the other sprite). After the
images disappear, the player picks the wedge where the outlier was.

## Files

- `game.js`: round generation, the two difficulty axes, and session bests. `generateRound()`
  returns `{ wedgeCount, imageCount, displayDurationMs, outlierWedgeIndex }`.
  `generatePracticeRound()` is the same at level 0 (3 images, 6 wedges, 800 ms).
  `calculateWedgeIndex()` converts a click position on the canvas into a wedge index.
- `index.js`: everything on the canvas. `loadImages()` splits `images/PiggiesSource.jpg` into
  left and right halves (normal and outlier). Each half is copied into its own offscreen canvas
  with a 2 px `SPRITE_INSET`, which stops the seam from bleeding into small draws.
  `drawBoard()`, `clearImages()`, `highlightWedge()`, and `wedgeMarkerRegion()` are exported
  for tests.
- `tutorial/`: the first-run tutorial. `tutorial.js` lists the step HTML files and the coach
  text for practice rounds (`PRACTICE_TEXT`). `start()` in `index.js` runs them through
  `runGuidedTutorialIfNeeded` before the session begins. The screenshot step highlights regions
  of `images/tutorialScreenshot.png` with the percentage-positioned `.fp-tutorial-highlight--*`
  boxes in `style.css`. Retake the screenshot and update those boxes together if the game
  layout changes.

## Tutorial practice rounds

After the slides, `_playPracticeRound` plays up to two rounds from `generatePracticeRound()`,
using the same `_playRound` display code as the real game. The session is never started, so
`game.isRunning()` stays `false`. `_resolveRound` sends practice answers to
`_finishPracticeRound`, which shows the usual feedback but skips `addScore`/`addMiss` and the
auto-advance. In the guided round, once the piggies vanish, the correct wedge is shaded
(`_practice.hintWedge`, redrawn by `_clearBoard()` after hover and keyboard highlights) and
ringed by the tutorial marker at `wedgeMarkerRegion()`. The practice signal's `abort` runs
`_endPractice`, which cancels the round timers. End Game during practice (`stop()` with no
session) cancels the tutorial and returns to the welcome panel without saving.

## Difficulty: two coupled levels

- `imageLevel` sets how many images appear: `3 + imageLevel`, up to 42. The wedge count is
  `max(6, imageCount)`, up to 42. When fewer images than wedges appear, `index.js` assigns them
  to random wedges (`slotAssignment`) and maps answers back through it. Keep that mapping in
  sync when you change round generation.
- `speedLevel` sets display time: 800 ms minus 100 ms per level down to 100 ms, then each level
  moves halfway toward 10 ms (rounded down to a multiple of 5).
- The staircase raises `imageLevel` on 3 correct in a row. Above 100 ms the speed level rises
  with it. Below that threshold the speed level rises only on every other image-level increase
  (`speedIncreaseNext`). On 3 misses `speedLevel` drops by 2, and `imageLevel` snaps back to
  `canonicalImageLevel(speedLevel)`. Test both phases when you touch this logic.

## Saved fields

`score` and `sessionDurationMs`. `level` is filled from the session `maxScore`, not from a level
counter. `lowestDisplayTime` comes from `lowestRoundDisplayMs`. `maxPiggies` (max) is passed
through `extraFields`. `topSpeedMs` and `mostRounds` are tracked in `game.js` but not saved.

## Controls

Click a wedge on the canvas. With the keyboard, the canvas (`role="application"`) is focusable:
arrow keys move the highlighted wedge, and Enter or Space submits.
