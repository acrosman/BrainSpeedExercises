/**
 * index.js — Fine Tuning game plugin entry point.
 *
 * Handles DOM wiring, the playback / response trial cycle, the voice setting, keyboard
 * shortcuts, feedback, and plugin lifecycle (init / start / stop / reset).
 *
 * Syllables are synthesized by the shared syllableService. Core game logic (trials,
 * staircase, scoring) lives in game.js.
 *
 * @file Fine Tuning game plugin (UI/controller layer).
 */

import * as game from './game.js';
import {
  getSyllableSequenceDurationMs,
  playSyllableSequence,
} from '../../components/syllableService.js';
import { playFeedbackSound } from '../../components/audioService.js';
import { loadGameScore, saveScore } from '../../components/scoreService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import * as timerService from '../../components/timerService.js';
import { renderTrendChart } from '../../components/trendChartService.js';

// ── Timing constants ──────────────────────────────────────────────────────────

/**
 * Buffer (ms) added after the audio ends before the answer buttons open. Gives the player a
 * brief moment to orient before responding.
 */
const POST_SEQUENCE_BUFFER_MS = 150;

/** Pause (ms) between submitting a response and the next trial starting. */
const INTER_TRIAL_DELAY_MS = 500;

// ── DOM element references (populated by init) ────────────────────────────────

/** @type {HTMLElement|null} */
let _container = null;
/** @type {HTMLElement|null} */
let _instructionsEl = null;
/** @type {HTMLElement|null} */
let _gameAreaEl = null;
/** @type {HTMLElement|null} */
let _endPanelEl = null;
/** @type {HTMLElement|null} */
let _feedbackEl = null;
/** @type {HTMLElement|null} */
let _statusEl = null;
/** @type {HTMLElement|null} */
let _levelEl = null;
/** @type {HTMLElement|null} */
let _scoreEl = null;
/** @type {HTMLElement|null} */
let _trialsEl = null;
/** @type {HTMLElement|null} */
let _streakEl = null;
/** @type {HTMLElement|null} */
let _sessionTimerEl = null;
/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;
/** @type {HTMLElement|null} */
let _trendEmptyEl = null;
/** @type {HTMLElement|null} */
let _trendLatestEl = null;
/** @type {HTMLElement|null} */
let _finalLevelEl = null;
/** @type {HTMLElement|null} */
let _finalScoreEl = null;
/** @type {HTMLElement|null} */
let _finalTrialsEl = null;
/** @type {HTMLButtonElement|null} */
let _firstBtn = null;
/** @type {HTMLButtonElement|null} */
let _secondBtn = null;
/** @type {HTMLButtonElement|null} */
let _startBtn = null;
/** @type {HTMLButtonElement|null} */
let _stopBtn = null;
/** @type {HTMLButtonElement|null} */
let _playAgainBtn = null;
/** @type {HTMLButtonElement|null} */
let _returnBtn = null;
/** @type {HTMLButtonElement|null} */
let _replayBtn = null;
/** @type {HTMLInputElement[]} */
let _voiceInputs = [];

// ── Per-trial state ───────────────────────────────────────────────────────────

/** The trial being played, kept so Replay repeats it exactly. @type {game.Trial|null} */
let _currentTrial = null;

/** Whether the player can currently submit a response. */
let _responseEnabled = false;

/** Stops the audio that is playing, if any. @type {(() => void)|null} */
let _stopAudio = null;

// ── Async handle references ───────────────────────────────────────────────────

/** setTimeout handle for the wait until the audio ends. @type {number|null} */
let _waitTimer = null;

/** setTimeout handle for the inter-trial pause. @type {number|null} */
let _nextTrialTimer = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Open or close the response phase: the two answer buttons, the Replay button, and whether
 * answers (clicks or keys) are accepted.
 *
 * @param {boolean} enabled
 */
function setResponsesEnabled(enabled) {
  _responseEnabled = enabled;
  [_firstBtn, _secondBtn, _replayBtn].forEach((btn) => {
    if (btn) btn.disabled = !enabled;
  });
}

