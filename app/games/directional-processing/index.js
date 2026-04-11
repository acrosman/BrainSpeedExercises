/**
 * index.js — Directional Processing game plugin entry point.
 *
 * Handles DOM wiring, the stimulus/mask/response trial cycle, arrow-key
 * interception, feedback, and plugin lifecycle (init / start / stop / reset).
 *
 * Rendering of Gabor patches and the visual mask is delegated to gabor.js.
 * Core game logic (staircase, scoring) lives in game.js.
 *
 * @file Directional Processing game plugin (UI/controller layer).
 */

import * as game from './game.js';
import { drawGabor, drawMask, getDirectionParams, PHASE_SPEED_RAD_PER_MS } from './gabor.js';
import { playFeedbackSound } from '../../components/audioService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import { saveScore } from '../../components/scoreService.js';
import * as timerService from '../../components/timerService.js';

/** Game identifier used for progress persistence (must match manifest.json id). */
const GAME_ID = 'directional-processing';

// ── Timing constants ──────────────────────────────────────────────────────────

/** Duration (ms) the visual mask is displayed between stimulus and response. */
const MASK_DURATION_MS = 150;

/** Pause (ms) between a response being submitted and the next trial starting. */
const INTER_TRIAL_DELAY_MS = 400;

/** Duration (ms) of the green/red flash overlay on the canvas stage. */
const FEEDBACK_FLASH_MS = 250;

// ── DOM element references (populated by init) ────────────────────────────────

/** @type {HTMLElement|null} */
let _container = null;
/** @type {HTMLElement|null} */
let _instructionsEl = null;
/** @type {HTMLElement|null} */
let _gameAreaEl = null;
/** @type {HTMLElement|null} */
let _endPanelEl = null;
/** @type {HTMLCanvasElement|null} */
let _canvasEl = null;
/** @type {HTMLElement|null} */
let _stageEl = null;
/** @type {HTMLElement|null} */
let _feedbackEl = null;
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
let _upBtn = null;
/** @type {HTMLButtonElement|null} */
let _downBtn = null;
/** @type {HTMLButtonElement|null} */
let _leftBtn = null;
/** @type {HTMLButtonElement|null} */
let _rightBtn = null;
/** @type {HTMLButtonElement|null} */
let _startBtn = null;
/** @type {HTMLButtonElement|null} */
let _stopBtn = null;
/** @type {HTMLButtonElement|null} */
let _playAgainBtn = null;
/** @type {HTMLButtonElement|null} */
let _returnBtn = null;

// ── Per-trial state ───────────────────────────────────────────────────────────

/** Direction chosen for the current trial. @type {string|null} */
let _currentDirection = null;

/** Whether the player can currently submit a direction response. */
let _responseEnabled = false;

// ── Async handle references ───────────────────────────────────────────────────

/** rAF handle for the stimulus animation loop. @type {number|null} */
let _stimulusRafId = null;

/** rAF handle for the mask phase. @type {number|null} */
let _maskRafId = null;

/** setTimeout handle for the inter-trial pause. @type {number|null} */
let _nextTrialTimer = null;

/** setTimeout handle for clearing the flash feedback class. @type {number|null} */
let _flashTimer = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Enable or disable all four direction buttons.
 *
 * Buttons are disabled during the stimulus and mask phases so the player
 * cannot submit a response prematurely, and re-enabled once the response
 * phase begins. Using disabled (rather than hidden) keeps the controls
 * visible throughout the game so the layout never shifts.
 *
 * @param {boolean} enabled
 */
function setDirectionButtonsEnabled(enabled) {
  [_upBtn, _downBtn, _leftBtn, _rightBtn].forEach((btn) => {
    if (btn) btn.disabled = !enabled;
  });
}

/**
 * Highlight the button that represents the correct answer.
 * Called after a wrong response so the player can see what they missed.
 *
 * @param {string} direction - One of 'up', 'down', 'left', 'right'.
 */
function highlightCorrectButton(direction) {
  const map = { up: _upBtn, down: _downBtn, left: _leftBtn, right: _rightBtn };
  const btn = map[direction];
  if (btn) btn.classList.add('dp-dir-btn--correct');
}

/**
 * Remove the correct-answer highlight from all direction buttons.
 * Called at the start of each new trial.
 */
function clearDirectionHighlights() {
  [_upBtn, _downBtn, _leftBtn, _rightBtn].forEach((btn) => {
    if (btn) btn.classList.remove('dp-dir-btn--correct');
  });
}

/**
 * Get a high-precision timestamp, falling back to Date.now when unavailable.
 *
 * @returns {number}
 */
