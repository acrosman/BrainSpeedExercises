/**
 * game.test.js — Unit tests for the Sound Sweep game logic module.
 *
 * @jest-environment node
 */
import {
  describe,
  test,
  expect,
  beforeEach,
} from '@jest/globals';

import {
  SEQUENCES,
  CORRECT_STREAK_TO_ADVANCE,
  WRONG_STREAK_TO_DROP,
  LEVEL_DROP,
  LEVELS,
  initGame,
  startGame,
  stopGame,
  pickSequence,
  recordTrial,
  getCurrentLevel,
  getCurrentLevelConfig,
  getScore,
  getTrialsCompleted,
  getConsecutiveCorrect,
  getConsecutiveWrong,
  isRunning,
  getSpeedHistory,
} from '../game.js';

beforeEach(() => {
  initGame();
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  test('SEQUENCES contains all four valid sequences', () => {
    expect(SEQUENCES).toEqual(
      expect.arrayContaining(['up-up', 'up-down', 'down-up', 'down-down']),
    );
    expect(SEQUENCES).toHaveLength(4);
  });

  test('CORRECT_STREAK_TO_ADVANCE is a positive integer', () => {
    expect(Number.isInteger(CORRECT_STREAK_TO_ADVANCE)).toBe(true);
    expect(CORRECT_STREAK_TO_ADVANCE).toBeGreaterThan(0);
  });

  test('WRONG_STREAK_TO_DROP is a positive integer', () => {
    expect(Number.isInteger(WRONG_STREAK_TO_DROP)).toBe(true);
    expect(WRONG_STREAK_TO_DROP).toBeGreaterThan(0);
  });

  test('LEVEL_DROP is a positive integer less than the number of levels', () => {
    expect(Number.isInteger(LEVEL_DROP)).toBe(true);
    expect(LEVEL_DROP).toBeGreaterThan(0);
    expect(LEVEL_DROP).toBeLessThan(LEVELS.length);
  });

  test('LEVELS is a non-empty array with required numeric fields', () => {
    expect(Array.isArray(LEVELS)).toBe(true);
    expect(LEVELS.length).toBeGreaterThan(0);
    LEVELS.forEach((level) => {
      expect(typeof level.sweepDurationMs).toBe('number');
      expect(typeof level.isiMs).toBe('number');
      expect(level.sweepDurationMs).toBeGreaterThan(0);
      expect(level.isiMs).toBeGreaterThan(0);
    });
  });

  test('LEVELS are ordered from longest to shortest sweep duration', () => {
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i].sweepDurationMs).toBeLessThanOrEqual(LEVELS[i - 1].sweepDurationMs);
    }
  });
});

// ── initGame ──────────────────────────────────────────────────────────────────

describe('initGame', () => {
  test('resets all state to initial values', () => {
    startGame();
    recordTrial({ success: true });
    initGame();

    expect(isRunning()).toBe(false);
    expect(getCurrentLevel()).toBe(0);
    expect(getScore()).toBe(0);
    expect(getTrialsCompleted()).toBe(0);
    expect(getConsecutiveCorrect()).toBe(0);
    expect(getConsecutiveWrong()).toBe(0);
  });
});

// ── startGame / stopGame ──────────────────────────────────────────────────────

describe('startGame and stopGame', () => {
  test('startGame sets running to true', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  test('startGame throws when already running', () => {
    startGame();
    expect(() => startGame()).toThrow('already running');
  });

  test('stopGame returns a result object and sets running to false', () => {
    startGame();
    const result = stopGame();

    expect(isRunning()).toBe(false);
    expect(result).toMatchObject({
      score: 0,
      level: 0,
      trialsCompleted: 0,
    });
    expect(typeof result.duration).toBe('number');
  });

  test('stopGame throws when game is not running', () => {
    expect(() => stopGame()).toThrow('not running');
  });

  test('stopGame returns a non-negative duration', () => {
    startGame();
    const result = stopGame();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ── pickSequence ──────────────────────────────────────────────────────────────

describe('pickSequence', () => {
  test('always returns one of the four valid sequences', () => {
    for (let i = 0; i < 100; i += 1) {
      const seq = pickSequence();
      expect(SEQUENCES).toContain(seq);
    }
  });
});

// ── recordTrial staircase behavior ────────────────────────────────────────────

describe('recordTrial — staircase advancement', () => {
  test('3 consecutive correct responses advance the level by 1', () => {
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: true });
    expect(getCurrentLevel()).toBe(0); // not yet
    recordTrial({ success: true });
    expect(getCurrentLevel()).toBe(1);
  });

  test('level does not advance before 3 correct in a row', () => {
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: true });
    expect(getCurrentLevel()).toBe(0);
  });

  test('correct streak resets to 0 after level advance', () => {
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: true });
    recordTrial({ success: true });
    expect(getConsecutiveCorrect()).toBe(0);
  });

  test('a wrong response resets the correct streak', () => {
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: true });
    recordTrial({ success: false });
    expect(getCurrentLevel()).toBe(0);
    expect(getConsecutiveCorrect()).toBe(0);
  });
});

