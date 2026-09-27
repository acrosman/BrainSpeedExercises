# Card Rat tutorial (`card-rat/tutorial/`)

The first-run guided tutorial: five slides, then up to two live practice rounds. It runs on the
shared framework in `components/tutorialService.js` and `components/tutorialLauncher.js`; see
[../../../components/CLAUDE.md](../../../components/CLAUDE.md) for the framework itself.

## Files

- `tutorial-*.html`: one HTML fragment per slide, listed in order in `TUTORIAL_STEP_DEFINITIONS`.
- `tutorial.js`: everything else the tutorial does.
  - `getTutorialSteps()` loads the slides, and `PRACTICE_TEXT` holds the coach text. Any text
    that describes a click also names Space.
  - `tutorial` is the game's shared launcher (`createTutorialLauncher`). `index.js` calls
    `tutorial.startIfNeeded(...)` from Start and `tutorial.replay(...)` from Replay Tutorial,
    passing `{ container, onComplete: beginGameSession }`, and `tutorial.isActive()` and
    `tutorial.cancel()` from `stop()` and `reset()`.
  - The practice round code: `playPracticeRound`, `dealPracticeCard`, and the hooks below.

The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
`.card-rat__tutorial-highlight--*` boxes in `../style.css`. Retake the screenshot and update
those boxes together if the game layout changes.

## How practice rounds reach the game

`tutorial.js` never imports `index.js`. Instead, `index.js` hands `PRACTICE_CONTROLS` (a
`PracticeRoundControls` object) to `setPracticeControls()` in `init()`. Through it the tutorial
shows the game area and attaches the Space listener (`startRound`), deals a card with the real
display, sound, and hint (`dealCard`), removes the Space listener (`stopRound`), finds the
reaction zone for the marker (`getSlapZone`), and shows a slap's feedback (`showSlapResult`).

`index.js` calls back into the tutorial at one point: while `isPracticing()`, `handleReaction`
sends every slap to `handlePracticeSlap()` in place of `respondToCurrentCard`, and
`handleKeyDown` lets Space through even though no session is running.

## Practice rules

- Card Rat has no discrete rounds, so a practice round is a short scripted run of cards from
  `game.getPracticeSequence(round)` (round 1 ends on a pair, round 2 on a sandwich), dealt at
  the easiest pace (`calculateDisplayDuration(0)`). The tutorial keeps its own deal timer.
- The last card is the only one to slap, and it stays up until the player slaps it. An early
  slap gets the usual too-soon feedback and the cards keep coming. Slapping the last card ends
  the round with the usual hit feedback.
- Nothing is scored, and the session never starts, so `game.isRunning()` stays `false`.
- In the guided first round the last card puts the marker on the reaction zone
  (`shape: 'box'`), and the coach explains why to slap.
- The practice signal's `abort` runs `endPractice`, which stops the deal timer and removes the
  Space listener. End Game during practice (`stop()` with no session) cancels the tutorial and
  returns to the welcome panel without saving.

## Tests

`tests/tutorial.test.js` covers the slides, the text, and the controller against fake card
controls. `tests/index.test.js` runs the real module wired to the game, with `tutorialService`
and `game.js` mocked.
