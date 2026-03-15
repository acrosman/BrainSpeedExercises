/** @jest-environment node */
import {
  initGame,
  startGame,
  stopGame,
  addScore,
  getScore,
  isRunning,
} from '../game.js';

beforeEach(() => {
  initGame();
});

describe('initGame', () => {
  test('resets score to 0', () => {
    addScore(42);
    initGame();
    expect(getScore()).toBe(0);
  });

  test('sets running to false', () => {
    startGame();
    initGame();
    expect(isRunning()).toBe(false);
  });
});

describe('startGame', () => {
  test('sets running to true', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });
});

describe('stopGame', () => {
  test('sets running to false', () => {
    startGame();
    stopGame();
    expect(isRunning()).toBe(false);
  });

  test('returns the current score and a duration', () => {
    addScore(7);
    const result = stopGame();
    expect(result).toMatchObject({ score: 7, duration: 0 });
  });
});

describe('addScore', () => {
  test('increases the score by the given amount', () => {
    addScore(5);
    expect(getScore()).toBe(5);
  });

  test('accumulates across multiple calls', () => {
    addScore(3);
    addScore(4);
    expect(getScore()).toBe(7);
  });
});

describe('getScore', () => {
  test('returns 0 after init', () => {
    expect(getScore()).toBe(0);
  });
});

describe('isRunning', () => {
  test('returns false before startGame is called', () => {
    expect(isRunning()).toBe(false);
  });

  test('returns true after startGame', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });
});
