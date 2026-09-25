/**
 * index.js — Template game plugin entry point for BrainSpeedExercises.
 *
 * Example implementation of the plugin contract for new games. Handles DOM
 * wiring, feedback, session timing, and the plugin lifecycle. Game rules live
 * in game.js.
 *
 * @file Template game plugin (UI/controller layer).
 */

import * as game from './game.js';
import { playFeedbackSound } from '../../components/audioService.js';
import { saveScore } from '../../components/scoreService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import * as timerService from '../../components/timerService.js';
import { renderTrendChart } from '../../components/trendChartService.js';

/** Game identifier used for progress persistence (must match manifest.json id). */
const GAME_ID = 'game-id-slug';

/** Human-readable name returned as part of the plugin contract. */
const name = 'Template Game';

// ── DOM element references (populated by init) ────────────────────────────────

/** @type {HTMLElement|null} */
let _instructionsEl = null;
/** @type {HTMLElement|null} */
let _playAreaEl = null;
/** @type {HTMLElement|null} */
let _endPanelEl = null;
/** @type {HTMLElement|null} */
let _feedbackEl = null;
/** @type {HTMLElement|null} */
let _scoreEl = null;
/** @type {HTMLElement|null} */
let _levelEl = null;
/** @type {HTMLElement|null} */
let _sessionTimerEl = null;
/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;
/** @type {HTMLElement|null} */
let _trendEmptyEl = null;
/** @type {HTMLElement|null} */
let _trendLatestEl = null;
/** @type {HTMLElement|null} */
let _finalScoreEl = null;
/** @type {HTMLElement|null} */
let _finalLevelEl = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Write a message to the polite live region for screen readers.
 *
 * @param {string} message
 */
export function announce(message) {
  if (_feedbackEl) _feedbackEl.textContent = message;
}

/**
 * Refresh the stats bar with current game state values.
 */
export function updateStats() {
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_levelEl) _levelEl.textContent = String(game.getCurrentLevel() + 1);
}

/**
 * Render the trend chart with the latest speed history.
 */
export function updateTrendChart() {
  renderTrendChart(
    { lineEl: _trendLineEl, emptyEl: _trendEmptyEl, latestEl: _trendLatestEl },
    game.getSpeedHistory(),
    game.getCurrentLevelConfig().displayTimeMs,
  );
}

/**
 * Handle the player's response to one trial. Call this from your game's
 * input handlers once you know whether the response was correct.
 *
 * @param {boolean} success - Whether the response was correct.
 */
export function handleResponse(success) {
  if (!game.isRunning()) return;

  game.recordTrial({ success });
  updateStats();
  updateTrendChart();
  playFeedbackSound(success);
  announce(success ? 'Correct!' : 'Incorrect.');
}

// ── Plugin contract ───────────────────────────────────────────────────────────

/**
 * Initialize the plugin.
 * Called once after the HTML fragment has been injected into the game container.
 * Sets up internal state and event listeners but does not start timers.
 *
 * @param {HTMLElement|null} gameContainer
 */
function init(gameContainer) {
  game.initGame();

  const q = (id) => (gameContainer ? gameContainer.querySelector(id) : null);
  _instructionsEl = q('#game-template-instructions');
  _playAreaEl = q('#game-template-play-area');
  _endPanelEl = q('#game-template-end-panel');
  _feedbackEl = q('#game-template-feedback');
  _scoreEl = q('#game-template-score');
  _levelEl = q('#game-template-level');
  _sessionTimerEl = q('#game-template-timer');
  _trendLineEl = q('#game-template-trend-line');
  _trendEmptyEl = q('#game-template-trend-empty');
  _trendLatestEl = q('#game-template-trend-latest');
  _finalScoreEl = q('#game-template-final-score');
  _finalLevelEl = q('#game-template-final-level');

  const startBtn = q('#game-template-start');
  const stopBtn = q('#game-template-stop');
  const playAgainBtn = q('#game-template-play-again');
  const returnBtn = q('#game-template-return');

  if (startBtn) startBtn.addEventListener('click', () => start());
  if (stopBtn) stopBtn.addEventListener('click', () => stop());
  if (playAgainBtn) playAgainBtn.addEventListener('click', () => { reset(); start(); });
  if (returnBtn) returnBtn.addEventListener('click', () => returnToMainMenu());

  updateStats();
}

/**
 * Start a session.
 * Hides the instructions panel, shows the play area, and starts the session timer.
 */
function start() {
  game.startGame();

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
  });

  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_playAreaEl) _playAreaEl.hidden = false;
  if (_endPanelEl) _endPanelEl.hidden = true;
  announce('');
  updateStats();
  updateTrendChart();
}

/**
 * Stop the session, save progress, and show the end panel.
 *
 * The shell also calls this when the app quits, so it must work when no
 * session is running. Empty sessions are not saved.
 *
 * @returns {{ score: number, level: number, trialsCompleted: number, duration: number }}
 */
function stop() {
  const result = game.isRunning() ? game.stopGame() : {
    score: game.getScore(),
    level: game.getCurrentLevel(),
    trialsCompleted: game.getTrialsCompleted(),
    duration: 0,
  };
  const sessionDurationMs = timerService.stopTimer();

  if (_playAreaEl) _playAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;
  if (_finalScoreEl) _finalScoreEl.textContent = String(result.score);
  if (_finalLevelEl) _finalLevelEl.textContent = String(result.level + 1);

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
 * Return the game to its initial state without reloading the HTML fragment.
 * Shows the instructions panel and hides the game area and end panel.
 */
function reset() {
  game.initGame();
  timerService.resetTimer();

  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_playAreaEl) _playAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  announce('');
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
