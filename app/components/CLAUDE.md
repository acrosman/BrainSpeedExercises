# Shared components (`app/components/`)

The module table and general rules for components are in [../CLAUDE.md](../CLAUDE.md). This
file holds detail that only matters when you work with a specific component.

## Tutorial framework (`tutorialService.js`, `tutorialLauncher.js`, `tutorialCoach.js`)

`tutorialService.js` shows tutorial slides and runs guided practice rounds. Whether the player
has seen a game's tutorial is stored under `progress.tutorials[gameId]`. `tutorialLauncher.js`
wraps the guided runner in the launch guard every game needs. Games reach `tutorialCoach.js`
only through the practice-round context described below.

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
guidedRounds = 1, onComplete }`. Games do not call these directly; they go through a launcher
(next section).

- Both return a run handle `{ cancel, isActive, finished }` (`IfNeeded` returns `null` when
  already seen). `cancel()` is safe on a run that has already ended. Cancelling removes the
  tutorial UI, and does not mark the tutorial seen or call `onComplete`.
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

### Launching (`tutorialLauncher.js`)

`createTutorialLauncher({ gameId, loadSteps, playPracticeRound, maxRounds?, guidedRounds? })`
returns `{ startIfNeeded, replay, isActive, cancel }`. Create one per game, once, in the game's
`tutorial/tutorial.js`. Do not copy the guard into a game.

- `startIfNeeded({ container, onComplete })` (the Start button) and
  `replay({ container, onComplete })` (Replay Tutorial) load the slides with `loadSteps()` and
  run the tutorial. `onComplete` begins the real session. Both do nothing without a container,
  while another launch is loading, or while a run is in progress.
- `isActive()` is `true` while a run is in progress. `stop()` with no session uses it to decide
  whether to `reset()`.
- `cancel()` ends the run, and also abandons a launch that is still loading, so neither the
  tutorial nor `onComplete` fires afterward. Call it from `reset()`. It is safe at any time.
- The guard is tested once, in `tests/tutorialLauncher.test.js`. Game tests cover only their
  own wiring (which launcher each button calls, and that the session waits for `onComplete`).

### Adding a tutorial to a game

Keep every piece of tutorial code in `<id>/tutorial/`, not in `index.js`. `index.js` supplies
the game's display and controls, and routes input to the tutorial while it is practicing.

1. Put one HTML fragment per slide in `<id>/tutorial/`, with an annotated
   `images/tutorialScreenshot.png`, and add a "Replay Tutorial" button to the welcome panel.
2. Import `game.js` in `tutorial.js` for `GAME_ID`, which every game exports from there (see
   [../games/CLAUDE.md](../games/CLAUDE.md)).
3. In `tutorial/tutorial.js`:
   - `getTutorialSteps()` passes the slide definitions to `loadTutorialSteps`, and
     `PRACTICE_TEXT` holds the coach text.
   - Define a controls typedef (`PracticeRoundControls` or `PracticeTrialControls`) listing
     what practice needs from the game: show the game area, play a round with the real
     display, stop it, find the control to mark, and show the result.
   - `setPracticeControls(controls)` stores them. `playPracticeRound(context)` plays a round
     through them and runs its cleanup on `context.signal`'s `abort`.
   - Export `isPracticing()` and whatever hooks the game calls while practicing, such as
     `finishPracticeRound(result)`.
   - `export const tutorial = createTutorialLauncher({ gameId: game.GAME_ID, loadSteps:
     getTutorialSteps, playPracticeRound })`.
   - `tutorial.js` must never import `index.js`.
4. In `index.js`:
   - Build a frozen `PRACTICE_CONTROLS` from existing display helpers, and call
     `setPracticeControls(PRACTICE_CONTROLS)` in `init()`.
   - `start()` returns `tutorial.startIfNeeded({ container, onComplete: beginGameSession })`,
     and Replay Tutorial calls `tutorial.replay(...)` with the same options.
   - `stop()` with no session calls `reset()` if `tutorial.isActive()`, and `reset()` calls
     `tutorial.cancel()`.
   - Where input is scored, send it to the tutorial's hook instead while `isPracticing()`.
5. Test the controller in `tests/tutorial.test.js` against fake controls, and run the real
   `tutorial.js` from `tests/index.test.js`, mocking only `tutorialService` (and `game.js` if
   the game's tests already do).
6. Document the tutorial in `<id>/tutorial/CLAUDE.md`, and link it from the game's `CLAUDE.md`.

Worked examples: `fast-piggie` and `directional-processing` (one answer per round), `card-rat`
(a timed run of cards with one to act on), `field-of-view` (a two-part answer, with retries),
and `high-speed-memory` (several answers per round, with retries).
