
/**
 * index.js — Template game plugin entry point for BrainSpeedExercises.
 *
 * Example implementation of the plugin contract for new games.
 * Handles DOM and plugin lifecycle for a minimal game.
 *
 * @file Template game plugin (UI/controller layer).
 */

import { initGame, startGame, stopGame, getScore } from './game.js';

/** Human-readable name returned as part of the plugin contract. */
const name = 'Template Game';

/** @type {HTMLElement|null} */
let container = null;

/**
 * Initialise the plugin.
 * Called once after the HTML fragment has been injected into the game container.
 * Sets up internal state but does not start timers.
 *
 * @param {HTMLElement} gameContainer
 */
function init(gameContainer) {
  container = gameContainer;
  initGame();
}

/**
 * Start the game loop / timers.
 */
function start() {
  startGame();
  if (container) {
    const status = container.querySelector('.game-template__status');
    if (status) {
      status.textContent = 'Playing\u2026';
    }
  }
}

/**
 * Pause or end the game.
 * @returns {{ score: number, duration: number }}
 */
function stop() {
  const result = stopGame();
  if (container) {
    const status = container.querySelector('.game-template__status');
    if (status) {
      status.textContent = `Game over \u2014 score: ${getScore()}`;
    }
  }
  return result;
}

/**
 * Return the game to its initial state without reloading the HTML fragment.
 */
function reset() {
  initGame();
  if (container) {
    const status = container.querySelector('.game-template__status');
    if (status) {
      status.textContent = 'Press Start to play.';
    }
  }
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
