/**
 * index.js — Object Track game plugin entry point.
 *
 * Handles DOM wiring, animation loop, phase transitions, and plugin lifecycle.
 * Pure game logic lives in game.js.
 *
 * @file Object Track plugin (UI/controller layer).
 */

import * as game from './game.js';
import { saveScore } from '../../components/scoreService.js';
import * as timerService from '../../components/timerService.js';
import { playSuccessSound, playFailureSound } from '../../components/audioService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import { renderTrendChart } from '../../components/trendChartService.js';

// ── Exported constants ────────────────────────────────────────────────────────

/** Duration (ms) targets are highlighted before tracking begins. */
export const MARKING_DURATION_MS = 2000;

/** Duration (ms) feedback is shown before the next round begins. */
export const FEEDBACK_DURATION_MS = 1500;

/**
 * Background image filenames for the arena (populated at runtime by
 * loadBackgroundImages via the games:listImages IPC channel).
 * Starts empty; the arena falls back to its CSS background-color.
 *
 * @type {string[]}
 */
export const ARENA_BACKGROUNDS = [];

/** Color palettes for the circles (hi/mid/lo gradient stops). */
export const CIRCLE_PALETTES = [
  { hi: '#7ec8f7', mid: '#1a73c8', lo: '#0a3a6e' },
  { hi: '#7de88b', mid: '#24943a', lo: '#0a4d1a' },
  { hi: '#c89af5', mid: '#8b3fd4', lo: '#4a1470' },
  { hi: '#f78080', mid: '#d42020', lo: '#701010' },
  { hi: '#ffd975', mid: '#e0a000', lo: '#7a5600' },
  { hi: '#5de8e8', mid: '#15adad', lo: '#075757' },
];

// ── Private constants ─────────────────────────────────────────────────────────

/** Base URL path for game assets (used when setting background images). */
const GAME_ASSET_BASE = './games/object-track/images/bg/';

// ── Private DOM references ────────────────────────────────────────────────────

/** @type {HTMLElement|null} */
let _container = null;
/** @type {HTMLElement|null} */
let _instructionsEl = null;
/** @type {HTMLElement|null} */
let _playAreaEl = null;
/** @type {HTMLElement|null} */
let _endPanelEl = null;
/** @type {HTMLElement|null} */
let _arenaEl = null;
/** @type {HTMLElement|null} */
let _scoreEl = null;
/** @type {HTMLElement|null} */
let _levelEl = null;
/** @type {HTMLElement|null} */
let _roundEl = null;
/** @type {HTMLElement|null} */
let _phaseLabel = null;
/** @type {HTMLElement|null} */
let _feedbackEl = null;
/** @type {HTMLButtonElement|null} */
let _stopBtn = null;
/** @type {HTMLButtonElement|null} */
let _startBtn = null;
/** @type {HTMLButtonElement|null} */
let _playAgainBtn = null;
/** @type {HTMLButtonElement|null} */
let _returnBtn = null;
/** @type {HTMLElement|null} */
let _finalScoreEl = null;
/** @type {HTMLElement|null} */
let _finalLevelEl = null;
/** @type {HTMLElement|null} */
let _finalRoundsEl = null;
/** @type {HTMLElement|null} */
let _sessionTimerEl = null;
/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;
/** @type {HTMLElement|null} */
let _trendEmptyEl = null;
/** @type {HTMLElement|null} */
let _trendLatestEl = null;

// ── Private state ─────────────────────────────────────────────────────────────

/** @type {Set<number>} Circle IDs selected by the player during response phase. */
let _selectedIds = new Set();

/** @type {number|null} requestAnimationFrame handle. */
let _rafHandle = null;

/** @type {ReturnType<typeof setInterval>|null} Blink interval handle. */
let _blinkInterval = null;

/** @type {ReturnType<typeof setTimeout>|null} Feedback phase timer handle. */
let _feedbackTimer = null;

/** @type {ReturnType<typeof setTimeout>|null} Tracking phase timer handle. */
let _trackingTimer = null;