function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Post a status message to the live-feedback region.
 *
 * @param {string} message
 */
export function announce(message) {
  if (_feedbackEl) {
    _feedbackEl.textContent = message;
  }
}

/**
 * Refresh the stats bar with current game state values.
 */
export function updateStats() {
  const lvl = game.getCurrentLevel();
  const streak = game.getConsecutiveCorrect();

  if (_levelEl) _levelEl.textContent = String(lvl + 1);
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_trialsEl) _trialsEl.textContent = String(game.getTrialsCompleted());
  if (_streakEl) _streakEl.textContent = String(streak);
}

/**
 * Apply a brief colored flash to the stage to indicate correct/incorrect.
 *
 * @param {boolean} isSuccess
 */
function flashStageFeedback(isSuccess) {
  if (!_stageEl) return;

  _stageEl.classList.remove('dp-stage--flash-correct', 'dp-stage--flash-wrong');
  _stageEl.classList.add(
    isSuccess ? 'dp-stage--flash-correct' : 'dp-stage--flash-wrong',
  );

  if (_flashTimer !== null) {
    clearTimeout(_flashTimer);
  }

  _flashTimer = setTimeout(() => {
    if (_stageEl) {
      _stageEl.classList.remove('dp-stage--flash-correct', 'dp-stage--flash-wrong');
    }
    _flashTimer = null;
  }, FEEDBACK_FLASH_MS);
}

/**
 * Cancel and clear all outstanding RAF handles and timeouts.
 */
function clearAsyncHandles() {
  if (_stimulusRafId !== null) {
    cancelAnimationFrame(_stimulusRafId);
    _stimulusRafId = null;
  }
  if (_maskRafId !== null) {
    cancelAnimationFrame(_maskRafId);
    _maskRafId = null;
  }
  if (_nextTrialTimer !== null) {
    clearTimeout(_nextTrialTimer);
    _nextTrialTimer = null;
  }
  if (_flashTimer !== null) {
    clearTimeout(_flashTimer);
    _flashTimer = null;
  }
}

/**
 * Enable the direction buttons and focus the first one so keyboard users
 * are ready to respond. The response panel is always visible; only the
 * interactive state of the buttons changes.
 */
function enterResponsePhase() {
  _responseEnabled = true;
  setDirectionButtonsEnabled(true);
  // Move focus to the Up button so keyboard users are ready to respond.
  if (_upBtn) {
    _upBtn.focus();
  }
}

/**
 * Display the mask (uniform gray) for MASK_DURATION_MS using rAF timing,
 * then transition to the response phase.
 */
function runMaskPhase() {
  if (_canvasEl) drawMask(_canvasEl);

  const start = nowMs();

  const tick = () => {
    const elapsed = nowMs() - start;
    if (elapsed >= MASK_DURATION_MS) {
      _maskRafId = null;
      enterResponsePhase();
      return;
    }
    _maskRafId = requestAnimationFrame(tick);
  };

  _maskRafId = requestAnimationFrame(tick);
}

/**
 * Animate the Gabor stimulus for the current level's display duration using
 * rAF timing, then transition to the mask phase.
 *
 * @param {string} direction - Motion direction ('up'|'down'|'left'|'right').
 * @param {number} contrast - Gabor contrast multiplier (0..1).
 * @param {number} displayDurationMs - Duration to show the stimulus.
 */
function runStimulusPhase(direction, contrast, displayDurationMs) {
  _responseEnabled = false;
  setDirectionButtonsEnabled(false);
  if (_feedbackEl) _feedbackEl.textContent = '';

  const { theta, phiDirection } = getDirectionParams(direction);
  const start = nowMs();

  const tick = () => {
    const elapsed = nowMs() - start;

    if (elapsed >= displayDurationMs) {
      _stimulusRafId = null;
      runMaskPhase();
      return;
    }

    // Advance the grating phase to create the apparent motion effect.
    const phi = phiDirection * PHASE_SPEED_RAD_PER_MS * elapsed;
    if (_canvasEl) {
      drawGabor(_canvasEl, { theta, phi, contrast });
    }

    _stimulusRafId = requestAnimationFrame(tick);
  };

  _stimulusRafId = requestAnimationFrame(tick);
}

/**
 * Begin a new trial: clear any previous answer highlight, pick a direction,
 * update stats, and start the stimulus animation.
 */
function startTrial() {
  if (!game.isRunning()) return;

  clearDirectionHighlights();
  _currentDirection = game.pickDirection();
  const { displayDurationMs, contrast } = game.getCurrentLevelConfig();

  updateStats();
  runStimulusPhase(_currentDirection, contrast, displayDurationMs);
}

