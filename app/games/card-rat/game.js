/**
 * game.js — Pure game logic for Card Rat.
 *
 * Implements an Egyptian Rat Screw-inspired reaction task:
 * - React when two consecutive cards share the same rank.
 * - React when a joker appears.
 * - Do not react on non-trigger cards.
 *
 * The game tracks a 55-card deck (52 standard cards plus three jokers) and
 * reshuffles at the end of each full pass through the deck.
 *
 * @file Card Rat game logic module.
 */

/** Ordered card ranks used in a standard deck. */
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Ordered suits used in a standard deck. */
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

/** Initial card display duration in milliseconds. */
export const BASE_DISPLAY_DURATION_MS = 1400;

/** Minimum card display duration in milliseconds. */
export const MIN_DISPLAY_DURATION_MS = 240;

/** Multiplicative speed-up factor applied after each correct reaction. */
export const DISPLAY_SPEED_FACTOR = 0.92;

/** @type {number} */
let score = 0;

/** @type {number} */
let triggerHits = 0;

/** @type {number} */
let misses = 0;

/** @type {number} */
let falseAlarms = 0;

/** @type {number} */
let cardsShown = 0;

/** @type {number} */
let deckPasses = 0;

/** @type {number} */
let displayDurationMs = BASE_DISPLAY_DURATION_MS;

/** @type {boolean} */
let running = false;

/** @type {number|null} */
let startTimeMs = null;

/** @type {Array<{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }>} */
let deck = [];

/** @type {number} */
let deckIndex = 0;

/** @type {{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }|null} */
let previousCard = null;

/** @type {{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }|null} */
let currentCard = null;

/** @type {boolean} */
let mustReactToCurrentCard = false;

/** @type {boolean} */
let reactedToCurrentCard = false;

/** Joker image variants used in the deck. */
export const JOKER_VARIANTS = ['joker1', 'joker2', 'joker3'];

/**
 * Create a standard 52-card deck.
 *
 * @returns {Array<{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }>}
 */
export function createStandardDeck() {
  const result = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      result.push({ rank, suit, isJoker: false });
    });
  });
  return result;
}

/**
 * Return a shuffled copy of the provided deck using Fisher-Yates.
 *
 * @param {Array<{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }>} cards
 * @returns {Array<{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }>}
 */