/** @type {ReturnType<typeof setTimeout>|null} Marking phase timer handle. */
let _markingTimer = null;

/** @type {number|null} Timestamp of the previous animation frame. */
let _lastFrameMs = null;

/** @type {{ hi: string, mid: string, lo: string }} Current circle color palette. */
let _currentPalette = CIRCLE_PALETTES[0];

/** @type {number} Number of targets for the current round (cached at response phase entry). */
let _numTargets = 0;

// ── Timer management ──────────────────────────────────────────────────────────

/**
 * Cancel all active timers and animation frames.
 *
 * @returns {void}
 */
export function clearAllTimers() {
  if (_markingTimer !== null) { clearTimeout(_markingTimer); _markingTimer = null; }
  if (_trackingTimer !== null) { clearTimeout(_trackingTimer); _trackingTimer = null; }
  if (_feedbackTimer !== null) { clearTimeout(_feedbackTimer); _feedbackTimer = null; }
  if (_blinkInterval !== null) { clearInterval(_blinkInterval); _blinkInterval = null; }
  if (_rafHandle !== null) { cancelAnimationFrame(_rafHandle); _rafHandle = null; }
}

// ── Accessibility helpers ─────────────────────────────────────────────────────

/**
 * Post a message to the ARIA live region for screen readers.
 *
 * @param {string} message - Text to announce.
 * @returns {void}
 */
export function announce(message) {
  if (_feedbackEl) _feedbackEl.textContent = message;
}

// ── Stats display ─────────────────────────────────────────────────────────────

/**
 * Refresh the score, level, and round counter elements from game state.
 *
 * @returns {void}
 */
export function updateStats() {
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_levelEl) _levelEl.textContent = String(game.getLevel() + 1);
  if (_roundEl) _roundEl.textContent = String(game.getRoundsPlayed() + 1);
}

/**
 * Render the speed trend chart with the latest speed history.
 *
 * @returns {void}
 */
export function updateTrendChart() {
  renderTrendChart(
    { lineEl: _trendLineEl, emptyEl: _trendEmptyEl, latestEl: _trendLatestEl },
    game.getSpeedHistory(),
    game.getLevelConfig(game.getLevel()).speedPxPerSec,
  );
}

// ── Arena background ──────────────────────────────────────────────────────────

/**
 * Scan the game's `images/bg/` directory via IPC and populate ARENA_BACKGROUNDS
 * with the discovered PNG filenames.
 *
 * Falls back silently when `window.api` is unavailable (e.g. in tests) or the
 * IPC call rejects.
 *
 * @returns {Promise<void>}
 */
export async function loadBackgroundImages() {
  if (typeof window === 'undefined' || !window.api) return;
  try {
    const files = await window.api.invoke('games:listImages', {
      gameId: 'object-track',
      subfolder: 'bg',
    });
    if (files && files.length > 0) {
      ARENA_BACKGROUNDS.length = 0;
      files.forEach((f) => ARENA_BACKGROUNDS.push(f));
    }
  } catch {
    // Silently fall back — arena will use its CSS background-color.
  }
}

/**
 * Apply a random background image to the arena element.
 * No-op when no backgrounds have been loaded.
 *
 * @param {HTMLElement|null} arenaEl - The arena container element.
 * @returns {void}
 */
export function setRandomBackground(arenaEl) {
  if (!arenaEl || ARENA_BACKGROUNDS.length === 0) return;
  const bg = ARENA_BACKGROUNDS[Math.floor(Math.random() * ARENA_BACKGROUNDS.length)];
  arenaEl.style.backgroundImage = `url('${GAME_ASSET_BASE}${bg}')`;
}

// ── Circle rendering ──────────────────────────────────────────────────────────

/**
 * Render circle DOM elements into the arena, replacing any existing content.
 *
 * @param {Array<object>} roundCircles - Circle state array.
 * @returns {void}
 */
