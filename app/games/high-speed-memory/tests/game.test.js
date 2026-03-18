/** @jest-environment node */
import {
  describe, test, expect, beforeEach,
} from '@jest/globals';

import {
  CARD_IMAGES,
  MATCH_SIZE,
  BASE_DISPLAY_MS,
  DISPLAY_DECREMENT_MS,
  MIN_DISPLAY_MS,
  initGame,
  startGame,
  stopGame,
  getGridSize,
  getActiveCardCount,
  getDisplayDurationMs,
  generateGrid,
  checkMatch,
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

describe('CARD_IMAGES', () => {
  test('is an array of strings', () => {
    expect(Array.isArray(CARD_IMAGES)).toBe(true);
    CARD_IMAGES.forEach((s) => expect(typeof s).toBe('string'));
  });

  test('has enough images for a level-9 grid (12x12 = 48 groups)', () => {
    const level9Groups = getActiveCardCount(9) / MATCH_SIZE;
    expect(CARD_IMAGES.length).toBeGreaterThanOrEqual(level9Groups);
  });
});

describe('MATCH_SIZE', () => {
  test('is 3', () => {
    expect(MATCH_SIZE).toBe(3);
  });
});

describe('display timing constants', () => {
  test('BASE_DISPLAY_MS is 500', () => {
    expect(BASE_DISPLAY_MS).toBe(500);
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

// ── getActiveCardCount ────────────────────────────────────────────────────────

describe('getActiveCardCount', () => {
  test('is always divisible by MATCH_SIZE', () => {
    for (let i = 0; i < 10; i += 1) {
      expect(getActiveCardCount(i) % MATCH_SIZE).toBe(0);
    }
  });

  test('is at most rows×cols', () => {
    for (let i = 0; i < 10; i += 1) {
      const { rows, cols } = getGridSize(i);
      expect(getActiveCardCount(i)).toBeLessThanOrEqual(rows * cols);
    }
  });

  test('level 0 (3×3=9) returns 9', () => {
    expect(getActiveCardCount(0)).toBe(9);
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
  test('returns getActiveCardCount cards', () => {
    expect(generateGrid(0).length).toBe(getActiveCardCount(0));
  });

  test('each image appears exactly MATCH_SIZE times', () => {
    const grid = generateGrid(0);
    const counts = {};
    grid.forEach(({ image }) => {
      counts[image] = (counts[image] || 0) + 1;
    });
    Object.values(counts).forEach((count) => expect(count).toBe(MATCH_SIZE));
  });

  test('all cards start as unmatched', () => {
    const grid = generateGrid(0);
    grid.forEach((card) => expect(card.matched).toBe(false));
  });

  test('card ids are sequential 0-based indices', () => {
    const grid = generateGrid(0);
    grid.forEach((card, i) => expect(card.id).toBe(i));
  });

  test('each card has an image property that is a non-empty string', () => {
    const grid = generateGrid(0);
    grid.forEach((card) => {
      expect(typeof card.image).toBe('string');
      expect(card.image.length).toBeGreaterThan(0);
    });
  });

  test('produces correct card count for several levels', () => {
    [0, 1, 2, 3, 4].forEach((lvl) => {
      expect(generateGrid(lvl).length).toBe(getActiveCardCount(lvl));
    });
  });
});

// ── checkMatch ────────────────────────────────────────────────────────────────

describe('checkMatch', () => {
  test('returns true when all MATCH_SIZE images are equal', () => {
    expect(checkMatch('card-01.svg', 'card-01.svg', 'card-01.svg')).toBe(true);
  });

  test('returns false when any image differs', () => {
    expect(checkMatch('card-01.svg', 'card-01.svg', 'card-02.svg')).toBe(false);
  });

  test('returns false when first and last differ', () => {
    expect(checkMatch('card-01.svg', 'card-02.svg', 'card-01.svg')).toBe(false);
  });

  test('returns false with fewer than MATCH_SIZE arguments', () => {
    expect(checkMatch('card-01.svg', 'card-01.svg')).toBe(false);
  });

  test('returns false with more than MATCH_SIZE arguments all equal', () => {
    const args = Array(MATCH_SIZE + 1).fill('card-01.svg');
    expect(checkMatch(...args)).toBe(false);
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


