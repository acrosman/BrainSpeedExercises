/** @jest-environment node */
import {
  describe, it, test, expect, beforeEach,
} from '@jest/globals';

import {
  SYMBOLS,
  GRID_CONFIGS,
  BASE_DISPLAY_MS,
  DISPLAY_DECREMENT_MS,
  MIN_DISPLAY_MS,
  initGame,
  startGame,
  stopGame,
  getGridSize,
  getDisplayDurationMs,
  generateGrid,
  checkMatch,
  addCorrectPair,
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

describe('SYMBOLS', () => {
  test('is an array of strings', () => {
    expect(Array.isArray(SYMBOLS)).toBe(true);
    SYMBOLS.forEach((s) => expect(typeof s).toBe('string'));
  });

  test('has at least as many symbols as the maximum pair count needed', () => {
    const maxPairs = Math.max(...GRID_CONFIGS.map(([r, c]) => (r * c) / 2));
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(maxPairs);
  });
});

describe('GRID_CONFIGS', () => {
  test('every config produces an even number of cards', () => {
    GRID_CONFIGS.forEach(([rows, cols]) => {
      expect((rows * cols) % 2).toBe(0);
    });
  });
});

// ── initGame ──────────────────────────────────────────────────────────────────

describe('initGame', () => {
  test('resets score to 0', () => {
    addCorrectPair();
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
    addCorrectPair();
    addCorrectPair();
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
  test('returns rows and cols for level 0', () => {
    const { rows, cols } = getGridSize(0);
    expect(rows).toBe(GRID_CONFIGS[0][0]);
    expect(cols).toBe(GRID_CONFIGS[0][1]);
  });

  test('clamps to the last config for very high levels', () => {
    const last = GRID_CONFIGS[GRID_CONFIGS.length - 1];
    const { rows, cols } = getGridSize(9999);
    expect(rows).toBe(last[0]);
    expect(cols).toBe(last[1]);
  });

  test('returns the correct config for every defined level', () => {
    GRID_CONFIGS.forEach(([r, c], i) => {
      const { rows, cols } = getGridSize(i);
      expect(rows).toBe(r);
      expect(cols).toBe(c);
    });
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
});

// ── generateGrid ──────────────────────────────────────────────────────────────

describe('generateGrid', () => {
  test('returns the correct number of cards for the level', () => {
    const { rows, cols } = getGridSize(0);
    const grid = generateGrid(0);
    expect(grid.length).toBe(rows * cols);
  });

  test('each symbol appears exactly twice', () => {
    const grid = generateGrid(0);
    const counts = {};
    grid.forEach(({ symbol }) => {
      counts[symbol] = (counts[symbol] || 0) + 1;
    });
    Object.values(counts).forEach((count) => expect(count).toBe(2));
  });

  test('all cards start as unmatched', () => {
    const grid = generateGrid(0);
    grid.forEach((card) => expect(card.matched).toBe(false));
  });

  test('card ids are sequential 0-based indices', () => {
    const grid = generateGrid(0);
    grid.forEach((card, i) => expect(card.id).toBe(i));
  });

  test('produces grids for every defined level', () => {
    GRID_CONFIGS.forEach((_, i) => {
      const { rows, cols } = getGridSize(i);
      expect(generateGrid(i).length).toBe(rows * cols);
    });
  });
});

// ── checkMatch ────────────────────────────────────────────────────────────────

describe('checkMatch', () => {
  test('returns true for equal symbols', () => {
    expect(checkMatch('★', '★')).toBe(true);
  });

  test('returns false for different symbols', () => {
    expect(checkMatch('★', '♠')).toBe(false);
  });
});

// ── addCorrectPair ────────────────────────────────────────────────────────────

describe('addCorrectPair', () => {
  test('increments score by 1', () => {
    addCorrectPair();
    expect(getScore()).toBe(1);
  });

  test('accumulates across multiple calls', () => {
    addCorrectPair();
    addCorrectPair();
    addCorrectPair();
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

  it('returns false after stopGame', () => {
    startGame();
    stopGame();
    expect(isRunning()).toBe(false);
  });
});
