/**
 * progress.js - Progress persistence for the Field of View game.
 *
 * Saves session results via the centralized scoreService. This module must only
 * be imported in renderer-side code and never calls Electron APIs directly.
 *
 * @file Field of View progress persistence helpers.
 */

import * as game from './game.js';
import { saveScore } from '../../components/scoreService.js';

/** Game identifier used for progress persistence. */
export const GAME_ID = 'field-of-view';

/**
 * Save game progress asynchronously via the score service.
 *
 * Only call this when an actual session was played (trialsCompleted > 0).
 *
 * @param {{ thresholdMs: number, trialsCompleted: number, recentAccuracy: number }} result
 * @param {number} [sessionDurationMs=0]
 */
export function saveProgress(result, sessionDurationMs = 0) {
  saveScore(GAME_ID, {
    score: Math.round(1000 / result.thresholdMs),
    sessionDurationMs,
    lowestDisplayTime: result.thresholdMs,
  }, (prev) => {
    // bestThresholdMs mirrors lowestDisplayTime but uses the game-specific name
    // for backward compatibility with existing saved progress records.
    const prevLowest = typeof prev.lowestDisplayTime === 'number'
      ? prev.lowestDisplayTime
      : Number.POSITIVE_INFINITY;
    const nextBest = Math.min(prevLowest, result.thresholdMs);
    return {
      bestThresholdMs: Number(nextBest.toFixed(2)),
      lastThresholdMs: Number(result.thresholdMs.toFixed(2)),
      lastRecentAccuracy: result.recentAccuracy,
      thresholdHistory: game.getThresholdHistory(),
      trialsCompleted: result.trialsCompleted,
    };
  });
}
