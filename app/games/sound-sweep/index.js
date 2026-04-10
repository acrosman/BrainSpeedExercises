/**
 * index.js — Sound Sweep game plugin entry point.
 *
 * Handles DOM wiring, the sweep playback / response trial cycle, keyboard
 * shortcut interception, feedback, and plugin lifecycle (init / start / stop / reset).
 *
 * Audio synthesis is handled by the centralized audioService. Core game logic
 * (staircase, scoring) lives in game.js.
 *
 * @file Sound Sweep game plugin (UI/controller layer).
 */

import * as game from './game.js';
import { playSweepPair, playFeedbackSound } from '../../components/audioService.js';
import { saveScore } from '../../components/scoreService.js';
import * as timerService from '../../components/timerService.js';

/** Game identifier used for progress persistence (must match manifest.json id). */
const GAME_ID = 'sound-sweep';

// ── Timing constants ──────────────────────────────────────────────────────────

/**
 * Buffer (ms) added after the last sweep ends before response buttons become
 * active. Gives the player a brief moment to orient before responding.
 */
const POST_SWEEP_BUFFER_MS = 150;

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
/** @type {HTMLElement|null} */
let _finalLevelEl = null;
/** @type {HTMLElement|null} */
let _finalScoreEl = null;
/** @type {HTMLElement|null} */
let _finalTrialsEl = null;
/** @type {HTMLButtonElement|null} */
let _uuBtn = null;
/** @type {HTMLButtonElement|null} */
let _udBtn = null;
/** @type {HTMLButtonElement|null} */
let _duBtn = null;
/** @type {HTMLButtonElement|null} */
let _ddBtn = null;
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

// ── Per-trial state ───────────────────────────────────────────────────────────

/** Sequence chosen for the current trial, e.g. 'up-down'. @type {string|null} */
let _currentSequence = null;

/** Whether the player can currently submit a response. */
let _responseEnabled = false;

// ── Async handle references ───────────────────────────────────────────────────

/** setTimeout handle for the post-sweep wait before response phase. @type {number|null} */
let _waitTimer = null;

/** setTimeout handle for the inter-trial pause. @type {number|null} */
let _nextTrialTimer = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Enable or disable all four sequence response buttons.
 *
 * Buttons are disabled during sweep playback and re-enabled once the response
 * phase begins so the player cannot respond prematurely.
 *
 * @param {boolean} enabled
 */
function setResponseButtonsEnabled(enabled) {
  [_uuBtn, _udBtn, _duBtn, _ddBtn].forEach((btn) => {
    if (btn) btn.disabled = !enabled;
  });
}

/**
 * Post a status or feedback message to the live-region elements.
 *
 * @param {string} message
 */
