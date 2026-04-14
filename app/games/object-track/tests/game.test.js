/** @jest-environment node */
/**
 * game.test.js — Unit tests for Object Track game.js
 *
 * Covers 100% of exported functions with pure-logic tests (no DOM).
 */

import {
  describe, it, expect, beforeEach,
} from '@jest/globals';

import {
  MIN_LEVEL,
  CORRECT_TO_ADVANCE,
  WRONG_TO_DROP,
  LEVELS_TO_DROP,
  MIN_TRACKING_DURATION_MS,
  MAX_TRACKING_DURATION_MS,
  CIRCLE_RADIUS,
  MIN_SPAWN_GAP,
  MAX_SPAWN_ATTEMPTS,
  getLevelConfig,
  circlesOverlap,
  createCircles,
  selectTargets,
  updateCirclePositions,
  resolveCircleCollisions,
  evaluateResponse,
  recordRoundResult,
  initRound,
  tickPhysics,
  getCurrentCircles,
  initGame,
  startGame,
  stopGame,
  isRunning,
  getLevel,
  getScore,
  getConsecutiveCorrect,
  getConsecutiveWrong,
  getRoundsPlayed,
  getSpeedHistory,
} from '../game.js';

beforeEach(() => {
  initGame();
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('MIN_LEVEL is 0', () => expect(MIN_LEVEL).toBe(0));
  it('CORRECT_TO_ADVANCE is 3', () => expect(CORRECT_TO_ADVANCE).toBe(3));
  it('WRONG_TO_DROP is 3', () => expect(WRONG_TO_DROP).toBe(3));
  it('LEVELS_TO_DROP is 2', () => expect(LEVELS_TO_DROP).toBe(2));
  it('MIN_TRACKING_DURATION_MS is 5000', () => expect(MIN_TRACKING_DURATION_MS).toBe(5000));
  it('MAX_TRACKING_DURATION_MS is 10000', () => expect(MAX_TRACKING_DURATION_MS).toBe(10000));
  it('CIRCLE_RADIUS is 30', () => expect(CIRCLE_RADIUS).toBe(30));
  it('MIN_SPAWN_GAP is 10', () => expect(MIN_SPAWN_GAP).toBe(10));
  it('MAX_SPAWN_ATTEMPTS is 200', () => expect(MAX_SPAWN_ATTEMPTS).toBe(200));
});

// ── getLevelConfig ────────────────────────────────────────────────────────────

describe('getLevelConfig', () => {
  it('returns correct values for level 0', () => {
    expect(getLevelConfig(0)).toEqual({
      numCircles: 8,
      numTargets: 3,
      speedPxPerSec: 150,
      trackingDurationMs: 5000,
    });
  });

  it('level 3: numCircles increases to 9', () => {
    const cfg = getLevelConfig(3);
    expect(cfg.numCircles).toBe(9);
  });

  it('level 5: numTargets increases to 4', () => {
    const cfg = getLevelConfig(5);
    expect(cfg.numTargets).toBe(4);
  });

  it('level 18: numCircles is capped at 14', () => {
    // 8 + floor(18/3) = 8 + 6 = 14, which hits the cap
    const cfg = getLevelConfig(18);
    expect(cfg.numCircles).toBe(14);
  });

  it('level 20: numTargets capped at 6 and trackingDurationMs capped at 10000', () => {
    const cfg = getLevelConfig(20);
    expect(cfg.numTargets).toBe(6);
    expect(cfg.trackingDurationMs).toBe(10000);
  });

  it('speed increases with level', () => {
    expect(getLevelConfig(1).speedPxPerSec).toBe(165);
    expect(getLevelConfig(10).speedPxPerSec).toBe(300);
  });
});

// ── circlesOverlap ────────────────────────────────────────────────────────────

