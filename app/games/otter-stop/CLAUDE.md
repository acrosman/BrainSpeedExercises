# Otter Stop (`otter-stop`)

A go/no-go task that trains inhibitory control. Otter images ("go") flash in quick succession,
and the player presses Space (or clicks) for each one. When the fish ("no-go") appears, the
player must hold back.

CSS classes and element IDs use the `os-` prefix.

## Stimuli and assets

- Go images are the files in `images/go/`, discovered at init by `loadGoImages()` through
  `games:listImages` and passed to `game.setGoKeys()`. Go keys are **full file names**, such as
  `go-1.png`. The defaults in `GO_KEYS` are used until the list arrives or if it is empty. To add
  an otter, drop a PNG/JPEG into `images/go/`; no code change is needed.
- The no-go key is `'no-go'`, which resolves to `images/no-go.png`. Feedback images are
  `images/success.png` and `images/failure.png`.
- `GO_KEYS` and `IMAGE_KEYS` are exported `let` bindings that `setGoKeys` reassigns. Import them
  as live bindings; do not copy them.

## Trial logic (`game.js`)

- `pickNextImage()` shows a run of go images and then one no-go. Run length is random in
  `[0, 5 + level]` (0 means the fish comes next). After any wrong outcome, `forceGoNext`
  guarantees the next stimulus is a go image.
- `recordResponse(isNoGo, spacePressed)` scores the trial:
  - Go + press: correct.
  - No-go + no press: correct, and **the only outcome that counts toward the level-up streak**.
  - Go + no press: a miss.
  - No-go + press: a no-go hit.

  Three wrong in a row costs two levels.
- The display interval is `1500 × 0.88^level` ms, with a floor of 150 ms.
- Go reaction times feed `getAverageResponseMs()`. The UI refreshes the average only after a
  no-go trial.
- `sessionBestScore` deliberately survives `initGame()`.

## Controller (`index.js`)

`beginTrial` shows the image and arms `_trialTimer` for the interval. A press ends the trial
early. `endTrial` records the result. Feedback (800 ms) appears only after a no-go trial or a
missed go. Trials are separated by a 120 ms `ISI_MS`.

## Saved fields

`score`, `sessionDurationMs`, and `level`. `lowestDisplayTime` is the current interval.
`maxSequenceLength` (max) is passed through `extraFields`.
