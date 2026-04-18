
/**
 * game.js — Pure game logic for Fast Piggie.
 *
 * Contains all state and logic for the Fast Piggie game, with no DOM access.
 * All functions are pure and easily unit-testable.
 *
 * @file Fast Piggie game logic module.
 */

import { updateAdaptiveDifficultyState } from '../../components/adaptiveDifficultyService.js';

// ── Difficulty constants ───────────────────────────────────────────────────
/** Display duration (ms) at level 0. */
const INITIAL_DISPLAY_MS = 800;
/** Fixed step (ms) subtracted each level while above the threshold. */
const DISPLAY_STEP_MS = 100;
/** Level at which fixed stepping gives way to proportional stepping. */
const DISPLAY_STEP_THRESHOLD_MS = 100;
/** Minimum (fastest) possible display duration in ms. */
const MIN_DISPLAY_MS = 10;
/** Number of images shown at level 0. */
const INITIAL_IMAGE_COUNT = 3;
/** Maximum number of images that can appear in a round. */
const MAX_IMAGE_COUNT = 42;
/** Maximum number of wedges on the wheel. */
const MAX_WEDGE_COUNT = 42;
/** Minimum number of wedges on the wheel. */
const MIN_WEDGE_COUNT = 6;
/**
 * The first speedLevel at which proportional display-duration stepping begins
 * (i.e., where calculateDisplayDuration first returns < DISPLAY_STEP_THRESHOLD_MS).
 */
const TRANSITION_SPEED_LEVEL = Math.floor(
  (INITIAL_DISPLAY_MS - DISPLAY_STEP_THRESHOLD_MS) / DISPLAY_STEP_MS,
) + 1;
// ─────────────────────────────────────────────────────────────────────────────

let score = 0;
let roundsPlayed = 0;
let running = false;
let startTime = null;
let imageLevel = 0;
let speedLevel = 0;
/** When true, the next image-level advance will also advance the speed level. */
let speedIncreaseNext = false;
let consecutiveCorrect = 0;
let consecutiveWrong = 0;

// Best performance tracking
let maxScore = 0;
let mostRounds = 0;
let mostGuineaPigs = 0;
let topSpeedMs = null; // Lower is better — minimum answer response time (ms)
/** Lower is better — minimum display duration actually used in any round. */
let lowestRoundDisplayMs = null;

/**
 * Session history of display durations in ms, one entry per round.
 * Used to render the in-game speed trend chart.
 * @type {number[]}
 */
let speedHistory = [];

/**
 * Initialize (or reset) all game state.
 */
export function initGame() {
  score = 0;
  roundsPlayed = 0;
  running = false;
  startTime = null;
  imageLevel = 0;
  speedLevel = 0;
  speedIncreaseNext = false;
  consecutiveCorrect = 0;
  consecutiveWrong = 0;
  speedHistory = [];
  lowestRoundDisplayMs = null;
}

/**
 * Start the game and timer.
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
 * Stop the game and return the final results.
 * @returns {{ score: number, roundsPlayed: number, duration: number }}
 * @throws {Error} If the game is not running.
 */
export function stopGame() {
  if (!running) {
    throw new Error('Game is not running.');
  }
  running = false;
  const duration = startTime !== null ? Date.now() - startTime : 0;

  // Update bests
  if (score > maxScore) maxScore = score;
  if (roundsPlayed > mostRounds) mostRounds = roundsPlayed;

  return {
    score,
    roundsPlayed,
    duration,
    maxScore,
    mostRounds,
    mostGuineaPigs,
    topSpeedMs,
    lowestRoundDisplayMs,
  };
}

/**
 * Compute the canonical imageLevel that corresponds to a given speedLevel,
 * matching the original upward progression.
 *
 * In the synced phase (spdLv <= TRANSITION_SPEED_LEVEL) imageLevel equals
 * speedLevel. In the alternating phase every speed-level increment requires two
 * image-level increments, so the gap widens by one for every speed step.
 * @param {number} spdLv
 * @returns {number}
 */
function canonicalImageLevel(spdLv) {
  if (spdLv <= TRANSITION_SPEED_LEVEL) {
    return spdLv;
  }
  return TRANSITION_SPEED_LEVEL + 2 * (spdLv - TRANSITION_SPEED_LEVEL);
}

