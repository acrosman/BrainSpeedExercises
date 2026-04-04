
/**
 * index.js — Otter Stop! game plugin entry point for BrainSpeedExercises.
 *
 * Handles all DOM manipulation, timing, and keyboard events for the
 * Otter Stop! go/no-go reaction game.
 *
 * @file Otter Stop! game plugin (UI/controller layer).
 */

import * as game from './game.js';
import { playSuccessSound, playFailureSound } from '../../components/audioService.js';

/** Human-readable name returned as part of the plugin contract. */
const name = 'Otter Stop!';

/** Duration (ms) the feedback image/text is shown after a no-go trial. */
const FEEDBACK_DURATION_MS = 800;

/** Brief blank gap (ms) between the end of one trial and the start of the next. */
const ISI_MS = 120;

/** Base path for image assets relative to the game folder (used by the renderer). */
const IMAGE_BASE = './games/otter-stop/images/';

// ── DOM references — populated by init() ─────────────────────────────────────

/** @type {HTMLElement|null} */
let _instructionsEl = null;

/** @type {HTMLElement|null} */
let _gameAreaEl = null;

/** @type {HTMLElement|null} */
let _stimulusEl = null;

/** @type {HTMLImageElement|null} */
let _stimulusImg = null;

/** @type {HTMLElement|null} */
let _feedbackEl = null;

/** @type {HTMLImageElement|null} */
let _feedbackImg = null;

/** @type {HTMLElement|null} */
let _feedbackText = null;

/** @type {HTMLElement|null} */
let _endPanelEl = null;

/** @type {HTMLButtonElement|null} */
let _startBtn = null;

/** @type {HTMLButtonElement|null} */
let _stopBtn = null;

/** @type {HTMLButtonElement|null} */
let _playAgainBtn = null;

/** @type {HTMLButtonElement|null} */
let _returnBtn = null;

/** @type {HTMLElement|null} */
let _levelEl = null;

/** @type {HTMLElement|null} */
let _scoreEl = null;

/** @type {HTMLElement|null} */
let _nogoHitsEl = null;

/** @type {HTMLElement|null} */
let _intervalEl = null;

/** @type {HTMLElement|null} */
let _finalScoreEl = null;

/** @type {HTMLElement|null} */
let _finalBestEl = null;

/** @type {HTMLElement|null} */
let _finalNogoEl = null;

/** @type {HTMLElement|null} */
let _finalMissesEl = null;

/** @type {HTMLElement|null} */
let _finalTrialsEl = null;

// ── Per-trial state ───────────────────────────────────────────────────────────

/** Key of the image currently being displayed (null between trials). */
let _currentImageKey = null;

/** Whether the current stimulus is the no-go image. */
let _currentIsNoGo = false;

/** Whether Space was pressed during the current trial window. */
let _spacePressedThisTrial = false;

/** setTimeout handle for the trial display window. */
let _trialTimer = null;

/** setTimeout handle for the feedback period. */
let _feedbackTimer = null;

/** setTimeout handle for the inter-stimulus interval. */
let _isiTimer = null;

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Update the live stats bar with the latest values from the game module.
 */
export function updateStats() {
  if (_levelEl) _levelEl.textContent = game.getLevel() + 1;
  if (_scoreEl) _scoreEl.textContent = game.getScore();
  if (_nogoHitsEl) _nogoHitsEl.textContent = game.getNoGoHits();
  if (_intervalEl) _intervalEl.textContent = game.getCurrentIntervalMs();
}

/**
 * Show the image for a given image key in the stimulus area.
 * @param {string} imageKey - One of the IMAGE_KEYS from game.js.
 */
export function showImage(imageKey) {
  if (!_stimulusImg) return;
  _stimulusImg.src = `${IMAGE_BASE}${imageKey}.png`;
  _stimulusImg.alt = imageKey === game.NO_GO_KEY ? 'No-go otter' : 'Go otter';
  _stimulusImg.classList.remove('os-hidden');
}

/**
 * Hide the current image (blank inter-stimulus interval).
 */
export function hideImage() {
  if (!_stimulusImg) return;
  _stimulusImg.classList.add('os-hidden');
}

/**
 * Display the feedback panel after a trial that requires feedback.
 * Feedback is shown for all no-go trials and for go images the player missed.
 *
 * @param {'correct' | 'wrong'} outcome - Whether the response was correct.
 * @param {boolean} wasNoGo - Whether the stimulus was the no-go image.
 */
