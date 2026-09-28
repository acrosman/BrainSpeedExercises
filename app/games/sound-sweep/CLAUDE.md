# Sound Sweep (`sound-sweep`)

An auditory processing-speed task. Two rapid frequency sweeps play back to back, each rising or
falling. The player identifies the sequence: Up-Up, Up-Down, Down-Up, or Down-Down. It is the
auditory counterpart of `directional-processing`, and the two have the same structure.

## Audio

This game creates no audio of its own. `playSweepPair(['up','down'], { sweepDurationMs, isiMs })`
in `components/audioService.js` schedules both sweeps on the shared `AudioContext` clock (300 Hz
↔ 3000 Hz, `SWEEP_LOW_FREQ_HZ` / `SWEEP_HIGH_FREQ_HZ`) and returns immediately. Change the sweep
sound in the service, not here.

## Trials

`playTrial(trial, onSweepsEnd?)` in `index.js` plays one `Trial` (`{ sequence, sweepDurationMs,
isiMs }`): the sweep pair, then the response phase. A session trial comes from `startTrial()`,
which picks a sequence at the current level. Because playback does not block, responses open
only after `2 × sweepDurationMs + isiMs + POST_SWEEP_BUFFER_MS` (150). Keep that formula in sync
if the sweep scheduling changes. Once responses are open, the Replay button replays the same
trial at the same timing.

`setResponsesEnabled()` opens and closes the four answer buttons, Replay, and keyboard answers
together. `stopTrial()` cancels the trial's timers and closes responses.

## Difficulty

`LEVELS` in `game.js` has 14 entries. Each one shortens `sweepDurationMs` (600 → 15 ms) and the
inter-stimulus interval `isiMs` (600 → 10 ms). At the top levels the sweeps are chirp-like. The
standard staircase applies, and trials are 500 ms apart. Sequences are the strings in
`SEQUENCES` (`'up-down'` and so on). Split them on `-` to get the direction array, and use
`formatSequence()` for the label the player sees (`'Up-Down'`).

## Saved fields

`score`, `level`, and `sessionDurationMs`, with no extra fields. The game saves only when
`trialsCompleted > 0`.

## Controls

Keys `1`–`4` answer `SEQUENCES` in order (Up-Up, Up-Down, Down-Up, Down-Down), the same order
as the four response buttons. When responses are enabled, focus moves to the first button.
`init()` calls `removeEventListener` before `addEventListener` on `document`, so re-entering the
game never registers the handler twice.
