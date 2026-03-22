/** @jest-environment node */
import {
  describe,
  test,
  expect,
  beforeEach,
} from '@jest/globals';

import {
  TOTAL_SPRITES,
  SPRITE_COLUMNS,
  SPRITE_ROWS,
  MAX_POSITION_COUNT,
  PRIMARY_SHOW_COUNT,
  MAX_DISTRACTOR_SHOWS,
  STREAK_TO_LEVEL_UP,
  BASE_DISPLAY_MS,
  DISPLAY_DECREMENT_MS,
  MIN_DISPLAY_MS,
  BASE_DISTRACTOR_COUNT,
  initGame,
  startGame,
  stopGame,
  getDisplayDurationMs,
  getDistractorCount,
  shuffle,
  pickUnique,
  buildPlaybackSequence,
  assignPositions,
  createRound,
  evaluateSelection,
  recordCorrectRound,
  recordIncorrectRound,
  getScore,
  getLevel,
  getRoundsPlayed,
  getConsecutiveCorrect,
  isRunning,
} from '../game.js';

beforeEach(() => {
  initGame();
});

describe('constants', () => {
  test('sprite sheet constants reflect a 4x2 grid', () => {
    expect(SPRITE_COLUMNS).toBe(4);
    expect(SPRITE_ROWS).toBe(2);
    expect(TOTAL_SPRITES).toBe(8);
  });

  test('round constraints constants are stable', () => {
    expect(MAX_POSITION_COUNT).toBeGreaterThanOrEqual(8);
    expect(PRIMARY_SHOW_COUNT).toBe(3);
    expect(MAX_DISTRACTOR_SHOWS).toBe(2);
    expect(STREAK_TO_LEVEL_UP).toBe(3);
    expect(BASE_DISTRACTOR_COUNT).toBe(2);
  });

  test('MAX_POSITION_COUNT caps the sequence length', () => {
    expect(MAX_POSITION_COUNT).toBeLessThanOrEqual(16);
  });

  test('timing constants are valid', () => {
    expect(BASE_DISPLAY_MS).toBeGreaterThan(MIN_DISPLAY_MS);
    expect(DISPLAY_DECREMENT_MS).toBeGreaterThan(0);
  });
});

