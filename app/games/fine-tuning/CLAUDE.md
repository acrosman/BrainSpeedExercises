# Fine Tuning (`fine-tuning`)

A speech-sound discrimination task. Each trial plays a target syllable, then two syllables from a
minimal pair, such as "ba" and "da"; one of them matches the target. The player says whether
the **First** or **Second** matched. It is the speech counterpart of `sound-sweep`, and the two
share their structure.

## Files

- `game.js`: the minimal pairs, the level table, the staircase, the voice setting, and
  `buildTrial()`, which builds a random trial for any level and voice setting without changing
  state. `pickTrial()` uses the current level; `generatePracticeTrial()` uses `LEVELS[0]`.
- `index.js`: the trial cycle, controls, voice radios, and plugin lifecycle.
- `tutorial/`: the first-run tutorial. See [tutorial/CLAUDE.md](tutorial/CLAUDE.md).

## Audio

This game creates no audio of its own. `playSyllableSequence` in
`components/syllableService.js` synthesizes the target and both choices on the shared
`AudioContext`, with `TARGET_GAP_MS` (600) after the target and the level's `isiMs` between the
choices. Change how the syllables sound in the service, not here. Every `CONTRAST_PAIRS` ID
must be in the service's `SYLLABLE_IDS`; `tests/game.test.js` checks it.

The service returns a stop handle. `index.js` keeps it, and `stopTrial()` calls it, so End Game,
reset, and quitting silence a trial mid-sequence. Replay stops the current audio before playing
the trial again.

## Trials

`playTrial(trial, onPlaybackEnd?)` in `index.js` plays one `Trial` (`{ target, choices, voices,
answer, transitionMs, isiMs, snrDb }`), then opens responses after
`getSyllableSequenceDurationMs(...) + POST_SEQUENCE_BUFFER_MS` (150). The service's function is
the only source of timing; never compute the length here. The target is never shown before the
answer, so the task stays auditory. A miss names the target and where it was.

## Difficulty

`LEVELS` has 14 entries of `{ transitionMs, isiMs, snrDb, crossVoice }`, in three phases:

1. Levels 1–6: clean audio with stretched transitions (100 → 50 ms) and long gaps.
2. Level 7: natural transitions (40 ms).
3. Levels 8–14: background noise that gets louder (+20 → +5 dB SNR), then compressed transitions
   (35 → 25 ms) and cross-voice trials from level 12.

The game is meant to be played for long stretches, so the noise always stays quieter than the
speech: no level goes below `MIN_SNR_DB` (+5 dB). Make the top levels harder through timing or
voices, not louder noise. The service also fades the noise in and out and caps its gain.

The standard staircase applies, and trials are 500 ms apart. The trend chart tracks
`transitionMs`. `tests/game.test.js` checks that no level is easier than the one before it.

## Voices

`VOICE_SETTINGS` is `lower`, `higher`, or `mixed` (default `lower`, the most intelligible). It is
a preference, so `initGame()` keeps it. With `lower` or `higher`, every syllable uses that
voice. With `mixed`, each trial picks a voice at random, and at `crossVoice` levels the target
uses one voice and both choices the other.

The `ft-voice` radios in the game area, below the trend chart, set it, so the player can change
it during a session or practice. A change applies from the next trial: the trial in progress,
and its Replay, keep their voices. `init()` checks the radio for the current setting, then
applies the saved `voice` from `loadGameScore` if it is valid.

## Saved fields

`score`, `level`, and `sessionDurationMs`, plus the extra field `voice`. The game saves only when
`trialsCompleted > 0`. The voice is saved with the session because `saveScore` always counts a
session, so a voice changed without playing a round is not remembered.

## Controls

Keys `1` and `2` answer `ANSWERS` in order (First, Second), the same order as the buttons. When
responses open, focus moves to First. `init()` calls `removeEventListener` before
`addEventListener` on `document`, so re-entering the game never registers the handler twice.
