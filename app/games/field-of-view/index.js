/**
 * index.js - Field of View plugin entry point.
 *
 * Handles DOM wiring, high-precision timing flow, and plugin lifecycle.
 * Rendering utilities are in render.js, audio feedback in audio.js,
 * and progress persistence in progress.js.
 *
 * @file Field of View game plugin (UI/controller layer).
 */

import * as game from './game.js';
import * as render from './render.js';
import { playFeedbackSound } from './audio.js';
import { saveProgress } from './progress.js';

/** Mask display duration in ms. */
const MASK_DURATION_MS = 120;

/** Inter-trial delay in ms. */
const INTER_TRIAL_DELAY_MS = 350;

/** Flash overlay duration for correct/incorrect feedback. */
const FEEDBACK_FLASH_MS = 220;

/** @type {HTMLElement|null} */
let _container = null;
/** @type {HTMLElement|null} */
let _instructionsEl = null;
/** @type {HTMLElement|null} */
let _gameAreaEl = null;
/** @type {HTMLElement|null} */
let _endPanelEl = null;
/** @type {HTMLElement|null} */
let _stageEl = null;
/** @type {HTMLElement|null} */
let _boardEl = null;
/** @type {HTMLElement|null} */
let _maskEl = null;
/** @type {HTMLElement|null} */
let _responseEl = null;
/** @type {HTMLElement|null} */
let _feedbackEl = null;
/** @type {HTMLElement|null} */
let _soaEl = null;
/** @type {HTMLElement|null} */
let _thresholdEl = null;
/** @type {HTMLElement|null} */
let _accuracyEl = null;
/** @type {HTMLElement|null} */
let _trialsEl = null;
/** @type {HTMLElement|null} */
let _finalThresholdEl = null;
/** @type {HTMLElement|null} */
let _finalAccuracyEl = null;
/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;
/** @type {HTMLElement|null} */
let _trendEmptyEl = null;
/** @type {HTMLElement|null} */
let _trendLatestEl = null;
/** @type {HTMLElement|null} */
let _finalBestThresholdEl = null;
/** @type {HTMLButtonElement|null} */
let _startBtn = null;
/** @type {HTMLButtonElement|null} */
let _stopBtn = null;
/** @type {HTMLButtonElement|null} */
let _playAgainBtn = null;
/** @type {HTMLButtonElement|null} */
let _returnBtn = null;
/** @type {HTMLButtonElement|null} */
let _centerPrimaryBtn = null;
/** @type {HTMLButtonElement|null} */
let _centerSecondaryBtn = null;

/** @type {ReturnType<typeof requestAnimationFrame>|null} */
let _stimulusRafId = null;
/** @type {ReturnType<typeof requestAnimationFrame>|null} */
let _maskRafId = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let _nextTrialTimer = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let _flashTimer = null;

/**
 * @type {{
 *   gridSize: number,
 *   centerIndex: number,
 *   centerIcon: { id: string, file: string, width: number, height: number },
 *   peripheralIndex: number,
 *   peripheralIcon: { id: string, file: string, width: number, height: number },
 *   cells: Array<{
 *     index: number,
 *     role: string,
 *     icon: { id: string, file: string, width: number, height: number }|null
 *   }>,
 * }|null}
 */
let _currentTrial = null;

/** @type {string|null} */
let _selectedCenterId = null;
/** @type {number|null} */
let _selectedPeripheralIndex = null;
/** @type {boolean} */
let _responseEnabled = false;
/** @type {number} */
let _responseStartMs = 0;

/**
 * Get a high-precision current timestamp.
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
 * Announce status text in the UI feedback region.
 *
 * @param {string} message
 */
function announce(message) {
  render.announce(_feedbackEl, message);
}

/**
 * Update game stats in the status bar.
 */
function updateStats() {
  render.updateStats(
    {
      soaEl: _soaEl,
      thresholdEl: _thresholdEl,
      accuracyEl: _accuracyEl,
      trialsEl: _trialsEl,
    },
    {
      soaMs: game.getCurrentSoaMs(),
      accuracy: game.getRecentAccuracy(),
      trialsCompleted: game.getTrialsCompleted(),
    },
  );
}

