# Orbit Sprite Memory tutorial (`orbit-sprite-memory/tutorial/`)

Five slides, then up to two practice rounds, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to Orbit Sprite Memory.

- `PRACTICE_TEXT` holds the coach and result text. Any text that describes a click also gives
  the Tab and Enter alternative. The player-facing word for a choice button is "spot". The
  guided text names the ringed spot by its accessible name ("Position 3"), because the marker
  is `aria-hidden`.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  percentage-positioned `.osm-tutorial-highlight--*` boxes in `../style.css`. The screenshot is
  the `#osm-game-area` element during a level 1 playback in a 1512 px wide window, scaled to
  640 px wide. If the layout changes, retake it and move the boxes together.
- The "What to Look For" slide shows the whole `../images/sprites.png` sheet. If the sheet
  changes, update that slide's `alt` text.

## Practice controls and hooks

`PRACTICE_CONTROLS` (`PracticeRoundControls`) lets the tutorial show the game area, find the
board (`getBoard`), play a round with the real playback and choice buttons (`playRound`), stop
it (`stopRound`), find position buttons, and write to the feedback region.

`index.js` calls into the tutorial at three points, each only while `isPracticing()`:

- The end of `startPlayback` → `promptPracticeResponse()`: in a guided round, ring the first
  spot where the target appeared; otherwise show the answer prompt.
- `togglePosition`, when fewer than three spots are chosen →
  `guidePracticeResponse(selectedPositions)`: ring the first target spot not yet chosen. A
  wrong choice does not move the ring, and clearing a target spot moves it back.
- `submitSelection` → `finishPracticeRound(correct)`, after the board flash and sound, in place
  of scoring, the stats, the trend chart, and the next round. It shows every rabbit in its spot
  (`showRoundReveal`) and leaves them there until the next round or the end of the tutorial.

## Practice rules

- Rounds come from `game.createPracticeRound()`: the level 0 round (5 rabbits, 1100 ms each).
- The coach banner sits above the game, so `../style.css` shrinks the board while
  `.tutorial-coach` is present, and each practice round scrolls the board into view. That keeps
  the whole circle on screen during playback.
- `finishPracticeRound` resolves with `{ correct, feedback }`. A correct round is announced in
  the feedback region. A miss is left to the coach banner, which offers Try Again. The retry
  plays a new round, as the real game does.
- `endPractice` (on abort) stops the round.