/**
 * Get the answer button for an answer.
 *
 * @param {string} answer - One of game.ANSWERS.
 * @returns {HTMLButtonElement|null}
 */
function getAnswerButton(answer) {
  const map = { first: _firstBtn, second: _secondBtn };
  return map[answer] || null;
}

/**
 * Post a status message to the assertive live region (`#ft-status`), or to `#ft-feedback`
 * when the status element is unavailable.
 *
 * Use this for trial-phase prompts ("Listen…", "Which sound matched the target?"). Result
 * feedback goes straight to `_feedbackEl`, the polite channel, so it is not announced twice.
 *
 * @param {string} message
 */
export function announce(message) {
  if (_statusEl) {
    _statusEl.textContent = message;
    return;
  }
  if (_feedbackEl) {
    _feedbackEl.textContent = message;
  }
}

/**
 * Refresh the stats bar with current game state values.
 */
export function updateStats() {
  if (_levelEl) _levelEl.textContent = String(game.getCurrentLevel() + 1);
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_trialsEl) _trialsEl.textContent = String(game.getTrialsCompleted());
  if (_streakEl) _streakEl.textContent = String(game.getConsecutiveCorrect());
}

/**
 * Render the speed trend chart with the latest transition-length history.
 */
export function updateTrendChart() {
  renderTrendChart(
    { lineEl: _trendLineEl, emptyEl: _trendEmptyEl, latestEl: _trendLatestEl },
    game.getSpeedHistory(),
    game.getCurrentLevelConfig().transitionMs,
  );
}

/**
 * Check the voice radio that matches the game's voice setting.
 */
function syncVoiceInputs() {
  const setting = game.getVoiceSetting();
  _voiceInputs.forEach((input) => {
    input.checked = input.value === setting;
  });
}

/**
 * Apply the voice setting saved with the player's progress, if it is valid.
 *
 * @returns {Promise<void>}
 */
export async function loadSavedVoice() {
  const record = await loadGameScore(game.GAME_ID);
  if (record && game.setVoiceSetting(record.voice)) syncVoiceInputs();
}

/**
 * Stop the audio that is playing, if any.
 */
function stopAudio() {
  if (_stopAudio) {
    _stopAudio();
    _stopAudio = null;
  }
}

/**
 * End the trial in progress: silence it, cancel its timers, close responses, and forget it.
 */
function stopTrial() {
  stopAudio();
  if (_waitTimer !== null) {
    clearTimeout(_waitTimer);
    _waitTimer = null;
  }
  if (_nextTrialTimer !== null) {
    clearTimeout(_nextTrialTimer);
    _nextTrialTimer = null;
  }
  setResponsesEnabled(false);
  _currentTrial = null;
}

/**
 * Enable the answer buttons and focus the first one so keyboard users are ready to respond.
 */
function enterResponsePhase() {
  setResponsesEnabled(true);
  announce('Which sound matched the target?');
  if (_firstBtn) {
    _firstBtn.focus();
  }
}

/**
 * The syllable sequence a trial plays: the target, then the two choices.
 *
 * @param {import('./game.js').Trial} trial
 * @returns {{ syllables: string[], voices: string[], gapsMs: number[], transitionMs: number,
 *   snrDb: number|null }}
 */
function getSequence({ target, choices, voices, isiMs, transitionMs, snrDb }) {
  return {
    syllables: [target, ...choices],
    voices,
    gapsMs: [game.TARGET_GAP_MS, isiMs],
    transitionMs,
    snrDb,
  };
}

/**
 * Play a trial's syllables, stopping any audio still playing. Playback is scheduled on the
 * audio clock, so this returns at once.
 *
 * @param {import('./game.js').Trial} trial
 */
function playSounds(trial) {
  stopAudio();
  _stopAudio = playSyllableSequence(getSequence(trial));
}

/**
 * Play a trial: the target and both choices, then the response phase once the audio ends.
 *
 * @param {import('./game.js').Trial} trial
 * @param {() => void} [onPlaybackEnd] - Called when the response phase begins.
 */