/**
 * Render the threshold history chart and summary values.
 */
function updateThresholdTrend() {
  render.renderThresholdTrend(
    {
      trendLineEl: _trendLineEl,
      trendEmptyEl: _trendEmptyEl,
      trendLatestEl: _trendLatestEl,
      finalBestThresholdEl: _finalBestThresholdEl,
    },
    game.getThresholdHistory(),
    game.getCurrentSoaMs(),
  );
}

/**
 * Cancel and clear any pending async handles.
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
 * Flash green/red tint over stage for trial feedback.
 *
 * @param {boolean} isSuccess
 */
function flashStageFeedback(isSuccess) {
  if (!_stageEl) return;

  _stageEl.classList.remove('fov-stage--flash-correct', 'fov-stage--flash-wrong');
  _stageEl.classList.add(isSuccess ? 'fov-stage--flash-correct' : 'fov-stage--flash-wrong');

  if (_flashTimer !== null) {
    clearTimeout(_flashTimer);
  }

  _flashTimer = setTimeout(() => {
    _stageEl.classList.remove('fov-stage--flash-correct', 'fov-stage--flash-wrong');
    _flashTimer = null;
  }, FEEDBACK_FLASH_MS);
}

/**
 * Render the current trial board.
 *
 * @param {boolean} revealStimulus
 */
function renderBoard(revealStimulus) {
  if (!_boardEl || !_currentTrial) return;

  _boardEl.innerHTML = '';
  _boardEl.style.gridTemplateColumns = `repeat(${_currentTrial.gridSize}, 1fr)`;
  _boardEl.style.gridTemplateRows = `repeat(${_currentTrial.gridSize}, 1fr)`;

  _currentTrial.cells.forEach((cell) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fov-cell';
    btn.dataset.index = String(cell.index);

    const row = Math.floor(cell.index / _currentTrial.gridSize) + 1;
    const col = (cell.index % _currentTrial.gridSize) + 1;
    btn.setAttribute('aria-label', `Row ${row}, column ${col}`);

    if (cell.role === 'center') {
      btn.classList.add('fov-cell--center');
      btn.disabled = true;
    }

    if (!revealStimulus) {
      btn.classList.add('fov-cell--hidden');
      btn.textContent = ' '; // keeps the cell geometry stable
    } else if (cell.icon) {
      btn.appendChild(render.createStimulusImage(cell.icon));
    } else {
      btn.textContent = ' ';
    }

    btn.addEventListener('click', () => {
      if (!_responseEnabled || !_currentTrial) return;
      if (cell.index === _currentTrial.centerIndex) return;
      _selectedPeripheralIndex = cell.index;
      render.updatePeripheralSelectionVisual(_boardEl, _selectedPeripheralIndex);
      attemptAutoSubmit();
    });

    _boardEl.appendChild(btn);
  });
}

/**
 * Set selected center icon response.
 *
 * The peripheral cell click handler in renderBoard carries an equivalent
 * _responseEnabled guard. Both ignore input outside the response phase.
 *
 * @param {'primary-kitten'|'secondary-kitten'} id
 */
function chooseCenter(id) {
  if (!_responseEnabled) return;
  _selectedCenterId = id;

  if (_centerPrimaryBtn) {
    _centerPrimaryBtn.setAttribute('aria-pressed', String(id === 'primary-kitten'));
  }
  if (_centerSecondaryBtn) {
    _centerSecondaryBtn.setAttribute('aria-pressed', String(id === 'secondary-kitten'));
  }

  attemptAutoSubmit();
}

/**
 * Auto-submit once both responses are selected.
 */
function attemptAutoSubmit() {
  const canSubmit = _responseEnabled
    && _selectedCenterId !== null
    && _selectedPeripheralIndex !== null;
  if (canSubmit) {
    submitResponse();
  }
}

/**
 * Reset response controls before each trial.
 */