export function renderCircles(roundCircles) {
  if (!_arenaEl) return;
  _arenaEl.innerHTML = '';
  roundCircles.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'mot-circle';
    el.id = `mot-circle-${c.id}`;
    el.dataset.circleId = String(c.id);
    el.style.width = `${c.radius * 2}px`;
    el.style.height = `${c.radius * 2}px`;
    el.style.left = `${c.x - c.radius}px`;
    el.style.top = `${c.y - c.radius}px`;
    el.style.setProperty('--mot-c-hi', _currentPalette.hi);
    el.style.setProperty('--mot-c-mid', _currentPalette.mid);
    el.style.setProperty('--mot-c-lo', _currentPalette.lo);
    el.setAttribute('aria-label', `Circle ${c.id + 1}`);
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    _arenaEl.appendChild(el);
  });
}

/**
 * Move existing circle elements to their updated positions.
 *
 * @param {Array<object>} roundCircles - Circle state array with updated coordinates.
 * @returns {void}
 */
export function repositionCircleElements(roundCircles) {
  if (!_arenaEl) return;
  roundCircles.forEach((c) => {
    const el = _arenaEl.querySelector(`#mot-circle-${c.id}`);
    if (!el) return;
    el.style.left = `${c.x - c.radius}px`;
    el.style.top = `${c.y - c.radius}px`;
  });
}

// ── Target highlighting ───────────────────────────────────────────────────────

/**
 * Add the target-reveal CSS class to all target circles.
 *
 * @returns {void}
 */
export function highlightTargets() {
  if (!_arenaEl) return;
  game.getCurrentCircles().forEach((c) => {
    if (!c.isTarget) return;
    const el = _arenaEl.querySelector(`#mot-circle-${c.id}`);
    if (el) el.classList.add('mot-circle--target-reveal');
  });
}

/**
 * Remove the target-reveal CSS class from all circles.
 *
 * @returns {void}
 */
export function unhighlightTargets() {
  if (!_arenaEl) return;
  _arenaEl.querySelectorAll('.mot-circle--target-reveal').forEach((el) => {
    el.classList.remove('mot-circle--target-reveal');
  });
}

// ── Tracking animation ────────────────────────────────────────────────────────

/**
 * Start the rAF-driven animation loop and schedule the end of the tracking phase.
 *
 * @param {number} durationMs - How long (ms) the tracking phase should last.
 * @returns {void}
 */
export function startTrackingAnimation(durationMs) {
  _lastFrameMs = null;
  const bounds = {
    width: (_arenaEl && _arenaEl.offsetWidth) || 600,
    height: (_arenaEl && _arenaEl.offsetHeight) || 400,
  };

  /** @param {number} timestamp - DOMHighResTimeStamp from rAF. */
  const tick = (timestamp) => {
    if (!game.isRunning()) return;
    const delta = _lastFrameMs === null ? 0 : timestamp - _lastFrameMs;
    _lastFrameMs = timestamp;
    const updated = game.tickPhysics(delta, bounds);
    repositionCircleElements(updated);
    _rafHandle = requestAnimationFrame(tick);
  };

  _rafHandle = requestAnimationFrame(tick);
  _trackingTimer = setTimeout(() => {
    stopTrackingAnimation();
    enterResponsePhase();
  }, durationMs);
}

/**
 * Cancel the rAF animation loop and tracking timer.
 *
 * @returns {void}
 */
export function stopTrackingAnimation() {
  if (_rafHandle !== null) { cancelAnimationFrame(_rafHandle); _rafHandle = null; }
  if (_trackingTimer !== null) { clearTimeout(_trackingTimer); _trackingTimer = null; }
}

// ── Response phase ────────────────────────────────────────────────────────────

/**
 * Transition into the response phase where the player selects circles.
 *
 * @returns {void}
 */
export function enterResponsePhase() {
  _selectedIds = new Set();
  _numTargets = game.getCurrentCircles().filter((c) => c.isTarget).length;
  if (_arenaEl) {
    _arenaEl.classList.add('mot-arena--response');
    _arenaEl.addEventListener('click', handleCircleClick);
  }
  if (_phaseLabel) _phaseLabel.textContent = 'Click the targets you tracked!';
  announce('Circles stopped. Click each target you tracked.');
}

