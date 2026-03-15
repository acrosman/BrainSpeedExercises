import {
  describe, it, expect, beforeEach, afterEach, jest,
} from '@jest/globals';
import {
  initGame,
  startGame,
  stopGame,
  generateRound,
  checkAnswer,
  calculateWedgeIndex,
  addScore,
  getScore,
  getRoundsPlayed,
  getCurrentDifficulty,
  isRunning,
} from '../game.js';

beforeEach(() => {
  initGame();
});

describe('initGame()', () => {
  it('resets getScore() to 0', () => {
    expect(getScore()).toBe(0);
  });

  it('resets getRoundsPlayed() to 0', () => {
    expect(getRoundsPlayed()).toBe(0);
  });

  it('resets isRunning() to false', () => {
    expect(isRunning()).toBe(false);
  });

  it('resets isRunning() to false even after startGame()', () => {
    startGame();
    initGame();
    expect(isRunning()).toBe(false);
  });

  it('resets getScore() to 0 even after addScore()', () => {
    addScore();
    initGame();
    expect(getScore()).toBe(0);
  });
});

describe('startGame() / stopGame()', () => {
  it('isRunning() returns false before startGame()', () => {
    expect(isRunning()).toBe(false);
  });

  it('isRunning() returns true after startGame()', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  it('isRunning() returns false after stopGame()', () => {
    startGame();
    stopGame();
    expect(isRunning()).toBe(false);
  });

  it('stopGame() returns an object with score, roundsPlayed, and duration keys', () => {
    startGame();
    const result = stopGame();
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('roundsPlayed');
    expect(result).toHaveProperty('duration');
  });

  it('stopGame().duration is a non-negative number', () => {
    startGame();
    const { duration } = stopGame();
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('startGame() throws when already running', () => {
    startGame();
    expect(() => startGame()).toThrow();
  });

  it('stopGame() throws when not running', () => {
    expect(() => stopGame()).toThrow();
  });
});

describe('addScore() / getScore() / getRoundsPlayed()', () => {
  it('getScore() starts at 0 after initGame()', () => {
    expect(getScore()).toBe(0);
  });

  it('addScore() increments getScore() by 1', () => {
    addScore();
    expect(getScore()).toBe(1);
  });

  it('calling addScore() three times produces getScore() === 3', () => {
    addScore();
    addScore();
    addScore();
    expect(getScore()).toBe(3);
  });

  it('addScore() increments getRoundsPlayed() by 1', () => {
    addScore();
    expect(getRoundsPlayed()).toBe(1);
  });

  it('getRoundsPlayed() starts at 0 after initGame()', () => {
    expect(getRoundsPlayed()).toBe(0);
  });
});

describe('generateRound(roundNumber)', () => {
  let randomSpy;

  beforeEach(() => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it.each([
    [0, 6, 2000],
    [3, 8, 1800],
    [6, 10, 1600],
    [9, 12, 1400],
    [12, 14, 1200],
    [15, 14, 1000],
    [30, 14, 500],
    [100, 14, 500],
  ])('roundNumber=%i → wedgeCount=%i, displayDurationMs=%i',
    (roundNumber, wedgeCount, displayDurationMs) => {
      const result = generateRound(roundNumber);
      expect(result.wedgeCount).toBe(wedgeCount);
      expect(result.displayDurationMs).toBe(displayDurationMs);
    });

  it('generateRound does not modify score or roundsPlayed', () => {
    generateRound(0);
    expect(getScore()).toBe(0);
    expect(getRoundsPlayed()).toBe(0);
  });

  it('outlierWedgeIndex is in [0, wedgeCount) for Math.random() = 0', () => {
    randomSpy.mockReturnValue(0);
    const { wedgeCount, outlierWedgeIndex } = generateRound(0);
    expect(outlierWedgeIndex).toBeGreaterThanOrEqual(0);
    expect(outlierWedgeIndex).toBeLessThan(wedgeCount);
  });

  it('outlierWedgeIndex is in [0, wedgeCount) for Math.random() = 0.5', () => {
    randomSpy.mockReturnValue(0.5);
    const { wedgeCount, outlierWedgeIndex } = generateRound(0);
    expect(outlierWedgeIndex).toBeGreaterThanOrEqual(0);
    expect(outlierWedgeIndex).toBeLessThan(wedgeCount);
  });

  it('outlierWedgeIndex is in [0, wedgeCount) for Math.random() = 0.9999', () => {
    randomSpy.mockReturnValue(0.9999);
    const { wedgeCount, outlierWedgeIndex } = generateRound(0);
    expect(outlierWedgeIndex).toBeGreaterThanOrEqual(0);
    expect(outlierWedgeIndex).toBeLessThan(wedgeCount);
  });
});

describe('checkAnswer(clickedWedge, outlierWedge)', () => {
  it('returns true when clickedWedge === outlierWedge', () => {
    expect(checkAnswer(2, 2)).toBe(true);
  });

  it('returns false when clickedWedge !== outlierWedge', () => {
    expect(checkAnswer(1, 3)).toBe(false);
  });

  it('returns false for wedge 0 vs wedge 1', () => {
    expect(checkAnswer(0, 1)).toBe(false);
  });

  it('returns true for wedge 5 vs wedge 5', () => {
    expect(checkAnswer(5, 5)).toBe(true);
  });
});

describe('calculateWedgeIndex()', () => {
  const cx = 100;
  const cy = 100;
  const r = 80;
  const wc4 = 4;

  it('click at center returns a valid wedge index (not -1)', () => {
    const idx = calculateWedgeIndex(cx, cy, cx, cy, r, wc4);
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  it('click at (100, 5) returns -1 (outside radius)', () => {
    expect(calculateWedgeIndex(100, 5, cx, cy, r, wc4)).toBe(-1);
  });

  it('click at (200, 200) returns -1 (outside radius)', () => {
    expect(calculateWedgeIndex(200, 200, cx, cy, r, wc4)).toBe(-1);
  });

  it('click at top (100, 25) maps to wedge 0', () => {
    expect(calculateWedgeIndex(100, 25, cx, cy, r, wc4)).toBe(0);
  });

  it('click at right (175, 100) maps to wedge 1', () => {
    expect(calculateWedgeIndex(175, 100, cx, cy, r, wc4)).toBe(1);
  });

  it('click at bottom (100, 175) maps to wedge 2', () => {
    expect(calculateWedgeIndex(100, 175, cx, cy, r, wc4)).toBe(2);
  });

  it('click at left (25, 100) maps to wedge 3', () => {
    expect(calculateWedgeIndex(25, 100, cx, cy, r, wc4)).toBe(3);
  });

  describe('wedgeCount = 6', () => {
    const wc6 = 6;
    // Wedge centers are at angles (in degrees from top, clockwise):
    // wedge 0: 0°, wedge 1: 60°, wedge 2: 120°, wedge 3: 180°, wedge 4: 240°, wedge 5: 300°
    // Points placed 60px from center along each wedge's center angle.
    it('wedge 0: point near top', () => {
      // angle 0° from top = straight up → (cx, cy - 60)
      expect(calculateWedgeIndex(100, 40, cx, cy, r, wc6)).toBe(0);
    });

    it('wedge 1: point at 60° clockwise from top', () => {
      // dx = 60*sin(60°)≈52, dy = -60*cos(60°)=-30 → (152, 70)
      expect(calculateWedgeIndex(152, 70, cx, cy, r, wc6)).toBe(1);
    });

    it('wedge 2: point at 120° clockwise from top', () => {
      // center of wedge 2 is 150° from top; dx=60*sin(150°)=30, dy=-60*cos(150°)≈52 → (130, 152)
      expect(calculateWedgeIndex(130, 152, cx, cy, r, wc6)).toBe(2);
    });

    it('wedge 3: point at 180° clockwise from top (bottom)', () => {
      // dx=0, dy=60 → (100, 160)
      expect(calculateWedgeIndex(100, 160, cx, cy, r, wc6)).toBe(3);
    });

    it('wedge 4: point at 240° clockwise from top', () => {
      // dx = 60*sin(240°)≈-52, dy = -60*cos(240°)=30 → (48, 130)
      expect(calculateWedgeIndex(48, 130, cx, cy, r, wc6)).toBe(4);
    });

    it('wedge 5: point at 300° clockwise from top', () => {
      // center of wedge 5 is 330° from top; dx=60*sin(330°)=-30, dy=-60*cos(330°)≈-52 → (70, 48)
      expect(calculateWedgeIndex(70, 48, cx, cy, r, wc6)).toBe(5);
    });
  });
});

describe('getCurrentDifficulty()', () => {
  it('returns { wedgeCount: 6, displayDurationMs: 2000 } after initGame()', () => {
    expect(getCurrentDifficulty()).toEqual({ wedgeCount: 6, displayDurationMs: 2000 });
  });

  it('returns { wedgeCount: 8, displayDurationMs: 1800 } after 3 addScore() calls', () => {
    addScore();
    addScore();
    addScore();
    expect(getCurrentDifficulty()).toEqual({ wedgeCount: 8, displayDurationMs: 1800 });
  });

  it('returns { wedgeCount: 14, displayDurationMs: 1200 } after 12 addScore() calls', () => {
    for (let i = 0; i < 12; i += 1) addScore();
    expect(getCurrentDifficulty()).toEqual({ wedgeCount: 14, displayDurationMs: 1200 });
  });

  it('returns { wedgeCount: 14, displayDurationMs: 500 } after 30 addScore() calls', () => {
    for (let i = 0; i < 30; i += 1) addScore();
    expect(getCurrentDifficulty()).toEqual({ wedgeCount: 14, displayDurationMs: 500 });
  });
});

describe('isRunning()', () => {
  it('returns false after initGame()', () => {
    expect(isRunning()).toBe(false);
  });
});