function resetResponseSelection() {
  _selectedCenterId = null;
  _selectedPeripheralIndex = null;

  if (_centerPrimaryBtn) _centerPrimaryBtn.setAttribute('aria-pressed', 'false');
  if (_centerSecondaryBtn) _centerSecondaryBtn.setAttribute('aria-pressed', 'false');

  render.updatePeripheralSelectionVisual(_boardEl, null);
}

/**
 * Enter response phase after stimulus and mask complete.
 */
function enterResponsePhase() {
  _responseEnabled = true;
  _responseStartMs = nowMs();

  render.setStageMode(_stageEl, 'response');

  render.setMaskVisible(_maskEl, true);
  if (_boardEl) _boardEl.hidden = false;

  renderBoard(false);

  resetResponseSelection();
}

/**
 * Start mask phase for a fixed duration using requestAnimationFrame timing.
 */
function runMaskPhase() {
  render.setStageMode(_stageEl, 'mask');

  render.setMaskVisible(_maskEl, true);
  if (_boardEl) _boardEl.hidden = true;

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
 * Show stimulus board for SOA duration using requestAnimationFrame timing.
 */
function runStimulusPhase() {
  _responseEnabled = false;

  render.setStageMode(_stageEl, 'stimulus');

  if (_boardEl) _boardEl.hidden = false;
  render.setMaskVisible(_maskEl, false);

  renderBoard(true);

  const start = nowMs();
  const targetSoa = game.getCurrentSoaMs();

  const tick = () => {
    const elapsed = nowMs() - start;
    if (elapsed >= targetSoa) {
      _stimulusRafId = null;
      runMaskPhase();
      return;
    }
    _stimulusRafId = requestAnimationFrame(tick);
  };

  _stimulusRafId = requestAnimationFrame(tick);
}

/**
 * Start one trial, including layout generation and timed phases.
 */
function startTrial() {
  if (!game.isRunning()) return;
  _currentTrial = game.createTrialLayout();
  updateStats();
  announce('Watch center kitten and edge toy. The field mask follows immediately.');
  runStimulusPhase();
}

/**
 * Process trial response and apply adaptive staircase update.
 */
function submitResponse() {
  if (!_responseEnabled || !_currentTrial) return;

  const centerCorrect = _selectedCenterId === _currentTrial.centerIcon.id;
  const peripheralCorrect = _selectedPeripheralIndex === _currentTrial.peripheralIndex;
  const success = centerCorrect && peripheralCorrect;

  _responseEnabled = false;

  const reactionTimeMs = nowMs() - _responseStartMs;
  const trialUpdate = game.recordTrial({ success, reactionTimeMs });

  updateStats();
  updateThresholdTrend();
  playFeedbackSound(success);
  flashStageFeedback(success);

  if (success) {
    announce('Correct. SOA may decrease after the success streak target is met.');
  } else {
    announce('Incorrect. SOA increased by one step to keep challenge near threshold.');
  }

  if (_feedbackEl) {
    _feedbackEl.textContent = `${_feedbackEl.textContent} `
      + `(accuracy ${render.percent(trialUpdate.recentAccuracy)})`;
  }

  if (game.isRunning()) {
    _nextTrialTimer = setTimeout(() => {
      _nextTrialTimer = null;
      startTrial();
    }, INTER_TRIAL_DELAY_MS);
  }
}

/**
 * Build an idle result object when stop is requested out of sequence.
 *
 * @returns {{
 *   score: number,
 *   thresholdMs: number,
 *   trialsCompleted: number,
 *   recentAccuracy: number,
 *   duration: number,
 * }}
 */
function buildIdleResult() {
  return {
    score: game.getCurrentSoaMs(),
    thresholdMs: game.getCurrentSoaMs(),
    trialsCompleted: game.getTrialsCompleted(),
    recentAccuracy: game.getRecentAccuracy(),
    duration: 0,
  };
}

/**
 * Dispatch app-level event to return to the game selector screen.
 */
function returnToMainMenu() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bsx:return-to-main-menu'));
  }
}

/** Human-readable plugin name. */
const name = 'Field of View';

