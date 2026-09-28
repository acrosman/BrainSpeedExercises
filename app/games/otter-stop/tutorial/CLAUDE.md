# Otter Stop tutorial (`otter-stop/tutorial/`)

Five slides, then up to two practice rounds, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to Otter Stop.

- `PRACTICE_TEXT` holds the coach text. Any text that asks for a press names both Space and a
  click. `mistakes(misses, noGoHits)` builds the Try Again feedback.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  percentage-positioned `.os-tutorial-highlight--*` boxes in `../style.css`. The screenshot is
  the `#os-game-area` element during a level 3 session in a 1512 px wide window, scaled to
  640 px wide. If the layout changes, retake it and move the boxes together.
- The "Otters and the Fish" slide shows `images/go/go-1.png` as its example otter. If that file
  is renamed or removed, update the slide.

## Practice controls

`PRACTICE_CONTROLS` (`PracticeRoundControls`) lets the tutorial show the game area, play a run
of trials through the game's own loop (`playTrials`), stop it (`stopTrials`), and find the
picture area for the marker (`getStimulusArea`).

A practice round is a `TrialRun` built by `createPracticeRun`. Its `next()` gives the scripted
stimuli, and its `record()` counts mistakes instead of scoring. Space, clicks, the display
window, and the feedback all come from the real loop, so `index.js` has no practice hooks and
no `isPracticing()` checks.

## Practice rules

- Rounds come from `game.createPracticeSequence(round)`: round 1 is three otters and the fish,
  round 2 is five otters (the longest run at level 1) and the fish.
- Round 1 is guided. Each otter waits for a press (`displayMs: null`) with the picture area
  marked (`shape: 'box'`). The fish removes the marker and stays up for the usual level 1
  interval, `game.getIntervalMs(0)`.
- Round 2 runs at the level 1 interval, `game.getIntervalMs(0)`, with no marker.
- The round resolves when the fish's trial is recorded, while its feedback is still showing.
  Any mistake resolves `{ correct: false, feedback }`, and the retry plays the same script. The
  loop then ends the run itself after the feedback, so Space is ignored until the next round.
- Each round scrolls the picture area into view, because the coach banner pushes the game down.
- `endPractice` (on abort) calls `stopTrials`.
