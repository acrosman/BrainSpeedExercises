/**
 * index.js — Card Rat game plugin entry point for BrainSpeedExercises.
 *
 * Handles all UI/event behavior for the Card Rat reaction game.
 *
 * @file Card Rat game plugin (UI/controller layer).
 */

import * as game from './game.js';
import * as timerService from '../../components/timerService.js';
import { playSuccessSound, playFailureSound } from '../../components/audioService.js';
import { saveScore } from '../../components/scoreService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';

/** Human-readable plugin name. */
const name = 'Card Rat';

/** Game ID used for progress persistence. */
const GAME_ID = 'card-rat';

/** Sprite path for card art. */
const CARD_SPRITE_PATH = 'games/card-rat/images/cards-sprite.png';

/** Number of columns in the card sprite sheet. */
const SPRITE_COLS = 13;

/** Number of rows in the card sprite sheet. */
const SPRITE_ROWS = 5;

/** Sprite row where standard suit cards begin. */
const STANDARD_CARD_START_ROW = 1;

/** Sprite columns used for jokers in the top row. */
const JOKER_COLUMNS = [1, 2];

/** Sprite coordinate for the deck-back card image. */
const DECK_BACK_POSITION = { row: 0, column: 0 };

/** @type {HTMLElement|null} */
let _container = null;

/** @type {HTMLElement|null} */
let _instructionsEl = null;

/** @type {HTMLElement|null} */
let _gameAreaEl = null;

/** @type {HTMLElement|null} */
let _endPanelEl = null;

/** @type {HTMLButtonElement|null} */
let _startBtn = null;

/** @type {HTMLButtonElement|null} */
let _stopBtn = null;

/** @type {HTMLButtonElement|null} */
let _playAgainBtn = null;

/** @type {HTMLButtonElement|null} */
let _returnBtn = null;

/** @type {HTMLButtonElement|null} */
let _reactionZoneBtn = null;

/** @type {HTMLElement|null} */
let _cardEl = null;

/** @type {HTMLElement|null} */
let _deckCardEl = null;

/** @type {HTMLElement|null} */
let _feedbackEl = null;

/** @type {HTMLElement|null} */
let _scoreEl = null;

/** @type {HTMLElement|null} */
let _hitsEl = null;

/** @type {HTMLElement|null} */
let _missesEl = null;

/** @type {HTMLElement|null} */
let _falseAlarmsEl = null;

/** @type {HTMLElement|null} */
let _displayTimeEl = null;

/** @type {HTMLElement|null} */
let _deckProgressEl = null;

/** @type {HTMLElement|null} */
let _sessionTimerEl = null;

/** @type {HTMLElement|null} */
let _finalScoreEl = null;

/** @type {HTMLElement|null} */
let _finalHitsEl = null;

/** @type {HTMLElement|null} */
let _finalMissesEl = null;

/** @type {HTMLElement|null} */
let _finalFalseAlarmsEl = null;

/** @type {HTMLElement|null} */
let _finalSpeedEl = null;

/** @type {HTMLElement|null} */
let _finalDeckPassesEl = null;

/** @type {ReturnType<typeof setTimeout>|null} */
let _dealTimer = null;

/**
 * Whether the document-level Space key handler is currently attached.
 * @type {boolean}
 */
let _isGlobalKeyListenerAttached = false;

/**
 * Return the rank column index in the card sprite.
 *
 * @param {string} rank
 * @returns {number}
 */
function getRankColumn(rank) {
  return game.RANKS.indexOf(rank);
}

/**
 * Return the suit row index in the card sprite.
 *
 * @param {string} suit
 * @returns {number}
 */
function getSuitRow(suit) {
  return game.SUITS.indexOf(suit);
}

/**
 * Resolve a card's slot index in the sprite sheet.
 *
 * Standard cards occupy slots 0-51 in row-major order.
 * Joker cards use the two slots immediately after that and alternate by deck pass.
 *
 * @param {{ rank: string, suit: string, isJoker: boolean }} card
 * @returns {number}
 */
function getSpriteCoordinates(card) {
  if (card.isJoker) {
    return {
      row: 0,
      column: JOKER_COLUMNS[game.getDeckPasses() % JOKER_COLUMNS.length],
    };
  }

  const suitRow = getSuitRow(card.suit);
  const rankColumn = getRankColumn(card.rank);
  if (suitRow < 0 || rankColumn < 0) return DECK_BACK_POSITION;

  return {
    row: suitRow + STANDARD_CARD_START_ROW,
    column: rankColumn,
  };
}

/**
 * Apply sprite image and position to a card element.
 *
 * @param {HTMLElement} element
 * @param {{ row: number, column: number }} coordinates
 */