export function showFeedback(outcome, wasNoGo) {
  if (!_feedbackEl) return;

  const isCorrect = outcome === 'correct';
  const imgKey = isCorrect ? 'success' : 'failure';

  let label;
  if (isCorrect) {
    label = 'Great stop!';
  } else if (wasNoGo) {
    label = 'Oops \u2014 too fast!';
  } else {
    label = 'Too slow!';
  }

  const cssClass = isCorrect ? 'os-feedback__text--correct' : 'os-feedback__text--wrong';

  if (_feedbackImg) {
    _feedbackImg.src = `${IMAGE_BASE}${imgKey}.png`;
    _feedbackImg.alt = label;
  }
  if (_feedbackText) {
    _feedbackText.textContent = label;
    _feedbackText.className = `os-feedback__text ${cssClass}`;
  }

  _feedbackEl.hidden = false;

  if (isCorrect) {
    playSuccessSound();
  } else {
    playFailureSound();
  }
}

/**
 * Hide the feedback panel.
 */
export function hideFeedback() {
  if (_feedbackEl) _feedbackEl.hidden = true;
}

/**
 * Populate and display the end-of-game results panel.
 * @param {{ score: number, noGoHits: number, misses: number,
 *           trialsCompleted: number, bestScore: number }} result
 */
export function showEndPanel(result) {
  if (_finalScoreEl) _finalScoreEl.textContent = result.score;
  if (_finalBestEl) _finalBestEl.textContent = result.bestScore;
  if (_finalNogoEl) _finalNogoEl.textContent = result.noGoHits;
  if (_finalMissesEl) _finalMissesEl.textContent = result.misses;
  if (_finalTrialsEl) _finalTrialsEl.textContent = result.trialsCompleted;
  if (_endPanelEl) _endPanelEl.hidden = false;
}

// ── Game loop ─────────────────────────────────────────────────────────────────

/**
 * End the current trial, record the response, handle feedback, then schedule
 * the next trial (or end the game if it has been stopped).
 *
 * Feedback is shown for:
 *  - All no-go trials (correct inhibition or false alarm).
 *  - Go images the player failed to respond to in time (miss).
 * Go images responded to correctly proceed immediately to keep the pace fast.
 */
export function endTrial() {
  if (!game.isRunning()) return;

  const outcome = game.recordResponse(_currentIsNoGo, _spacePressedThisTrial);
  updateStats();

  const wasNoGo = _currentIsNoGo;
  _currentImageKey = null;
  _currentIsNoGo = false;

  hideImage();

  // Show feedback for no-go trials and for go images the player missed.
  const needsFeedback = wasNoGo || outcome === 'wrong';
  if (needsFeedback) {
    showFeedback(outcome, wasNoGo);
    _feedbackTimer = setTimeout(() => {
      hideFeedback();
      scheduleNextTrial();
    }, FEEDBACK_DURATION_MS);
  } else {
    scheduleNextTrial();
  }
}

/**
 * Schedule the next trial after the inter-stimulus interval.
 * If the game is no longer running, this is a no-op.
 */
export function scheduleNextTrial() {
  if (!game.isRunning()) return;
  _isiTimer = setTimeout(beginTrial, ISI_MS);
}

/**
 * Begin a new trial: pick a stimulus, display it, and start the response window.
 */
export function beginTrial() {
  if (!game.isRunning()) return;

  _spacePressedThisTrial = false;
  const { imageKey, isNoGo } = game.pickNextImage();
  _currentImageKey = imageKey;
  _currentIsNoGo = isNoGo;

  showImage(imageKey);

  const intervalMs = game.getCurrentIntervalMs();
  _trialTimer = setTimeout(endTrial, intervalMs);
}

/**
 * Clear all pending timers (trial, feedback, ISI).
 */
export function clearAllTimers() {
  if (_trialTimer !== null) {
    clearTimeout(_trialTimer);
    _trialTimer = null;
  }
  if (_feedbackTimer !== null) {
    clearTimeout(_feedbackTimer);
    _feedbackTimer = null;
  }
  if (_isiTimer !== null) {
    clearTimeout(_isiTimer);
    _isiTimer = null;
  }
}

// ── Keyboard handler ──────────────────────────────────────────────────────────

/**
 * Handle a keydown event. Only Space is relevant during an active trial.
 * @param {KeyboardEvent} event
 */