describe('circlesOverlap', () => {
  it('returns true when circles are close enough to overlap', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 50, y: 0 };
    expect(circlesOverlap(a, b, 30)).toBe(true);
  });

  it('returns false when circles are far enough apart', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 200, y: 0 };
    expect(circlesOverlap(a, b, 30)).toBe(false);
  });

  it('returns true when gap pushes overlap threshold higher', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 65, y: 0 };
    // Without gap: 65 >= 60, no overlap
    expect(circlesOverlap(a, b, 30, 0)).toBe(false);
    // With gap 10: threshold = 70, 65 < 70, overlaps
    expect(circlesOverlap(a, b, 30, 10)).toBe(true);
  });

  it('returns false when gap is 0 and circles just touch', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 60, y: 0 };
    expect(circlesOverlap(a, b, 30, 0)).toBe(false);
  });
});

// ── createCircles ─────────────────────────────────────────────────────────────

describe('createCircles', () => {
  it('returns array of correct length', () => {
    const circles = createCircles(5, 600, 400, 30, 150);
    expect(circles).toHaveLength(5);
  });

  it('each circle has required properties', () => {
    const circles = createCircles(3, 600, 400, 30, 150);
    circles.forEach((c, i) => {
      expect(c).toHaveProperty('id', i);
      expect(c).toHaveProperty('x');
      expect(c).toHaveProperty('y');
      expect(c).toHaveProperty('vx');
      expect(c).toHaveProperty('vy');
      expect(c).toHaveProperty('radius', 30);
      expect(c).toHaveProperty('isTarget', false);
    });
  });

  it('velocities are non-zero when speed > 0', () => {
    const circles = createCircles(5, 600, 400, 30, 150);
    circles.forEach((c) => {
      expect(Math.abs(c.vx) + Math.abs(c.vy)).toBeGreaterThan(0);
    });
  });

  it('falls back gracefully in a tiny arena (overlap possible)', () => {
    // 65x65 arena with radius 30 — impossible to place 2+ circles without overlap
    const circles = createCircles(3, 65, 65, 30, 100);
    expect(circles).toHaveLength(3);
    circles.forEach((c) => {
      expect(typeof c.x).toBe('number');
      expect(typeof c.y).toBe('number');
    });
  });

  it('returns empty array for numCircles=0', () => {
    expect(createCircles(0, 600, 400, 30, 150)).toHaveLength(0);
  });
});

// ── selectTargets ─────────────────────────────────────────────────────────────

describe('selectTargets', () => {
  it('returns array of same length', () => {
    const circles = createCircles(8, 600, 400, 30, 150);
    const result = selectTargets(circles, 3);
    expect(result).toHaveLength(8);
  });

  it('exactly numTargets circles have isTarget=true', () => {
    const circles = createCircles(8, 600, 400, 30, 150);
    const result = selectTargets(circles, 3);
    const targets = result.filter((c) => c.isTarget);
    expect(targets).toHaveLength(3);
  });

  it('remaining circles have isTarget=false', () => {
    const circles = createCircles(8, 600, 400, 30, 150);
    const result = selectTargets(circles, 3);
    const nonTargets = result.filter((c) => !c.isTarget);
    expect(nonTargets).toHaveLength(5);
  });

  it('does not mutate the input array', () => {
    const circles = createCircles(5, 600, 400, 30, 150);
    const origIsTarget = circles.map((c) => c.isTarget);
    selectTargets(circles, 2);
    circles.forEach((c, i) => expect(c.isTarget).toBe(origIsTarget[i]));
  });
});

// ── updateCirclePositions ─────────────────────────────────────────────────────

