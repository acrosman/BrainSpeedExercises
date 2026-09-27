# High Speed Memory tutorial (`high-speed-memory/tutorial/`)

The first-run guided tutorial: five slides, then up to two live practice rounds. It runs on the
shared framework in `components/tutorialService.js`; see
[../../../components/CLAUDE.md](../../../components/CLAUDE.md) for the framework itself.

## Files

- `tutorial-*.html`: one HTML fragment per slide, listed in order in `TUTORIAL_STEP_DEFINITIONS`.
- `tutorial.js`: everything else the tutorial does.
  - `getTutorialSteps()` loads the slides, and `PRACTICE_TEXT` holds the coach and result text.
    Any text that describes a click also gives the Tab and Enter alternative.
  - `startTutorialIfNeeded(options)` (the Start button) and `replayTutorial(options)` (Replay
    Tutorial) launch the tutorial, then call `options.onComplete` to begin the session. They
    ignore a second launch while one is loading or running. `isTutorialActive()` and
    `cancelTutorial()` let `index.js` end it from `stop()` and `reset()`.
  - The practice round code: `playPracticeRound` plus the hooks below.

The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
percentage-positioned `.hsm-tutorial-highlight--*` boxes in `../style.css`. Retake the
screenshot (the `#hsm-game-area` element during a level 1 reveal) and update those boxes
together if the game layout changes.

## How practice rounds reach the game

`tutorial.js` never imports `index.js`. Instead, `index.js` passes `PRACTICE_CONTROLS` (a
`PracticeRoundControls` object) in the launch options. Through it the tutorial shows the game
area, plays a grid with the real reveal and flip code (`playRound`), stops it (`stopRound`),
finds card buttons, and writes to the feedback region. `index.js` marks found cards `matched`
in the grid the tutorial handed it, which is how the tutorial knows which card to ring next.

`index.js` calls back into the tutorial at three points, each only while `isPracticing()`:

- `hideAllCards` → `promptPracticeResponse()`: in a guided round, ring the first greyhound
  card; otherwise show the answer prompt.
- `onPrimaryFound`, before the last greyhound → `guidePracticeResponse()`: ring the next
  greyhound card still face down. The player may find one other than the ringed card.
- `onPrimaryFound` on the last greyhound, or `onWrongGuess` →
  `finishPracticeRound(success)`, in place of scoring, the staircase, the trend chart, and the
  next round. A wrong guess shows the greyhound cards at once and locks the board.

## Practice rules

- Rounds come from `game.createPracticeRound()` (3×3 grid, 1500 ms) and never start the
  session, so `game.isRunning()` stays `false` and nothing is scored or saved.
- `finishPracticeRound` resolves the round with `{ correct, feedback }`. A correct round is
  announced in the feedback region. A miss is left to the coach banner, which offers Try Again.
  The retry deals a new grid, as the real game does after a wrong guess.
- The practice signal's `abort` runs `endPractice`, which stops the round. End Game during
  practice (`stop()` with no session) cancels the tutorial and returns to the welcome panel
  without saving.
- The coach banner sits above the game, so `style.css` shrinks the grid while
  `.tutorial-coach` is present. That keeps every card on screen during the reveal.

## Tests

`tests/tutorial.test.js` covers the slides, the text, and the controller against fake round
controls. `tests/index.test.js` runs the real module wired to the game, with only
`tutorialService` and `game.js` mocked.
