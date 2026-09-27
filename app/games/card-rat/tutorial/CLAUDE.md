# Card Rat tutorial (`card-rat/tutorial/`)

Five slides, then up to two practice rounds, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to Card Rat.

- `PRACTICE_TEXT`: any text that describes a click also names Space.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  `.card-rat__tutorial-highlight--*` boxes in `../style.css`. If the layout changes, retake the
  screenshot and move the boxes together.

## Practice controls and hooks

`PRACTICE_CONTROLS` (`PracticeRoundControls`) lets the tutorial show the game area and attach
the Space listener (`startRound`), deal a card with the real display, sound, and hint
(`dealCard`), remove the Space listener (`stopRound`), find the reaction zone for the marker
(`getSlapZone`), and show a slap's feedback (`showSlapResult`).

While `isPracticing()`, `index.js` sends every slap from `handleReaction` to
`handlePracticeSlap()` in place of `respondToCurrentCard`, and `handleKeyDown` lets Space
through even though no session is running.

## Practice rules

- Card Rat has no discrete rounds, so a practice round is a short scripted run of cards from
  `game.getPracticeSequence(round)` (round 1 ends on a pair, round 2 on a sandwich), dealt at
  the easiest pace (`calculateDisplayDuration(0)`). The tutorial runs its own deal timer.
- Only the last card should be slapped, and it stays up until the player slaps it. An early
  slap gets the usual too-soon feedback and the cards keep coming.
- In the guided first round, the last card puts the marker on the reaction zone
  (`shape: 'box'`), and the coach explains why to slap.
- `endPractice` (on abort) stops the deal timer and removes the Space listener.