/**
 * Handle a direction response (from button click or keyboard).
 *
 * @param {string} direction - One of 'up', 'down', 'left', 'right'.
 */
export function handleDirectionResponse(direction) {
  if (!_responseEnabled) return;

  _responseEnabled = false;
  setDirectionButtonsEnabled(false);

  const success = direction === _currentDirection;
  game.recordTrial({ success });

  updateStats();
  playFeedbackSound(success);
  flashStageFeedback(success);

  if (success) {
    announce('Correct!');
  } else {
    // Highlight the correct button so the player can see what they missed.
    highlightCorrectButton(_currentDirection);
    announce(`Incorrect — direction was ${_currentDirection}.`);
  }

  if (game.isRunning()) {
    _nextTrialTimer = setTimeout(() => {
      _nextTrialTimer = null;
      startTrial();
    }, INTER_TRIAL_DELAY_MS);
  }
}

/**
 * Keyboard handler for arrow key input.
 *
 * Arrow key default behavior (page scrolling) is blocked while the game is
 * running so that keyboard responses do not also move the scroll position.
 *
 * @param {KeyboardEvent} event
 */
export function handleKeyDown(event) {
  /** @type {Record<string, string>} */
  const directionMap = {
    ArrowUp:    'up',
    ArrowDown:  'down',
    ArrowLeft:  'left',
    ArrowRight: 'right',
  };

  const direction = directionMap[event.key];
  if (!direction) return;

  // Block default scrolling during game play.
  if (game.isRunning()) {
    event.preventDefault();
  }

  if (_responseEnabled) {
    handleDirectionResponse(direction);
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

// ── Plugin contract ───────────────────────────────────────────────────────────

/** Human-readable plugin name. */
const name = 'Directional Processing';

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

  _instructionsEl = _container.querySelector('#dp-instructions');
  _gameAreaEl     = _container.querySelector('#dp-game-area');
  _endPanelEl     = _container.querySelector('#dp-end-panel');
  _canvasEl       = _container.querySelector('#dp-canvas');
  _stageEl        = _container.querySelector('#dp-stage');
  _feedbackEl     = _container.querySelector('#dp-feedback');
  _levelEl        = _container.querySelector('#dp-level');
  _scoreEl        = _container.querySelector('#dp-score');
  _trialsEl       = _container.querySelector('#dp-trials');
  _streakEl       = _container.querySelector('#dp-streak');
  _sessionTimerEl = _container.querySelector('#dp-session-timer');
  _finalLevelEl   = _container.querySelector('#dp-final-level');
  _finalScoreEl   = _container.querySelector('#dp-final-score');
  _finalTrialsEl  = _container.querySelector('#dp-final-trials');
  _upBtn          = _container.querySelector('#dp-btn-up');
  _downBtn        = _container.querySelector('#dp-btn-down');
  _leftBtn        = _container.querySelector('#dp-btn-left');
  _rightBtn       = _container.querySelector('#dp-btn-right');
  _startBtn       = _container.querySelector('#dp-start-btn');
  _stopBtn        = _container.querySelector('#dp-stop-btn');
  _playAgainBtn   = _container.querySelector('#dp-play-again-btn');
  _returnBtn      = _container.querySelector('#dp-return-btn');

  if (_startBtn) _startBtn.addEventListener('click', () => start());
  if (_stopBtn)  _stopBtn.addEventListener('click', () => stop());
  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      start();
    });
  }
  if (_returnBtn) _returnBtn.addEventListener('click', () => returnToMainMenu());

  if (_upBtn)    _upBtn.addEventListener('click', () => handleDirectionResponse('up'));
  if (_downBtn)  _downBtn.addEventListener('click', () => handleDirectionResponse('down'));
  if (_leftBtn)  _leftBtn.addEventListener('click', () => handleDirectionResponse('left'));
  if (_rightBtn) _rightBtn.addEventListener('click', () => handleDirectionResponse('right'));

  document.addEventListener('keydown', handleKeyDown);

  setDirectionButtonsEnabled(false);
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

  clearDirectionHighlights();
  setDirectionButtonsEnabled(false);

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
  setDirectionButtonsEnabled(false);
  clearDirectionHighlights();

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
    }, {
      lastTrialsCompleted: result.trialsCompleted,
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

  _currentDirection = null;
  _responseEnabled = false;

  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';
  if (_feedbackEl) _feedbackEl.textContent = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl)     _gameAreaEl.hidden = true;
  if (_endPanelEl)     _endPanelEl.hidden = true;

  clearDirectionHighlights();
  setDirectionButtonsEnabled(false);
  updateStats();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