export function announce(message) {
  if (_feedbackEl) {
    _feedbackEl.textContent = message;
  }
  if (_statusEl) {
    _statusEl.textContent = message;
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
 * Cancel and clear all outstanding timer handles.
 */
function clearAsyncHandles() {
  if (_waitTimer !== null) {
    clearTimeout(_waitTimer);
    _waitTimer = null;
  }
  if (_nextTrialTimer !== null) {
    clearTimeout(_nextTrialTimer);
    _nextTrialTimer = null;
  }
}

/**
 * Enable the response buttons and focus the first one so keyboard users
 * are ready to respond.
 */
function enterResponsePhase() {
  _responseEnabled = true;
  setResponseButtonsEnabled(true);
  announce('Which sequence did you hear?');
  if (_uuBtn) {
    _uuBtn.focus();
  }
}

/**
 * Begin a new trial: pick a sequence, play it via audioService, and schedule
 * the response phase after the sweeps complete.
 */
function startTrial() {
  if (!game.isRunning()) return;

  _currentSequence = game.pickSequence();
  const { sweepDurationMs, isiMs } = game.getCurrentLevelConfig();

  _responseEnabled = false;
  setResponseButtonsEnabled(false);
  if (_replayBtn) _replayBtn.disabled = true;
  announce('Listen...');

  updateStats();

  playSweepPair(_currentSequence.split('-'), { sweepDurationMs, isiMs });

  const waitMs = sweepDurationMs + isiMs + sweepDurationMs + POST_SWEEP_BUFFER_MS;
  _waitTimer = setTimeout(() => {
    _waitTimer = null;
    if (_replayBtn) _replayBtn.disabled = false;
    enterResponsePhase();
  }, waitMs);
}

/**
 * Handle a sequence response (from button click or keyboard shortcut).
 *
 * @param {string} response - One of 'up-up', 'up-down', 'down-up', 'down-down'.
 */
export function handleSequenceResponse(response) {
  if (!_responseEnabled) return;

  _responseEnabled = false;
  setResponseButtonsEnabled(false);
  if (_replayBtn) _replayBtn.disabled = true;

  const success = response === _currentSequence;
  game.recordTrial({ success });

  updateStats();
  playFeedbackSound(success);

  if (success) {
    announce('Correct!');
  } else {
    announce(`Incorrect - the sequence was ${formatSequenceLabel(_currentSequence)}.`);
  }

  if (game.isRunning()) {
    _nextTrialTimer = setTimeout(() => {
      _nextTrialTimer = null;
      startTrial();
    }, INTER_TRIAL_DELAY_MS);
  }
}

/**
 * Replay the current trial's sweep pair without scoring it.
 * Only active during the response phase.
 */
function replayCurrentSweep() {
  if (!_currentSequence) return;
  const { sweepDurationMs, isiMs } = game.getCurrentLevelConfig();
  playSweepPair(_currentSequence.split('-'), { sweepDurationMs, isiMs });
}

/**
 * Convert a sequence key to a human-readable label, e.g. 'up-down' → 'Up-Down'.
 *
 * @param {string} sequence
 * @returns {string}
 */
function formatSequenceLabel(sequence) {
  return sequence
    .split('-')
    .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
    .join('-');
}

/**
 * Keyboard handler — maps digit keys 1–4 to sequence responses.
 *
 * Default scroll behavior for the digit keys is not affected.
 *
 * @param {KeyboardEvent} event
 */
export function handleKeyDown(event) {
  /** @type {Record<string, string>} */
  const keyMap = {
    1: 'up-up',
    2: 'up-down',
    3: 'down-up',
    4: 'down-down',
  };

  const response = keyMap[event.key];
  if (!response) return;

  if (_responseEnabled) {
    handleSequenceResponse(response);
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
 * Dispatch the app-level event that returns the user to the game selector.
 */
function returnToMainMenu() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bsx:return-to-main-menu'));
  }
}

// ── Plugin contract ───────────────────────────────────────────────────────────

/** Human-readable plugin name. */
const name = 'Sound Sweep';

/**
 * Initialize the plugin after interface.html has been injected.
 *
 * Queries all required DOM elements, attaches event listeners, and resets
 * game state. Does NOT start the game loop or timers.
 *
 * @param {HTMLElement|null} gameContainer - The element containing the game HTML.
 */
function init(gameContainer) {
  _container = gameContainer;
  game.initGame();

  if (!_container) return;

  _instructionsEl  = _container.querySelector('#ss-instructions');
  _gameAreaEl      = _container.querySelector('#ss-game-area');
  _endPanelEl      = _container.querySelector('#ss-end-panel');
  _feedbackEl      = _container.querySelector('#ss-feedback');
  _statusEl        = _container.querySelector('#ss-status');
  _levelEl         = _container.querySelector('#ss-level');
  _scoreEl         = _container.querySelector('#ss-score');
  _trialsEl        = _container.querySelector('#ss-trials');
  _streakEl        = _container.querySelector('#ss-streak');
  _sessionTimerEl  = _container.querySelector('#ss-session-timer');
  _finalLevelEl    = _container.querySelector('#ss-final-level');
  _finalScoreEl    = _container.querySelector('#ss-final-score');
  _finalTrialsEl   = _container.querySelector('#ss-final-trials');
  _uuBtn           = _container.querySelector('#ss-btn-uu');
  _udBtn           = _container.querySelector('#ss-btn-ud');
  _duBtn           = _container.querySelector('#ss-btn-du');
  _ddBtn           = _container.querySelector('#ss-btn-dd');
  _startBtn        = _container.querySelector('#ss-start-btn');
  _stopBtn         = _container.querySelector('#ss-stop-btn');
  _playAgainBtn    = _container.querySelector('#ss-play-again-btn');
  _returnBtn       = _container.querySelector('#ss-return-btn');
  _replayBtn       = _container.querySelector('#ss-replay-btn');

  if (_startBtn)     _startBtn.addEventListener('click', () => start());
  if (_stopBtn)      _stopBtn.addEventListener('click', () => stop());
  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      start();
    });
  }
  if (_returnBtn)  _returnBtn.addEventListener('click', () => returnToMainMenu());
  if (_replayBtn)  _replayBtn.addEventListener('click', () => replayCurrentSweep());

  if (_uuBtn) _uuBtn.addEventListener('click', () => handleSequenceResponse('up-up'));
  if (_udBtn) _udBtn.addEventListener('click', () => handleSequenceResponse('up-down'));
  if (_duBtn) _duBtn.addEventListener('click', () => handleSequenceResponse('down-up'));
  if (_ddBtn) _ddBtn.addEventListener('click', () => handleSequenceResponse('down-down'));

  document.addEventListener('keydown', handleKeyDown);

  setResponseButtonsEnabled(false);
  updateStats();
}

/**
 * Start a gameplay session.
 */
function start() {
  game.startGame();

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });

  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl)     _endPanelEl.hidden = true;
  if (_gameAreaEl)     _gameAreaEl.hidden = false;
  if (_feedbackEl)     _feedbackEl.textContent = '';

  setResponseButtonsEnabled(false);

  startTrial();
}

/**
 * Stop the gameplay session, save progress, and show the end panel.
 *
 * @returns {{ score: number, level: number, trialsCompleted: number, duration: number }}
 */
function stop() {
  clearAsyncHandles();
  _responseEnabled = false;
  setResponseButtonsEnabled(false);

  const result = game.isRunning() ? game.stopGame() : {
    score: game.getScore(),
    level: game.getCurrentLevel(),
    trialsCompleted: game.getTrialsCompleted(),
    duration: 0,
  };
  const sessionDurationMs = timerService.stopTimer();

  if (_gameAreaEl) _gameAreaEl.hidden = true;
  showEndPanel(result);

  if (result.trialsCompleted > 0) {
    saveScore(GAME_ID, {
      score: result.score,
      level: result.level,
      sessionDurationMs,
    });
  }

  return result;
}

/**
 * Reset to the pre-game instructions state without reloading interface.html.
 */
function reset() {
  clearAsyncHandles();
  game.initGame();
  timerService.resetTimer();

  _currentSequence = null;
  _responseEnabled = false;

  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';
  if (_feedbackEl)     _feedbackEl.textContent = '';
  if (_statusEl)       _statusEl.textContent = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl)     _gameAreaEl.hidden = true;
  if (_endPanelEl)     _endPanelEl.hidden = true;

  setResponseButtonsEnabled(false);
  updateStats();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