function playTrial(trial, onPlaybackEnd = () => {}) {
  _currentTrial = trial;
  setResponsesEnabled(false);
  if (_feedbackEl) _feedbackEl.textContent = '';
  announce('Listen: the target, then two sounds...');

  playSounds(trial);

  const waitMs = getSyllableSequenceDurationMs(getSequence(trial)) + POST_SEQUENCE_BUFFER_MS;
  _waitTimer = setTimeout(() => {
    _waitTimer = null;
    enterResponsePhase();
    onPlaybackEnd();
  }, waitMs);
}

/**
 * Begin a new session trial at the current level.
 */
function startTrial() {
  if (!game.isRunning()) return;

  updateStats();
  playTrial(game.pickTrial());
}

/**
 * Play the feedback sound and show the result. After a miss, name the target and where it
 * was. Changes no game state.
 *
 * @param {boolean} success - Whether the response was correct.
 */
function showResponseFeedback(success) {
  playFeedbackSound(success);

  const { target, answer } = _currentTrial;
  const feedbackMsg = success
    ? 'Correct!'
    : `Incorrect - the target "${target}" was the ${answer} sound.`;
  if (_feedbackEl) _feedbackEl.textContent = feedbackMsg;
}

/**
 * Handle an answer (from a button click or keyboard shortcut).
 *
 * @param {string} response - One of game.ANSWERS.
 */
export function handleResponse(response) {
  if (!_responseEnabled) return;

  setResponsesEnabled(false);

  const success = response === _currentTrial.answer;

  game.recordTrial({ success });

  updateStats();
  updateTrendChart();
  showResponseFeedback(success);

  if (game.isRunning()) {
    _nextTrialTimer = setTimeout(() => {
      _nextTrialTimer = null;
      startTrial();
    }, INTER_TRIAL_DELAY_MS);
  }
}

/**
 * Replay the current trial's sounds without scoring it.
 * Only active during the response phase.
 */
function replayCurrentTrial() {
  if (_currentTrial) playSounds(_currentTrial);
}

/**
 * Keyboard handler — maps digit keys 1 and 2 to the answers.
 *
 * Default behavior for the digit keys is not affected.
 *
 * @param {KeyboardEvent} event
 */
export function handleKeyDown(event) {
  // Keys 1–2 answer game.ANSWERS in order, the same order as the buttons.
  const response = game.ANSWERS[Number(event.key) - 1];
  if (!response) return;

  if (_responseEnabled) {
    handleResponse(response);
  }
}

/**
 * Populate the end panel with session results.
 *
 * @param {{ score: number, level: number, trialsCompleted: number }} result
 */
function showEndPanel(result) {
  if (_finalLevelEl) _finalLevelEl.textContent = String(result.level + 1);
  if (_finalScoreEl) _finalScoreEl.textContent = String(result.score);
  if (_finalTrialsEl) _finalTrialsEl.textContent = String(result.trialsCompleted);
  if (_endPanelEl) _endPanelEl.hidden = false;
}

/**
 * Show the game area in place of the welcome and end panels.
 */
function showGameArea() {
  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl)     _endPanelEl.hidden = true;
  if (_gameAreaEl)     _gameAreaEl.hidden = false;
}

/**
 * Start a gameplay session.
 */
function beginGameSession() {
  game.startGame();

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });

  showGameArea();

  // Move focus to the status element so keyboard users land in the game area
  // rather than remaining on the now-hidden Start button (WCAG 2.4.3).
  if (_statusEl) _statusEl.focus();

  startTrial();
}

// ── Plugin contract ───────────────────────────────────────────────────────────

/** Human-readable plugin name. */
const name = 'Fine Tuning';

/**
 * Initialize the plugin after interface.html has been injected.
 *
 * Queries all required DOM elements, attaches event listeners, resets game state, and
 * restores the saved voice setting. Does NOT start the game loop or timers.
 *
 * @param {HTMLElement|null} gameContainer - The element containing the game HTML.
 */
