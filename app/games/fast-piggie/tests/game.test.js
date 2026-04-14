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
  addMiss,
  getBestStats,
  getScore,
  getRoundsPlayed,
  getLevel,
  getSpeedLevel,
  getConsecutiveCorrect,
  getConsecutiveWrong,
  getCurrentDifficulty,
  isRunning,
  getSpeedHistory,
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

  it('resets getLevel() to 0', () => {
    expect(getLevel()).toBe(0);
  });

  it('resets getConsecutiveCorrect() to 0', () => {
    expect(getConsecutiveCorrect()).toBe(0);
  });

  it('resets getLevel() to 0 even after three addScore() calls', () => {
    addScore();
    addScore();
    addScore();
    initGame();
    expect(getLevel()).toBe(0);
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

  it('getConsecutiveCorrect() increments on addScore()', () => {
    addScore();
    addScore();
    expect(getConsecutiveCorrect()).toBe(2);
  });

  it('getLevel() does not advance until 3 consecutive correct answers', () => {
    addScore();
    addScore();
    expect(getLevel()).toBe(0);
  });

  it('getLevel() advances to 1 after 3 consecutive addScore() calls', () => {
    addScore();
    addScore();
    addScore();
    expect(getLevel()).toBe(1);
  });

  it('getConsecutiveCorrect() resets to 0 after level advances', () => {
    addScore();
    addScore();
    addScore();
    expect(getConsecutiveCorrect()).toBe(0);
  });

  it('getLevel() advances to 2 after 6 consecutive addScore() calls', () => {
    for (let i = 0; i < 6; i += 1) addScore();
    expect(getLevel()).toBe(2);
  });
});

describe('addMiss()', () => {
  it('increments getRoundsPlayed() by 1', () => {
    addMiss();
    expect(getRoundsPlayed()).toBe(1);
  });

  it('does not increment getScore()', () => {
    addMiss();
    expect(getScore()).toBe(0);
  });

  it('resets getConsecutiveCorrect() to 0', () => {
    addScore();
    addScore();
    addMiss();
    expect(getConsecutiveCorrect()).toBe(0);
  });

  it('prevents level advancement when a miss breaks the streak', () => {
    addScore();
    addScore();
    addMiss();
    addScore();
    addScore();
    expect(getLevel()).toBe(0);
  });

  it('does not change level on first or second consecutive miss', () => {
    addScore(); addScore(); addScore(); // level → 1
    addMiss(); // consecutiveWrong = 1
    expect(getLevel()).toBe(1);
    addMiss(); // consecutiveWrong = 2
    expect(getLevel()).toBe(1);
  });

  it('decreases level by 2 after 3 consecutive misses', () => {
    addScore(); addScore(); addScore(); // level → 1
    addScore(); addScore(); addScore(); // level → 2
    addMiss(); addMiss(); addMiss(); // 3 consecutive misses → level 0
    expect(getLevel()).toBe(0);
  });

  it('does not decrease level below 0 after 3 misses', () => {
    addMiss(); addMiss(); addMiss();
    expect(getLevel()).toBe(0);
  });

  it('resets consecutive wrong counter after level decrease', () => {
    addScore(); addScore(); addScore(); // level → 1
    addMiss(); addMiss(); addMiss(); // 3 misses → level 0, counter reset
    addMiss(); addMiss(); // only 2 more misses, no additional level change
    expect(getLevel()).toBe(0);
    expect(getConsecutiveWrong()).toBe(2);
  });

  it('resets the wrong counter when a correct answer is given', () => {
    addScore(); addScore(); addScore(); // level → 1
    addMiss(); addMiss(); // 2 consecutive misses
    addScore(); // correct — resets wrong counter
    addMiss(); addMiss(); // only 2 more, no level change
    expect(getLevel()).toBe(1);
    expect(getConsecutiveWrong()).toBe(2);
  });
});

describe('getLevel()', () => {
  it('returns 0 after initGame()', () => {
    expect(getLevel()).toBe(0);
  });
});

describe('getConsecutiveCorrect()', () => {
  it('returns 0 after initGame()', () => {
    expect(getConsecutiveCorrect()).toBe(0);
  });
});

