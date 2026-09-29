# Shared components (`app/components/`)

Renderer modules shared by the shell and the games. Each one is plain functions plus module
state, with no classes. Tests live in `tests/`. When more than one game needs a behavior, add it
here as a service instead of copying it between games.

Rules for every component:

- Never call Electron or Node APIs. Anything persistent goes through `window.api.invoke`,
  usually through `scoreService`.
- Return early when `window.api` is missing, so the module runs in jsdom.
- Build UI with DOM calls, as `gameCard.js` and `historyView.js` do. Only HTML that ships
  with the app (a fixed template, a tutorial fragment) may go through `innerHTML`, and it must
  not contain inline scripts, styles, or event handlers, because the CSP blocks them. Put
  runtime values in with `textContent`.

| Module | Used by | Role |
| --- | --- | --- |
| `scoreService.js` | games, shell | Save and load results; clear history |
| `timerService.js` | games, shell | Session timer, `formatDuration`, today's date key |
| `logService.js` | all renderer code | `logger.*`, forwarded to `electron-log` |
| `audioService.js` | games | The shared `AudioContext` and every sound effect |
| `syllableService.js` | games | Synthesized speech syllables and background noise |
| `adaptiveDifficultyService.js` | games | Staircase counter math |
| `trendChartService.js` | games | In-game SVG trend line |
| `gameUtils.js` | games | `returnToMainMenu()` |
| `gameCard.js` | shell | One card on the game selector |
| `historyView.js` | shell | Contents of the History modal |
| `tutorialService.js` | tutorial launcher | Tutorial slides, the seen flag, guided practice |
| `tutorialLauncher.js` | game tutorials | The Start/Replay launch guard |
| `tutorialCoach.js` | tutorialService | Practice coach banner and target marker |

## `scoreService.js`

All progress reads and writes for the `'default'` player (`DEFAULT_PLAYER_ID`).

- `saveScore(gameId, result, extraFields?)` loads progress, merges, and saves. From `result` it
  sets `highScore` (max of `score`), adds `sessionDurationMs` to `dailyTime[today]`, sets
  `highestLevel` (max of `level`) and `lowestDisplayTime` (min) when those are numbers, and
  always updates `sessionsPlayed` and `lastPlayed`.
- `extraFields` holds game-specific fields. Pass `(prevRecord) => ({ ... })` when the new value
  depends on the saved one, or a plain object to overwrite.
- It resolves to the new game record, or `null` on any failure. It never throws, so a failed
  save cannot interrupt play.
- `loadProgress()` returns the whole progress object (an empty one on failure), and
  `loadGameScore(gameId)` returns one game's record (`{}` if none). `clearHistory()` calls
  `progress:reset`.

## `timerService.js`

One session timer shared by whichever game is running.

- `startTimer(onTick?, tickIntervalMs = 1000)` restarts the timer. `onTick(elapsedMs)` drives a
  live display.
- `stopTimer()` returns the elapsed milliseconds (0 if not running). `resetTimer()` discards
  them. `getElapsedMs()` and `isTimerRunning()` read the state.
- `formatDuration(ms)` returns `MM:SS`. `getTodayDateString()` returns local `YYYY-MM-DD`, the
  `dailyTime` key.

## `logService.js`

`logger.error|warn|info|verbose|debug(...args)` sends one line through `log:send`. `Error`
arguments keep their stack, and objects are JSON-encoded. Logging is fire-and-forget and never
throws.

## `audioService.js`

`getAudioContext()` creates one `AudioContext` on first use and reuses it; it returns `null`
where Web Audio is missing. Every sound resumes a suspended context and swallows audio errors.

- Feedback: `playSuccessSound()`, `playFailureSound()`, and `playFeedbackSound(isSuccess)`.
- `playCardFlickSound()`: a short card snap.
- `playSweepPair(['up' | 'down', 'up' | 'down'], { sweepDurationMs, isiMs })` schedules two
  frequency sweeps between `SWEEP_LOW_FREQ_HZ` and `SWEEP_HIGH_FREQ_HZ` on the context clock and
  returns at once. Invalid input schedules nothing.

