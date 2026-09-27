# High Speed Memory tutorial (`high-speed-memory/tutorial/`)

Five slides, then up to two practice rounds, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to High Speed Memory.

- `PRACTICE_TEXT` holds the coach and result text. Any text that describes a click also gives
  the Tab and Enter alternative.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  percentage-positioned `.hsm-tutorial-highlight--*` boxes in `../style.css`. The screenshot is
  the `#hsm-game-area` element during a level 1 reveal. If the layout changes, retake it and
  move the boxes together.

## Practice controls and hooks

`PRACTICE_CONTROLS` (`PracticeRoundControls`) lets the tutorial show the game area, play a grid
with the real reveal and flip code (`playRound`), stop it (`stopRound`), find card buttons, and
write to the feedback region. `index.js` marks found cards `matched` in the grid the tutorial
handed it, which is how the tutorial knows which card to ring next.

`index.js` calls into the tutorial at three points, each only while `isPracticing()`:

- `hideAllCards` → `promptPracticeResponse()`: in a guided round, ring the first greyhound
  (Primary) card; otherwise show the answer prompt.
- `onPrimaryFound`, before the last greyhound → `guidePracticeResponse()`: ring the next
  greyhound card still face down. The player may find a different one than the ringed card.
- `onPrimaryFound` on the last greyhound, or `onWrongGuess` →
  `finishPracticeRound(success)`, in place of scoring, the staircase, the trend chart, and the
  next round. A wrong guess reveals the greyhound cards at once and locks the board.

## Practice rules

- Rounds come from `game.createPracticeRound()`: a 3×3 grid shown for 1500 ms.
- `finishPracticeRound` resolves with `{ correct, feedback }`. A correct round is announced in
  the feedback region. A miss is left to the coach banner, which offers Try Again. The retry
  deals a new grid, as the real game does after a wrong guess.
- `endPractice` (on abort) stops the round.
- The coach banner sits above the game, so `style.css` shrinks the grid while
  `.tutorial-coach` is present. That keeps every card on screen during the reveal.
