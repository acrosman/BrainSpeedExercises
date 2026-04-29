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
  getForceGoNext,
  getSessionBestScore,
  isRunning,
  IMAGE_KEYS,
  NO_GO_KEY,
  GO_KEYS,
  setGoKeys,
  getSpeedHistory,
  recordGoResponseTime,
  getAverageResponseMs,
} from '../game.js';

/** Default go keys used by the test suite (matches built-in defaults). */
const DEFAULT_GO_KEYS = ['go-1.png', 'go-2.png', 'go-3.png'];

beforeEach(() => {
  initGame();
  // Restore go keys to defaults before each test to prevent cross-test leakage.
  setGoKeys(DEFAULT_GO_KEYS);
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('IMAGE_KEYS / NO_GO_KEY / GO_KEYS', () => {
  it('IMAGE_KEYS contains 4 entries by default', () => {
    expect(IMAGE_KEYS).toHaveLength(4);
  });

  it('IMAGE_KEYS includes the NO_GO_KEY', () => {
    expect(IMAGE_KEYS).toContain(NO_GO_KEY);
  });

  it('NO_GO_KEY equals "no-go"', () => {
    expect(NO_GO_KEY).toBe('no-go');
  });

  it('GO_KEYS contains only go images (excludes NO_GO_KEY)', () => {
    expect(GO_KEYS).not.toContain(NO_GO_KEY);
    expect(GO_KEYS).toHaveLength(IMAGE_KEYS.length - 1);
  });

  it('default GO_KEYS filenames include a .png extension', () => {
    GO_KEYS.forEach((k) => expect(k).toMatch(/\.png$/i));
  });
});

// ── setGoKeys ─────────────────────────────────────────────────────────────────

describe('setGoKeys()', () => {
  it('updates GO_KEYS to the provided array', () => {
    setGoKeys(['a.png', 'b.png']);
    expect(GO_KEYS).toEqual(['a.png', 'b.png']);
  });

  it('updates IMAGE_KEYS to include the new go keys plus NO_GO_KEY', () => {
    setGoKeys(['a.png', 'b.png']);
    expect(IMAGE_KEYS).toEqual(['a.png', 'b.png', NO_GO_KEY]);
  });

  it('pickNextImage() picks from the new keys after setGoKeys()', () => {
    setGoKeys(['custom.png']);
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const { imageKey } = pickNextImage();
    spy.mockRestore();
    expect(imageKey).toBe('custom.png');
  });

  it('does not modify NO_GO_KEY', () => {
    setGoKeys(['x.jpg']);
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
    recordResponse(true, false); // correct response ×3 → level → 1
    recordResponse(true, false);
    recordResponse(true, false);
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
    recordResponse(true, false); // correct no-go — increments consecutiveCorrect
    recordResponse(true, false);
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

  it('resets forceGoNext to false', () => {
    startGame();
    recordResponse(false, false); // wrong go — sets forceGoNext
    stopGame();
    initGame();
    expect(getForceGoNext()).toBe(false);
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

  it('stopGame() returns required fields including level', () => {
    startGame();
    const result = stopGame();
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('noGoHits');
    expect(result).toHaveProperty('misses');
    expect(result).toHaveProperty('trialsCompleted');
    expect(result).toHaveProperty('level');
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
    [0, 'go-1.png', false],
    [0.25, 'go-2.png', false],
    [0.5, 'go-3.png', false],
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

  describe('when forceGoNext is true (after a wrong outcome)', () => {
    it('returns a go image (never the no-go image)', () => {
      recordResponse(false, false); // wrong → forceGoNext = true
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const { isNoGo } = pickNextImage();
      expect(isNoGo).toBe(false);
    });

    it('returns a key from GO_KEYS only', () => {
      recordResponse(false, false); // wrong → forceGoNext = true
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const { imageKey } = pickNextImage();
      expect(GO_KEYS).toContain(imageKey);
    });

    it('clears forceGoNext after being used', () => {
      recordResponse(false, false); // wrong → forceGoNext = true
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      pickNextImage();
      expect(getForceGoNext()).toBe(false);
    });

    it('subsequent pickNextImage() can return no-go again', () => {
      recordResponse(false, false); // wrong → forceGoNext = true
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      pickNextImage(); // consumes forceGoNext
      randomSpy.mockReturnValue(0.75); // next random → no-go index
      const second = pickNextImage();
      expect(second.isNoGo).toBe(true);
    });
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

    it('does not increment consecutiveCorrect (only no-go inhibitions advance the streak)', () => {
      recordResponse(false, true);
      expect(getConsecutiveCorrect()).toBe(0);
    });

    it('does not reset consecutiveWrong (only a correct no-go inhibition resets it)', () => {
      recordResponse(false, false); // wrong first (consecutiveWrong = 1)
      recordResponse(false, true); // correct go — does NOT reset wrong streak
      expect(getConsecutiveWrong()).toBe(1);
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
      recordResponse(true, false); // correct no-go first
      recordResponse(false, false); // now wrong
      expect(getConsecutiveCorrect()).toBe(0);
    });

    it('increments consecutiveWrong', () => {
      recordResponse(false, false);
      expect(getConsecutiveWrong()).toBe(1);
    });

    it('sets forceGoNext to true', () => {
      recordResponse(false, false);
      expect(getForceGoNext()).toBe(true);
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

    it('increments consecutiveCorrect (no-go inhibitions advance the streak)', () => {
      recordResponse(true, false);
      expect(getConsecutiveCorrect()).toBe(1);
    });

    it('does not set forceGoNext', () => {
      recordResponse(true, false);
      expect(getForceGoNext()).toBe(false);
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

    it('sets forceGoNext to true', () => {
      recordResponse(true, true); // wrong no-go (false alarm)
      expect(getForceGoNext()).toBe(true);
    });
  });

  describe('adaptive staircase — level advancement', () => {
    it('level does not advance on two consecutive correct no-go inhibitions', () => {
      recordResponse(true, false); // correct no-go
      recordResponse(true, false); // correct no-go
      expect(getLevel()).toBe(0);
    });

    it('level advances to 1 after 3 consecutive correct no-go inhibitions', () => {
      recordResponse(true, false);
      recordResponse(true, false);
      recordResponse(true, false);
      expect(getLevel()).toBe(1);
    });

    it('correct go responses do not advance the level (only no-go inhibitions count)', () => {
      recordResponse(false, true); // correct go
      recordResponse(false, true);
      recordResponse(false, true);
      expect(getLevel()).toBe(0);
    });

    it('consecutiveCorrect resets to 0 after level advances', () => {
      recordResponse(true, false);
      recordResponse(true, false);
      recordResponse(true, false);
      expect(getConsecutiveCorrect()).toBe(0);
    });

    it('a wrong response breaks the correct streak', () => {
      recordResponse(true, false); // correct no-go
      recordResponse(true, false); // correct no-go
      recordResponse(false, false); // wrong go — breaks streak
      recordResponse(true, false); // correct no-go
      recordResponse(true, false); // correct no-go
      expect(getLevel()).toBe(0);
    });

    it('level advances to 2 after 6 consecutive correct no-go inhibitions', () => {
      for (let i = 0; i < 6; i += 1) recordResponse(true, false);
      expect(getLevel()).toBe(2);
    });
  });

  describe('adaptive staircase — level drop', () => {
    it('level does not drop on first or second consecutive wrong', () => {
      // First reach level 2 with no-go correct responses
      for (let i = 0; i < 6; i += 1) recordResponse(true, false);
      recordResponse(false, false);
      expect(getLevel()).toBe(2);
      recordResponse(false, false);
      expect(getLevel()).toBe(2);
    });

    it('level drops by 2 after 3 consecutive wrong responses', () => {
      for (let i = 0; i < 6; i += 1) recordResponse(true, false); // level → 2
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
      for (let i = 0; i < 6; i += 1) recordResponse(true, false); // level → 2
      recordResponse(false, false);
      recordResponse(false, false);
      recordResponse(false, false); // drop; wrong counter resets
      recordResponse(false, false);
      recordResponse(false, false);
      expect(getConsecutiveWrong()).toBe(2);
    });

    it('a correct no-go inhibition resets the wrong streak', () => {
      for (let i = 0; i < 6; i += 1) recordResponse(true, false); // level → 2
      recordResponse(false, false); // miss, consecutiveWrong = 1
      recordResponse(false, false); // miss, consecutiveWrong = 2
      recordResponse(true, false); // correct no-go inhibition — resets wrong streak
      recordResponse(false, false); // miss, consecutiveWrong = 1
      recordResponse(false, false); // miss, consecutiveWrong = 2
      expect(getLevel()).toBe(2); // no drop (only 2 wrong since last correct no-go)
    });

    it('a correct go response does not reset the wrong streak', () => {
      for (let i = 0; i < 6; i += 1) recordResponse(true, false); // level → 2
      recordResponse(false, false); // miss, consecutiveWrong = 1
      recordResponse(false, false); // miss, consecutiveWrong = 2
      recordResponse(false, true); // correct go — does NOT reset wrong streak
      recordResponse(false, false); // miss, consecutiveWrong = 3 → level drops to 0
      expect(getLevel()).toBe(0);
    });

    it('3 false alarms with correct forced-go responses between them cause a level drop', () => {
      for (let i = 0; i < 6; i += 1) recordResponse(true, false); // level → 2
      recordResponse(true, true); // false alarm, consecutiveWrong = 1
      recordResponse(false, true); // correct forced go — does NOT reset wrong streak
      recordResponse(true, true); // false alarm, consecutiveWrong = 2
      recordResponse(false, true); // correct forced go — does NOT reset wrong streak
      recordResponse(true, true); // false alarm, consecutiveWrong = 3 → level drops
      expect(getLevel()).toBe(0);
    });
  });
});

// ── getCurrentIntervalMs ──────────────────────────────────────────────────────

describe('getCurrentIntervalMs()', () => {
  it('returns 1500 at level 0', () => {
    expect(getCurrentIntervalMs()).toBe(1500);
  });

  it('returns 1320 at level 1 (after 3 correct no-go inhibitions)', () => {
    recordResponse(true, false);
    recordResponse(true, false);
    recordResponse(true, false);
    expect(getCurrentIntervalMs()).toBe(1320); // Math.round(1500 * 0.88)
  });

  it('returns 150 at a high level (floor clamped)', () => {
    // 3 no-go correct per level; floor is reached at level 19 (Math.round(1500 * 0.88^19) < 150)
    for (let i = 0; i < 57; i += 1) recordResponse(true, false);
    expect(getCurrentIntervalMs()).toBe(150);
  });

  it('never returns less than 150 ms regardless of level', () => {
    // Simulate many correct no-go inhibitions.
    for (let i = 0; i < 300; i += 1) recordResponse(true, false);
    expect(getCurrentIntervalMs()).toBeGreaterThanOrEqual(150);
  });
});

// ── getForceGoNext ────────────────────────────────────────────────────────────

describe('getForceGoNext()', () => {
  it('returns false initially', () => {
    expect(getForceGoNext()).toBe(false);
  });

  it('returns true after a wrong go response', () => {
    recordResponse(false, false);
    expect(getForceGoNext()).toBe(true);
  });

  it('returns true after a wrong no-go response (false alarm)', () => {
    recordResponse(true, true);
    expect(getForceGoNext()).toBe(true);
  });

  it('returns false after a correct no-go response', () => {
    recordResponse(true, false);
    expect(getForceGoNext()).toBe(false);
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

// ── getSpeedHistory ───────────────────────────────────────────────────────────

describe('getSpeedHistory()', () => {
  it('appends an entry after recordResponse', () => {
    startGame();
    recordResponse(false, true);
    const history = getSpeedHistory();
    expect(history).toHaveLength(1);
    expect(typeof history[0]).toBe('number');
  });

  it('returns a copy so external mutations do not affect state', () => {
    startGame();
    recordResponse(false, true);
    const h = getSpeedHistory();
    h.pop();
    expect(getSpeedHistory()).toHaveLength(1);
  });

  it('resets to empty after initGame', () => {
    startGame();
    recordResponse(false, true);
    initGame();
    expect(getSpeedHistory()).toEqual([]);
  });
});

// ── recordGoResponseTime / getAverageResponseMs ───────────────────────────────

describe('getAverageResponseMs()', () => {
  it('returns null when no go response times have been recorded', () => {
    expect(getAverageResponseMs()).toBeNull();
  });

  it('returns the single recorded value when only one response has been recorded', () => {
    recordGoResponseTime(400);
    expect(getAverageResponseMs()).toBe(400);
  });

  it('returns the rounded average of multiple recorded times', () => {
    recordGoResponseTime(300);
    recordGoResponseTime(500);
    expect(getAverageResponseMs()).toBe(400);
  });

  it('rounds to the nearest millisecond', () => {
    recordGoResponseTime(300);
    recordGoResponseTime(301);
    expect(getAverageResponseMs()).toBe(301); // Math.round(601 / 2) = 301 (rounds down 300.5)
  });

  it('resets to null after initGame()', () => {
    recordGoResponseTime(350);
    initGame();
    expect(getAverageResponseMs()).toBeNull();
  });
});

describe('recordGoResponseTime()', () => {
  it('accumulates response times so each additional entry changes the average', () => {
    recordGoResponseTime(200);
    expect(getAverageResponseMs()).toBe(200);
    recordGoResponseTime(400);
    expect(getAverageResponseMs()).toBe(300);
  });

  it('accepts any non-negative value including 0', () => {
    recordGoResponseTime(0);
    expect(getAverageResponseMs()).toBe(0);
  });
});
