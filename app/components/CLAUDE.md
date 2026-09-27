# Shared components (`app/components/`)

The module table and general rules for components are in [../CLAUDE.md](../CLAUDE.md). This
file holds detail that only matters when you work with a specific component.

## Tutorial framework (`tutorialService.js`, `tutorialCoach.js`)

`tutorialService.js` shows tutorial slides and runs guided practice rounds. Whether the player
has seen a game's tutorial is stored under `progress.tutorials[gameId]`. Games reach
`tutorialCoach.js` only through the practice-round context described below.

### Slides

- Steps are `{ title, content }`, where `content` is an HTML string.
- `loadTutorialSteps(definitions)` builds steps from `{ title, contentPath }` definitions whose
  content is an HTML fragment file. It caches each file and shows fallback text if one fails
  to load (`clearTutorialMarkupCache()` resets the cache in tests).
- `showTutorialIfNeeded(gameId, steps, container, onComplete)` shows the overlay only the first
  time. Otherwise it calls `onComplete` immediately. `showTutorial(...)` always shows it, which
  suits a "How to play" replay button. These are slides only.
- Overlay, coach, and marker styles live in `.tutorial-overlay*`, `.tutorial-coach*`, and
  `.tutorial-marker*` in `app/styles/game-shared.css`. Do not restyle them per game.

### Guided tutorials (slides, then live practice)

`runGuidedTutorial(options)` and `runGuidedTutorialIfNeeded(options)` run the full #105 flow:
slides → practice round → "Play another round?" → optional second round → mark seen →
`onComplete`. "Skip Tutorial" (slides) and "Skip Practice" (coach) both jump to mark seen →
`onComplete`. Options are `{ gameId, container, introSteps, playPracticeRound, maxRounds = 2,
guidedRounds = 1, onComplete }`.

- Both return a run handle `{ cancel, isActive, finished }` (`IfNeeded` returns `null` when
  already seen). Store it, and guard against a second launch with `run.isActive()`. Call
  `run.cancel()` from `stop()` and `reset()`; it is safe on a run that has already ended.
  Cancelling removes the tutorial UI, and does not mark the tutorial seen or call `onComplete`.
- `playPracticeRound(context)` plays one round at the game's easiest setting and resolves once
  the player answers. `context` holds `round`, `attempt`, `maxRounds`, `guided` (show the
  marker; only the first `guidedRounds` rounds are guided), `signal`, `setInstructions(text)`,
  `showMarker({ anchor, region?, shape? })`, and `hideMarker()`.
- To replay missed rounds, resolve with `{ correct: false, feedback? }`. The coach then shows
  `feedback` (default "Not quite.") followed by "Try this round again." with a Try Again
  button, and calls `playPracticeRound` again for the same round with `attempt` increased.
  Resolving with nothing, or with `correct: true`, moves on as usual.
- `signal` aborts when the tutorial ends for any reason. Listen for it to cancel practice
  timers and clear practice state in one place.
- A practice round must not score, change difficulty, add speed history, start the session
  timer, or save. Build it from `game.js` helpers that have no side effects, and never call
  `startGame()`. `game.isRunning()` stays `false` throughout, so `stop()` must handle an idle
  game (see "How a game gets loaded" in [../games/CLAUDE.md](../games/CLAUDE.md)).
- `setInstructions` text goes to an `aria-live` region. Whenever it describes a click, also
  give the keyboard alternative. The marker is decorative (`aria-hidden`).
- `showMarker` rings `anchor`. For a canvas, pass `region` as fractions (0–1) of the anchor's
  box so the marker stays put when CSS scales the canvas. Use `shape: 'box'` for wide targets
  such as buttons.

### Adding a tutorial to a game

- Put one HTML fragment per slide in `<id>/tutorial/`, and a `tutorial.js` whose
  `getTutorialSteps()` passes their definitions to `loadTutorialSteps`.
- Add an annotated `images/tutorialScreenshot.png` and a "Replay Tutorial" button on the
  welcome panel.
- Make `start()` async: load the steps and launch the tutorial with a function that begins the
  session. Guard against a second launch while one is loading or in progress.
- Document the tutorial in the game's own `CLAUDE.md`, or in `<id>/tutorial/CLAUDE.md`.
- For a worked example, see `fast-piggie` (a single answer, with launch code in `index.js`) or
  `field-of-view` (a two-part answer, with launch and practice code in `tutorial/tutorial.js`).
