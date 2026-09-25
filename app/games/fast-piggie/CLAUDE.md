# Fast Piggie (`fast-piggie`)

A visual search task under time pressure. Guinea Pig images flash briefly in the wedges of a
circular wheel drawn on a `<canvas>`. One of them is the outlier (the other sprite). After the
images disappear, the player picks the wedge where the outlier was.

## Files

- `game.js`: round generation, the two difficulty axes, and session bests. `generateRound()`
  returns `{ wedgeCount, imageCount, displayDurationMs, outlierWedgeIndex }`.
  `calculateWedgeIndex()` converts a click position on the canvas into a wedge index.
- `index.js`: everything on the canvas. `loadImages()` splits `images/PiggiesSource.jpg` into
  left and right halves (normal and outlier). Each half is copied into its own offscreen canvas
  with a 2 px `SPRITE_INSET`, which stops the seam from bleeding into small draws.
  `drawBoard()`, `clearImages()`, and `highlightWedge()` are exported for tests.
- `tutorial/`: the first-run tutorial. `tutorial.js` lists the step HTML files, and
  `start()` in `index.js` shows them through `showTutorialIfNeeded` before the session begins.
  The screenshot step highlights regions of `images/tutorialScreenshot.png` with the
  percentage-positioned `.fp-tutorial-highlight--*` boxes in `style.css`. Retake the screenshot
  and update those boxes together if the game layout changes.

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
