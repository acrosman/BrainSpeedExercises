/** @jest-environment node */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import {
  RANKS,
  SUITS,
  BASE_DISPLAY_DURATION_MS,
  MIN_DISPLAY_DURATION_MS,
  createStandardDeck,
  shuffleDeck,
  drawJokerGap,
  initGame,
  startGame,
  stopGame,
  finalizeCurrentCard,
  dealNextCard,
  respondToCurrentCard,
  getScore,
  getTriggerHits,
  getMisses,
  getFalseAlarms,
  getCardsShown,
  getDeckPasses,
  getDeckIndex,
  getDisplayDurationMs,
  getCurrentCard,
  shouldReactNow,
  isRunning,
  MIN_JOKER_GAP,
  MAX_JOKER_GAP,
} from '../game.js';

let randomSpy;

beforeEach(() => {
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
  initGame();
});

afterEach(() => {
  randomSpy.mockRestore();
});

describe('deck helpers', () => {
  test('createStandardDeck returns 52 non-joker cards', () => {
    const deck = createStandardDeck();
    expect(deck).toHaveLength(52);
    expect(deck.every((card) => !card.isJoker)).toBe(true);
  });

  test('createStandardDeck contains each suit and rank', () => {
    const deck = createStandardDeck();
    SUITS.forEach((suit) => {
      RANKS.forEach((rank) => {
        expect(deck.some((card) => card.rank === rank && card.suit === suit)).toBe(true);
      });
    });
  });

  test('shuffleDeck returns a new array', () => {
    const deck = createStandardDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).not.toBe(deck);
    expect(shuffled).toHaveLength(deck.length);
  });

  test('drawJokerGap stays within configured range', () => {
    randomSpy.mockReturnValue(0.9999);
    const gap = drawJokerGap();
    expect(gap).toBeGreaterThanOrEqual(MIN_JOKER_GAP);
    expect(gap).toBeLessThanOrEqual(MAX_JOKER_GAP);
  });
});

describe('lifecycle', () => {
  test('initGame resets public counters', () => {
    expect(getScore()).toBe(0);
    expect(getTriggerHits()).toBe(0);
    expect(getMisses()).toBe(0);
    expect(getFalseAlarms()).toBe(0);
    expect(getCardsShown()).toBe(0);
    expect(getDeckPasses()).toBe(0);
    expect(getDeckIndex()).toBe(0);
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);
    expect(isRunning()).toBe(false);
  });

  test('startGame marks running', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  test('startGame throws when called while already running', () => {
    startGame();
    expect(() => startGame()).toThrow('already running');
  });

  test('stopGame throws when game is not running', () => {
    expect(() => stopGame()).toThrow('not running');
  });

  test('stopGame returns final result object', () => {
    startGame();
    const result = stopGame();
    expect(result).toMatchObject({
      score: expect.any(Number),
      triggerHits: expect.any(Number),
      misses: expect.any(Number),
      falseAlarms: expect.any(Number),
      cardsShown: expect.any(Number),
      deckPasses: expect.any(Number),
      lowestDisplayTime: expect.any(Number),
      duration: expect.any(Number),
    });
    expect(isRunning()).toBe(false);
  });
});

describe('deal and response flow', () => {
  /**
   * Deal cards until a reaction target appears.
   *
   * @param {number} [maxDeals=40]
   */
  function dealUntilTrigger(maxDeals = 40) {
    for (let i = 0; i < maxDeals; i += 1) {
      dealNextCard();
      if (shouldReactNow()) return;
    }
  }

  test('dealNextCard throws when not running', () => {
    expect(() => dealNextCard()).toThrow('not running');
  });

  test('dealNextCard shows a normal card on first deal', () => {
    startGame();
    const dealt = dealNextCard();
    expect(dealt.card.isJoker).toBe(false);
    expect(getCurrentCard()).not.toBeNull();
    expect(getCardsShown()).toBe(1);
    expect(getDeckIndex()).toBe(1);
  });

  test('respondToCurrentCard marks false alarm when no trigger is active', () => {
    startGame();
    dealNextCard();
    const outcome = respondToCurrentCard();
    expect(outcome).toBe('false-alarm');
    expect(getFalseAlarms()).toBe(1);
  });

  test('respondToCurrentCard returns ignored before first deal', () => {
    startGame();
    expect(respondToCurrentCard()).toBe('ignored');
  });

  test('pair trigger produces hit and speed-up', () => {
    startGame();

    dealUntilTrigger();

    expect(shouldReactNow()).toBe(true);
    expect(respondToCurrentCard()).toBe('hit');
    expect(getScore()).toBe(1);
    expect(getTriggerHits()).toBe(1);
    expect(getDisplayDurationMs()).toBeLessThan(BASE_DISPLAY_DURATION_MS);
  });

  test('second response in same trigger window is ignored', () => {
    startGame();
    dealUntilTrigger();
    respondToCurrentCard();
    expect(respondToCurrentCard()).toBe('ignored');
  });

  test('missing a trigger increments misses on next deal', () => {
    startGame();
    dealUntilTrigger();
    expect(shouldReactNow()).toBe(true);
    dealNextCard();
    expect(getMisses()).toBe(1);
  });

  test('finalizeCurrentCard records miss for unresolved trigger', () => {
    startGame();
    dealUntilTrigger();
    finalizeCurrentCard();
    expect(getMisses()).toBe(1);
  });

  test('joker appears after configured non-joker gap', () => {
    startGame();
    let jokerFound = false;
    for (let i = 0; i < MIN_JOKER_GAP + 1; i += 1) {
      const { card } = dealNextCard();
      if (card.isJoker) {
        jokerFound = true;
        break;
      }
    }
    expect(jokerFound).toBe(true);
  });

  test('deck reshuffles after a full 52-card pass', () => {
    startGame();
    for (let i = 0; i < 80; i += 1) {
      dealNextCard();
    }
    expect(getDeckPasses()).toBeGreaterThanOrEqual(1);
  });

  test('display duration does not go below minimum', () => {
    startGame();
    for (let i = 0; i < 40; i += 1) {
      dealNextCard();
      dealNextCard();
      respondToCurrentCard();
    }
    expect(getDisplayDurationMs()).toBeGreaterThanOrEqual(MIN_DISPLAY_DURATION_MS);
  });
});