describe('updateCirclePositions', () => {
  const bounds = { width: 600, height: 400 };

  it('moves circles by vx*deltaMs and vy*deltaMs', () => {
    const circles = [{ id: 0, x: 200, y: 150, vx: 0.1, vy: 0.2, radius: 30, isTarget: false }];
    const result = updateCirclePositions(circles, 100, bounds);
    expect(result[0].x).toBeCloseTo(210);
    expect(result[0].y).toBeCloseTo(170);
  });

  it('bounces off left wall: x becomes radius and vx becomes positive', () => {
    const circles = [{ id: 0, x: 25, y: 200, vx: -0.1, vy: 0, radius: 30, isTarget: false }];
    const result = updateCirclePositions(circles, 100, bounds);
    expect(result[0].x).toBe(30);
    expect(result[0].vx).toBeGreaterThan(0);
  });

  it('bounces off right wall: x becomes width-radius and vx becomes negative', () => {
    const circles = [{ id: 0, x: 575, y: 200, vx: 0.1, vy: 0, radius: 30, isTarget: false }];
    const result = updateCirclePositions(circles, 100, bounds);
    expect(result[0].x).toBe(570);
    expect(result[0].vx).toBeLessThan(0);
  });

  it('bounces off top wall: y becomes radius and vy becomes positive', () => {
    const circles = [{ id: 0, x: 200, y: 25, vx: 0, vy: -0.1, radius: 30, isTarget: false }];
    const result = updateCirclePositions(circles, 100, bounds);
    expect(result[0].y).toBe(30);
    expect(result[0].vy).toBeGreaterThan(0);
  });

  it('bounces off bottom wall: y becomes height-radius and vy becomes negative', () => {
    const circles = [{ id: 0, x: 200, y: 375, vx: 0, vy: 0.1, radius: 30, isTarget: false }];
    const result = updateCirclePositions(circles, 100, bounds);
    expect(result[0].y).toBe(370);
    expect(result[0].vy).toBeLessThan(0);
  });

  it('does not mutate input array', () => {
    const circles = [{ id: 0, x: 200, y: 200, vx: 0.1, vy: 0.1, radius: 30, isTarget: false }];
    const origX = circles[0].x;
    updateCirclePositions(circles, 100, bounds);
    expect(circles[0].x).toBe(origX);
  });
});

// ── resolveCircleCollisions ───────────────────────────────────────────────────

describe('resolveCircleCollisions', () => {
  it('non-overlapping circles: velocities unchanged', () => {
    const circles = [
      { id: 0, x: 0, y: 0, vx: 0.1, vy: 0, radius: 30, isTarget: false },
      { id: 1, x: 200, y: 0, vx: -0.1, vy: 0, radius: 30, isTarget: false },
    ];
    const result = resolveCircleCollisions(circles);
    expect(result[0].vx).toBeCloseTo(0.1);
    expect(result[1].vx).toBeCloseTo(-0.1);
  });

  it('overlapping approaching circles exchange velocities along normal', () => {
    const circles = [
      { id: 0, x: 0, y: 0, vx: 0.1, vy: 0, radius: 30, isTarget: false },
      { id: 1, x: 40, y: 0, vx: -0.1, vy: 0, radius: 30, isTarget: false },
    ];
    const result = resolveCircleCollisions(circles);
    // After elastic collision along x-axis, velocities should swap sign
    expect(result[0].vx).toBeLessThan(0);
    expect(result[1].vx).toBeGreaterThan(0);
  });

  it('handles distSq=0 (same position) without throwing', () => {
    const circles = [
      { id: 0, x: 100, y: 100, vx: 0.1, vy: 0, radius: 30, isTarget: false },
      { id: 1, x: 100, y: 100, vx: -0.1, vy: 0, radius: 30, isTarget: false },
    ];
    expect(() => resolveCircleCollisions(circles)).not.toThrow();
    const result = resolveCircleCollisions(circles);
    expect(result).toHaveLength(2);
  });

  it('does not mutate input array', () => {
    const circles = [
      { id: 0, x: 0, y: 0, vx: 0.1, vy: 0, radius: 30, isTarget: false },
      { id: 1, x: 40, y: 0, vx: -0.1, vy: 0, radius: 30, isTarget: false },
    ];
    const origVx = circles[0].vx;
    resolveCircleCollisions(circles);
    expect(circles[0].vx).toBe(origVx);
  });
});

// ── evaluateResponse ──────────────────────────────────────────────────────────

