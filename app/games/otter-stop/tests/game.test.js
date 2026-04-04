/** @jest-environment node */
import {
  describe, it, expect, beforeEach, afterEach, jest,
} from '@jest/globals';
import {
  initGame,
  startGame,
  stopGame,
  pickNextImage,
  recordResponse,
  getCurrentIntervalMs,
  getScore,
  getNoGoHits,
  getMisses,
  getTrialsCompleted,
  getLevel,
  getConsecutiveCorrect,
  getConsecutiveWrong,
  getSessionBestScore,
  isRunning,
  IMAGE_KEYS,
  NO_GO_KEY,
} from '../game.js';

beforeEach(() => {
  initGame();
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('IMAGE_KEYS / NO_GO_KEY', () => {
  it('IMAGE_KEYS contains 4 entries', () => {
    expect(IMAGE_KEYS).toHaveLength(4);
  });

  it('IMAGE_KEYS includes the NO_GO_KEY', () => {
    expect(IMAGE_KEYS).toContain(NO_GO_KEY);
  });

  it('NO_GO_KEY equals "no-go"', () => {
    expect(NO_GO_KEY).toBe('no-go');
  });
});

// ── initGame ──────────────────────────────────────────────────────────────────

describe('initGame()', () => {
  it('resets score to 0', () => {
    startGame();
    recordResponse(false, true); // correct go
    stopGame();
    initGame();
    expect(getScore()).toBe(0);
  });

  it('resets noGoHits to 0', () => {
    startGame();
    recordResponse(true, true); // wrong no-go
    stopGame();
    initGame();
    expect(getNoGoHits()).toBe(0);
  });

  it('resets misses to 0', () => {
    startGame();
    recordResponse(false, false); // miss
    stopGame();
    initGame();
    expect(getMisses()).toBe(0);
  });

  it('resets trialsCompleted to 0', () => {
    startGame();
    recordResponse(false, true);
    stopGame();
    initGame();
    expect(getTrialsCompleted()).toBe(0);
  });

  it('resets level to 0', () => {
    startGame();
    recordResponse(false, true);
    recordResponse(false, true);
    recordResponse(false, true); // level advances to 1
    stopGame();
    initGame();
    expect(getLevel()).toBe(0);
  });

  it('resets running to false', () => {
    startGame();
    initGame();
    expect(isRunning()).toBe(false);
  });

  it('resets consecutiveCorrect to 0', () => {
    startGame();
    recordResponse(false, true);
    recordResponse(false, true);
    stopGame();
    initGame();
    expect(getConsecutiveCorrect()).toBe(0);
  });

  it('resets consecutiveWrong to 0', () => {
    startGame();
    recordResponse(false, false);
    stopGame();
    initGame();
    expect(getConsecutiveWrong()).toBe(0);
  });
});

// ── startGame / stopGame ──────────────────────────────────────────────────────

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

  it('startGame() throws when already running', () => {
    startGame();
    expect(() => startGame()).toThrow('Game is already running.');
  });

  it('stopGame() throws when not running', () => {
    expect(() => stopGame()).toThrow('Game is not running.');
  });

  it('stopGame() returns score, noGoHits, misses, trialsCompleted, duration, bestScore', () => {
    startGame();
    const result = stopGame();
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('noGoHits');
    expect(result).toHaveProperty('misses');
    expect(result).toHaveProperty('trialsCompleted');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('bestScore');
  });

  it('stopGame() duration is a non-negative number', () => {
    startGame();
    const { duration } = stopGame();
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('stopGame() returns the current score in the result', () => {
    startGame();
    recordResponse(false, true); // go + pressed = correct
    const result = stopGame();
    expect(result.score).toBe(1);
  });
});

// ── pickNextImage ─────────────────────────────────────────────────────────────

describe('pickNextImage()', () => {
  let randomSpy;

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it.each([
    [0, 'go-1', false],
    [0.25, 'go-2', false],
    [0.5, 'go-3', false],
    [0.75, 'no-go', true],
  ])('Math.random()=%f → imageKey="%s", isNoGo=%s', (rand, expectedKey, expectedIsNoGo) => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(rand);
    const result = pickNextImage();
    expect(result.imageKey).toBe(expectedKey);
    expect(result.isNoGo).toBe(expectedIsNoGo);
  });

  it('always returns an imageKey that is in IMAGE_KEYS', () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { imageKey } = pickNextImage();
    expect(IMAGE_KEYS).toContain(imageKey);
  });

  it('returns isNoGo=true only when the selected key is NO_GO_KEY', () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const { imageKey, isNoGo } = pickNextImage();
    expect(isNoGo).toBe(imageKey === NO_GO_KEY);
  });
});

