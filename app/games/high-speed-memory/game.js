/**
 * game.js — Pure game logic for High Speed Memory.
 *
 * Contains all state and logic for the High Speed Memory game, with no DOM access.
 * All functions are easily unit-testable.
 *
 * @file High Speed Memory game logic module.
 */

/**
 * Filename of the target card that the player must find.
 * Appears exactly PRIMARY_COUNT times in every grid.
 */
export const PRIMARY_IMAGE = 'Primary.jpg';

/**
 * Filenames of distractor card images.
 * These fill all grid cells that are not the Primary card.
 */
export const DISTRACTOR_IMAGES = [
  'Distractor1.jpg',
  'Distractor2.jpg',
  'Distractor3.jpg',
];

/**
 * Number of Primary card copies placed in each round's grid.
 * The player wins the round by finding all of them.
 */
export const PRIMARY_COUNT = 3;

/**
 * Number of consecutive correct rounds (no wrong guesses) required to advance one level.
 * A wrong guess in any round resets this streak back to zero.
 */
export const ROUNDS_TO_LEVEL_UP = 3;

/** Initial card-reveal display duration in milliseconds (level 0). */
export const BASE_DISPLAY_MS = 1500;

/** Amount to reduce display duration per level (ms). */
export const DISPLAY_DECREMENT_MS = 25;

/** Minimum display duration regardless of level (ms). */
export const MIN_DISPLAY_MS = 20;

/** @type {number} */
let score = 0;

/** @type {number} */
let level = 0;

/** @type {number} */
let roundsCompleted = 0;

/**
 * Number of consecutive correct rounds completed without a wrong guess.
 * Resets to 0 after a wrong guess or after reaching ROUNDS_TO_LEVEL_UP.
 * @type {number}
 */
let consecutiveCorrectRounds = 0;

/** @type {boolean} */
let running = false;

/** @type {number|null} */
let startTime = null;

/**
 * Initialize (or reset) all game state.
 */
export function initGame() {
  score = 0;
  level = 0;
  roundsCompleted = 0;
  consecutiveCorrectRounds = 0;
  running = false;
  startTime = null;
}

/**
 * Start the game timer.
 * @throws {Error} If the game is already running.
 */
export function startGame() {
  if (running) {
    throw new Error('Game is already running.');
  }
  running = true;
  startTime = Date.now();
}

/**
 * Stop the game and return final results.
 * @returns {{ score: number, level: number, roundsCompleted: number, duration: number }}
 * @throws {Error} If the game is not running.
 */
export function stopGame() {
  if (!running) {
    throw new Error('Game is not running.');
  }
  running = false;
  const duration = startTime !== null ? Date.now() - startTime : 0;
  return {
    score,
    level,
    roundsCompleted,
    duration,
  };
}

/**
 * Get the square grid dimensions for a given level.
 * Grids start at 3×3 and grow by 1 each level with no upper bound.
 *
 * @param {number} lvl - The game level (0-based).
 * @returns {{ rows: number, cols: number }}
 */
export function getGridSize(lvl) {
  const n = lvl + 3;
  return { rows: n, cols: n };
}

/**
 * Get the card-reveal display duration in milliseconds for a given level.
 * Ranges from BASE_DISPLAY_MS down to MIN_DISPLAY_MS.
 *
 * @param {number} lvl - The game level (0-based).
 * @returns {number} Display duration in milliseconds.
 */
export function getDisplayDurationMs(lvl) {
  return Math.max(BASE_DISPLAY_MS - lvl * DISPLAY_DECREMENT_MS, MIN_DISPLAY_MS);
}

/**
 * Generate a shuffled array of card objects for a given level.
 * Each card has { id, image, matched }.
 * Exactly PRIMARY_COUNT cards show PRIMARY_IMAGE; the rest are random DISTRACTOR_IMAGES.
 * The grid is fully filled (rows × cols cards, no empty cells).
 *
 * @param {number} lvl - The game level (0-based).
 * @returns {Array<{ id: number, image: string, matched: boolean }>}
 */
export function generateGrid(lvl) {
  const { rows, cols } = getGridSize(lvl);
  const totalCards = rows * cols;

  // Build the array: PRIMARY_COUNT copies of the primary image, rest are random distractors
  const cardImages = [];
  for (let i = 0; i < PRIMARY_COUNT; i += 1) {
    cardImages.push(PRIMARY_IMAGE);
  }
  for (let i = PRIMARY_COUNT; i < totalCards; i += 1) {
    const idx = Math.floor(Math.random() * DISTRACTOR_IMAGES.length);
    cardImages.push(DISTRACTOR_IMAGES[idx]);
  }

  // Fisher-Yates shuffle
  for (let i = cardImages.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cardImages[i], cardImages[j]] = [cardImages[j], cardImages[i]];
  }

  // Assign sequential ids matching array position
  return cardImages.map((image, i) => ({ id: i, image, matched: false }));
}

/**
 * Check whether a card image is the Primary target image.
 *
 * @param {string} image - The image filename to check.
 * @returns {boolean} True if the image is the Primary target.
 */
export function isPrimary(image) {
  return image === PRIMARY_IMAGE;
}

/**
 * Record a correctly found Primary card and increment the score.
 */
export function addCorrectGroup() {
  score += 1;
}

/**
 * Mark the current round as complete.
 * Increments the consecutive-correct-rounds streak.
 * The level only advances when ROUNDS_TO_LEVEL_UP consecutive correct rounds are reached,
 * at which point the streak resets to zero.
 */
export function completeRound() {
  roundsCompleted += 1;
  consecutiveCorrectRounds += 1;
  if (consecutiveCorrectRounds >= ROUNDS_TO_LEVEL_UP) {
    level += 1;
    consecutiveCorrectRounds = 0;
  }
}

/**
 * Reset the consecutive-correct-rounds streak to zero and step difficulty down.
 * Implements the adaptive staircase: a wrong guess decreases the level by one
 * (minimum 0), making the next round easier.
 * Called when the player clicks a Distractor card (wrong guess).
 */
export function resetConsecutiveRounds() {
  consecutiveCorrectRounds = 0;
  if (level > 0) {
    level -= 1;
  }
}

/**
 * Get the current score.
 * @returns {number}
 */
export function getScore() {
  return score;
}

/**
 * Get the current level (0-based).
 * @returns {number}
 */
export function getLevel() {
  return level;
}

/**
 * Get the number of rounds completed.
 * @returns {number}
 */
export function getRoundsCompleted() {
  return roundsCompleted;
}

/**
 * Get the current consecutive-correct-rounds streak.
 * @returns {number}
 */
export function getConsecutiveCorrectRounds() {
  return consecutiveCorrectRounds;
}

/**
 * Check whether the game is currently running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}
