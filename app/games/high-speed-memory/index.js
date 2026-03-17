/**
 * index.js — High Speed Memory game plugin entry point for BrainSpeedExercises.
 *
 * Handles all DOM, rendering, and event logic for the High Speed Memory game UI.
 * Exports the plugin contract for dynamic loading by the app shell.
 *
 * @file High Speed Memory game plugin (UI/controller layer).
 */

import * as game from './game.js';

/** Delay in ms before flipping back a wrong-guess pair. */
const WRONG_FLIP_DELAY_MS = 900;

// ── DOM references (populated by init) ────────────────────────────────────────

/** @type {HTMLElement|null} */
let _container = null;

/** @type {HTMLElement|null} */
let _instructionsEl = null;

/** @type {HTMLElement|null} */
let _gameAreaEl = null;

/** @type {HTMLElement|null} */
let _endPanelEl = null;

/** @type {HTMLElement|null} */
let _startBtn = null;

/** @type {HTMLElement|null} */
let _stopBtn = null;

/** @type {HTMLElement|null} */
let _playAgainBtn = null;

/** @type {HTMLElement|null} */
let _gridEl = null;

/** @type {HTMLElement|null} */
let _scoreEl = null;

/** @type {HTMLElement|null} */
let _levelEl = null;

/** @type {HTMLElement|null} */
let _pairsFoundEl = null;

/** @type {HTMLElement|null} */
let _pairsTotalEl = null;

/** @type {HTMLElement|null} */
let _countdownEl = null;

/** @type {HTMLElement|null} */
let _feedbackEl = null;

/** @type {HTMLElement|null} */
let _finalScoreEl = null;

/** @type {HTMLElement|null} */
let _finalLevelEl = null;

// ── Round state (reset each round) ────────────────────────────────────────────

/**
 * Current round's card data (from game.generateGrid).
 * @type {Array<{ id: number, symbol: string, matched: boolean }>}
 */
let _roundGrid = [];

/**
 * IDs of the (up to two) cards currently flipped face-up waiting for comparison.
 * @type {number[]}
 */
let _flipped = [];

/**
 * When true, card clicks are ignored (during reveal phase or wrong-guess flip-back).
 * @type {boolean}
 */
let _flipLock = false;

/**
 * Number of pairs matched in the current round.
 * @type {number}
 */
let _pairsFound = 0;

/**
 * Pending setTimeout handle for flipping wrong guesses back.
 * @type {ReturnType<typeof setTimeout>|null}
 */
let _flipBackTimer = null;

/**
 * Pending setTimeout handle for hiding all cards after reveal phase.
 * @type {ReturnType<typeof setTimeout>|null}
 */
let _hideTimer = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Announce a message to the screen-reader feedback region.
 * @param {string} msg - Text to announce.
 */
export function announce(msg) {
  if (_feedbackEl) {
    _feedbackEl.textContent = msg;
  }
}

/**
 * Update the score and level displays.
 */
export function updateStats() {
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_levelEl) _levelEl.textContent = String(game.getLevel() + 1);
}

/**
 * Update the pairs counter display.
 */
export function updatePairsDisplay() {
  if (_pairsFoundEl) _pairsFoundEl.textContent = String(_pairsFound);
}

/**
 * Build and inject the card grid DOM for the current round.
 * Clears any existing grid content first.
 */
export function renderGrid() {
  if (!_gridEl) return;
  _gridEl.innerHTML = '';

  const { cols } = game.getGridSize(game.getLevel());
  _gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  _roundGrid.forEach((card) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hsm-card hsm-card--revealed';
    btn.setAttribute('aria-label', `Card ${card.id + 1}: ${card.symbol}`);
    btn.setAttribute('data-id', String(card.id));
    btn.textContent = card.symbol;
    btn.addEventListener('click', () => handleCardClick(card.id));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCardClick(card.id);
      }
    });
    _gridEl.appendChild(btn);
  });

  if (_pairsTotalEl) {
    const totalPairs = _roundGrid.length / 2;
    _pairsTotalEl.textContent = String(totalPairs);
  }
}

/**
 * Flip a single card face-down in the DOM (without affecting _roundGrid state).
 * @param {number} cardId - The id of the card to hide.
 */
