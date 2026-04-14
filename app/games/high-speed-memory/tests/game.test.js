/** @jest-environment node */
import {
  describe, test, expect, beforeEach,
} from '@jest/globals';

import {
  PRIMARY_IMAGE,
  DISTRACTOR_IMAGES,
  PRIMARY_COUNT,
  ROUNDS_TO_LEVEL_UP,
  BASE_DISPLAY_MS,
  DISPLAY_DECREMENT_MS,
  MIN_DISPLAY_MS,
  initGame,
  startGame,
  stopGame,
  getGridSize,
  getDisplayDurationMs,
  generateGrid,
  isPrimary,
  addCorrectGroup,
  completeRound,
  resetConsecutiveRounds,
  getScore,
  getLevel,
  getRoundsCompleted,
  getConsecutiveCorrectRounds,
  getConsecutiveWrongRounds,
  isRunning,
  getSpeedHistory,
} from '../game.js';

beforeEach(() => {
  initGame();
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('PRIMARY_IMAGE', () => {
  test('is a non-empty string', () => {
    expect(typeof PRIMARY_IMAGE).toBe('string');
    expect(PRIMARY_IMAGE.length).toBeGreaterThan(0);
  });

  test('is Primary.jpg', () => {
    expect(PRIMARY_IMAGE).toBe('Primary.jpg');
  });
});

describe('DISTRACTOR_IMAGES', () => {
  test('is a non-empty array of strings', () => {
    expect(Array.isArray(DISTRACTOR_IMAGES)).toBe(true);
    expect(DISTRACTOR_IMAGES.length).toBeGreaterThan(0);
    DISTRACTOR_IMAGES.forEach((s) => expect(typeof s).toBe('string'));
  });

  test('does not contain the PRIMARY_IMAGE', () => {
    expect(DISTRACTOR_IMAGES).not.toContain(PRIMARY_IMAGE);
  });
});

describe('PRIMARY_COUNT', () => {
  test('is 3', () => {
    expect(PRIMARY_COUNT).toBe(3);
  });
});

describe('ROUNDS_TO_LEVEL_UP', () => {
  test('is 3', () => {
    expect(ROUNDS_TO_LEVEL_UP).toBe(3);
  });
});

describe('display timing constants', () => {
  test('BASE_DISPLAY_MS is 500', () => {
    expect(BASE_DISPLAY_MS).toBe(1500);
  });

  test('MIN_DISPLAY_MS is 20', () => {
    expect(MIN_DISPLAY_MS).toBe(20);
  });

  test('DISPLAY_DECREMENT_MS is a positive number', () => {
    expect(DISPLAY_DECREMENT_MS).toBeGreaterThan(0);
  });
});

// ── initGame ──────────────────────────────────────────────────────────────────

describe('initGame', () => {
  test('resets score to 0', () => {
    addCorrectGroup();
    initGame();
    expect(getScore()).toBe(0);
  });

  test('resets level to 0', () => {
    // Need 3 completeRound calls to advance level
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP; i += 1) {
      completeRound();
    }
    initGame();
    expect(getLevel()).toBe(0);
  });

  test('resets roundsCompleted to 0', () => {
    completeRound();
    initGame();
    expect(getRoundsCompleted()).toBe(0);
  });

  test('resets consecutiveCorrectRounds to 0', () => {
    completeRound();
    initGame();
    expect(getConsecutiveCorrectRounds()).toBe(0);
  });

  test('resets running to false', () => {
    startGame();
    initGame();
    expect(isRunning()).toBe(false);
  });
});

// ── startGame ─────────────────────────────────────────────────────────────────

describe('startGame', () => {
  test('sets running to true', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  test('throws if called when already running', () => {
    startGame();
    expect(() => startGame()).toThrow('already running');
  });
});

// ── stopGame ──────────────────────────────────────────────────────────────────

describe('stopGame', () => {
  test('sets running to false', () => {
    startGame();
    stopGame();
    expect(isRunning()).toBe(false);
  });

  test('returns score, level, roundsCompleted, and duration', () => {
    startGame();
    const result = stopGame();
    expect(result).toMatchObject({
      score: 0,
      level: 0,
      roundsCompleted: 0,
    });
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  test('throws if the game is not running', () => {
    expect(() => stopGame()).toThrow('not running');
  });

  test('includes the current score in the result', () => {
    startGame();
    addCorrectGroup();
    addCorrectGroup();
    const result = stopGame();
    expect(result.score).toBe(2);
  });

  test('includes the current level in the result', () => {
    // Level advances after ROUNDS_TO_LEVEL_UP consecutive correct rounds
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP; i += 1) {
      completeRound();
    }
    startGame();
    const result = stopGame();
    expect(result.level).toBe(1);
  });
});

// ── getGridSize ───────────────────────────────────────────────────────────────

describe('getGridSize', () => {
  test('returns 3×3 for level 0', () => {
    expect(getGridSize(0)).toEqual({ rows: 3, cols: 3 });
  });

  test('returns 4×4 for level 1', () => {
    expect(getGridSize(1)).toEqual({ rows: 4, cols: 4 });
  });

  test('returns 5×5 for level 2', () => {
    expect(getGridSize(2)).toEqual({ rows: 5, cols: 5 });
  });

  test('rows always equal cols (square grid)', () => {
    for (let i = 0; i < 10; i += 1) {
      const { rows, cols } = getGridSize(i);
      expect(rows).toBe(cols);
    }
  });

  test('grid grows with each level', () => {
    for (let i = 0; i < 9; i += 1) {
      expect(getGridSize(i + 1).rows).toBeGreaterThan(getGridSize(i).rows);
    }
  });
});

// ── getDisplayDurationMs ──────────────────────────────────────────────────────

describe('getDisplayDurationMs', () => {
  test('returns BASE_DISPLAY_MS at level 0', () => {
    expect(getDisplayDurationMs(0)).toBe(BASE_DISPLAY_MS);
  });

  test('decreases by DISPLAY_DECREMENT_MS each level', () => {
    expect(getDisplayDurationMs(1)).toBe(BASE_DISPLAY_MS - DISPLAY_DECREMENT_MS);
  });

  test('never goes below MIN_DISPLAY_MS', () => {
    expect(getDisplayDurationMs(9999)).toBe(MIN_DISPLAY_MS);
  });

  test('reaches minimum at high levels', () => {
    const levelsToMin = Math.ceil((BASE_DISPLAY_MS - MIN_DISPLAY_MS) / DISPLAY_DECREMENT_MS);
    expect(getDisplayDurationMs(levelsToMin + 5)).toBe(MIN_DISPLAY_MS);
  });
});

// ── generateGrid ──────────────────────────────────────────────────────────────

describe('generateGrid', () => {
  test('returns rows×cols cards (full grid)', () => {
    const { rows, cols } = getGridSize(0);
    expect(generateGrid(0).length).toBe(rows * cols);
  });

  test('contains exactly PRIMARY_COUNT copies of PRIMARY_IMAGE', () => {
    const grid = generateGrid(0);
    const primaryCards = grid.filter((c) => c.image === PRIMARY_IMAGE);
    expect(primaryCards.length).toBe(PRIMARY_COUNT);
  });

  test('all non-Primary cards use DISTRACTOR_IMAGES', () => {
    const grid = generateGrid(0);
    grid.filter((c) => c.image !== PRIMARY_IMAGE).forEach((c) => {
      expect(DISTRACTOR_IMAGES).toContain(c.image);
    });
  });

  test('all cards start as unmatched', () => {
    const grid = generateGrid(0);
    grid.forEach((card) => expect(card.matched).toBe(false));
  });

  test('card ids are sequential 0-based indices', () => {
    const grid = generateGrid(0);
    grid.forEach((card, i) => expect(card.id).toBe(i));
  });

  test('grid is full-sized at level 1 (4×4 = 16 cards)', () => {
    expect(generateGrid(1).length).toBe(16);
  });

  test('PRIMARY_COUNT primary cards present at higher levels', () => {
    [1, 2, 3, 4].forEach((lvl) => {
      const grid = generateGrid(lvl);
      const primaries = grid.filter((c) => c.image === PRIMARY_IMAGE);
      expect(primaries.length).toBe(PRIMARY_COUNT);
    });
  });
});

// ── isPrimary ─────────────────────────────────────────────────────────────────

describe('isPrimary', () => {
  test('returns true for PRIMARY_IMAGE', () => {
    expect(isPrimary(PRIMARY_IMAGE)).toBe(true);
  });

  test('returns false for each DISTRACTOR_IMAGE', () => {
    DISTRACTOR_IMAGES.forEach((img) => {
      expect(isPrimary(img)).toBe(false);
    });
  });

  test('returns false for an empty string', () => {
    expect(isPrimary('')).toBe(false);
  });
});

// ── addCorrectGroup ───────────────────────────────────────────────────────────

describe('addCorrectGroup', () => {
  test('increments score by 1', () => {
    addCorrectGroup();
    expect(getScore()).toBe(1);
  });

  test('accumulates across multiple calls', () => {
    addCorrectGroup();
    addCorrectGroup();
    addCorrectGroup();
    expect(getScore()).toBe(3);
  });
});

// ── completeRound ─────────────────────────────────────────────────────────────

describe('completeRound', () => {
  test('increments roundsCompleted by 1', () => {
    completeRound();
    expect(getRoundsCompleted()).toBe(1);
  });

  test('does not advance level until ROUNDS_TO_LEVEL_UP consecutive rounds', () => {
    completeRound();
    expect(getLevel()).toBe(0);
    completeRound();
    expect(getLevel()).toBe(0);
  });

  test('advances level after ROUNDS_TO_LEVEL_UP consecutive correct rounds', () => {
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP; i += 1) {
      completeRound();
    }
    expect(getLevel()).toBe(1);
  });

  test('resets consecutiveCorrectRounds to 0 after level advance', () => {
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP; i += 1) {
      completeRound();
    }
    expect(getConsecutiveCorrectRounds()).toBe(0);
  });

  test('accumulates across multiple level advances', () => {
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP * 2; i += 1) {
      completeRound();
    }
    expect(getLevel()).toBe(2);
    expect(getRoundsCompleted()).toBe(ROUNDS_TO_LEVEL_UP * 2);
  });
});

