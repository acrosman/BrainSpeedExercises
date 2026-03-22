/**
 * game.js — Pure game logic for Orbit Sprite Memory.
 *
 * Generates rounds where one target sprite appears exactly three times,
 * distractors appear up to two times each, and level progression is streak-based.
 *
 * @file Orbit Sprite Memory game logic module.
 */

/** Number of sprites in the provided 4x2 sheet. */
export const TOTAL_SPRITES = 8;

/** Number of columns in the provided sprite sheet. */
export const SPRITE_COLUMNS = 4;

/** Number of rows in the provided sprite sheet. */
export const SPRITE_ROWS = 2;

/** Number of circle positions used for playback and recall. */
export const POSITION_COUNT = 8;

/** Target sprite appears exactly this many times per round. */
export const PRIMARY_SHOW_COUNT = 3;

/** Any distractor can appear at most this many times per round. */
export const MAX_DISTRACTOR_SHOWS = 2;

/** Correct rounds in a row needed for a level increase. */
export const STREAK_TO_LEVEL_UP = 3;

/** Base display duration at level 0, in ms. */
export const BASE_DISPLAY_MS = 1100;

/** Display duration reduction per level, in ms. */
export const DISPLAY_DECREMENT_MS = 90;

/** Minimum image display duration, in ms. */
export const MIN_DISPLAY_MS = 250;

/** Distractor count at level 0. */
export const BASE_DISTRACTOR_COUNT = 2;

/** @type {number} */
let score = 0;

/** @type {number} */
let level = 0;

/** @type {number} */
let roundsPlayed = 0;

/** @type {number} */
let consecutiveCorrect = 0;

/** @type {boolean} */
let running = false;

/** @type {number|null} */
let startTime = null;

/**
 * Resets all gameplay state.
 */
export function initGame() {
  score = 0;
  level = 0;
  roundsPlayed = 0;
  consecutiveCorrect = 0;
  running = false;
  startTime = null;
}

/**
 * Starts the game timer.
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
 * Stops the game and returns summary stats.
 * @returns {{ score: number, level: number, roundsPlayed: number, duration: number }}
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
    roundsPlayed,
    duration,
  };
}

/**
 * Returns display duration for a given level.
 *
 * @param {number} lvl - Zero-based level.
 * @returns {number}
 */
export function getDisplayDurationMs(lvl) {
  return Math.max(BASE_DISPLAY_MS - lvl * DISPLAY_DECREMENT_MS, MIN_DISPLAY_MS);
}

/**
 * Returns how many unique distractor sprites are used this level.
 *
 * @param {number} lvl - Zero-based level.
 * @returns {number}
 */
export function getDistractorCount(lvl) {
  const maxDistractors = TOTAL_SPRITES - 1;
  return Math.min(BASE_DISTRACTOR_COUNT + lvl, maxDistractors);
}

/**
 * Creates a shuffled copy of an input array.
 *
 * @template T
 * @param {T[]} source - Input list.
 * @returns {T[]}
 */