/**
 * Handle a click on the arena during the response phase.
 *
 * Toggles the selected state of the clicked circle element. When the
 * player has selected as many circles as there are targets the response
 * is submitted automatically.
 *
 * @param {MouseEvent} event - The click event from the arena.
 * @returns {void}
 */
export function handleCircleClick(event) {
  const el = event.target.closest('.mot-circle');
  if (!el) return;
  const id = Number(el.dataset.circleId);
  if (_selectedIds.has(id)) {
    _selectedIds.delete(id);
    el.classList.remove('mot-circle--selected');
    el.setAttribute('aria-pressed', 'false');
  } else {
    _selectedIds.add(id);
    el.classList.add('mot-circle--selected');
    el.setAttribute('aria-pressed', 'true');
  }
  // Auto-submit once the player has selected all required targets.
  if (_selectedIds.size >= _numTargets) {
    submitResponse();
  }
}

/**
 * Evaluate the player's current selection and transition to feedback.
 *
 * @returns {Promise<void>}
 */
export async function submitResponse() {
  if (_arenaEl) {
    _arenaEl.classList.remove('mot-arena--response');
    _arenaEl.removeEventListener('click', handleCircleClick);
  }
  const currentCircles = game.getCurrentCircles();
  const evalResult = game.evaluateResponse(currentCircles, _selectedIds);
  game.recordRoundResult(evalResult.correct);
  updateStats();
  updateTrendChart();

  currentCircles.forEach((c) => {
    if (!_arenaEl) return;
    const el = _arenaEl.querySelector(`#mot-circle-${c.id}`);
    if (!el || !c.isTarget) return;
    el.classList.add(_selectedIds.has(c.id) ? 'mot-circle--correct' : 'mot-circle--missed');
  });

  const msg = evalResult.correct
    ? `Perfect! All ${evalResult.totalTargets} targets found!`
    : `${evalResult.correctCount} of ${evalResult.totalTargets} targets found.`;
  announce(msg);
  if (_phaseLabel) {
    _phaseLabel.textContent = evalResult.correct ? 'Correct!' : 'Not quite...';
  }
  if (evalResult.correct) {
    playSuccessSound();
  } else {
    playFailureSound();
  }

  _feedbackTimer = setTimeout(() => {
    _feedbackTimer = null;
    beginRound();
  }, FEEDBACK_DURATION_MS);
}

// ── End panel ─────────────────────────────────────────────────────────────────

/**
 * Display the end panel with session results.
 *
 * @param {{ score: number, level: number, roundsPlayed: number }} result - Session summary.
 * @returns {void}
 */
export function showEndPanel(result) {
  if (_playAreaEl) _playAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;
  if (_finalScoreEl) _finalScoreEl.textContent = String(result.score);
  if (_finalLevelEl) _finalLevelEl.textContent = String(result.level + 1);
  if (_finalRoundsEl) _finalRoundsEl.textContent = String(result.roundsPlayed);
}

// ── Round lifecycle ───────────────────────────────────────────────────────────

/**
 * Start a new round: pick a palette, spawn circles, and enter the marking phase.
 *
 * @returns {void}
 */
export function beginRound() {
  _selectedIds = new Set();
  _currentPalette = CIRCLE_PALETTES[Math.floor(Math.random() * CIRCLE_PALETTES.length)];
  setRandomBackground(_arenaEl);
  const bounds = {
    width: (_arenaEl && _arenaEl.offsetWidth) || 600,
    height: (_arenaEl && _arenaEl.offsetHeight) || 400,
  };
  const roundCircles = game.initRound(bounds.width, bounds.height);
  unhighlightTargets();
  renderCircles(roundCircles);
  updateStats();
  if (_phaseLabel) _phaseLabel.textContent = 'Watch for targets!';
  highlightTargets();
  _markingTimer = setTimeout(() => endMarkingPhase(), MARKING_DURATION_MS);
}

