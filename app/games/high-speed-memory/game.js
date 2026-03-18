/**
 * game.js — Pure game logic for High Speed Memory.
 *
 * Contains all state and logic for the High Speed Memory game, with no DOM access.
 * All functions are easily unit-testable.
 *
 * @file High Speed Memory game logic module.
 */

/**
 * Placeholder card-face image filenames.
 * Replace these files with real artwork when assets are available.
 * Enough entries to support up to level 9 (12×12 grid = 48 groups).
 */
export const CARD_IMAGES = [
  'card-01.svg', 'card-02.svg', 'card-03.svg', 'card-04.svg',
  'card-05.svg', 'card-06.svg', 'card-07.svg', 'card-08.svg',
  'card-09.svg', 'card-10.svg', 'card-11.svg', 'card-12.svg',
  'card-13.svg', 'card-14.svg', 'card-15.svg', 'card-16.svg',
  'card-17.svg', 'card-18.svg', 'card-19.svg', 'card-20.svg',
  'card-21.svg', 'card-22.svg', 'card-23.svg', 'card-24.svg',
  'card-25.svg', 'card-26.svg', 'card-27.svg', 'card-28.svg',
  'card-29.svg', 'card-30.svg', 'card-31.svg', 'card-32.svg',
  'card-33.svg', 'card-34.svg', 'card-35.svg', 'card-36.svg',
  'card-37.svg', 'card-38.svg', 'card-39.svg', 'card-40.svg',
  'card-41.svg', 'card-42.svg', 'card-43.svg', 'card-44.svg',
  'card-45.svg', 'card-46.svg', 'card-47.svg', 'card-48.svg',
];

/** Number of cards in each matching group. */
export const MATCH_SIZE = 3;

/** Initial card-reveal display duration in milliseconds (level 0). */
export const BASE_DISPLAY_MS = 500;

/** Amount to reduce display duration per level (ms). */
export const DISPLAY_DECREMENT_MS = 24;

/** Minimum display duration regardless of level (ms). */
export const MIN_DISPLAY_MS = 20;

/** @type {number} */
let score = 0;

/** @type {number} */
let level = 0;

/** @type {number} */
let roundsCompleted = 0;

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
 * Get the number of active cards for a given level.
 * This is the largest multiple of MATCH_SIZE that fits inside the n×n grid.
 *
 * @param {number} lvl - The game level (0-based).
 * @returns {number} Total active card count.
 */
export function getActiveCardCount(lvl) {
  const { rows, cols } = getGridSize(lvl);
  return Math.floor((rows * cols) / MATCH_SIZE) * MATCH_SIZE;
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
 * Every image appears exactly MATCH_SIZE times.
 * Returns getActiveCardCount(lvl) cards; any remaining grid cells are rendered empty.
 *
 * @param {number} lvl - The game level (0-based).
 * @returns {Array<{ id: number, image: string, matched: boolean }>}
 */
export function generateGrid(lvl) {
  const activeCount = getActiveCardCount(lvl);
  const groupCount = activeCount / MATCH_SIZE;

  const selectedImages = CARD_IMAGES.slice(0, groupCount);

  // Create MATCH_SIZE copies of each image filename
  const cardImages = [];
  selectedImages.forEach((img) => {
    for (let k = 0; k < MATCH_SIZE; k += 1) {
      cardImages.push(img);
    }
  });

  // Fisher-Yates shuffle
  for (let i = cardImages.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cardImages[i], cardImages[j]] = [cardImages[j], cardImages[i]];
  }

  // Assign sequential ids matching array position
  return cardImages.map((image, i) => ({ id: i, image, matched: false }));
}

/**
 * Check whether a set of MATCH_SIZE card images all match.
 *
 * @param {...string} images - Image filenames to compare; must have MATCH_SIZE arguments.
 * @returns {boolean} True if all images are identical.
 */
export function checkMatch(...images) {
  return images.length === MATCH_SIZE && images.every((img) => img === images[0]);
}

/**
 * Record a correct group match and increment the score.
 */
export function addCorrectGroup() {
  score += 1;
}

/**
 * Mark the current round as complete and advance to the next level.
 */
export function completeRound() {
  roundsCompleted += 1;
  level += 1;
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
 * Check whether the game is currently running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}