export function hideCardEl(cardId) {
  const btn = _gridEl && _gridEl.querySelector(`[data-id="${cardId}"]`);
  if (!btn) return;
  btn.classList.remove('hsm-card--revealed', 'hsm-card--wrong');
  btn.setAttribute('aria-label', `Card ${cardId + 1}: face down`);
  btn.textContent = '';
}

/**
 * Flip a card face-up in the DOM.
 * @param {number} cardId - The id of the card to reveal.
 * @param {string} symbol - The symbol to display.
 */
export function revealCardEl(cardId, symbol) {
  const btn = _gridEl && _gridEl.querySelector(`[data-id="${cardId}"]`);
  if (!btn) return;
  btn.classList.add('hsm-card--revealed');
  btn.classList.remove('hsm-card--wrong');
  btn.setAttribute('aria-label', `Card ${cardId + 1}: ${symbol}`);
  btn.textContent = symbol;
}

/**
 * Apply the "matched" visual state to a card element.
 * @param {number} cardId - The id of the card to mark as matched.
 */
export function markCardMatched(cardId) {
  const btn = _gridEl && _gridEl.querySelector(`[data-id="${cardId}"]`);
  if (!btn) return;
  btn.classList.add('hsm-card--matched');
  btn.classList.remove('hsm-card--revealed', 'hsm-card--wrong');
  btn.disabled = true;
}

/**
 * Apply the "wrong guess" visual state to a card element briefly.
 * @param {number} cardId - The id of the card to mark as wrong.
 */
export function markCardWrong(cardId) {
  const btn = _gridEl && _gridEl.querySelector(`[data-id="${cardId}"]`);
  if (!btn) return;
  btn.classList.add('hsm-card--wrong');
}

/**
 * Hide all un-matched cards after the reveal phase ends.
 * Called by the timer set in startRound.
 */
export function hideAllCards() {
  _roundGrid.forEach((card) => {
    if (!card.matched) {
      hideCardEl(card.id);
    }
  });
  if (_countdownEl) _countdownEl.hidden = true;
  _flipLock = false;
  announce('Cards hidden — find the matching pairs!');
}

/**
 * Start a new round: generate a fresh grid, render it revealed, then hide after delay.
 */
export function startRound() {
  _pairsFound = 0;
  _flipped = [];
  _flipLock = true;

  _roundGrid = game.generateGrid(game.getLevel());
  renderGrid();
  updateStats();
  updatePairsDisplay();

  const displayMs = game.getDisplayDurationMs(game.getLevel());
  const seconds = Math.ceil(displayMs / 1000);

  if (_countdownEl) {
    _countdownEl.textContent = `Memorize! Cards hide in ${seconds} second${seconds !== 1 ? 's' : ''}…`;
    _countdownEl.hidden = false;
  }

  announce(`Level ${game.getLevel() + 1}. Memorize the ${_roundGrid.length} cards. They will hide in ${seconds} seconds.`);

  _hideTimer = setTimeout(hideAllCards, displayMs);
}

/**
 * Handle a card being clicked (or activated via keyboard).
 * Ignores clicks when the flip lock is active or the card is already matched/flipped.
 *
 * @param {number} cardId - The id of the clicked card.
 */
export function handleCardClick(cardId) {
  if (_flipLock) return;
  if (_flipped.includes(cardId)) return;

  const card = _roundGrid.find((c) => c.id === cardId);
  if (!card || card.matched) return;

  // Flip the card face-up
  revealCardEl(cardId, card.symbol);
  _flipped.push(cardId);

  if (_flipped.length < 2) return;

  // Two cards flipped — check for a match
  _flipLock = true;
  const [idA, idB] = _flipped;
  const cardA = _roundGrid.find((c) => c.id === idA);
  const cardB = _roundGrid.find((c) => c.id === idB);

  if (game.checkMatch(cardA.symbol, cardB.symbol)) {
    // Match found
    cardA.matched = true;
    cardB.matched = true;
    markCardMatched(idA);
    markCardMatched(idB);
    game.addCorrectPair();
    _pairsFound += 1;
    updateStats();
    updatePairsDisplay();
    announce(`Match! ${cardA.symbol}`);
    _flipped = [];
    _flipLock = false;

    const totalPairs = _roundGrid.length / 2;
    if (_pairsFound >= totalPairs) {
      onRoundComplete();
    }
  } else {
    // No match — shake and flip back
    markCardWrong(idA);
    markCardWrong(idB);
    announce('No match. Try again.');

    _flipBackTimer = setTimeout(() => {
      hideCardEl(idA);
      hideCardEl(idB);
      _flipped = [];
      _flipLock = false;
    }, WRONG_FLIP_DELAY_MS);
  }
}