function init(gameContainer) {
  _container = gameContainer;
  game.initGame();

  if (!_container) return;

  _instructionsEl  = _container.querySelector('#ft-instructions');
  _gameAreaEl      = _container.querySelector('#ft-game-area');
  _endPanelEl      = _container.querySelector('#ft-end-panel');
  _feedbackEl      = _container.querySelector('#ft-feedback');
  _statusEl        = _container.querySelector('#ft-status');
  _levelEl         = _container.querySelector('#ft-level');
  _scoreEl         = _container.querySelector('#ft-score');
  _trialsEl        = _container.querySelector('#ft-trials');
  _streakEl        = _container.querySelector('#ft-streak');
  _sessionTimerEl  = _container.querySelector('#ft-session-timer');
  _trendLineEl     = _container.querySelector('#ft-trend-line');
  _trendEmptyEl    = _container.querySelector('#ft-trend-empty');
  _trendLatestEl   = _container.querySelector('#ft-trend-latest');
  _finalLevelEl    = _container.querySelector('#ft-final-level');
  _finalScoreEl    = _container.querySelector('#ft-final-score');
  _finalTrialsEl   = _container.querySelector('#ft-final-trials');
  _firstBtn        = _container.querySelector('#ft-btn-first');
  _secondBtn       = _container.querySelector('#ft-btn-second');
  _startBtn        = _container.querySelector('#ft-start-btn');
  _stopBtn         = _container.querySelector('#ft-stop-btn');
  _playAgainBtn    = _container.querySelector('#ft-play-again-btn');
  _returnBtn       = _container.querySelector('#ft-return-btn');
  _replayBtn       = _container.querySelector('#ft-replay-btn');
  _voiceInputs     = [..._container.querySelectorAll('input[name="ft-voice"]')];

  if (_startBtn)     _startBtn.addEventListener('click', () => start());
  if (_stopBtn)      _stopBtn.addEventListener('click', () => stop());
  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      start();
    });
  }
  if (_returnBtn)  _returnBtn.addEventListener('click', () => returnToMainMenu());
  if (_replayBtn)  _replayBtn.addEventListener('click', () => replayCurrentTrial());

  game.ANSWERS.forEach((answer) => {
    const btn = getAnswerButton(answer);
    if (btn) btn.addEventListener('click', () => handleResponse(answer));
  });

  _voiceInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) game.setVoiceSetting(input.value);
    });
  });
  syncVoiceInputs();
  void loadSavedVoice();

  // Remove any existing handler before registering to guarantee exactly one
  // keydown listener regardless of how many times init() is called.
  document.removeEventListener('keydown', handleKeyDown);
  document.addEventListener('keydown', handleKeyDown);

  setResponsesEnabled(false);
  updateStats();
}

/**
 * Start a gameplay session.
 */
function start() {
  beginGameSession();
}

/**
 * Stop the gameplay session, save progress, and show the end panel.
 *
 * With no session running (on the welcome screen, or when the app quits after a session
 * ended) there is nothing to save and the screen is left alone.
 *
 * @returns {{ score: number, level: number, trialsCompleted: number, duration: number }}
 */
function stop() {
  stopTrial();

  if (!game.isRunning()) {
    return {
      score: game.getScore(),
      level: game.getCurrentLevel(),
      trialsCompleted: game.getTrialsCompleted(),
      duration: 0,
    };
  }

  const result = game.stopGame();
  const sessionDurationMs = timerService.stopTimer();

  if (_gameAreaEl) _gameAreaEl.hidden = true;
  showEndPanel(result);

  if (result.trialsCompleted > 0) {
    saveScore(game.GAME_ID, {
      score: result.score,
      level: result.level,
      sessionDurationMs,
    }, { voice: game.getVoiceSetting() });
  }

  return result;
}

/**
 * Reset to the pre-game instructions state without reloading interface.html.
 */
function reset() {
  stopTrial();
  game.initGame();
  timerService.resetTimer();

  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';
  if (_feedbackEl)     _feedbackEl.textContent = '';
  if (_statusEl)       _statusEl.textContent = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl)     _gameAreaEl.hidden = true;
  if (_endPanelEl)     _endPanelEl.hidden = true;

  updateStats();
  updateTrendChart();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