function applySpriteCoordinates(element, coordinates) {
  const xPercent = (coordinates.column / (SPRITE_COLS - 1)) * 100;
  const yPercent = (coordinates.row / (SPRITE_ROWS - 1)) * 100;
  element.style.backgroundImage = `url('${CARD_SPRITE_PATH}')`;
  element.style.backgroundSize = `${SPRITE_COLS * 100}% ${SPRITE_ROWS * 100}%`;
  element.style.backgroundPosition = `${xPercent}% ${yPercent}%`;
}

/**
 * Return a short card label for fallback and accessibility.
 *
 * @param {{ rank: string, suit: string, isJoker: boolean }} card
 * @returns {string}
 */
function getCardLabel(card) {
  if (card.isJoker) return 'Joker';

  const symbols = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  };

  return `${card.rank}${symbols[card.suit] || ''}`;
}

/**
 * Clear pending deal-loop timer.
 */
export function clearDealTimer() {
  if (_dealTimer !== null) {
    clearTimeout(_dealTimer);
    _dealTimer = null;
  }
}

/**
 * Update live stats in the game area.
 */
export function updateStats() {
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_hitsEl) _hitsEl.textContent = String(game.getTriggerHits());
  if (_missesEl) _missesEl.textContent = String(game.getMisses());
  if (_falseAlarmsEl) _falseAlarmsEl.textContent = String(game.getFalseAlarms());
  if (_displayTimeEl) _displayTimeEl.textContent = String(game.getDisplayDurationMs());
  if (_deckProgressEl) _deckProgressEl.textContent = `${game.getDeckIndex()} / 52`;
}

/**
 * Render the current card in the play area.
 *
 * @param {{ rank: string, suit: string, isJoker: boolean }} card
 */
export function renderCard(card) {
  if (!_cardEl) return;

  const label = getCardLabel(card);
  _cardEl.setAttribute('aria-label', `Current card: ${label}`);

  const coordinates = getSpriteCoordinates(card);
  applySpriteCoordinates(_cardEl, coordinates);

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  _cardEl.classList.toggle('card-rat__card--red', !card.isJoker && isRed);
}

/**
 * Render the deck back image.
 */
export function renderDeckBack() {
  if (!_deckCardEl) return;
  _deckCardEl.setAttribute('aria-label', 'Deck back');
  applySpriteCoordinates(_deckCardEl, DECK_BACK_POSITION);
}

/**
 * Start or continue the deal loop.
 */
export function beginDealLoop() {
  if (!game.isRunning()) return;

  const next = game.dealNextCard();
  renderCard(next.card);
  updateStats();

  if (_feedbackEl) {
    _feedbackEl.textContent = next.mustReact
      ? 'SLAP now! (Space or click)'
      : 'Wait for a pair or a joker.';
  }

  clearDealTimer();
  _dealTimer = setTimeout(() => {
    beginDealLoop();
  }, next.displayDurationMs);
}

/**
 * Handle a reaction input from keyboard or click.
 */
export function handleReaction() {
  const outcome = game.respondToCurrentCard();

  if (_feedbackEl) {
    if (outcome === 'hit') {
      _feedbackEl.textContent = 'Nice slap!';
    } else if (outcome === 'false-alarm') {
      _feedbackEl.textContent = 'Too soon — only react to pairs or jokers.';
    }
  }

  if (outcome === 'hit') {
    playSuccessSound();
  } else if (outcome === 'false-alarm') {
    playFailureSound();
  }

  updateStats();
}

/**
 * Handle keyboard reactions.
 *
 * @param {KeyboardEvent} event
 */