/**
 * Calculate the display duration in milliseconds for a given level.
 *
 * Steps down by DISPLAY_STEP_MS each level while above DISPLAY_STEP_THRESHOLD_MS.
 * Once at or below the threshold, each subsequent level moves halfway to
 * MIN_DISPLAY_MS (result rounded down to the nearest 5 ms).
 * @param {number} lv - The level to calculate for.
 * @returns {number} Display duration in ms.
 */
function calculateDisplayDuration(lv) {
  let duration = INITIAL_DISPLAY_MS;
  for (let i = 0; i < lv; i += 1) {
    if (duration > DISPLAY_STEP_THRESHOLD_MS) {
      duration = Math.max(duration - DISPLAY_STEP_MS, DISPLAY_STEP_THRESHOLD_MS);
    } else {
      const midpoint = (duration + MIN_DISPLAY_MS) / 2;
      duration = Math.max(Math.floor(midpoint / 5) * 5, MIN_DISPLAY_MS);
    }
  }
  return duration;
}

/**
 * Generate a new round's parameters based on the current image and speed levels.
 * @param {number} currentImageLevel - Drives the number of images shown.
 * @param {number} currentSpeedLevel - Drives the display duration.
 * @returns {{ wedgeCount: number, imageCount: number,
 *  displayDurationMs: number, outlierWedgeIndex: number }}
 */
export function generateRound(currentImageLevel, currentSpeedLevel) {
  const imageCount = Math.min(INITIAL_IMAGE_COUNT + currentImageLevel, MAX_IMAGE_COUNT);
  const wedgeCount = Math.min(Math.max(MIN_WEDGE_COUNT, imageCount), MAX_WEDGE_COUNT);
  const displayDurationMs = calculateDisplayDuration(currentSpeedLevel);
  const outlierWedgeIndex = Math.floor(Math.random() * imageCount);
  return {
    wedgeCount,
    imageCount,
    displayDurationMs,
    outlierWedgeIndex,
  };
}

/**
 * Check if the clicked wedge is the outlier.
 * @param {number} clickedWedge
 * @param {number} outlierWedge
 * @returns {boolean}
 */
export function checkAnswer(clickedWedge, outlierWedge) {
  return clickedWedge === outlierWedge;
}

/**
 * Calculate which wedge was clicked based on coordinates.
 * @param {number} clickX
 * @param {number} clickY
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} radius
 * @param {number} wedgeCount
 * @returns {number}
 */
export function calculateWedgeIndex(clickX, clickY, centerX, centerY, radius, wedgeCount) {
  const dx = clickX - centerX;
  const dy = clickY - centerY;
  if (Math.sqrt(dx * dx + dy * dy) > radius) {
    return -1;
  }
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
  return Math.floor(angle / (2 * Math.PI / wedgeCount));
}

/**
 * Add a correct answer to the score and update level if needed.
 * Also resets the consecutive-wrong counter.
 * @param {number} [guineaPigsThisRound] - Number of guinea pigs displayed this round.
 * @param {number} [answerSpeedMs] - Time in ms to answer this round (if tracked).
 * @param {number} [displayDurationMs] - Display duration (ms) of this round.
 */
export function addScore(guineaPigsThisRound, answerSpeedMs, displayDurationMs) {
  score += 1;
  roundsPlayed += 1;

  const staircaseState = updateAdaptiveDifficultyState({
    value: imageLevel,
    wasCorrect: true,
    consecutiveCorrect,
    consecutiveWrong,
    increaseAfter: 3,
    decreaseAfter: 3,
    harderStep: 1,
    easierStep: -2,
    minValue: 0,
    maxValue: Number.POSITIVE_INFINITY,
  });

  imageLevel = staircaseState.value;
  consecutiveCorrect = staircaseState.consecutiveCorrect;
  consecutiveWrong = staircaseState.consecutiveWrong;

  if (staircaseState.valueDelta === 1) {
    if (calculateDisplayDuration(speedLevel) < DISPLAY_STEP_THRESHOLD_MS) {
      // Sub-threshold phase: alternate between image-only and both.
      if (speedIncreaseNext) {
        speedLevel += 1;
        speedIncreaseNext = false;
      } else {
        speedIncreaseNext = true;
      }
    } else {
      // Above/at threshold: image level and speed level advance together.
      speedLevel += 1;
    }
  }
  // Track most guinea pigs displayed in a round
  if (typeof guineaPigsThisRound === 'number' && guineaPigsThisRound > mostGuineaPigs) {
    mostGuineaPigs = guineaPigsThisRound;
  }
  // Track top speed (lowest ms to answer correctly)
  if (typeof answerSpeedMs === 'number' && (topSpeedMs === null || answerSpeedMs < topSpeedMs)) {
    topSpeedMs = answerSpeedMs;
  }
  // Track the minimum display duration actually used in any round
  if (typeof displayDurationMs === 'number'
    && (lowestRoundDisplayMs === null || displayDurationMs < lowestRoundDisplayMs)) {
    lowestRoundDisplayMs = displayDurationMs;
  }
  speedHistory.push(calculateDisplayDuration(speedLevel));
}