describe('recordTrial — staircase drop', () => {
  test('3 consecutive wrong responses drop the level by 2', () => {
    startGame();
    // Advance to level 3 first.
    for (let i = 0; i < 9; i += 1) {
      recordTrial({ success: true });
    }
    expect(getCurrentLevel()).toBe(3);

    recordTrial({ success: false });
    recordTrial({ success: false });
    recordTrial({ success: false });
    expect(getCurrentLevel()).toBe(1);
  });

  test('wrong streak resets to 0 after the drop', () => {
    startGame();
    recordTrial({ success: false });
    recordTrial({ success: false });
    recordTrial({ success: false });
    expect(getConsecutiveWrong()).toBe(0);
  });

  test('level does not drop below 0', () => {
    startGame();
    recordTrial({ success: false });
    recordTrial({ success: false });
    recordTrial({ success: false });
    expect(getCurrentLevel()).toBe(0);
  });

  test('a correct response resets the wrong streak', () => {
    startGame();
    recordTrial({ success: false });
    recordTrial({ success: false });
    recordTrial({ success: true });
    expect(getConsecutiveWrong()).toBe(0);
    expect(getCurrentLevel()).toBe(0);
  });
});

describe('recordTrial — level ceiling', () => {
  test('level does not exceed the last LEVELS index', () => {
    startGame();
    const maxTrials = LEVELS.length * CORRECT_STREAK_TO_ADVANCE * 2;
    for (let i = 0; i < maxTrials; i += 1) {
      recordTrial({ success: true });
    }
    expect(getCurrentLevel()).toBe(LEVELS.length - 1);
  });
});

describe('recordTrial — counters', () => {
  test('trialsCompleted increments on each call', () => {
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: false });
    recordTrial({ success: true });
    expect(getTrialsCompleted()).toBe(3);
  });

  test('score increments only on correct responses', () => {
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: false });
    recordTrial({ success: true });
    expect(getScore()).toBe(2);
  });

  test('recordTrial returns current level and streak values', () => {
    startGame();
    const result = recordTrial({ success: true });
    expect(result).toMatchObject({
      level: 0,
      consecutiveCorrect: 1,
      consecutiveWrong: 0,
    });
  });
});

// ── getCurrentLevelConfig ─────────────────────────────────────────────────────

describe('getCurrentLevelConfig', () => {
  test('returns the config for level 0 initially', () => {
    expect(getCurrentLevelConfig()).toEqual(LEVELS[0]);
  });

  test('returns updated config after level advance', () => {
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: true });
    recordTrial({ success: true });
    expect(getCurrentLevelConfig()).toEqual(LEVELS[1]);
  });
});

// ── getSpeedHistory ───────────────────────────────────────────────────────────

describe('getSpeedHistory', () => {
  test('appends one entry per completed trial', () => {
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: false });
    const history = getSpeedHistory();
    expect(history).toHaveLength(2);
    history.forEach((v) => expect(typeof v).toBe('number'));
  });

  test('returns a copy so external mutations do not affect state', () => {
    startGame();
    recordTrial({ success: true });
    const h = getSpeedHistory();
    h.pop();
    expect(getSpeedHistory()).toHaveLength(1);
  });

  test('resets to empty after initGame', () => {
    startGame();
    recordTrial({ success: true });
    initGame();
    expect(getSpeedHistory()).toEqual([]);
  });
});