describe('evaluateResponse', () => {
  const circles = [
    { id: 0, isTarget: true },
    { id: 1, isTarget: true },
    { id: 2, isTarget: false },
    { id: 3, isTarget: false },
  ];

  it('exact match returns correct=true', () => {
    const result = evaluateResponse(circles, new Set([0, 1]));
    expect(result.correct).toBe(true);
    expect(result.correctCount).toBe(2);
    expect(result.totalTargets).toBe(2);
  });

  it('missing a target returns correct=false', () => {
    const result = evaluateResponse(circles, new Set([0]));
    expect(result.correct).toBe(false);
    expect(result.correctCount).toBe(1);
  });

  it('selecting a non-target returns correct=false', () => {
    const result = evaluateResponse(circles, new Set([0, 1, 2]));
    expect(result.correct).toBe(false);
  });

  it('empty selection returns correct=false', () => {
    const result = evaluateResponse(circles, new Set());
    expect(result.correct).toBe(false);
    expect(result.correctCount).toBe(0);
  });

  it('wrong circle selected (non-target only) returns correct=false', () => {
    const result = evaluateResponse(circles, new Set([2, 3]));
    expect(result.correct).toBe(false);
    expect(result.correctCount).toBe(0);
  });
});

// ── recordRoundResult ─────────────────────────────────────────────────────────

describe('recordRoundResult', () => {
  it('correct answer increments score and consecutiveCorrect', () => {
    recordRoundResult(true);
    expect(getScore()).toBe(1);
    expect(getConsecutiveCorrect()).toBe(1);
    expect(getConsecutiveWrong()).toBe(0);
  });

  it('wrong answer increments consecutiveWrong and resets consecutiveCorrect', () => {
    recordRoundResult(true);
    recordRoundResult(false);
    expect(getConsecutiveCorrect()).toBe(0);
    expect(getConsecutiveWrong()).toBe(1);
  });

  it('3 correct in a row advances level', () => {
    recordRoundResult(true);
    recordRoundResult(true);
    const { levelDelta, newLevel } = recordRoundResult(true);
    expect(levelDelta).toBe(1);
    expect(newLevel).toBe(1);
    expect(getLevel()).toBe(1);
    expect(getConsecutiveCorrect()).toBe(0);
  });

  it('3 wrong in a row drops level by 2', () => {
    // First get to level 3
    for (let i = 0; i < 9; i++) recordRoundResult(true);
    expect(getLevel()).toBe(3);
    recordRoundResult(false);
    recordRoundResult(false);
    const { levelDelta, newLevel } = recordRoundResult(false);
    expect(levelDelta).toBe(-2);
    expect(newLevel).toBe(1);
  });

  it('level cannot drop below 0', () => {
    // Already at level 0
    recordRoundResult(false);
    recordRoundResult(false);
    const { newLevel } = recordRoundResult(false);
    expect(newLevel).toBe(0);
  });

  it('correct resets consecutiveWrong to 0', () => {
    recordRoundResult(false);
    recordRoundResult(false);
    recordRoundResult(true);
    expect(getConsecutiveWrong()).toBe(0);
  });

  it('roundsPlayed increments on every call', () => {
    recordRoundResult(true);
    recordRoundResult(false);
    recordRoundResult(true);
    expect(getRoundsPlayed()).toBe(3);
  });
});

// ── initRound ─────────────────────────────────────────────────────────────────

describe('initRound', () => {
  it('returns array with some isTarget=true circles', () => {
    startGame();
    const circles = initRound(600, 400);
    const targets = circles.filter((c) => c.isTarget);
    expect(targets.length).toBeGreaterThan(0);
  });

  it('stores result in module state (getCurrentCircles matches)', () => {
    startGame();
    const fromInit = initRound(600, 400);
    const fromGet = getCurrentCircles();
    expect(fromGet).toHaveLength(fromInit.length);
    fromGet.forEach((c, i) => {
      expect(c.id).toBe(fromInit[i].id);
      expect(c.isTarget).toBe(fromInit[i].isTarget);
    });
  });
});

// ── tickPhysics ───────────────────────────────────────────────────────────────

describe('tickPhysics', () => {
  it('returns updated positions and stores them in module state', () => {
    startGame();
    initRound(600, 400);
    const before = getCurrentCircles();
    tickPhysics(100, { width: 600, height: 400 });
    const after = getCurrentCircles();
    // At least some circles should have moved
    const moved = after.some(
      (c, i) => c.x !== before[i].x || c.y !== before[i].y,
    );
    expect(moved).toBe(true);
  });
});

// ── getCurrentCircles ─────────────────────────────────────────────────────────