export function shuffle(source) {
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Picks unique values from a source array.
 *
 * @template T
 * @param {T[]} source - Source values.
 * @param {number} count - Number of values to return.
 * @returns {T[]}
 */
export function pickUnique(source, count) {
  return shuffle(source).slice(0, count);
}

/**
 * Builds the ordered image sequence for one round.
 * Primary appears exactly PRIMARY_SHOW_COUNT times.
 * Each distractor appears once, and some appear a second time as level rises.
 *
 * @param {number} primarySpriteId - Target sprite id for this round.
 * @param {number[]} distractorIds - Chosen distractor sprite ids.
 * @param {number} lvl - Current level.
 * @returns {number[]} Sequence of sprite ids.
 */
export function buildPlaybackSequence(primarySpriteId, distractorIds, lvl) {
  const primaryList = Array.from({ length: PRIMARY_SHOW_COUNT }, () => primarySpriteId);
  const sequence = [...primaryList, ...distractorIds];

  const extraDistractors = Math.min(lvl, distractorIds.length);
  for (let i = 0; i < extraDistractors; i += 1) {
    sequence.push(distractorIds[i]);
  }

  return shuffle(sequence);
}

/**
 * Assigns positions to each step in the sequence.
 * Primary steps always use unique positions. Distractors never use those positions.
 *
 * @param {number[]} sequence - Ordered sprite ids.
 * @param {number} primarySpriteId - Target sprite id for this round.
 * @returns {{
 *  steps: Array<{ spriteId: number, positionIndex: number, isPrimary: boolean }>,
 *  primaryPositions: number[],
 *  shownPositions: number[]
 * }}
 */
export function assignPositions(sequence, primarySpriteId) {
  const allPositions = Array.from({ length: POSITION_COUNT }, (_, i) => i);
  const primaryPositions = pickUnique(allPositions, PRIMARY_SHOW_COUNT);

  const nonPrimaryPositions = allPositions.filter((p) => !primaryPositions.includes(p));
  const steps = [];
  const shown = new Set(primaryPositions);
  let primaryPointer = 0;

  sequence.forEach((spriteId, index) => {
    if (spriteId === primarySpriteId) {
      steps.push({
        spriteId,
        positionIndex: primaryPositions[primaryPointer],
        isPrimary: true,
      });
      primaryPointer += 1;
      return;
    }

    const positionIndex = nonPrimaryPositions[index % nonPrimaryPositions.length];
    shown.add(positionIndex);
    steps.push({
      spriteId,
      positionIndex,
      isPrimary: false,
    });
  });

  return {
    steps,
    primaryPositions,
    shownPositions: [...shown],
  };
}

/**
 * Creates a full round definition for the current level.
 *
 * @param {number} lvl - Current level.
 * @returns {{
 *  primarySpriteId: number,
 *  distractorSpriteIds: number[],
 *  steps: Array<{ spriteId: number, positionIndex: number, isPrimary: boolean }>,
 *  primaryPositions: number[],
 *  shownPositions: number[],
 *  displayMs: number
 * }}
 */
export function createRound(lvl) {
  const spriteIds = Array.from({ length: TOTAL_SPRITES }, (_, i) => i);
  const primarySpriteId = spriteIds[Math.floor(Math.random() * spriteIds.length)];

  const distractorPool = spriteIds.filter((id) => id !== primarySpriteId);
  const distractorSpriteIds = pickUnique(distractorPool, getDistractorCount(lvl));

  const sequence = buildPlaybackSequence(primarySpriteId, distractorSpriteIds, lvl);
  const positioned = assignPositions(sequence, primarySpriteId);

  return {
    primarySpriteId,
    distractorSpriteIds,
    steps: positioned.steps,
    primaryPositions: positioned.primaryPositions,
    shownPositions: positioned.shownPositions,
    displayMs: getDisplayDurationMs(lvl),
  };
}

/**
 * Evaluates whether player selections match this round's primary positions exactly.
 *
 * @param {{ primaryPositions: number[] }} round - Round metadata.
 * @param {number[]} selectedPositions - Player-selected position ids.
 * @returns {boolean}
 */
export function evaluateSelection(round, selectedPositions) {
  if (!round || !Array.isArray(round.primaryPositions)) {
    return false;
  }

  if (!Array.isArray(selectedPositions) || selectedPositions.length !== PRIMARY_SHOW_COUNT) {
    return false;
  }

  const expected = [...round.primaryPositions].sort((a, b) => a - b);
  const actual = [...selectedPositions].sort((a, b) => a - b);
  return expected.every((value, index) => value === actual[index]);
}

/**
 * Records a correct round and handles level progression.
 */
export function recordCorrectRound() {
  roundsPlayed += 1;
  score += 1;
  consecutiveCorrect += 1;

  if (consecutiveCorrect >= STREAK_TO_LEVEL_UP) {
    level += 1;
    consecutiveCorrect = 0;
  }
}

/**
 * Records an incorrect round and resets the level-up streak.
 */
export function recordIncorrectRound() {
  roundsPlayed += 1;
  consecutiveCorrect = 0;
}

/**
 * Returns score.
 * @returns {number}
 */
export function getScore() {
  return score;
}

/**
 * Returns current level.
 * @returns {number}
 */
export function getLevel() {
  return level;
}

/**
 * Returns rounds played.
 * @returns {number}
 */
export function getRoundsPlayed() {
  return roundsPlayed;
}

/**
 * Returns current consecutive correct rounds.
 * @returns {number}
 */
export function getConsecutiveCorrect() {
  return consecutiveCorrect;
}

/**
 * Returns whether the game is running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}
