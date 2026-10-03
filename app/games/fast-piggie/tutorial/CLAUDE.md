# Fast Piggie tutorial (`fast-piggie/tutorial/`)

Five slides, then up to two practice rounds, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to Fast Piggie.

- `PRACTICE_TEXT`: any text that describes a click also gives the arrow-key and Enter
  alternative.
- Start and Replay Tutorial pass `onComplete: _beginGameSession`.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  percentage-positioned `.fp-tutorial-highlight--*` boxes in `../style.css` (`--stats` blue
  `--callout-1`, `--board` green `--callout-2`, `--controls` orange `--callout-3`, each with the
  shared `.tutorial-callout` halo). The screenshot follows the standard in
  [../../../components/CLAUDE.md](../../../components/CLAUDE.md), taken while the guinea pigs
  are on the wheel (they show for 800 ms, so capture as soon as the sprites are drawn). If the
  layout changes, retake the screenshot and move the boxes together.
- The game area is tall and narrow, so `.fp-tutorial-image` caps its height to the window less
  the slide's text, and `.fp-tutorial-image-wrap` shrinks to the image to keep the boxes
  aligned.

## Practice controls and hooks

`PRACTICE_CONTROLS` (`PracticeRoundControls`) lets the tutorial show the game area, play a
round with the real `_playRound` display code (`playRound`), stop it (`stopRound`), find the
correct wedge and where to ring it (`getCorrectWedge`, and `getWedgeMarker`, which uses
`wedgeMarkerRegion()`), redraw the wheel (`redrawBoard`), and give the usual answer feedback
(`showAnswer`).

`index.js` calls into the tutorial at two points:

- `_resolveRound`, while `isPracticing()` → `finishPracticeRound(wedge)`, in place of
  `addScore`/`addMiss`, the stats, and the auto-advance.
- `_clearBoard` → `getPracticeHintWedge()`: the wedge to keep shaded, so hover and keyboard
  highlights do not erase the hint. It is -1 outside a guided round.

## Practice rules

- Rounds come from `game.generatePracticeRound()`: 3 images, 6 wedges, 800 ms.
- In the guided first round, once the piggies vanish, the correct wedge is shaded and ringed.
  `finishPracticeRound` clears the hint before the result colors are drawn.
- `endPractice` (on abort) cancels the round timers.