// ── recordResponse ────────────────────────────────────────────────────────────

describe('recordResponse()', () => {
  describe('go + Space pressed (correct)', () => {
    it('returns "correct"', () => {
      expect(recordResponse(false, true)).toBe('correct');
    });

    it('increments score by 1', () => {
      recordResponse(false, true);
      expect(getScore()).toBe(1);
    });

    it('increments trialsCompleted', () => {
      recordResponse(false, true);
      expect(getTrialsCompleted()).toBe(1);
    });

    it('does not increment noGoHits', () => {
      recordResponse(false, true);
      expect(getNoGoHits()).toBe(0);
    });

    it('does not increment misses', () => {
      recordResponse(false, true);
      expect(getMisses()).toBe(0);
    });

    it('increments consecutiveCorrect', () => {
      recordResponse(false, true);
      expect(getConsecutiveCorrect()).toBe(1);
    });

    it('resets consecutiveWrong to 0', () => {
      recordResponse(false, false); // wrong first
      recordResponse(false, true); // now correct
      expect(getConsecutiveWrong()).toBe(0);
    });
  });

  describe('go + no press (miss / wrong)', () => {
    it('returns "wrong"', () => {
      expect(recordResponse(false, false)).toBe('wrong');
    });

    it('does not increment score', () => {
      recordResponse(false, false);
      expect(getScore()).toBe(0);
    });

    it('increments misses by 1', () => {
      recordResponse(false, false);
      expect(getMisses()).toBe(1);
    });

    it('does not increment noGoHits', () => {
      recordResponse(false, false);
      expect(getNoGoHits()).toBe(0);
    });

    it('resets consecutiveCorrect to 0', () => {
      recordResponse(false, true); // correct first
      recordResponse(false, false); // now wrong
      expect(getConsecutiveCorrect()).toBe(0);
    });

    it('increments consecutiveWrong', () => {
      recordResponse(false, false);
      expect(getConsecutiveWrong()).toBe(1);
    });
  });

  describe('no-go + no press (correct inhibition)', () => {
    it('returns "correct"', () => {
      expect(recordResponse(true, false)).toBe('correct');
    });

    it('increments score', () => {
      recordResponse(true, false);
      expect(getScore()).toBe(1);
    });

    it('does not increment noGoHits', () => {
      recordResponse(true, false);
      expect(getNoGoHits()).toBe(0);
    });

    it('does not increment misses', () => {
      recordResponse(true, false);
      expect(getMisses()).toBe(0);
    });
  });

  describe('no-go + Space pressed (false alarm / wrong)', () => {
    it('returns "wrong"', () => {
      expect(recordResponse(true, true)).toBe('wrong');
    });

    it('does not increment score', () => {
      recordResponse(true, true);
      expect(getScore()).toBe(0);
    });

    it('increments noGoHits by 1', () => {
      recordResponse(true, true);
      expect(getNoGoHits()).toBe(1);
    });

    it('does not increment misses', () => {
      recordResponse(true, true);
      expect(getMisses()).toBe(0);
    });
  });

  describe('adaptive staircase — level advancement', () => {
    it('level does not advance until 3 consecutive correct responses', () => {
      recordResponse(false, true);
      recordResponse(false, true);
      expect(getLevel()).toBe(0);
    });

    it('level advances to 1 after 3 consecutive correct responses', () => {
      recordResponse(false, true);
      recordResponse(false, true);
      recordResponse(false, true);
      expect(getLevel()).toBe(1);
    });

    it('consecutiveCorrect resets to 0 after level advances', () => {
      recordResponse(false, true);
      recordResponse(false, true);
      recordResponse(false, true);
      expect(getConsecutiveCorrect()).toBe(0);
    });

    it('a wrong response breaks the correct streak', () => {
      recordResponse(false, true);
      recordResponse(false, true);
      recordResponse(false, false); // wrong — breaks streak
      recordResponse(false, true);
      recordResponse(false, true);
      expect(getLevel()).toBe(0);
    });

    it('level advances to 2 after 6 consecutive correct responses', () => {
      for (let i = 0; i < 6; i += 1) recordResponse(false, true);
      expect(getLevel()).toBe(2);
    });
  });

  describe('adaptive staircase — level drop', () => {
    it('level does not drop on first or second consecutive wrong', () => {
      // First reach level 2
      for (let i = 0; i < 6; i += 1) recordResponse(false, true);
      recordResponse(false, false);
      expect(getLevel()).toBe(2);
      recordResponse(false, false);
      expect(getLevel()).toBe(2);
    });

    it('level drops by 2 after 3 consecutive wrong responses', () => {
      for (let i = 0; i < 6; i += 1) recordResponse(false, true); // level → 2
      recordResponse(false, false);
      recordResponse(false, false);
      recordResponse(false, false); // 3 consecutive wrong → level 0
      expect(getLevel()).toBe(0);
    });

    it('level does not drop below 0', () => {
      recordResponse(false, false);
      recordResponse(false, false);
      recordResponse(false, false);
      expect(getLevel()).toBe(0);
    });

    it('consecutiveWrong resets after a level drop', () => {
      for (let i = 0; i < 6; i += 1) recordResponse(false, true); // level → 2
      recordResponse(false, false);
      recordResponse(false, false);
      recordResponse(false, false); // drop; wrong counter resets
      recordResponse(false, false);
      recordResponse(false, false);
      expect(getConsecutiveWrong()).toBe(2);
    });

    it('a correct response resets the wrong streak', () => {
      for (let i = 0; i < 6; i += 1) recordResponse(false, true); // level → 2
      recordResponse(false, false);
      recordResponse(false, false);
      recordResponse(false, true); // correct — resets wrong streak
      recordResponse(false, false);
      recordResponse(false, false);
      expect(getLevel()).toBe(2); // no drop
    });
  });
});