/**
 * Called when all pairs in the current round have been found.
 * Advances to the next level and starts a new round.
 */
function onRoundComplete() {
  game.completeRound();
  announce(`Round complete! Starting level ${game.getLevel() + 1}.`);
  // Brief pause so the player sees the complete board before the next round
  setTimeout(startRound, 1200);
}

/**
 * Clear any pending timers (used during stop/reset).
 */
function clearTimers() {
  if (_flipBackTimer !== null) {
    clearTimeout(_flipBackTimer);
    _flipBackTimer = null;
  }
  if (_hideTimer !== null) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }
}

/**
 * Show the end-game panel with final results.
 * @param {{ score: number, level: number }} result
 */
function showEndPanel(result) {
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;
  if (_finalScoreEl) _finalScoreEl.textContent = String(result.score);
  if (_finalLevelEl) _finalLevelEl.textContent = String(result.level + 1);
}

// ── Plugin contract ────────────────────────────────────────────────────────────

/** Human-readable name returned as part of the plugin contract. */
const name = 'High Speed Memory';

/**
 * Initialize the plugin.
 * Called once after interface.html has been injected into the game container.
 * Queries DOM elements and attaches event listeners; does not start timers.
 *
 * @param {HTMLElement} gameContainer - The container element holding the game HTML.
 */
function init(gameContainer) {
  _container = gameContainer;
  game.initGame();

  if (!_container) return;

  _instructionsEl = _container.querySelector('#hsm-instructions');
  _gameAreaEl = _container.querySelector('#hsm-game-area');
  _endPanelEl = _container.querySelector('#hsm-end-panel');
  _startBtn = _container.querySelector('#hsm-start-btn');
  _stopBtn = _container.querySelector('#hsm-stop-btn');
  _playAgainBtn = _container.querySelector('#hsm-play-again-btn');
  _gridEl = _container.querySelector('#hsm-grid');
  _scoreEl = _container.querySelector('#hsm-score');
  _levelEl = _container.querySelector('#hsm-level');
  _pairsFoundEl = _container.querySelector('#hsm-pairs-found');
  _pairsTotalEl = _container.querySelector('#hsm-pairs-total');
  _countdownEl = _container.querySelector('#hsm-countdown');
  _feedbackEl = _container.querySelector('#hsm-feedback');
  _finalScoreEl = _container.querySelector('#hsm-final-score');
  _finalLevelEl = _container.querySelector('#hsm-final-level');

  if (_startBtn) {
    _startBtn.addEventListener('click', () => start());
  }
  if (_stopBtn) {
    _stopBtn.addEventListener('click', () => stop());
  }
  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      start();
    });
  }
}

/**
 * Start the game.
 * Hides the instructions panel, shows the game area, and begins the first round.
 */
function start() {
  game.startGame();

  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_gameAreaEl) _gameAreaEl.hidden = false;

  startRound();
}

/**
 * Stop the game and return the final result.
 * Clears timers and shows the end-game panel.
 *
 * @returns {{ score: number, level: number, roundsCompleted: number, duration: number }}
 */
function stop() {
  clearTimers();
  const result = game.stopGame();

  if (typeof window !== 'undefined' && window.api) {
    window.api.invoke('progress:save', {
      gameId: 'high-speed-memory',
      score: result.score,
      level: result.level,
    }).catch(() => {});
  }

  showEndPanel(result);
  return result;
}

/**
 * Reset the game to its initial state without reloading interface.html.
 */
function reset() {
  clearTimers();
  game.initGame();

  _roundGrid = [];
  _flipped = [];
  _flipLock = false;
  _pairsFound = 0;

  if (_gridEl) _gridEl.innerHTML = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_countdownEl) _countdownEl.hidden = true;
  if (_feedbackEl) _feedbackEl.textContent = '';

  updateStats();
  updatePairsDisplay();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
