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
  MAX_SPEED_LEVEL,
  MIN_DISPLAY_DURATION_MS,
  JOKER_VARIANTS,
  calculateDisplayDuration,
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
  getSpeedLevel,
  getConsecutiveCorrect,
  getConsecutiveWrong,
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

  test('calculateDisplayDuration returns BASE at level 0', () => {
    expect(calculateDisplayDuration(0)).toBe(BASE_DISPLAY_DURATION_MS);
  });

  test('calculateDisplayDuration returns less at higher levels', () => {
    expect(calculateDisplayDuration(1)).toBeLessThan(BASE_DISPLAY_DURATION_MS);
    expect(calculateDisplayDuration(10)).toBeLessThan(calculateDisplayDuration(1));
  });

  test('calculateDisplayDuration is clamped to MIN at very high levels', () => {
    expect(calculateDisplayDuration(MAX_SPEED_LEVEL)).toBe(MIN_DISPLAY_DURATION_MS);
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
    expect(getSpeedLevel()).toBe(0);
    expect(getConsecutiveCorrect()).toBe(0);
    expect(getConsecutiveWrong()).toBe(0);
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
    // Speed only changes after a complete staircase step (3 consecutive hits).
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);
    expect(getSpeedHistory()).toHaveLength(0);
    expect(getConsecutiveCorrect()).toBe(1);
    expect(getConsecutiveWrong()).toBe(0);
  });

  test('speed-up applies after three consecutive trigger hits', () => {
    startGame();

    // Hit three triggers without any misses or false alarms in between.
    for (let i = 0; i < 3; i += 1) {
      expect(hitNextTrigger()).toBe(true);
    }

    expect(getDisplayDurationMs()).toBeLessThan(BASE_DISPLAY_DURATION_MS);
    expect(getSpeedHistory()).toHaveLength(1);
    expect(getConsecutiveCorrect()).toBe(0); // reset after step
    expect(getSpeedLevel()).toBe(1);
  });

  test('speed-up consecutive counter resets to zero after each step', () => {
    startGame();
    for (let i = 0; i < 3; i += 1) {
      hitNextTrigger();
    }
    expect(getConsecutiveCorrect()).toBe(0);
    expect(getSpeedLevel()).toBe(1);
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
    expect(getConsecutiveCorrect()).toBe(2);

    // Miss the next trigger.
    expect(dealUntilTrigger()).toBe(true);
    const missesBefore = getMisses();
    dealNextCard();
    expect(getMisses()).toBe(missesBefore + 1);

    // Correct counter was reset by the miss.
    expect(getConsecutiveCorrect()).toBe(0);
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);
    expect(getSpeedHistory()).toHaveLength(0);
  });

  test('three consecutive misses slow down the game', () => {
    startGame();
    // First get fast enough to have room to slow down.
    for (let i = 0; i < 6; i += 1) {
      hitNextTrigger();
    }
    const fastSpeed = getDisplayDurationMs();
    const fastLevel = getSpeedLevel();
    expect(fastLevel).toBeGreaterThanOrEqual(2);

    // Accumulate three consecutive misses.
    for (let i = 0; i < 3; i += 1) {
      expect(dealUntilTrigger()).toBe(true);
      dealNextCard(); // miss by advancing past it
    }

    // After 3 misses the staircase should have decreased level by 2.
    expect(getSpeedLevel()).toBe(fastLevel - 2);
    expect(getDisplayDurationMs()).toBeGreaterThan(fastSpeed);
    // Wrong counter resets after the staircase step fires (may be slightly higher
    // if passing over trigger cards during dealUntilTrigger traversal).
    expect(getConsecutiveWrong()).toBeLessThan(3);
  });

  test('false alarm resets the speed-up streak', () => {
    startGame();
    expect(hitNextTrigger()).toBe(true);
    expect(hitNextTrigger()).toBe(true);
    expect(getConsecutiveCorrect()).toBe(2);

    expect(dealUntilNonTrigger()).toBe(true);
    expect(respondToCurrentCard()).toBe('false-alarm');

    // Correct counter reset, wrong counter incremented (may be higher than 1
    // if dealUntilNonTrigger passed over intermediate trigger cards).
    expect(getConsecutiveCorrect()).toBe(0);
    expect(getConsecutiveWrong()).toBeGreaterThanOrEqual(1);
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);
    expect(getSpeedHistory()).toHaveLength(0);
  });

  test('three consecutive false alarms slow down the game', () => {
    startGame();
    // Speed up first.
    for (let i = 0; i < 6; i += 1) {
      hitNextTrigger();
    }
    const fastSpeed = getDisplayDurationMs();
    const fastLevel = getSpeedLevel();
    expect(fastLevel).toBeGreaterThanOrEqual(2);

    // Three consecutive false alarms.
    for (let i = 0; i < 3; i += 1) {
      expect(dealUntilNonTrigger()).toBe(true);
      expect(respondToCurrentCard()).toBe('false-alarm');
    }

    expect(getSpeedLevel()).toBe(fastLevel - 2);
    expect(getDisplayDurationMs()).toBeGreaterThan(fastSpeed);
    expect(getConsecutiveWrong()).toBe(0);
  });

  test('speed level never goes below 0 (cannot be slower than base)', () => {
    startGame();
    // Three misses at level 0 should clamp at 0 (easierStep=-2 clamped to minValue=0).
    for (let i = 0; i < 3; i += 1) {
      expect(dealUntilTrigger()).toBe(true);
      dealNextCard();
    }
    expect(getSpeedLevel()).toBe(0);
    expect(getDisplayDurationMs()).toBe(BASE_DISPLAY_DURATION_MS);
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