// ── getCurrentIntervalMs ──────────────────────────────────────────────────────

describe('getCurrentIntervalMs()', () => {
  it('returns 700 at level 0', () => {
    expect(getCurrentIntervalMs()).toBe(700);
  });

  it('returns 650 at level 1 (after 3 correct)', () => {
    recordResponse(false, true);
    recordResponse(false, true);
    recordResponse(false, true);
    expect(getCurrentIntervalMs()).toBe(650);
  });

  it('returns 150 at a high level (floor clamped)', () => {
    // 3 correct per level, need level 11 → (700 - 11*50 = 150)
    for (let i = 0; i < 33; i += 1) recordResponse(false, true);
    expect(getCurrentIntervalMs()).toBe(150);
  });

  it('never returns less than 150 ms regardless of level', () => {
    // Simulate many correct responses
    for (let i = 0; i < 300; i += 1) recordResponse(false, true);
    expect(getCurrentIntervalMs()).toBeGreaterThanOrEqual(150);
  });
});

// ── getSessionBestScore ───────────────────────────────────────────────────────

describe('getSessionBestScore()', () => {
  it('tracks the highest score achieved across stopGame() calls', () => {
    startGame();
    recordResponse(false, true);
    recordResponse(false, true);
    stopGame();
    initGame();
    expect(getSessionBestScore()).toBeGreaterThanOrEqual(2);
  });
});

// ── isRunning ─────────────────────────────────────────────────────────────────

describe('isRunning()', () => {
  it('returns false after initGame()', () => {
    expect(isRunning()).toBe(false);
  });

  it('returns true after startGame()', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  it('returns false after stopGame()', () => {
    startGame();
    stopGame();
    expect(isRunning()).toBe(false);
  });
});
