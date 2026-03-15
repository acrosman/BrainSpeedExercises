/**
 * Pure game-logic module for the template game.
 * No DOM access — every function is easily unit-tested.
 */

/** @type {number} */
let score = 0;

/** @type {boolean} */
let running = false;

/**
 * Initialise (or reset) all game state.
 */
export function initGame() {
  score = 0;
  running = false;
}

/**
 * Start the game.
 */
export function startGame() {
  running = true;
}

/**
 * Stop the game and return the final results.
 * @returns {{ score: number, duration: number }}
 */
export function stopGame() {
  running = false;
  return { score, duration: 0 };
}

/**
 * Add points to the player's score.
 * @param {number} points
 */
export function addScore(points) {
  score += points;
}

/**
 * Return the current score.
 * @returns {number}
 */
export function getScore() {
  return score;
}

/**
 * Return whether the game is currently running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}
