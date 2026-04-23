/**
 * adaptiveDifficultyService.test.js — Unit tests for adaptive difficulty helpers.
 *
 * @file Tests for adaptiveDifficultyService.js
 */

import { describe, it, expect } from '@jest/globals';

import {
  clampDifficultyValue,
  updateAdaptiveDifficultyState,
} from '../adaptiveDifficultyService.js';

describe('clampDifficultyValue()', () => {
  it('returns the value when already in range', () => {
    expect(clampDifficultyValue(3, 0, 10)).toBe(3);
  });

  it('clamps to the minimum when below range', () => {
    expect(clampDifficultyValue(-1, 0, 10)).toBe(0);
  });

  it('clamps to the maximum when above range', () => {
    expect(clampDifficultyValue(11, 0, 10)).toBe(10);
  });
});

describe('updateAdaptiveDifficultyState()', () => {
  it('increments correct streak and resets wrong streak on correct result', () => {
    const state = updateAdaptiveDifficultyState({
      value: 2,
      wasCorrect: true,
      consecutiveCorrect: 1,
      consecutiveWrong: 2,
    });

    expect(state).toMatchObject({
      value: 2,
      consecutiveCorrect: 2,
      consecutiveWrong: 0,
      valueDelta: 0,
    });
  });

  it('increments wrong streak and resets correct streak on wrong result', () => {
    const state = updateAdaptiveDifficultyState({
      value: 2,
      wasCorrect: false,
      consecutiveCorrect: 2,
      consecutiveWrong: 1,
    });

    expect(state).toMatchObject({
      value: 2,
      consecutiveCorrect: 0,
      consecutiveWrong: 2,
      valueDelta: 0,
    });
  });

  it('applies harderStep after the correct streak threshold', () => {
    const state = updateAdaptiveDifficultyState({
      value: 2,
      wasCorrect: true,
      consecutiveCorrect: 2,
      consecutiveWrong: 0,
      increaseAfter: 3,
      harderStep: 1,
      minValue: 0,
      maxValue: 10,
    });

    expect(state).toMatchObject({
      value: 3,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      valueDelta: 1,
    });
  });

  it('applies easierStep after the wrong streak threshold', () => {
    const state = updateAdaptiveDifficultyState({
      value: 4,
      wasCorrect: false,
      consecutiveCorrect: 0,
      consecutiveWrong: 2,
      decreaseAfter: 3,
      easierStep: -2,
      minValue: 0,
      maxValue: 10,
    });

    expect(state).toMatchObject({
      value: 2,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      valueDelta: -2,
    });
  });

  it('uses default 3/3 and +1/-2 staircase parameters', () => {
    const levelUpState = updateAdaptiveDifficultyState({
      value: 0,
      wasCorrect: true,
      consecutiveCorrect: 2,
      consecutiveWrong: 0,
      minValue: 0,
      maxValue: 10,
    });

    const levelDownState = updateAdaptiveDifficultyState({
      value: 3,
      wasCorrect: false,
      consecutiveCorrect: 0,
      consecutiveWrong: 2,
      minValue: 0,
      maxValue: 10,
    });

    expect(levelUpState.value).toBe(1);
    expect(levelDownState.value).toBe(1);
  });

  it('clamps harder/easier adjustments at provided bounds', () => {
    const clampedUp = updateAdaptiveDifficultyState({
      value: 10,
      wasCorrect: true,
      consecutiveCorrect: 2,
      consecutiveWrong: 0,
      harderStep: 1,
      minValue: 0,
      maxValue: 10,
    });

    const clampedDown = updateAdaptiveDifficultyState({
      value: 0,
      wasCorrect: false,
      consecutiveCorrect: 0,
      consecutiveWrong: 2,
      easierStep: -2,
      minValue: 0,
      maxValue: 10,
    });

    expect(clampedUp).toMatchObject({
      value: 10,
      consecutiveCorrect: 0,
      valueDelta: 0,
    });
    expect(clampedDown).toMatchObject({
      value: 0,
      consecutiveWrong: 0,
      valueDelta: 0,
    });
  });
});
