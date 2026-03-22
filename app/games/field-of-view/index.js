/**
 * index.js - Field of View plugin entry point.
 *
 * Handles DOM rendering, high-precision timing flow, and plugin lifecycle.
 *
 * @file Field of View game plugin (UI/controller layer).
 */

import * as game from './game.js';

/** Game identifier used for progress persistence. */
const GAME_ID = 'field-of-view';

/** Mask display duration in ms. */
const MASK_DURATION_MS = 120;

/** Inter-trial delay in ms. */
const INTER_TRIAL_DELAY_MS = 350;

/** Path to Field of View image assets from renderer root. */
const IMAGES_BASE_PATH = 'games/field-of-view/images/';

/** @type {HTMLElement|null} */
let _container = null;
/** @type {HTMLElement|null} */
let _instructionsEl = null;
/** @type {HTMLElement|null} */
let _gameAreaEl = null;
/** @type {HTMLElement|null} */
let _endPanelEl = null;
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
/** @type {HTMLButtonElement|null} */
let _submitBtn = null;

/** @type {ReturnType<typeof requestAnimationFrame>|null} */
let _stimulusRafId = null;
/** @type {ReturnType<typeof requestAnimationFrame>|null} */
let _maskRafId = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let _nextTrialTimer = null;

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
  if (_feedbackEl) {
    _feedbackEl.textContent = message;
  }
}

/**
 * Convert a ratio [0..1] to display percent.
 *
 * @param {number} value
 * @returns {string}
 */
function percent(value) {
  return `${Math.round(value * 100)}%`;
}

/**
 * Normalize millisecond values to at most 2 decimals without trailing zeros.
 *
 * @param {number} value
 * @returns {string}
 */
function formatMs(value) {
  return String(Number(value).toFixed(2)).replace(/\.00$/, '');
}

/**
 * Update game stats in the status bar.
 */
function updateStats() {
  if (_soaEl) _soaEl.textContent = String(game.getCurrentSoaMs());
  if (_thresholdEl) _thresholdEl.textContent = String(game.getCurrentSoaMs());
  if (_accuracyEl) _accuracyEl.textContent = percent(game.getRecentAccuracy());
  if (_trialsEl) _trialsEl.textContent = String(game.getTrialsCompleted());
}

/**
 * Build SVG point string for threshold history polyline.
 *
 * @param {Array<{ thresholdMs: number }>} history
 * @returns {string}
 */
