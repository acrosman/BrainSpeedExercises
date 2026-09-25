/** @jest-environment node */
import {
  CORRECT_STREAK_TO_ADVANCE,
  WRONG_STREAK_TO_DROP,
  LEVEL_DROP,
  LEVELS,
  initGame,
  startGame,
  stopGame,
  recordTrial,
  getCurrentLevel,
  getCurrentLevelConfig,
  getScore,
  getTrialsCompleted,
  isRunning,
  getSpeedHistory,
} from '../game.js';

/**
 * Record the same outcome several times.
 *
 * @param {boolean} success
 * @param {number} count
 */
function recordMany(success, count) {
  for (let i = 0; i < count; i += 1) recordTrial({ success });
}

beforeEach(() => {
  initGame();
});

describe('initGame', () => {
  test('resets all state', () => {
    startGame();
    recordMany(true, CORRECT_STREAK_TO_ADVANCE);
    initGame();
    expect(isRunning()).toBe(false);
    expect(getScore()).toBe(0);
    expect(getCurrentLevel()).toBe(0);
    expect(getTrialsCompleted()).toBe(0);
    expect(getSpeedHistory()).toEqual([]);
  });
});

describe('startGame', () => {
  test('sets running to true', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  test('throws if already running', () => {
    startGame();
    expect(() => startGame()).toThrow('Game is already running.');
  });
});

describe('stopGame', () => {
  test('throws if not running', () => {
    expect(() => stopGame()).toThrow('Game is not running.');
  });

  test('stops the game and returns the result', () => {
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: false });
    const result = stopGame();
    expect(isRunning()).toBe(false);
    expect(result).toMatchObject({ score: 1, level: 0, trialsCompleted: 2 });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('recordTrial', () => {
  test('counts trials and scores correct responses', () => {
    recordTrial({ success: true });
    recordTrial({ success: false });
    expect(getTrialsCompleted()).toBe(2);
    expect(getScore()).toBe(1);
  });

  test('advances one level after a correct streak', () => {
    recordMany(true, CORRECT_STREAK_TO_ADVANCE);
    expect(getCurrentLevel()).toBe(1);
  });

  test('drops levels after a wrong streak', () => {
    recordMany(true, CORRECT_STREAK_TO_ADVANCE * 3);
    const level = getCurrentLevel();
    const result = recordTrial({ success: false });
    expect(result.consecutiveWrong).toBe(1);
    recordMany(false, WRONG_STREAK_TO_DROP - 1);
    expect(getCurrentLevel()).toBe(level - LEVEL_DROP);
  });

  test('never goes below level 0 or above the last level', () => {
    recordMany(false, WRONG_STREAK_TO_DROP);
    expect(getCurrentLevel()).toBe(0);
    recordMany(true, CORRECT_STREAK_TO_ADVANCE * (LEVELS.length + 1));
    expect(getCurrentLevel()).toBe(LEVELS.length - 1);
  });

  test('appends the current display time to the speed history', () => {
    recordMany(true, CORRECT_STREAK_TO_ADVANCE);
    const history = getSpeedHistory();
    expect(history).toHaveLength(CORRECT_STREAK_TO_ADVANCE);
    expect(history[history.length - 1]).toBe(LEVELS[1].displayTimeMs);
  });
});

describe('getCurrentLevelConfig', () => {
  test('returns the config for the current level', () => {
    expect(getCurrentLevelConfig()).toBe(LEVELS[0]);
  });
});

describe('getSpeedHistory', () => {
  test('returns a copy', () => {
    recordTrial({ success: true });
    getSpeedHistory().push(999);
    expect(getSpeedHistory()).toHaveLength(1);
  });
});
