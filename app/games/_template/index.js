
/**
 * index.js — Template game plugin entry point for BrainSpeedExercises.
 *
 * Example implementation of the plugin contract for new games.
 * Handles DOM and plugin lifecycle for a minimal game.
 *
 * @file Template game plugin (UI/controller layer).
 */

import { initGame, startGame, stopGame, getScore } from './game.js';
import { saveScore } from '../../components/scoreService.js';

/** Human-readable name returned as part of the plugin contract. */
const name = 'Template Game';

/** @type {HTMLElement|null} */
let _container = null;

/** @type {HTMLElement|null} */
let _instructionsEl = null;

/** @type {HTMLElement|null} */
let _playAreaEl = null;

/** @type {HTMLElement|null} */
let _endPanelEl = null;

/** @type {HTMLElement|null} */
let _finalScoreEl = null;

/** @type {HTMLButtonElement|null} */
let _startBtn = null;

/** @type {HTMLButtonElement|null} */
let _stopBtn = null;

/** @type {HTMLButtonElement|null} */
let _playAgainBtn = null;

/** @type {HTMLButtonElement|null} */
let _returnBtn = null;

/**
 * Show the end-game panel and populate it with the final score.
 *
 * @param {number} score - The final score to display.
 */
function _showEndPanel(score) {
  if (_playAreaEl) _playAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;
  if (_finalScoreEl) _finalScoreEl.textContent = String(score);
}

/**
 * Return to the main menu by dispatching a custom event.
 */
function _returnToMainMenu() {
  const event = new CustomEvent('game:return', { bubbles: true });
  if (_container) _container.dispatchEvent(event);
}

/**
 * Initialise the plugin.
 * Called once after the HTML fragment has been injected into the game container.
 * Sets up internal state and event listeners but does not start timers.
 *
 * @param {HTMLElement} gameContainer
 */
function init(gameContainer) {
  _container = gameContainer;

  const q = (id) => (gameContainer ? gameContainer.querySelector(id) : null);
  _instructionsEl = q('#game-template-instructions');
  _playAreaEl = q('#game-template-play-area');
  _endPanelEl = q('#game-template-end-panel');
  _finalScoreEl = q('#game-template-final-score');
  _startBtn = q('#game-template-start');
  _stopBtn = q('#game-template-stop');
  _playAgainBtn = q('#game-template-play-again');
  _returnBtn = q('#game-template-return');

  if (_startBtn) _startBtn.addEventListener('click', () => start());
  if (_stopBtn) _stopBtn.addEventListener('click', () => stop());
  if (_playAgainBtn) _playAgainBtn.addEventListener('click', () => { reset(); start(); });
  if (_returnBtn) _returnBtn.addEventListener('click', () => _returnToMainMenu());

  initGame();
}

/**
 * Start the game loop / timers.
 * Hides the instructions panel and shows the active game area.
 */
function start() {
  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_playAreaEl) _playAreaEl.hidden = false;
  if (_endPanelEl) _endPanelEl.hidden = true;
  startGame();
}

/**
 * Stop the game, persist progress, and show the end panel.
 *
 * @returns {Promise<object>} Game result
 */
async function stop() {
  const result = stopGame();

  // Save the score via the centralized score service.
  // Replace 'game-template' with your actual game ID (matching manifest.json).
  await saveScore('game-template', {
    score: result.score,
  });

  _showEndPanel(getScore());
  return result;
}

/**
 * Return the game to its initial state without reloading the HTML fragment.
 * Shows the instructions panel and hides the game area and end panel.
 */
function reset() {
  initGame();
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_playAreaEl) _playAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
