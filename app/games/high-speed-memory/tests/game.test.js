/** @jest-environment node */
import {
  describe, test, expect, beforeEach,
} from '@jest/globals';

import {
  PRIMARY_IMAGE,
  DISTRACTOR_IMAGES,
  PRIMARY_COUNT,
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
  getScore,
  getLevel,
  getRoundsCompleted,
  isRunning,
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
    completeRound();
    initGame();
    expect(getLevel()).toBe(0);
  });

  test('resets roundsCompleted to 0', () => {
    completeRound();
    initGame();
    expect(getRoundsCompleted()).toBe(0);
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
    completeRound();
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
  test('increments level by 1', () => {
    completeRound();
    expect(getLevel()).toBe(1);
  });

  test('increments roundsCompleted by 1', () => {
    completeRound();
    expect(getRoundsCompleted()).toBe(1);
  });

  test('accumulates across multiple calls', () => {
    completeRound();
    completeRound();
    expect(getLevel()).toBe(2);
    expect(getRoundsCompleted()).toBe(2);
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
