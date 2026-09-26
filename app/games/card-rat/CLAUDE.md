# Card Rat (`card-rat`)

A go/no-go reaction task modeled on Egyptian Rat Screw. Cards are dealt one at a time on a timer.
The player "slaps" (Space or click) only on trigger cards:

- **Pair:** same rank as the previous card.
- **Sandwich:** same rank as the card two back, with a different card between them.
- **Joker:** any joker.

A joker never forms a pair or sandwich with a card next to it.

## Files

- `game.js`: builds a 55-card deck (52 + `joker1..3`), reshuffles after each full pass
  (`deckPasses`), and detects triggers. `dealNextCard()` first calls `finalizeCurrentCard()`, so
  **a miss is scored when the next card is dealt**, not when a timer fires.
  `respondToCurrentCard()` returns `'hit' | 'false-alarm' | 'ignored'`. A second slap on the
  same trigger returns `'ignored'`. `getSlapReason()` is the pure trigger check
  (`'joker' | 'pair' | 'sandwich' | null`) that `dealNextCard()` and practice rounds share.
  `PRACTICE_SEQUENCES` / `getPracticeSequence(round)` hold the scripted practice cards.
- `cardSvg.js`: despite the name, it has no SVG. It returns CSS background-position styles that
  cut cards out of `images/cards-sprite.png`, plus the paths for the joker and card-back PNGs.
  The sprite geometry constants must match that image exactly. Update them together if the
  sprite changes.
- `tutorial/`: the first-run tutorial. `tutorial.js` lists steps as
  `{ title, contentPath }` pointing to the `tutorial-step-*.html` fragments, plus the coach
  text for practice rounds (`PRACTICE_TEXT`). `getTutorialSteps()` loads the steps with
  `loadTutorialSteps` from the tutorial service. `start()` runs them through
  `runGuidedTutorialIfNeeded`, and `#cr-replay-tutorial-btn` through `runGuidedTutorial`,
  before the session begins.

## Tutorial practice rounds

Card Rat has no discrete rounds, so a practice round is a short scripted run of cards from
`getPracticeSequence(round)` (round 1 ends on a pair, round 2 on a sandwich). `dealPracticeCard`
deals them with the real card display at the easiest pace (`calculateDisplayDuration(0)`). The
last card is the only one to slap, and it stays up until the player slaps it. `handleReaction`
sends practice slaps to `handlePracticeReaction`: an early slap gets the usual too-soon
feedback and the cards keep coming, and slapping the last card ends the round with the usual
hit feedback. Nothing goes through `respondToCurrentCard`, so nothing is scored, and the session
is never started (`game.isRunning()` stays `false`). In the guided first round the last card
puts the marker on the reaction zone (`shape: 'box'`) and the coach explains why to slap. The
Space listener is attached for practice and removed by `endPractice` when the practice signal
aborts. End Game during practice (`stop()` with no session) cancels the tutorial and returns to
the welcome panel without saving.

## Difficulty

Display time per card is `round(1400 × 0.85^level)`, with a floor of 120 ms and a maximum level
of 50. Hits count as correct. Misses and false alarms both count as wrong, so the standard
3-up / 3-down staircase applies to both.

## Saved fields

`score`, `sessionDurationMs`, and `lowestDisplayTime`, plus `bestTriggerHits` (max) through
`extraFields`. It does not save `level`. `stop()` with no session running returns an idle result
without saving or changing the screen.

## Controls

A `document`-level Space listener (`attachGlobalKeyListener` / `detachGlobalKeyListener`) makes
Space work wherever focus is. The reaction-zone button also slaps when clicked. A checkbox toggles
the hint text under the cards (`updateHintVisibility()`).
