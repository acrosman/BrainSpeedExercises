/**
 * adaptiveDifficultyService.js — Shared adaptive difficulty staircase helpers.
 *
 * Applies the common BrainSpeedExercises rule:
 * - 3 consecutive correct results increase difficulty by one step.
 * - 3 consecutive wrong results decrease difficulty by two steps.
 *
 * @file Shared adaptive staircase service.
 */

/**
 * Clamp a numeric difficulty value to an inclusive [min, max] range.
 *
 * @param {number} value - Value to clamp.
 * @param {number} minValue - Lower bound.
 * @param {number} maxValue - Upper bound.
 * @returns {number} Clamped value.
 */
export function clampDifficultyValue(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

/**
 * Apply one adaptive-staircase update for a completed trial/round.
 *
 * The caller provides:
 * - Current difficulty value (level, SOA, interval, etc.)
 * - Current consecutive correct/wrong counters
 * - Whether this result was correct
 * - Numeric step direction/magnitude for harder/easier adjustments
 *
 * @param {{
 *   value: number,
 *   wasCorrect: boolean,
 *   consecutiveCorrect: number,
 *   consecutiveWrong: number,
 *   increaseAfter?: number,
 *   decreaseAfter?: number,
 *   harderStep?: number,
 *   easierStep?: number,
 *   minValue?: number,
 *   maxValue?: number,
 * }} state
 * @returns {{
 *   value: number,
 *   consecutiveCorrect: number,
 *   consecutiveWrong: number,
 *   valueDelta: number,
 * }}
 */
export function updateAdaptiveDifficultyState(state) {
  const {
    value,
    wasCorrect,
    consecutiveCorrect,
    consecutiveWrong,
    increaseAfter = 3,
    decreaseAfter = 3,
    harderStep = 1,
    easierStep = -2,
    minValue = Number.NEGATIVE_INFINITY,
    maxValue = Number.POSITIVE_INFINITY,
  } = state;

  let nextValue = value;
  let nextConsecutiveCorrect = wasCorrect ? consecutiveCorrect + 1 : 0;
  let nextConsecutiveWrong = wasCorrect ? 0 : consecutiveWrong + 1;

  if (nextConsecutiveCorrect >= increaseAfter) {
    nextValue = clampDifficultyValue(value + harderStep, minValue, maxValue);
    nextConsecutiveCorrect = 0;
  } else if (nextConsecutiveWrong >= decreaseAfter) {
    nextValue = clampDifficultyValue(value + easierStep, minValue, maxValue);
    nextConsecutiveWrong = 0;
  }

  return {
    value: nextValue,
    consecutiveCorrect: nextConsecutiveCorrect,
    consecutiveWrong: nextConsecutiveWrong,
    valueDelta: nextValue - value,
  };
}