Add new sounds here, with their tuning values as named constants at the top of the file. Speech
sounds go in `syllableService.js` instead.

## `syllableService.js`

Synthesized consonant-vowel syllables (/b d g p t/ × /a i/, listed in `SYLLABLE_IDS`) on the
shared context from `getAudioContext()`. It never creates its own context.

- Each syllable is a parallel formant synthesizer: a sawtooth voicing source and a noise source
  feed band-pass filters for F1–F3, which glide from the consonant's onsets (`PLACE_CUES`) to
  the vowel's steady values (`VOWEL_FORMANTS`) over `transitionMs`. Voiceless /p t/ play
  aspiration noise through F2 and F3 until voicing starts (`VOT_MS`).
- `VOICE_PROFILES` (`lower`, `higher`, listed in `VOICE_IDS`) set the falling F0 and a
  `formantScale` that multiplies every formant and burst frequency.
- `playSyllableSequence({ syllables, voices, gapsMs, transitionMs, snrDb })` schedules the
  whole sequence on the audio clock, with one voice per syllable and `gapsMs` of silence
  between syllables. It returns a `stop()` function that fades the sequence out; it is safe to
  call more than once. Invalid options, or no Web Audio, schedule nothing and return a no-op.
- `snrDb` adds looping brown noise (a leaky random walk, a soft rumble rather than hiss) from
  the start to the end of the sequence, fading in and out over `NOISE_FADE_MS`; `null` means
  none. The brown buffer is scaled to `BROWN_NOISE_RMS` and crossfaded at its ends so it loops
  without a click. Bursts and aspiration use a separate white-noise buffer. The SNR is
  approximate (`NOISE_GAIN_AT_0_DB`, tuned by ear), and `MAX_NOISE_GAIN` caps it.
- `getSyllableSequenceDurationMs({ syllables, gapsMs, transitionMs })` is the total length,
  including `NOISE_LEAD_MS` before the first syllable and `NOISE_TAIL_MS` after the last, with
  or without noise. Open responses from it, never from a separate formula.
- Tuning values are named constants at the top of the file. Change them by ear.

## `adaptiveDifficultyService.js`

`updateAdaptiveDifficultyState({ value, wasCorrect, consecutiveCorrect, consecutiveWrong, ... })`
returns the next `{ value, consecutiveCorrect, consecutiveWrong, valueDelta }`. The defaults
are the house rule: 3 correct in a row moves `value` by `harderStep` (+1), and 3 wrong in a row
moves it by `easierStep` (−2). The result is clamped to `minValue`/`maxValue`, and the counter
that fired is reset. The caller decides what `value` means, so a game where lower is harder
passes negative `harderStep` and positive `easierStep`. `clampDifficultyValue` is exported for
other clamping.

## `trendChartService.js`

`renderTrendChart({ lineEl, emptyEl, latestEl }, values, currentValue)` fills the shared
`.game-trend` markup: it writes the polyline `points`, hides the empty message once there is
data, and shows the latest value (or `currentValue` when `values` is empty). Any element may be
`null`. The chart scales to the history's own minimum and maximum. `buildPolylinePoints` does
the math and is exported for tests.

## `gameUtils.js`

`returnToMainMenu()` dispatches `bsx:return-to-main-menu` on `window`. It is the only way a
game should leave.

## `gameCard.js`

`createGameCard(manifest, progress)` returns an `<article class="game-card">` with the
thumbnail, name, description, a stats line, and a Play button. A click anywhere on the card
dispatches a bubbling `game:select` event with `detail.gameId`. The stats line joins whatever
is present: Top Score, Max Level (`highestLevel + 1`), Min Display Time, and time played today.
It is left out when none of them are present. The function throws without `manifest.id` and
`manifest.name`.

## `historyView.js`