describe('getCurrentCircles', () => {
  it('returns a shallow copy, not the same reference', () => {
    startGame();
    initRound(600, 400);
    const a = getCurrentCircles();
    const b = getCurrentCircles();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('returns empty array after initGame', () => {
    expect(getCurrentCircles()).toHaveLength(0);
  });
});

// ── initGame ──────────────────────────────────────────────────────────────────

describe('initGame', () => {
  it('resets score to 0', () => {
    startGame();
    initRound(600, 400);
    recordRoundResult(true);
    initGame();
    expect(getScore()).toBe(0);
  });

  it('resets level to 0', () => {
    // Advance level by recording CORRECT_TO_ADVANCE consecutive correct rounds.
    startGame();
    for (let i = 0; i < CORRECT_TO_ADVANCE; i += 1) recordRoundResult(true);
    expect(getLevel()).toBe(1);
    initGame();
    expect(getLevel()).toBe(0);
  });

  it('resets running to false', () => {
    startGame();
    expect(isRunning()).toBe(true);
    initGame();
    expect(isRunning()).toBe(false);
  });

  it('resets roundsPlayed to 0', () => {
    startGame();
    recordRoundResult(true);
    initGame();
    expect(getRoundsPlayed()).toBe(0);
  });
});

// ── startGame ─────────────────────────────────────────────────────────────────

describe('startGame', () => {
  it('sets isRunning to true', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  it('throws if called when already running', () => {
    startGame();
    expect(() => startGame()).toThrow('Game is already running');
  });
});

// ── stopGame ──────────────────────────────────────────────────────────────────

describe('stopGame', () => {
  it('sets isRunning to false', () => {
    startGame();
    stopGame();
    expect(isRunning()).toBe(false);
  });

  it('returns summary object with score, level, roundsPlayed, duration', () => {
    startGame();
    const result = stopGame();
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('roundsPlayed');
    expect(result).toHaveProperty('duration');
    expect(typeof result.duration).toBe('number');
  });

  it('throws if called when not running', () => {
    expect(() => stopGame()).toThrow('Game is not running');
  });
});

// ── Getters ───────────────────────────────────────────────────────────────────

describe('getters', () => {
  it('isRunning returns false initially', () => expect(isRunning()).toBe(false));
  it('getLevel returns 0 initially', () => expect(getLevel()).toBe(0));
  it('getScore returns 0 initially', () => expect(getScore()).toBe(0));
  it('getConsecutiveCorrect returns 0 initially', () => expect(getConsecutiveCorrect()).toBe(0));
  it('getConsecutiveWrong returns 0 initially', () => expect(getConsecutiveWrong()).toBe(0));
  it('getRoundsPlayed returns 0 initially', () => expect(getRoundsPlayed()).toBe(0));

  it('getScore reflects recorded correct answers', () => {
    startGame();
    recordRoundResult(true);
    recordRoundResult(true);
    expect(getScore()).toBe(2);
  });

  it('getConsecutiveCorrect reflects streak', () => {
    startGame();
    recordRoundResult(true);
    recordRoundResult(true);
    expect(getConsecutiveCorrect()).toBe(2);
  });

  it('getConsecutiveWrong reflects streak', () => {
    startGame();
    recordRoundResult(false);
    recordRoundResult(false);
    expect(getConsecutiveWrong()).toBe(2);
  });
});

// ── getSpeedHistory ───────────────────────────────────────────────────────────

describe('getSpeedHistory', () => {
  test('returns empty array before any rounds', () => {
    expect(getSpeedHistory()).toEqual([]);
  });

  test('appends an entry after recordRoundResult', () => {
    startGame();
    recordRoundResult(true);
    const history = getSpeedHistory();
    expect(history).toHaveLength(1);
    expect(typeof history[0]).toBe('number');
  });

  test('returns a copy so external mutations do not affect state', () => {
    startGame();
    recordRoundResult(false);
    const h = getSpeedHistory();
    h.pop();
    expect(getSpeedHistory()).toHaveLength(1);
  });

  test('resets to empty after initGame', () => {
    startGame();
    recordRoundResult(true);
    initGame();
    expect(getSpeedHistory()).toEqual([]);
  });
});
