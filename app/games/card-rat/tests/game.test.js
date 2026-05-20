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
  HITS_REQUIRED_FOR_SPEED_UP,
  MIN_DISPLAY_DURATION_MS,
  JOKER_VARIANTS,
  createStandardDeck,
  createJokerCards,
  createGameplayDeck,
  isSandwichPattern,
  shuffleDeck,
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
  getDeckSize,
  getDisplayDurationMs,
  getSpeedHistory,
  getCurrentCard,
  shouldReactNow,
  isRunning,
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

  test('createJokerCards returns three unique joker variants', () => {
    const jokers = createJokerCards();
    expect(jokers).toHaveLength(3);
    expect(jokers.map((card) => card.jokerVariant)).toEqual(JOKER_VARIANTS);
    expect(jokers.every((card) => card.isJoker)).toBe(true);
  });

  test('createGameplayDeck returns 55 cards including three jokers', () => {
    const deck = createGameplayDeck();
    expect(deck).toHaveLength(55);
    expect(deck.filter((card) => card.isJoker)).toHaveLength(3);
    expect(deck.filter((card) => !card.isJoker)).toHaveLength(52);
  });

  test('isSandwichPattern returns true only for valid sandwiches', () => {
    const left = { rank: '2', isJoker: false };
    const middle = { rank: '5', isJoker: false };
    const right = { rank: '2', isJoker: false };
    const joker = { rank: 'JOKER', isJoker: true };

    expect(isSandwichPattern(left, middle, right)).toBe(true);
    expect(isSandwichPattern(left, left, right)).toBe(false);
    expect(isSandwichPattern(left, middle, joker)).toBe(false);
    expect(isSandwichPattern(null, middle, right)).toBe(false);
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
    expect(getDeckSize()).toBe(55);
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
   * @param {number} [maxDeals=60]
   * @returns {boolean}
   */
  function dealUntilTrigger(maxDeals = 60) {
    for (let i = 0; i < maxDeals; i += 1) {
      dealNextCard();
      if (shouldReactNow()) return true;
    }
    return false;
  }

  /**
   * Deal cards until a non-trigger appears.
   *
   * @param {number} [maxDeals=120]
   * @returns {boolean}
   */
  function dealUntilNonTrigger(maxDeals = 120) {
    for (let i = 0; i < maxDeals; i += 1) {
      dealNextCard();
      if (!shouldReactNow()) return true;
    }
    return false;
  }

  /**
   * Deal cards until a trigger appears, then hit it.
   *
   * @param {number} [maxDeals=120]
   * @returns {boolean}
   */
  function hitNextTrigger(maxDeals = 120) {
    for (let i = 0; i < maxDeals; i += 1) {
      dealNextCard();
      if (shouldReactNow()) {
        return respondToCurrentCard() === 'hit';
      }
    }
    return false;
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

  test('single trigger hit does not speed up immediately', () => {
    startGame();

    expect(dealUntilTrigger()).toBe(true);

    expect(shouldReactNow()).toBe(true);
    expect(respondToCurrentCard()).toBe('hit');
    expect(getScore()).toBe(1);
    expect(getTriggerHits()).toBe(1);
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);
    expect(getSpeedHistory()).toHaveLength(0);
  });

  test('speed-up applies after three consecutive trigger hits', () => {
    startGame();

    for (let i = 0; i < HITS_REQUIRED_FOR_SPEED_UP; i += 1) {
      expect(hitNextTrigger()).toBe(true);
    }

    expect(getDisplayDurationMs()).toBeLessThan(BASE_DISPLAY_DURATION_MS);
    expect(getSpeedHistory()).toHaveLength(1);
  });

  test('second response in same trigger window is ignored', () => {
    startGame();
    expect(dealUntilTrigger()).toBe(true);
    respondToCurrentCard();
    expect(respondToCurrentCard()).toBe('ignored');
  });

  test('missing a trigger increments misses on next deal', () => {
    startGame();
    expect(dealUntilTrigger()).toBe(true);
    expect(shouldReactNow()).toBe(true);
    dealNextCard();
    expect(getMisses()).toBe(1);
  });

  test('missing a trigger resets the speed-up streak', () => {
    startGame();
    expect(hitNextTrigger()).toBe(true);
    expect(hitNextTrigger()).toBe(true);
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);

    expect(dealUntilTrigger()).toBe(true);
    const missesBefore = getMisses();
    dealNextCard();
    expect(getMisses()).toBe(missesBefore + 1);

    expect(hitNextTrigger()).toBe(true);
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);
    expect(getSpeedHistory()).toHaveLength(0);
  });

  test('false alarm resets the speed-up streak', () => {
    startGame();
    expect(hitNextTrigger()).toBe(true);
    expect(hitNextTrigger()).toBe(true);
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);

    expect(dealUntilNonTrigger()).toBe(true);
    expect(respondToCurrentCard()).toBe('false-alarm');

    expect(hitNextTrigger()).toBe(true);
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);
    expect(getSpeedHistory()).toHaveLength(0);
  });

  test('finalizeCurrentCard records miss for unresolved trigger', () => {
    startGame();
    expect(dealUntilTrigger()).toBe(true);
    finalizeCurrentCard();
    expect(getMisses()).toBe(1);
  });

  test('joker cards appear in normal deal flow', () => {
    startGame();
    let jokerFound = false;
    for (let i = 0; i < getDeckSize(); i += 1) {
      const { card } = dealNextCard();
      if (card.isJoker) {
        jokerFound = true;
        break;
      }
    }
    expect(jokerFound).toBe(true);
  });

  test('deck reshuffles after a full deck pass', () => {
    startGame();
    for (let i = 0; i < getDeckSize() + 5; i += 1) {
      dealNextCard();
    }
    expect(getDeckPasses()).toBeGreaterThanOrEqual(1);
  });

  test('display duration does not go below minimum', () => {
    startGame();
    for (let i = 0; i < 90; i += 1) {
      expect(hitNextTrigger()).toBe(true);
    }
    expect(getDisplayDurationMs()).toBeGreaterThanOrEqual(MIN_DISPLAY_DURATION_MS);
  });

  test('getSpeedHistory returns a defensive copy', () => {
    startGame();
    expect(dealUntilTrigger()).toBe(true);
    respondToCurrentCard();

    const history = getSpeedHistory();
    history.push(9999);

    expect(getSpeedHistory()).not.toContain(9999);
  });
});