`buildHistoryPanel(progress, manifests)` returns the History modal's body, built from each
game's `dailyTime`:

- A total play-time line chart. It is `aria-hidden` because the table repeats its data, and it
  shows at most `MAX_X_LABELS` date labels.
- A per-game bar chart that shows the last `INITIAL_VISIBLE_DAYS` days, with a toggle for older
  days. Colors come from `history-chart__bar--color-N` (see "Styles" in
  [../CLAUDE.md](../CLAUDE.md)).
- A data table, which is the accessible version of both charts.

With no history it returns an empty-state message. The helpers (`getAllDates`,
`getGamesWithData`, `buildSummaryData`, `getGameName`, and the three `create*` builders) are
exported and tested one by one. The modal behavior itself lives in `interface.js`.

## Tutorial framework (`tutorialService.js`, `tutorialLauncher.js`, `tutorialCoach.js`)

`tutorialService.js` shows tutorial slides and runs guided practice rounds. Whether the player
has seen a game's tutorial is stored in `progress.tutorials[gameId]`. `tutorialLauncher.js`
wraps the guided runner in the launch guard every game needs. Games reach `tutorialCoach.js`
only through the practice-round context described below.

### Slides

- Steps are `{ title, content }`, where `content` is an HTML string.
- `loadTutorialSteps(definitions)` builds steps from `{ title, contentPath }` definitions, where
  each file is an HTML fragment. It caches each file and shows fallback text if one fails to
  load. `clearTutorialMarkupCache()` resets the cache in tests.
- `showTutorialIfNeeded(gameId, steps, container, onComplete)` shows the slides only the first
  time; otherwise it calls `onComplete` at once. `showTutorial(...)` always shows them.
- Overlay, coach, and marker styles are the `.tutorial-overlay*`, `.tutorial-coach*`, and
  `.tutorial-marker*` classes in `app/styles/game-shared.css`. Do not restyle them per game.

### Guided tutorials (slides, then live practice)

`runGuidedTutorial(options)` and `runGuidedTutorialIfNeeded(options)` run slides → practice
round → "Play another round?" → optional second round → mark seen → `onComplete`. "Skip
Tutorial" (slides) and "Skip Practice" (coach) both jump to mark seen → `onComplete`. Options
are `{ gameId, container, introSteps, playPracticeRound, maxRounds = 2, guidedRounds = 1,
onComplete }`. Games call these only through a launcher (next section).

- Both return a run handle `{ cancel, isActive, finished }`. `IfNeeded` returns `null` when the
  tutorial was already seen. `cancel()` is safe after the run ends. It removes the tutorial UI
  without marking the tutorial seen or calling `onComplete`.
- `playPracticeRound(context)` plays one round at the game's easiest setting and resolves once
  the player answers. `context` holds `round`, `attempt`, `maxRounds`, `guided` (true for the
  first `guidedRounds` rounds; show the marker), `signal`, `setInstructions(text)`,
  `showMarker({ anchor, region?, shape? })`, and `hideMarker()`.
- To make the player retry a missed round, resolve with `{ correct: false, feedback? }`. The
  coach shows `feedback` (default "Not quite.") and a Try Again button, then calls
  `playPracticeRound` for the same round with `attempt` increased. Resolving with nothing, or
  with `correct: true`, moves on.
- `signal` aborts when the tutorial ends for any reason. Cancel practice timers and clear
  practice state in its `abort` listener.
- A practice round must not score, change difficulty, add speed history, start the session
  timer, or save. Build it from `game.js` helpers that have no side effects, and never call
  `startGame()`. `game.isRunning()` stays `false`, so `stop()` must handle an idle game.
- `setInstructions` text goes to an `aria-live` region. When it describes a click, also give
  the keyboard alternative. The marker is decorative (`aria-hidden`).
- `showMarker` rings `anchor`. For a canvas, pass `region` as fractions (0–1) of the anchor's
  box so the marker stays in place when CSS scales the canvas. Use `shape: 'box'` for wide
  targets such as buttons.