export function shuffleDeck(cards) {
  const shuffled = cards.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Create joker cards for the deck.
 *
 * @returns {Array<{ rank: string, suit: string, isJoker: boolean, jokerVariant: string }>}
 */
export function createJokerCards() {
  return JOKER_VARIANTS.map((jokerVariant) => ({
    rank: 'JOKER',
    suit: 'joker',
    isJoker: true,
    jokerVariant,
  }));
}

/**
 * Create a full gameplay deck containing standard cards and jokers.
 *
 * @returns {Array<{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }>}
 */
export function createGameplayDeck() {
  return [...createStandardDeck(), ...createJokerCards()];
}

/**
 * Initialize (or reset) game state.
 */
export function initGame() {
  score = 0;
  triggerHits = 0;
  misses = 0;
  falseAlarms = 0;
  cardsShown = 0;
  deckPasses = 0;
  displayDurationMs = BASE_DISPLAY_DURATION_MS;
  running = false;
  startTimeMs = null;
  deck = shuffleDeck(createGameplayDeck());
  deckIndex = 0;
  previousCard = null;
  currentCard = null;
  mustReactToCurrentCard = false;
  reactedToCurrentCard = false;
}

/**
 * Start the game.
 *
 * @throws {Error} If the game is already running.
 */
export function startGame() {
  if (running) {
    throw new Error('Game is already running.');
  }
  running = true;
  startTimeMs = Date.now();
}

/**
 * Finalize the currently visible card window before moving on.
 */
export function finalizeCurrentCard() {
  if (mustReactToCurrentCard && !reactedToCurrentCard) {
    misses += 1;
  }
  mustReactToCurrentCard = false;
  reactedToCurrentCard = false;
}

/**
 * Draw the next card to show.
 *
 * This function finalizes the previous card window first, then deals the next
 * card. The full 55-card deck is reshuffled after each complete pass.
 *
 * @returns {{
 *   card: { rank: string, suit: string, isJoker: boolean, jokerVariant?: string },
 *   mustReact: boolean,
 *   displayDurationMs: number,
 *   deckIndex: number,
 *   deckPasses: number,
 * }}
 * @throws {Error} If the game is not running.
 */
export function dealNextCard() {
  if (!running) {
    throw new Error('Game is not running.');
  }

  finalizeCurrentCard();

  if (deckIndex >= deck.length) {
    deck = shuffleDeck(createGameplayDeck());
    deckIndex = 0;
    deckPasses += 1;
  }

  const card = deck[deckIndex];
  deckIndex += 1;

  const hasPair = previousCard !== null
    && !previousCard.isJoker
    && !card.isJoker
    && previousCard.rank === card.rank;

  currentCard = card;
  mustReactToCurrentCard = card.isJoker || hasPair;
  reactedToCurrentCard = false;
  previousCard = card;
  cardsShown += 1;

  return {
    card,
    mustReact: mustReactToCurrentCard,
    displayDurationMs,
    deckIndex,
    deckPasses,
  };
}

/**
 * Record the player's reaction for the current card.
 *
 * @returns {'hit' | 'false-alarm' | 'ignored'}
 */
export function respondToCurrentCard() {
  if (!running || currentCard === null) {
    return 'ignored';
  }

  if (mustReactToCurrentCard && !reactedToCurrentCard) {
    reactedToCurrentCard = true;
    triggerHits += 1;
    score += 1;
    displayDurationMs = Math.max(
      MIN_DISPLAY_DURATION_MS,
      Math.round(displayDurationMs * DISPLAY_SPEED_FACTOR),
    );
    return 'hit';
  }

  if (!mustReactToCurrentCard) {
    falseAlarms += 1;
    return 'false-alarm';
  }

  return 'ignored';
}

/**
 * Stop the game and return final results.
 *
 * @returns {{
 *   score: number,
 *   triggerHits: number,
 *   misses: number,
 *   falseAlarms: number,
 *   cardsShown: number,
 *   deckPasses: number,
 *   lowestDisplayTime: number,
 *   duration: number,
 * }}
 * @throws {Error} If the game is not running.
 */
export function stopGame() {
  if (!running) {
    throw new Error('Game is not running.');
  }

  finalizeCurrentCard();
  running = false;

  const duration = startTimeMs === null ? 0 : Date.now() - startTimeMs;

  return {
    score,
    triggerHits,
    misses,
    falseAlarms,
    cardsShown,
    deckPasses,
    lowestDisplayTime: displayDurationMs,
    duration,
  };
}

/**
 * Return current score.
 * @returns {number}
 */
export function getScore() {
  return score;
}

/**
 * Return correct trigger-hit count.
 * @returns {number}
 */
export function getTriggerHits() {
  return triggerHits;
}

/**
 * Return missed-trigger count.
 * @returns {number}
 */
export function getMisses() {
  return misses;
}

/**
 * Return false-alarm count.
 * @returns {number}
 */
export function getFalseAlarms() {
  return falseAlarms;
}

/**
 * Return total cards shown.
 * @returns {number}
 */
export function getCardsShown() {
  return cardsShown;
}

/**
 * Return number of completed 52-card deck passes.
 * @returns {number}
 */
export function getDeckPasses() {
  return deckPasses;
}

/**
 * Return number of cards consumed from current deck pass.
 * @returns {number}
 */
export function getDeckIndex() {
  return deckIndex;
}

/**
 * Return total number of cards in the active deck.
 * @returns {number}
 */
export function getDeckSize() {
  return deck.length;
}

/**
 * Return the current card display duration.
 * @returns {number}
 */
export function getDisplayDurationMs() {
  return displayDurationMs;
}

/**
 * Return the currently visible card.
 * @returns {{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }|null}
 */
export function getCurrentCard() {
  return currentCard;
}

/**
 * Return whether the current card requires a reaction.
 * @returns {boolean}
 */
export function shouldReactNow() {
  return mustReactToCurrentCard;
}

/**
 * Return whether the game is running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}