export function handleKeyDown(event) {
  if (event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Space') return;
  if (!game.isRunning()) return;
  event.preventDefault();
  handleReaction();
}

/**
 * Attach the document-level Space key handler for reliable keyboard reactions.
 */
export function attachGlobalKeyListener() {
  if (_isGlobalKeyListenerAttached || typeof document === 'undefined') return;
  document.addEventListener('keydown', handleKeyDown);
  _isGlobalKeyListenerAttached = true;
}

/**
 * Detach the document-level Space key handler.
 */
export function detachGlobalKeyListener() {
  if (!_isGlobalKeyListenerAttached || typeof document === 'undefined') return;
  document.removeEventListener('keydown', handleKeyDown);
  _isGlobalKeyListenerAttached = false;
}

/**
 * Show the end panel with final values.
 *
 * @param {{
 *   score: number,
 *   triggerHits: number,
 *   misses: number,
 *   falseAlarms: number,
 *   deckPasses: number,
 *   lowestDisplayTime: number,
 * }} result
 */
export function showEndPanel(result) {
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;

  if (_finalScoreEl) _finalScoreEl.textContent = String(result.score);
  if (_finalHitsEl) _finalHitsEl.textContent = String(result.triggerHits);
  if (_finalMissesEl) _finalMissesEl.textContent = String(result.misses);
  if (_finalFalseAlarmsEl) _finalFalseAlarmsEl.textContent = String(result.falseAlarms);
  if (_finalSpeedEl) _finalSpeedEl.textContent = `${result.lowestDisplayTime} ms`;
  if (_finalDeckPassesEl) _finalDeckPassesEl.textContent = String(result.deckPasses);
}

/**
 * Initialize plugin DOM references and event listeners.
 *
 * @param {HTMLElement|null} gameContainer
 */
function init(gameContainer) {
  _container = gameContainer;
  if (!_container) return;

  _instructionsEl = _container.querySelector('#cr-instructions');
  _gameAreaEl = _container.querySelector('#cr-game-area');
  _endPanelEl = _container.querySelector('#cr-end-panel');

  _startBtn = _container.querySelector('#cr-start-btn');
  _stopBtn = _container.querySelector('#cr-stop-btn');
  _playAgainBtn = _container.querySelector('#cr-play-again-btn');
  _returnBtn = _container.querySelector('#cr-return-btn');
  _reactionZoneBtn = _container.querySelector('#cr-reaction-zone');

  _cardEl = _container.querySelector('#cr-card');
  _deckCardEl = _container.querySelector('#cr-deck-card');
  _feedbackEl = _container.querySelector('#cr-feedback');

  _scoreEl = _container.querySelector('#cr-score');
  _hitsEl = _container.querySelector('#cr-hits');
  _missesEl = _container.querySelector('#cr-misses');
  _falseAlarmsEl = _container.querySelector('#cr-false-alarms');
  _displayTimeEl = _container.querySelector('#cr-display-time');
  _deckProgressEl = _container.querySelector('#cr-deck-progress');
  _sessionTimerEl = _container.querySelector('#cr-session-timer');

  _finalScoreEl = _container.querySelector('#cr-final-score');
  _finalHitsEl = _container.querySelector('#cr-final-hits');
  _finalMissesEl = _container.querySelector('#cr-final-misses');
  _finalFalseAlarmsEl = _container.querySelector('#cr-final-false-alarms');
  _finalSpeedEl = _container.querySelector('#cr-final-speed');
  _finalDeckPassesEl = _container.querySelector('#cr-final-deck-passes');

  game.initGame();
  renderDeckBack();
  updateStats();

  if (_startBtn) _startBtn.addEventListener('click', start);
  if (_stopBtn) _stopBtn.addEventListener('click', stop);
  if (_playAgainBtn) _playAgainBtn.addEventListener('click', start);
  if (_returnBtn) _returnBtn.addEventListener('click', returnToMainMenu);
  if (_reactionZoneBtn) {
    _reactionZoneBtn.addEventListener('click', handleReaction);
    _reactionZoneBtn.addEventListener('keydown', handleKeyDown);
  }
}

/**
 * Start the Card Rat game.
 */
function start() {
  clearDealTimer();
  detachGlobalKeyListener();

  game.initGame();
  game.startGame();
  attachGlobalKeyListener();

  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_gameAreaEl) _gameAreaEl.hidden = false;

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });

  if (_sessionTimerEl) {
    _sessionTimerEl.textContent = '00:00';
  }

  if (_feedbackEl) {
    _feedbackEl.textContent = 'Game started. React to pairs and jokers.';
  }

  renderDeckBack();
  beginDealLoop();
}

/**
 * Stop the game, persist score, and show summary.
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
 */
function stop() {
  clearDealTimer();
  detachGlobalKeyListener();
  timerService.stopTimer();

  if (!game.isRunning()) {
    return {
      score: game.getScore(),
      triggerHits: game.getTriggerHits(),
      misses: game.getMisses(),
      falseAlarms: game.getFalseAlarms(),
      cardsShown: game.getCardsShown(),
      deckPasses: game.getDeckPasses(),
      lowestDisplayTime: game.getDisplayDurationMs(),
      duration: 0,
    };
  }

  const result = game.stopGame();

  void saveScore(
    GAME_ID,
    {
      score: result.score,
      sessionDurationMs: result.duration,
      lowestDisplayTime: result.lowestDisplayTime,
    },
    (previousRecord) => ({
      bestTriggerHits: Math.max(previousRecord.bestTriggerHits || 0, result.triggerHits),
    }),
  );

  showEndPanel(result);
  return result;
}

/**
 * Reset game UI state to pre-start view.
 */
function reset() {
  clearDealTimer();
  detachGlobalKeyListener();
  timerService.resetTimer();
  game.initGame();

  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';

  if (_feedbackEl) {
    _feedbackEl.textContent = 'React to rank matches and jokers.';
  }

  renderDeckBack();
  updateStats();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