export function handleKeyDown(event) {
  if (event.code !== 'Space') return;
  if (!game.isRunning()) return;
  if (_currentImageKey === null) return;

  // Prevent page scroll.
  event.preventDefault();

  _spacePressedThisTrial = true;

  // Respond immediately: clear the trial timer and process the trial end.
  if (_trialTimer !== null) {
    clearTimeout(_trialTimer);
    _trialTimer = null;
  }
  endTrial();
}

/**
 * Handle a click on the stimulus area. Equivalent to pressing Space.
 * Allows mouse/touch users to respond to go images without using the keyboard.
 */
export function handleClick() {
  if (!game.isRunning()) return;
  if (_currentImageKey === null) return;

  _spacePressedThisTrial = true;

  // Respond immediately: clear the trial timer and process the trial end.
  if (_trialTimer !== null) {
    clearTimeout(_trialTimer);
    _trialTimer = null;
  }
  endTrial();
}

// ── Plugin lifecycle ──────────────────────────────────────────────────────────

/**
 * Initialise the plugin after interface.html has been injected.
 * Queries all required DOM elements and attaches event listeners.
 * Does NOT start the game loop.
 *
 * @param {HTMLElement} container - The element into which the HTML fragment was injected.
 */
function init(container) {
  if (!container) return;

  _instructionsEl = container.querySelector('#os-instructions');
  _gameAreaEl = container.querySelector('#os-game-area');
  _stimulusEl = container.querySelector('#os-stimulus');
  _stimulusImg = container.querySelector('#os-stimulus-img');
  _feedbackEl = container.querySelector('#os-feedback');
  _feedbackImg = container.querySelector('#os-feedback-img');
  _feedbackText = container.querySelector('#os-feedback-text');
  _endPanelEl = container.querySelector('#os-end-panel');
  _startBtn = container.querySelector('#os-start-btn');
  _stopBtn = container.querySelector('#os-stop-btn');
  _playAgainBtn = container.querySelector('#os-play-again-btn');
  _returnBtn = container.querySelector('#os-return-btn');
  _levelEl = container.querySelector('#os-level');
  _scoreEl = container.querySelector('#os-score');
  _nogoHitsEl = container.querySelector('#os-nogo-hits');
  _intervalEl = container.querySelector('#os-interval');
  _finalScoreEl = container.querySelector('#os-final-score');
  _finalBestEl = container.querySelector('#os-final-best');
  _finalNogoEl = container.querySelector('#os-final-nogo');
  _finalMissesEl = container.querySelector('#os-final-misses');
  _finalTrialsEl = container.querySelector('#os-final-trials');

  game.initGame();

  if (_startBtn) {
    _startBtn.addEventListener('click', () => {
      start();
    });
  }

  if (_stopBtn) {
    _stopBtn.addEventListener('click', () => {
      stop();
    });
  }

  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      start();
    });
  }

  if (_returnBtn) {
    _returnBtn.addEventListener('click', () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('game:return-to-menu'));
      }
    });
  }

  document.addEventListener('keydown', handleKeyDown);
  if (_stimulusEl) {
    _stimulusEl.addEventListener('click', handleClick);
  }
}

/**
 * Start the game. Shows the game area and begins the trial loop.
 */
function start() {
  game.initGame();
  game.startGame();

  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_gameAreaEl) _gameAreaEl.hidden = false;

  hideFeedback();
  updateStats();
  scheduleNextTrial();
}

/**
 * Stop the game, show the end panel, and persist progress via IPC.
 * @returns {{ score: number, noGoHits: number, misses: number,
 *             trialsCompleted: number, duration: number, bestScore: number }}
 */
function stop() {
  clearAllTimers();
  hideImage();
  hideFeedback();

  const result = game.stopGame();

  if (_gameAreaEl) _gameAreaEl.hidden = true;
  showEndPanel(result);

  if (typeof window !== 'undefined' && window.api) {
    window.api.invoke('progress:save', {
      playerId: 'default',
      gameId: 'otter-stop',
      score: result.score,
    }).catch(() => {});
  }

  return result;
}

/**
 * Reset the game to its initial state without reloading interface.html.
 * Returns to the instructions screen.
 */
function reset() {
  clearAllTimers();
  hideImage();
  hideFeedback();
  game.initGame();

  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_instructionsEl) _instructionsEl.hidden = false;

  updateStats();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