/**
 * End the marking phase: remove highlights and begin the tracking animation.
 *
 * @returns {void}
 */
export function endMarkingPhase() {
  _markingTimer = null;
  unhighlightTargets();
  if (_phaseLabel) _phaseLabel.textContent = 'Track the targets...';
  const config = game.getLevelConfig(game.getLevel());
  startTrackingAnimation(config.trackingDurationMs);
}

// ── Plugin lifecycle ──────────────────────────────────────────────────────────

/**
 * Wire up DOM references and attach event listeners.
 *
 * @param {HTMLElement|null} gameContainer - The container element for this game.
 * @returns {void}
 */
function init(gameContainer) {
  _container = gameContainer;
  game.initGame();
  if (!_container) return;

  /** @param {string} id - Element ID to query. */
  const q = (id) => _container.querySelector(id);

  _instructionsEl = q('#mot-instructions');
  _playAreaEl = q('#mot-play-area');
  _endPanelEl = q('#mot-end-panel');
  _arenaEl = q('#mot-arena');
  _scoreEl = q('#mot-score');
  _levelEl = q('#mot-level');
  _roundEl = q('#mot-round');
  _phaseLabel = q('#mot-phase-label');
  _feedbackEl = q('#mot-feedback');
  _stopBtn = q('#mot-stop');
  _startBtn = q('#mot-start');
  _playAgainBtn = q('#mot-play-again');
  _returnBtn = q('#mot-return');
  _finalScoreEl = q('#mot-final-score');
  _finalLevelEl = q('#mot-final-level');
  _finalRoundsEl = q('#mot-final-rounds');
  _sessionTimerEl = q('#mot-session-timer');
  _trendLineEl = q('#mot-trend-line');
  _trendEmptyEl = q('#mot-trend-empty');
  _trendLatestEl = q('#mot-trend-latest');

  if (_startBtn) _startBtn.addEventListener('click', () => start());
  if (_stopBtn) _stopBtn.addEventListener('click', () => stop());
  if (_playAgainBtn) _playAgainBtn.addEventListener('click', () => { reset(); start(); });
  if (_returnBtn) _returnBtn.addEventListener('click', () => returnToMainMenu());

  // Load background images asynchronously; silently falls back if unavailable.
  loadBackgroundImages();
}

/**
 * Start a new game session.
 *
 * @returns {void}
 */
function start() {
  game.startGame();
  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });
  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_playAreaEl) _playAreaEl.hidden = false;
  if (_endPanelEl) _endPanelEl.hidden = true;
  beginRound();
}

/**
 * Stop the current session, persist results, and show the end panel.
 *
 * @returns {Promise<{ score: number, level: number, roundsPlayed: number,
 *   duration: number }>} Session summary object.
 */
async function stop() {
  clearAllTimers();
  const result = game.isRunning()
    ? game.stopGame()
    : {
        score: game.getScore(),
        level: game.getLevel(),
        roundsPlayed: game.getRoundsPlayed(),
        duration: 0,
      };
  const sessionDurationMs = timerService.stopTimer();
  if (_arenaEl) {
    _arenaEl.removeEventListener('click', handleCircleClick);
    _arenaEl.classList.remove('mot-arena--response');
  }
  await saveScore('object-track', {
    score: result.score,
    sessionDurationMs,
    level: result.level,
  });
  showEndPanel(result);
  return result;
}

/**
 * Reset the plugin to its initial pre-game state.
 *
 * @returns {void}
 */
function reset() {
  clearAllTimers();
  game.initGame();
  timerService.resetTimer();
  if (_arenaEl) {
    _arenaEl.innerHTML = '';
    _arenaEl.classList.remove('mot-arena--response');
    _arenaEl.removeEventListener('click', handleCircleClick);
  }
  _selectedIds = new Set();
  if (_phaseLabel) _phaseLabel.textContent = '';
  if (_feedbackEl) _feedbackEl.textContent = '';
  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_playAreaEl) _playAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  updateTrendChart();
}

export default {
  name: 'Object Track',
  init,
  start,
  stop,
  reset,
};