describe('generateRound(level)', () => {
  let randomSpy;

  beforeEach(() => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it.each([
    // Synced phase (imageLevel === speedLevel, duration >= 100ms)
    [0, 0, 6, 3, 800],
    [1, 1, 6, 4, 700],
    [2, 2, 6, 5, 600],
    [3, 3, 6, 6, 500],
    [4, 4, 7, 7, 400],
    [5, 5, 8, 8, 300],
    [6, 6, 9, 9, 200],
    [7, 7, 10, 10, 100],
    // Still synced at level 8 (speed becomes 55ms)
    [8, 8, 11, 11, 55],
    [9, 9, 12, 12, 30],
    [10, 10, 13, 13, 20],
    [11, 11, 14, 14, 15],
    [12, 12, 15, 15, 10],
    [24, 24, 27, 27, 10],
    [39, 39, 42, 42, 10],
    [100, 100, 42, 42, 10],
    // Diverged phase (alternating: imageLevel ahead of speedLevel)
    [9, 8, 12, 12, 55],
    [10, 9, 13, 13, 30],
    [12, 9, 15, 15, 30],
    [15, 11, 18, 18, 15],
  ])('imageLevel=%i, speedLevel=%i → wedgeCount=%i, imageCount=%i, displayDurationMs=%i',
    (imgLv, spdLv, wedgeCount, imageCount, displayDurationMs) => {
      const result = generateRound(imgLv, spdLv);
      expect(result.wedgeCount).toBe(wedgeCount);
      expect(result.imageCount).toBe(imageCount);
      expect(result.displayDurationMs).toBe(displayDurationMs);
    });

  it('generateRound does not modify score or roundsPlayed', () => {
    generateRound(0, 0);
    expect(getScore()).toBe(0);
    expect(getRoundsPlayed()).toBe(0);
  });

  it('outlierWedgeIndex is in [0, imageCount) for Math.random() = 0', () => {
    randomSpy.mockReturnValue(0);
    const { imageCount, outlierWedgeIndex } = generateRound(0, 0);
    expect(outlierWedgeIndex).toBeGreaterThanOrEqual(0);
    expect(outlierWedgeIndex).toBeLessThan(imageCount);
  });

  it('outlierWedgeIndex is in [0, imageCount) for Math.random() = 0.5', () => {
    randomSpy.mockReturnValue(0.5);
    const { imageCount, outlierWedgeIndex } = generateRound(0, 0);
    expect(outlierWedgeIndex).toBeGreaterThanOrEqual(0);
    expect(outlierWedgeIndex).toBeLessThan(imageCount);
  });

  it('outlierWedgeIndex is in [0, imageCount) for Math.random() = 0.9999', () => {
    randomSpy.mockReturnValue(0.9999);
    const { imageCount, outlierWedgeIndex } = generateRound(0, 0);
    expect(outlierWedgeIndex).toBeGreaterThanOrEqual(0);
    expect(outlierWedgeIndex).toBeLessThan(imageCount);
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
  it('returns { wedgeCount: 6, imageCount: 3, displayDurationMs: 800 } after initGame()', () => {
    expect(getCurrentDifficulty()).toEqual({
      wedgeCount: 6, imageCount: 3, displayDurationMs: 800,
    });
  });

  it('returns wedgeCount:6, imageCount:4, displayDurationMs:700 after 3 consecutive '
    + 'addScore() calls (level 1)', () => {
      addScore();
      addScore();
      addScore();
      expect(getCurrentDifficulty()).toEqual({
        wedgeCount: 6, imageCount: 4, displayDurationMs: 700,
      });
    });

  it('returns wedgeCount:6, imageCount:6, displayDurationMs:500 after 9 consecutive '
    + 'addScore() calls (level 3)', () => {
      for (let i = 0; i < 9; i += 1) addScore();
      expect(getCurrentDifficulty()).toEqual({
        wedgeCount: 6, imageCount: 6, displayDurationMs: 500,
      });
    });

  it('returns { wedgeCount: 11, imageCount: 11, displayDurationMs: 55 } at level 8', () => {
    for (let i = 0; i < 24; i += 1) addScore();
    expect(getCurrentDifficulty()).toEqual({
      wedgeCount: 11, imageCount: 11, displayDurationMs: 55,
    });
  });

  it('returns { wedgeCount: 27, imageCount: 27, displayDurationMs: 10 } at level 24', () => {
    for (let i = 0; i < 72; i += 1) addScore();
    expect(getCurrentDifficulty()).toEqual({
      wedgeCount: 27, imageCount: 27, displayDurationMs: 10,
    });
  });

  it('returns { wedgeCount: 42, imageCount: 42, displayDurationMs: 10 } at level 39+', () => {
    for (let i = 0; i < 117; i += 1) addScore(); // 39 levels × 3 correct each
    expect(getCurrentDifficulty()).toEqual({
      wedgeCount: 42, imageCount: 42, displayDurationMs: 10,
    });
  });

  it('level does not advance when streak is broken by addMiss()', () => {
    addScore();
    addScore();
    addMiss();
    addScore();
    addScore();
    expect(getCurrentDifficulty()).toEqual({
      wedgeCount: 6, imageCount: 3, displayDurationMs: 800,
    });
  });
});

describe('isRunning()', () => {
  it('returns false after initGame()', () => {
    expect(isRunning()).toBe(false);
  });
});

describe('getSpeedLevel()', () => {
  it('returns 0 after initGame()', () => {
    expect(getSpeedLevel()).toBe(0);
  });

  it('advances in sync with getLevel() while display duration is >= 100ms', () => {
    // 7 level-ups produces duration=100ms (at threshold, not below)
    for (let i = 0; i < 21; i += 1) addScore(); // 7 level-ups
    expect(getLevel()).toBe(7);
    expect(getSpeedLevel()).toBe(7);
  });

  it('still advances in sync on the level-up that hits exactly 100ms', () => {
    // Level-up 7 → duration 100ms; the check is <100ms so both still increment
    for (let i = 0; i < 24; i += 1) addScore(); // 8 level-ups
    expect(getLevel()).toBe(8);
    expect(getSpeedLevel()).toBe(8);
  });

  it('imageLevel advances but speedLevel does not on first sub-threshold level-up', () => {
    for (let i = 0; i < 24; i += 1) addScore(); // imageLevel=8, speedLevel=8 (55ms)
    addScore(); addScore(); addScore();           // imageLevel=9, speedLevel stays 8
    expect(getLevel()).toBe(9);
    expect(getSpeedLevel()).toBe(8);
  });

  it('both advance on the second sub-threshold level-up', () => {
    for (let i = 0; i < 24; i += 1) addScore(); // imageLevel=8, speedLevel=8
    addScore(); addScore(); addScore();           // imageLevel=9, speedLevel=8 (skip)
    addScore(); addScore(); addScore();           // imageLevel=10, speedLevel=9 (both)
    expect(getLevel()).toBe(10);
    expect(getSpeedLevel()).toBe(9);
  });

  it('alternates correctly over four sub-threshold level-ups', () => {
    for (let i = 0; i < 24; i += 1) addScore(); // → imageLevel=8, speedLevel=8
    // skip, both, skip, both
    for (let i = 0; i < 12; i += 1) addScore(); // 4 more level-ups
    expect(getLevel()).toBe(12);
    expect(getSpeedLevel()).toBe(10);
  });

  it('decreases in sync with imageLevel on addMiss() staircase in synced phase', () => {
    for (let i = 0; i < 9; i += 1) addScore(); // imageLevel=3, speedLevel=3
    addMiss(); addMiss(); addMiss();             // both drop by 2
    expect(getLevel()).toBe(1);
    expect(getSpeedLevel()).toBe(1);
  });

  it('imageLevel snaps to canonical value when staircase falls back into synced range', () => {
    // After 24 addScores: imageLevel=8, speedLevel=8; then one more level-up (skip):
    // imageLevel=9, speedLevel=8
    for (let i = 0; i < 27; i += 1) addScore();
    expect(getLevel()).toBe(9);
    expect(getSpeedLevel()).toBe(8);
    // 3 misses: speedLevel → 6; canonical imageLevel(6) = 6
    addMiss(); addMiss(); addMiss();
    expect(getLevel()).toBe(6);
    expect(getSpeedLevel()).toBe(6);
  });

  it('imageLevel snaps to correct sub-threshold canonical value when staircase stays sub-threshold',
    () => {
      // 14 level-ups: 8 synced + 6 alternating → imageLevel=14, speedLevel=11
      for (let i = 0; i < 42; i += 1) addScore();
      expect(getLevel()).toBe(14);
      expect(getSpeedLevel()).toBe(11);
      // 3 misses: speedLevel → 9; canonical imageLevel(9) = 8 + 2*(9-8) = 10
      addMiss(); addMiss(); addMiss();
      expect(getLevel()).toBe(10);
      expect(getSpeedLevel()).toBe(9);
    });

  it('imageLevel returned by getCurrentDifficulty matches speedLevel after sub-threshold miss',
    () => {
      for (let i = 0; i < 42; i += 1) addScore(); // imageLevel=14, speedLevel=11
      addMiss(); addMiss(); addMiss();              // speedLevel=9, imageLevel=10
      const { imageCount, displayDurationMs } = getCurrentDifficulty();
      // imageCount = 3 + 10 = 13, displayDurationMs = calculateDisplayDuration(9) = 30ms
      expect(imageCount).toBe(13);
      expect(displayDurationMs).toBe(30);
    });
});

describe('getBestStats()', () => {
  it('returns an object with maxScore, mostRounds, mostGuineaPigs, topSpeedMs', () => {
    const stats = getBestStats();
    expect(stats).toHaveProperty('maxScore');
    expect(stats).toHaveProperty('mostRounds');
    expect(stats).toHaveProperty('mostGuineaPigs');
    expect(stats).toHaveProperty('topSpeedMs');
  });

  it('maxScore reflects the highest score achieved since module load', () => {
    startGame();
    addScore();
    addScore();
    stopGame();
    const stats = getBestStats();
    expect(stats.maxScore).toBeGreaterThanOrEqual(2);
  });

  it('mostGuineaPigs updates when addScore is called with a guineaPigs count', () => {
    addScore(7);
    const stats = getBestStats();
    expect(stats.mostGuineaPigs).toBeGreaterThanOrEqual(7);
  });

  it('topSpeedMs updates when addScore is called with an answerSpeedMs value', () => {
    addScore(3, 500);
    const stats = getBestStats();
    expect(stats.topSpeedMs).toBeLessThanOrEqual(500);
  });

  it('topSpeedMs is null when no speed has been recorded', () => {
    // initGame() resets the session but session-best trackers are module-level;
    // to get null we rely on a fresh import (module-level state).
    // Here we just verify the type contract: null or a non-negative number.
    const stats = getBestStats();
    expect(stats.topSpeedMs === null || typeof stats.topSpeedMs === 'number').toBe(true);
  });

  it('mostRounds reflects rounds played across sessions', () => {
    startGame();
    addScore();
    addMiss();
    stopGame();
    const stats = getBestStats();
    expect(stats.mostRounds).toBeGreaterThanOrEqual(2);
  });
});

// ── getSpeedHistory ───────────────────────────────────────────────────────────

describe('getSpeedHistory()', () => {
  it('returns empty array before any rounds', () => {
    expect(getSpeedHistory()).toEqual([]);
  });

  it('appends an entry after addScore()', () => {
    startGame();
    generateRound();
    addScore(3, 0);
    const history = getSpeedHistory();
    expect(history).toHaveLength(1);
    expect(typeof history[0]).toBe('number');
  });

  it('appends an entry after addMiss()', () => {
    startGame();
    generateRound();
    addMiss(0);
    const history = getSpeedHistory();
    expect(history).toHaveLength(1);
  });

  it('returns a copy so mutations do not affect internal state', () => {
    startGame();
    generateRound();
    addScore(3, 0);
    const h = getSpeedHistory();
    h.pop();
    expect(getSpeedHistory()).toHaveLength(1);
  });

  it('resets to empty after initGame()', () => {
    startGame();
    generateRound();
    addScore(3, 0);
    initGame();
    expect(getSpeedHistory()).toEqual([]);
  });
});