// ── resetConsecutiveRounds ───────────────────────────────────────────────────

describe('resetConsecutiveRounds', () => {
  test('resets the consecutive correct round counter to 0', () => {
    completeRound();
    expect(getConsecutiveCorrectRounds()).toBe(1);
    resetConsecutiveRounds();
    expect(getConsecutiveCorrectRounds()).toBe(0);
  });

  test('prevents level advance when streak is broken between rounds', () => {
    completeRound();
    completeRound();
    resetConsecutiveRounds(); // streak broken: back to 0
    completeRound(); // only 1 consecutive now
    expect(getLevel()).toBe(0);
    expect(getConsecutiveCorrectRounds()).toBe(1);
  });

  test('does not change level on first or second consecutive wrong round', () => {
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP; i += 1) completeRound();
    expect(getLevel()).toBe(1);
    resetConsecutiveRounds(); // wrong 1
    expect(getLevel()).toBe(1);
    resetConsecutiveRounds(); // wrong 2
    expect(getLevel()).toBe(1);
  });

  test('decreases level by 2 after 3 consecutive wrong rounds (adaptive staircase)', () => {
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP * 2; i += 1) completeRound();
    expect(getLevel()).toBe(2);
    resetConsecutiveRounds();
    resetConsecutiveRounds();
    resetConsecutiveRounds(); // 3 consecutive wrong → level 0
    expect(getLevel()).toBe(0);
  });

  test('does not decrease level below 0 after 3 wrong rounds', () => {
    resetConsecutiveRounds();
    resetConsecutiveRounds();
    resetConsecutiveRounds();
    expect(getLevel()).toBe(0);
  });

  test('resets consecutive wrong counter after level decrease', () => {
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP; i += 1) completeRound();
    expect(getLevel()).toBe(1);
    resetConsecutiveRounds();
    resetConsecutiveRounds();
    resetConsecutiveRounds(); // 3 wrong → level 0, counter reset
    resetConsecutiveRounds();
    resetConsecutiveRounds(); // only 2 more wrong
    expect(getLevel()).toBe(0);
    expect(getConsecutiveWrongRounds()).toBe(2);
  });

  test('resets wrong counter when a round is completed correctly', () => {
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP; i += 1) completeRound();
    expect(getLevel()).toBe(1);
    resetConsecutiveRounds();
    resetConsecutiveRounds(); // 2 wrong
    completeRound(); // correct — resets wrong counter
    resetConsecutiveRounds();
    resetConsecutiveRounds(); // only 2 more wrong
    expect(getLevel()).toBe(1);
    expect(getConsecutiveWrongRounds()).toBe(2);
  });
});