/**
 * Record a missed answer and apply the adaptive staircase.
 * Resets consecutive correct count. After 3 consecutive misses the level
 * decreases by 2 (minimum 0), making the next round easier.
 * @param {number} [guineaPigsThisRound] - Number of guinea pigs displayed this round.
 * @param {number} [displayDurationMs] - Display duration (ms) of this round.
 */
export function addMiss(guineaPigsThisRound, displayDurationMs) {
  roundsPlayed += 1;
  const staircaseState = updateAdaptiveDifficultyState({
    value: speedLevel,
    wasCorrect: false,
    consecutiveCorrect,
    consecutiveWrong,
    increaseAfter: 3,
    decreaseAfter: 3,
    harderStep: 1,
    easierStep: -2,
    minValue: 0,
    maxValue: Number.POSITIVE_INFINITY,
  });

  speedLevel = staircaseState.value;
  consecutiveCorrect = staircaseState.consecutiveCorrect;
  consecutiveWrong = staircaseState.consecutiveWrong;
  if (staircaseState.valueDelta < 0) {
    imageLevel = canonicalImageLevel(speedLevel);
    speedIncreaseNext = false;
  }
  // Track most guinea pigs displayed in a round (even if missed)
  if (typeof guineaPigsThisRound === 'number' && guineaPigsThisRound > mostGuineaPigs) {
    mostGuineaPigs = guineaPigsThisRound;
  }
  // Track the minimum display duration actually used in any round
  if (typeof displayDurationMs === 'number'
    && (lowestRoundDisplayMs === null || displayDurationMs < lowestRoundDisplayMs)) {
    lowestRoundDisplayMs = displayDurationMs;
  }
  speedHistory.push(calculateDisplayDuration(speedLevel));
}

/**
 * Get the best stats for this session.
 * @returns {object} Best stats: { maxScore, mostRounds, mostGuineaPigs, topSpeedMs,
 *   lowestRoundDisplayMs }
 */
export function getBestStats() {
  return {
    maxScore, mostRounds, mostGuineaPigs, topSpeedMs, lowestRoundDisplayMs,
  };
}

/**
 * Get the current score.
 * @returns {number}
 */
export function getScore() {
  return score;
}

/**
 * Get the number of rounds played.
 * @returns {number}
 */
export function getRoundsPlayed() {
  return roundsPlayed;
}

/**
 * Get the current image level (number of level-ups completed).
 * @returns {number}
 */
export function getLevel() {
  return imageLevel;
}

/**
 * Get the current speed level (drives display duration).
 * Advances in sync with imageLevel while display duration is >= 100ms;
 * alternates with imageLevel once display duration drops below 100ms.
 * @returns {number}
 */
export function getSpeedLevel() {
  return speedLevel;
}

/**
 * Get the number of consecutive correct answers.
 * @returns {number}
 */
export function getConsecutiveCorrect() {
  return consecutiveCorrect;
}

/**
 * Get the current difficulty parameters.
 * @returns {{ wedgeCount: number, imageCount: number, displayDurationMs: number }}
 */
export function getCurrentDifficulty() {
  const imageCount = Math.min(INITIAL_IMAGE_COUNT + imageLevel, MAX_IMAGE_COUNT);
  const wedgeCount = Math.min(Math.max(MIN_WEDGE_COUNT, imageCount), MAX_WEDGE_COUNT);
  const displayDurationMs = calculateDisplayDuration(speedLevel);
  return { wedgeCount, imageCount, displayDurationMs };
}

/**
 * Get the number of consecutive wrong answers in the current staircase window.
 * Resets to 0 after 3 consecutive wrong answers (when level decreases) or
 * after any correct answer.
 * @returns {number}
 */
export function getConsecutiveWrong() {
  return consecutiveWrong;
}

/**
 * Check if the game is currently running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}

/**
 * Get the session speed history as an array of display durations in ms.
 * One entry is appended per round (correct or missed) after any staircase adjustment.
 * @returns {number[]}
 */
export function getSpeedHistory() {
  return [...speedHistory];
}