### Launching (`tutorialLauncher.js`)

`createTutorialLauncher({ gameId, loadSteps, playPracticeRound, maxRounds?, guidedRounds? })`
returns `{ startIfNeeded, replay, isActive, cancel }`. Create one per game, in the game's
`tutorial/tutorial.js`. Do not copy the guard into a game.

- `startIfNeeded({ container, onComplete })` (Start) and `replay({ container, onComplete })`
  (Replay Tutorial) load the slides with `loadSteps()` and run the tutorial. `onComplete`
  begins the real session. Both do nothing without a container, or while another launch is
  loading or running.
- `isActive()` is `true` while a run is in progress. `stop()` with no session uses it to decide
  whether to `reset()`.
- `cancel()` ends the run and abandons a launch that is still loading, so neither the tutorial
  nor `onComplete` fires afterward. Call it from `reset()`. It is safe at any time.
- The guard is tested once, in `tests/tutorialLauncher.test.js`. Game tests cover only their own
  wiring: which launcher each button calls, and that the session waits for `onComplete`.

### Adding a tutorial to a game

Keep all tutorial code in `<id>/tutorial/`. `index.js` only supplies the game's display and
controls, and routes input to the tutorial while it is practicing.

1. Put one HTML fragment per slide in `<id>/tutorial/`, add an annotated
   `images/tutorialScreenshot.png`, and add a "Replay Tutorial" button to the welcome panel.
2. In `tutorial/tutorial.js`:
   - Import `game.js` for `GAME_ID` and the practice-round helpers. Never import `index.js`.
   - `getTutorialSteps()` passes the slide definitions (`TUTORIAL_STEP_DEFINITIONS`) to
     `loadTutorialSteps`. `PRACTICE_TEXT` holds the coach text.
   - Define a controls typedef (`PracticeRoundControls` or `PracticeTrialControls`) listing
     what practice needs from the game: show the game area, play a round with the real
     display, stop it, find the control to mark, and show the result.
   - `setPracticeControls(controls)` stores them. `playPracticeRound(context)` plays a round
     through them and runs its cleanup (`endPractice`) on `context.signal`'s `abort`.
   - Export `isPracticing()` and the hooks the game calls while practicing, such as
     `finishPracticeRound(result)`.
   - `export const tutorial = createTutorialLauncher({ gameId: game.GAME_ID, loadSteps:
     getTutorialSteps, playPracticeRound })`.
3. In `index.js`:
   - Build a frozen `PRACTICE_CONTROLS` from existing display helpers, and call
     `setPracticeControls(PRACTICE_CONTROLS)` in `init()`.
   - Start calls `tutorial.startIfNeeded({ container, onComplete: beginGameSession })`, and
     Replay Tutorial calls `tutorial.replay(...)` with the same options.
   - `stop()` with no session calls `reset()` if `tutorial.isActive()`, and `reset()` calls
     `tutorial.cancel()`. End Game during practice therefore returns to the welcome panel
     without saving.
   - Where input is scored, send it to the tutorial's hook instead while `isPracticing()`.
4. Test the controller in `tests/tutorial.test.js` against fake controls. Run the real
   `tutorial.js` from `tests/index.test.js`, mocking `tutorialService` and `game.js` but not
   the tutorial itself.
5. Add `<id>/tutorial/CLAUDE.md` covering only what differs from the steps above: the controls,
   the hooks `index.js` calls, and the practice rules. Link it from the game's `CLAUDE.md`.

Worked examples: `fast-piggie`, `directional-processing`, `sound-sweep`, and `fine-tuning`
(one answer per round), `card-rat` (a timed run of cards with one to act on), `field-of-view`
(a two-part answer, with retries), `high-speed-memory` (several answers per round, with
retries), `object-track` (several answers per round after an animation, with retries),
`orbit-sprite-memory` (several answers per round after a timed sequence, with retries), and
`otter-stop` (a steady stream of responses, played through the game's own trial loop with no
practice hooks, with retries).