// ── getScore / getLevel / getRoundsCompleted / isRunning ──────────────────────

describe('getScore', () => {
  test('returns 0 after init', () => {
    expect(getScore()).toBe(0);
  });
});

describe('getLevel', () => {
  test('returns 0 after init', () => {
    expect(getLevel()).toBe(0);
  });
});

describe('getRoundsCompleted', () => {
  test('returns 0 after init', () => {
    expect(getRoundsCompleted()).toBe(0);
  });
});

describe('getConsecutiveCorrectRounds', () => {
  test('returns 0 after init', () => {
    expect(getConsecutiveCorrectRounds()).toBe(0);
  });

  test('increments with each completeRound call', () => {
    completeRound();
    expect(getConsecutiveCorrectRounds()).toBe(1);
    completeRound();
    expect(getConsecutiveCorrectRounds()).toBe(2);
  });

  test('resets to 0 when level advances', () => {
    for (let i = 0; i < ROUNDS_TO_LEVEL_UP; i += 1) {
      completeRound();
    }
    expect(getConsecutiveCorrectRounds()).toBe(0);
  });
});

describe('isRunning', () => {
  test('returns false before startGame', () => {
    expect(isRunning()).toBe(false);
  });

  test('returns true after startGame', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  test('returns false after stopGame', () => {
    startGame();
    stopGame();
    expect(isRunning()).toBe(false);
  });
});

// ── getSpeedHistory ───────────────────────────────────────────────────────────

describe('getSpeedHistory', () => {
  test('returns empty array before any rounds', () => {
    expect(getSpeedHistory()).toEqual([]);
  });

  test('appends an entry after completeRound', () => {
    startGame();
    completeRound();
    const history = getSpeedHistory();
    expect(history).toHaveLength(1);
    expect(typeof history[0]).toBe('number');
  });

  test('appends an entry after resetConsecutiveRounds', () => {
    startGame();
    resetConsecutiveRounds();
    expect(getSpeedHistory()).toHaveLength(1);
  });

  test('returns a copy so external mutations do not affect state', () => {
    startGame();
    completeRound();
    const h = getSpeedHistory();
    h.pop();
    expect(getSpeedHistory()).toHaveLength(1);
  });

  test('resets to empty after initGame', () => {
    startGame();
    completeRound();
    initGame();
    expect(getSpeedHistory()).toEqual([]);
  });
});