function buildTrendPolylinePoints(history) {
  if (!history || history.length === 0) {
    return '';
  }

  const width = 300;
  const height = 120;
  const pad = 10;

  const values = history.map((entry) => entry.thresholdMs);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  const denominator = Math.max(history.length - 1, 1);

  return history.map((entry, index) => {
    const x = pad + ((width - pad * 2) * index) / denominator;
    const normalized = (entry.thresholdMs - min) / span;
    const y = height - pad - normalized * (height - pad * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

/**
 * Render the threshold history chart and summary values.
 */
function renderThresholdTrend() {
  const history = game.getThresholdHistory();
  const latest = history.length > 0
    ? history[history.length - 1].thresholdMs
    : game.getCurrentSoaMs();

  if (_trendLatestEl) {
    _trendLatestEl.textContent = formatMs(latest);
  }

  if (_finalBestThresholdEl) {
    const best = history.length > 0
      ? Math.min(...history.map((entry) => entry.thresholdMs))
      : game.getCurrentSoaMs();
    _finalBestThresholdEl.textContent = formatMs(best);
  }

  if (!_trendLineEl) return;

  const points = buildTrendPolylinePoints(history);
  _trendLineEl.setAttribute('points', points);

  if (_trendEmptyEl) {
    _trendEmptyEl.hidden = points.length > 0;
  }
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
}

/**
 * Return human-readable label text for a stimulus icon.
 *
 * @param {{ id: string }} icon
 * @returns {string}
 */
function labelForIcon(icon) {
  if (!icon) return 'Empty';
  if (icon.id === 'primary-kitten') return 'Primary kitten';
  if (icon.id === 'secondary-kitten') return 'Secondary kitten';
  if (icon.id === 'toy-1') return 'Toy 1';
  if (icon.id === 'toy-2') return 'Toy 2';
  return 'Stimulus';
}

/**
 * Create an image element for a stimulus icon.
 *
 * @param {{ id: string, file: string }} icon
 * @returns {HTMLImageElement}
 */
function createStimulusImage(icon) {
  const img = document.createElement('img');
  img.src = `${IMAGES_BASE_PATH}${icon.file}`;
  img.alt = labelForIcon(icon);
  img.decoding = 'async';
  img.loading = 'eager';
  return img;
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

  _currentTrial.cells.forEach((cell) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fov-cell';
    btn.dataset.index = String(cell.index);

    if (cell.role === 'center') {
      btn.classList.add('fov-cell--center');
      btn.disabled = true;
    }

    if (!revealStimulus) {
      btn.classList.add('fov-cell--hidden');
      btn.textContent = ' '; // keeps the cell geometry stable
    } else if (cell.icon) {
      btn.appendChild(createStimulusImage(cell.icon));
    } else {
      btn.textContent = ' ';
    }

    btn.addEventListener('click', () => {
      if (!_responseEnabled || !_currentTrial) return;
      if (cell.index === _currentTrial.centerIndex) return;
      _selectedPeripheralIndex = cell.index;
      updatePeripheralSelectionVisual();
      updateSubmitButtonState();
    });

    _boardEl.appendChild(btn);
  });
}

/**
 * Highlight selected peripheral cell in response phase.
 */
function updatePeripheralSelectionVisual() {
  if (!_boardEl) return;
  const cells = _boardEl.querySelectorAll('.fov-cell');
  cells.forEach((el) => {
    const index = Number(el.getAttribute('data-index'));
    if (index === _selectedPeripheralIndex) {
      el.classList.add('fov-cell--selected');
    } else {
      el.classList.remove('fov-cell--selected');
    }
  });
}

/**
 * Set selected center icon response.
 *
 * @param {'primary-kitten'|'secondary-kitten'} id
 */
function chooseCenter(id) {
  _selectedCenterId = id;

  if (_centerPrimaryBtn) {
    _centerPrimaryBtn.setAttribute('aria-pressed', String(id === 'primary-kitten'));
  }
  if (_centerSecondaryBtn) {
    _centerSecondaryBtn.setAttribute('aria-pressed', String(id === 'secondary-kitten'));
  }

  updateSubmitButtonState();
}

/**
 * Enable submit only when both responses are selected.
 */
function updateSubmitButtonState() {
  if (!_submitBtn) return;
  const canSubmit = _responseEnabled
    && _selectedCenterId !== null
    && _selectedPeripheralIndex !== null;
  _submitBtn.disabled = !canSubmit;
}

/**
 * Reset response controls before each trial.
 */
function resetResponseSelection() {
  _selectedCenterId = null;
  _selectedPeripheralIndex = null;

  if (_centerPrimaryBtn) _centerPrimaryBtn.setAttribute('aria-pressed', 'false');
  if (_centerSecondaryBtn) _centerSecondaryBtn.setAttribute('aria-pressed', 'false');

  updatePeripheralSelectionVisual();
  updateSubmitButtonState();
}

/**
 * Enter response phase after stimulus and mask complete.
 */
function enterResponsePhase() {
  _responseEnabled = true;
  _responseStartMs = nowMs();

  if (_maskEl) _maskEl.hidden = true;
  if (_boardEl) _boardEl.hidden = false;

  renderBoard(false);

  if (_responseEl) _responseEl.hidden = false;
  announce('Respond now: choose the center kitten and the toy location.');

  resetResponseSelection();
}

/**
 * Start mask phase for a fixed duration using requestAnimationFrame timing.
 */
function runMaskPhase() {
  if (_maskEl) _maskEl.hidden = false;
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
  if (_responseEl) _responseEl.hidden = true;
  _responseEnabled = false;

  if (_boardEl) _boardEl.hidden = false;
  if (_maskEl) _maskEl.hidden = true;

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
  updateSubmitButtonState();

  const reactionTimeMs = nowMs() - _responseStartMs;
  const trialUpdate = game.recordTrial({ success, reactionTimeMs });

  updateStats();
  renderThresholdTrend();

  if (success) {
    announce('Correct. SOA may decrease after the success streak target is met.');
  } else {
    announce('Incorrect. SOA increased by one step to keep challenge near threshold.');
  }

  if (_feedbackEl) {
    _feedbackEl.textContent = `${_feedbackEl.textContent} `
      + `(accuracy ${percent(trialUpdate.recentAccuracy)})`;
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
 * Save game progress asynchronously via IPC.
 *
 * @param {{ thresholdMs: number, trialsCompleted: number, recentAccuracy: number }} result
 */
function saveProgress(result) {
  (async () => {
    if (typeof window === 'undefined' || !window.api) return;

    try {
      const fallback = { playerId: 'default', games: {} };
      let existing = fallback;
      try {
        existing = await window.api.invoke('progress:load', { playerId: 'default' }) || fallback;
      } catch {
        existing = fallback;
      }

      const previous = (existing.games && existing.games[GAME_ID]) || {};
      const previousBest = Number(previous.bestThresholdMs || Number.POSITIVE_INFINITY);
      const nextBest = Math.min(previousBest, result.thresholdMs);

      const updated = {
        ...existing,
        games: {
          ...existing.games,
          [GAME_ID]: {
            highScore: Math.max(previous.highScore || 0, Math.round(1000 / result.thresholdMs)),
            sessionsPlayed: (previous.sessionsPlayed || 0) + 1,
            lastPlayed: new Date().toISOString(),
            bestThresholdMs: Number(nextBest.toFixed(2)),
            lastThresholdMs: Number(result.thresholdMs.toFixed(2)),
            lastRecentAccuracy: result.recentAccuracy,
            thresholdHistory: game.getThresholdHistory(),
            trialsCompleted: result.trialsCompleted,
          },
        },
      };

      await window.api.invoke('progress:save', { playerId: 'default', data: updated });
    } catch {
      // Swallow all progress save errors.
    }
  })();
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
  _submitBtn = _container.querySelector('#fov-submit-btn');

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
  if (_submitBtn) _submitBtn.addEventListener('click', () => submitResponse());

  updateStats();
  renderThresholdTrend();
}

/**
 * Start gameplay session.
 */
function start() {
  game.startGame();

  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_gameAreaEl) _gameAreaEl.hidden = false;

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
  if (_finalAccuracyEl) _finalAccuracyEl.textContent = percent(result.recentAccuracy);

  renderThresholdTrend();

  saveProgress(result);

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
  if (_maskEl) _maskEl.hidden = true;
  if (_responseEl) _responseEl.hidden = true;
  if (_feedbackEl) _feedbackEl.textContent = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;

  updateStats();
  renderThresholdTrend();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