describe('init/start/stop lifecycle', () => {
  test('initGame resets all counters and flags', () => {
    recordCorrectRound();
    startGame();
    initGame();

    expect(getScore()).toBe(0);
    expect(getLevel()).toBe(0);
    expect(getRoundsPlayed()).toBe(0);
    expect(getConsecutiveCorrect()).toBe(0);
    expect(isRunning()).toBe(false);
  });

  test('startGame sets running true', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  test('startGame throws when already running', () => {
    startGame();
    expect(() => startGame()).toThrow('already running');
  });

  test('stopGame returns summary and clears running', () => {
    startGame();
    const result = stopGame();
    expect(result).toMatchObject({
      score: 0,
      level: 0,
      roundsPlayed: 0,
    });
    expect(typeof result.duration).toBe('number');
    expect(isRunning()).toBe(false);
  });

  test('stopGame throws when not running', () => {
    expect(() => stopGame()).toThrow('not running');
  });
});

describe('difficulty helpers', () => {
  test('display duration decreases by level and respects minimum', () => {
    expect(getDisplayDurationMs(0)).toBe(BASE_DISPLAY_MS);
    expect(getDisplayDurationMs(1)).toBe(BASE_DISPLAY_MS - DISPLAY_DECREMENT_MS);
    expect(getDisplayDurationMs(1000)).toBe(MIN_DISPLAY_MS);
  });

  test('distractor count rises with level and caps at TOTAL_SPRITES - 1', () => {
    expect(getDistractorCount(0)).toBe(BASE_DISTRACTOR_COUNT);
    expect(getDistractorCount(1)).toBe(BASE_DISTRACTOR_COUNT + 1);
    expect(getDistractorCount(1000)).toBe(TOTAL_SPRITES - 1);
  });
});

describe('array helpers', () => {
  test('shuffle returns same items and keeps array length', () => {
    const input = [1, 2, 3, 4, 5];
    const output = shuffle(input);

    expect(output).toHaveLength(input.length);
    expect([...output].sort((a, b) => a - b)).toEqual(input);
  });

  test('pickUnique returns requested count without duplicates', () => {
    const values = [0, 1, 2, 3, 4, 5];
    const picked = pickUnique(values, 3);

    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    picked.forEach((value) => expect(values).toContain(value));
  });
});

describe('round generation', () => {
  test('buildPlaybackSequence includes primary exactly three times', () => {
    const sequence = buildPlaybackSequence(7, [1, 2, 3], 2);
    const primaryCount = sequence.filter((id) => id === 7).length;
    const byDistractor = sequence.filter((id) => id !== 7);

    expect(primaryCount).toBe(PRIMARY_SHOW_COUNT);
    expect(byDistractor.length).toBeGreaterThanOrEqual(3);
  });

  test('buildPlaybackSequence caps sequence at MAX_POSITION_COUNT', () => {
    // Level 100 would add unlimited extras without the cap.
    const allDistractors = Array.from({ length: TOTAL_SPRITES - 1 }, (_, i) => i + 1);
    const sequence = buildPlaybackSequence(0, allDistractors, 100);
    expect(sequence.length).toBeLessThanOrEqual(MAX_POSITION_COUNT);
    expect(sequence.filter((id) => id === 0).length).toBe(PRIMARY_SHOW_COUNT);
  });

  test('assignPositions gives each step a unique position', () => {
    const sequence = [3, 3, 3, 1, 2, 4];
    const assigned = assignPositions(sequence, 3);

    expect(assigned.shownPositions).toHaveLength(sequence.length);
    expect(new Set(assigned.shownPositions).size).toBe(sequence.length);

    const allIndexes = assigned.steps.map((s) => s.positionIndex);
    expect(new Set(allIndexes).size).toBe(sequence.length);

    const primarySteps = assigned.steps.filter((step) => step.isPrimary);
    expect(primarySteps).toHaveLength(PRIMARY_SHOW_COUNT);
    primarySteps.forEach((step) => {
      expect(assigned.primaryPositions).toContain(step.positionIndex);
    });
  });

  test('createRound returns a complete round payload', () => {
    const round = createRound(1);

    expect(typeof round.primarySpriteId).toBe('number');
    expect(round.primarySpriteId).toBeGreaterThanOrEqual(0);
    expect(round.primarySpriteId).toBeLessThan(TOTAL_SPRITES);
    expect(round.displayMs).toBe(getDisplayDurationMs(1));
    expect(round.primaryPositions).toHaveLength(PRIMARY_SHOW_COUNT);
    expect(round.steps.length).toBeGreaterThan(round.distractorSpriteIds.length);
  });
});

describe('selection and scoring', () => {
  test('evaluateSelection is true for exact position match', () => {
    const round = { primaryPositions: [1, 3, 5] };
    expect(evaluateSelection(round, [5, 1, 3])).toBe(true);
  });

  test('evaluateSelection is false for wrong, malformed, or missing data', () => {
    const round = { primaryPositions: [1, 3, 5] };
    expect(evaluateSelection(round, [1, 3, 4])).toBe(false);
    expect(evaluateSelection(round, [1, 3])).toBe(false);
    expect(evaluateSelection(null, [1, 3, 5])).toBe(false);
  });

  test('recordCorrectRound increments score and rounds', () => {
    recordCorrectRound();
    expect(getScore()).toBe(1);
    expect(getRoundsPlayed()).toBe(1);
    expect(getConsecutiveCorrect()).toBe(1);
  });

  test('recordCorrectRound levels up after three consecutive rounds', () => {
    recordCorrectRound();
    recordCorrectRound();
    recordCorrectRound();

    expect(getLevel()).toBe(1);
    expect(getConsecutiveCorrect()).toBe(0);
  });

  test('recordIncorrectRound resets streak and increments rounds', () => {
    recordCorrectRound();
    expect(getConsecutiveCorrect()).toBe(1);

    recordIncorrectRound();
    expect(getConsecutiveCorrect()).toBe(0);
    expect(getRoundsPlayed()).toBe(2);
  });
});