/**
 * Initialize plugin with injected game container.
 *
 * @param {HTMLElement|null} gameContainer
 */
function init(gameContainer) {
  _container = gameContainer;
  game.initGame();

  if (!_container) return;

  _instructionsEl = _container.querySelector('#fov-instructions');
  _gameAreaEl = _container.querySelector('#fov-game-area');
  _endPanelEl = _container.querySelector('#fov-end-panel');
  _stageEl = _container.querySelector('#fov-stage');
  _boardEl = _container.querySelector('#fov-board');
  _maskEl = _container.querySelector('#fov-mask');
  _responseEl = _container.querySelector('#fov-response');
  _feedbackEl = _container.querySelector('#fov-feedback');
  _soaEl = _container.querySelector('#fov-soa');
  _thresholdEl = _container.querySelector('#fov-threshold');
  _accuracyEl = _container.querySelector('#fov-accuracy');
  _trialsEl = _container.querySelector('#fov-trials');
  _finalThresholdEl = _container.querySelector('#fov-final-threshold');
  _finalAccuracyEl = _container.querySelector('#fov-final-accuracy');
  _trendLineEl = _container.querySelector('#fov-trend-line');
  _trendEmptyEl = _container.querySelector('#fov-trend-empty');
  _trendLatestEl = _container.querySelector('#fov-trend-latest');
  _finalBestThresholdEl = _container.querySelector('#fov-final-best-threshold');
  _startBtn = _container.querySelector('#fov-start-btn');
  _stopBtn = _container.querySelector('#fov-stop-btn');
  _playAgainBtn = _container.querySelector('#fov-play-again-btn');
  _returnBtn = _container.querySelector('#fov-return-btn');
  _centerPrimaryBtn = _container.querySelector('#fov-center-primary');
  _centerSecondaryBtn = _container.querySelector('#fov-center-secondary');

  if (_startBtn) _startBtn.addEventListener('click', () => start());
  if (_stopBtn) _stopBtn.addEventListener('click', () => stop());
  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      start();
    });
  }
  if (_returnBtn) _returnBtn.addEventListener('click', () => returnToMainMenu());
  if (_centerPrimaryBtn) {
    _centerPrimaryBtn.addEventListener('click', () => chooseCenter('primary-kitten'));
  }
  if (_centerSecondaryBtn) {
    _centerSecondaryBtn.addEventListener('click', () => chooseCenter('secondary-kitten'));
  }

  updateStats();
  updateThresholdTrend();
}

/**
 * Start gameplay session.
 */
function start() {
  game.startGame();

  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_gameAreaEl) _gameAreaEl.hidden = false;
  if (_responseEl) _responseEl.hidden = false;

  startTrial();
}

/**
 * Stop gameplay and show end panel.
 *
 * @returns {{
 *   score: number,
 *   thresholdMs: number,
 *   trialsCompleted: number,
 *   recentAccuracy: number,
 *   duration: number,
 * }}
 */
function stop() {
  clearAsyncHandles();

  const result = game.isRunning() ? game.stopGame() : buildIdleResult();

  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;

  if (_finalThresholdEl) _finalThresholdEl.textContent = String(result.thresholdMs);
  if (_finalAccuracyEl) _finalAccuracyEl.textContent = render.percent(result.recentAccuracy);

  updateThresholdTrend();

  if (result.trialsCompleted > 0) {
    saveProgress(result);
  }

  return result;
}

/**
 * Reset to pre-game state without leaving the game plugin.
 */
function reset() {
  clearAsyncHandles();
  game.initGame();

  _currentTrial = null;
  _responseEnabled = false;
  _selectedCenterId = null;
  _selectedPeripheralIndex = null;

  if (_boardEl) _boardEl.innerHTML = '';
  render.setStageMode(_stageEl, 'stimulus');
  render.setMaskVisible(_maskEl, false);
  if (_responseEl) _responseEl.hidden = true;
  if (_feedbackEl) _feedbackEl.textContent = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;

  updateStats();
  updateThresholdTrend();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
