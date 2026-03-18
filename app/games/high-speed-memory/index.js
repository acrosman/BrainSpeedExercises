/**
 * index.js — High Speed Memory game plugin entry point for BrainSpeedExercises.
 *
 * Handles all DOM, rendering, and event logic for the High Speed Memory game UI.
 * Exports the plugin contract for dynamic loading by the app shell.
 *
 * @file High Speed Memory game plugin (UI/controller layer).
 */

import * as game from './game.js';

/**
 * Delay in ms before flipping back a wrong-guess group.
 * Long enough for the player to see which cards were wrong.
 */
const WRONG_FLIP_DELAY_MS = 900;

/**
 * Base path for card images relative to the renderer's root (app/index.html).
 * Images are stored alongside this game's own files.
 */
const IMAGES_PATH = 'games/high-speed-memory/images/';

/** Src for the card-back image (face-down state). */
const CARD_BACK_SRC = `${IMAGES_PATH}card-back.svg`;

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
let _groupsFoundEl = null;

/** @type {HTMLElement|null} */
let _groupsTotalEl = null;

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
 * @type {Array<{ id: number, image: string, matched: boolean }>}
 */
let _roundGrid = [];

/**
 * IDs of cards currently flipped face-up waiting for comparison (up to MATCH_SIZE).
 * @type {number[]}
 */
let _flipped = [];

/**
 * When true, card clicks are ignored (during reveal phase or wrong-guess flip-back).
 * @type {boolean}
 */
let _flipLock = false;

/**
 * Number of groups matched in the current round.
 * @type {number}
 */
let _groupsFound = 0;

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

// ── Audio ─────────────────────────────────────────────────────────────────────

/**
 * Play a short buzzer sound to indicate a wrong guess.
 * Uses the Web Audio API; silently no-ops if the API is unavailable.
 */
export function playWrongSound() {
  const AudioCtx = (typeof AudioContext !== 'undefined' && AudioContext)
    // eslint-disable-next-line no-undef
    || (typeof webkitAudioContext !== 'undefined' && webkitAudioContext)
    || null;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => { ctx.close().catch(() => {}); };
  } catch {
    // Ignore any audio initialization errors
  }
}

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
 * Update the groups-found counter display.
 */
export function updateGroupsDisplay() {
  if (_groupsFoundEl) _groupsFoundEl.textContent = String(_groupsFound);
}

/**
 * Build and inject the card grid DOM for the current round.
 * Clears any existing grid content first.
 * Cards are rendered face-up during the reveal phase.
 */
export function renderGrid() {
  if (!_gridEl) return;
  _gridEl.innerHTML = '';

  const { rows, cols } = game.getGridSize(game.getLevel());

  // Set CSS grid columns and a --cols custom property used by the stylesheet
  _gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  _gridEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  _gridEl.style.setProperty('--cols', String(cols));
  _gridEl.style.setProperty('--rows', String(rows));

  _roundGrid.forEach((card) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hsm-card hsm-card--revealed';
    btn.setAttribute('aria-label', `Card ${card.id + 1}: revealed`);
    btn.setAttribute('data-id', String(card.id));
    btn.setAttribute('data-image', card.image);

    const img = document.createElement('img');
    img.src = `${IMAGES_PATH}${card.image}`;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.className = 'hsm-card__img';
    btn.appendChild(img);

    btn.addEventListener('click', () => handleCardClick(card.id));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCardClick(card.id);
      }
    });
    _gridEl.appendChild(btn);
  });

  // Fill remaining grid cells with empty placeholders if n*n is not divisible by MATCH_SIZE
  const emptyCount = rows * cols - _roundGrid.length;
  for (let i = 0; i < emptyCount; i += 1) {
    const placeholder = document.createElement('div');
    placeholder.className = 'hsm-card hsm-card--empty';
    placeholder.setAttribute('aria-hidden', 'true');
    _gridEl.appendChild(placeholder);
  }

  if (_groupsTotalEl) {
    _groupsTotalEl.textContent = String(_roundGrid.length / game.MATCH_SIZE);
  }
}

/**
 * Flip a single card face-down in the DOM (does not modify _roundGrid state).
 * @param {number} cardId - The id of the card to hide.
 */
export function hideCardEl(cardId) {
  const btn = _gridEl && _gridEl.querySelector(`[data-id="${cardId}"]`);
  if (!btn) return;
  btn.classList.remove('hsm-card--revealed', 'hsm-card--wrong');
  btn.setAttribute('aria-label', `Card ${cardId + 1}: face down`);
  const img = btn.querySelector('img');
  if (img) {
    img.src = CARD_BACK_SRC;
  }
}

/**
 * Flip a card face-up in the DOM.
 * @param {number} cardId - The id of the card to reveal.
 * @param {string} imageName - The image filename to display.
 */
export function revealCardEl(cardId, imageName) {
  const btn = _gridEl && _gridEl.querySelector(`[data-id="${cardId}"]`);
  if (!btn) return;
  btn.classList.add('hsm-card--revealed');
  btn.classList.remove('hsm-card--wrong');
  btn.setAttribute('aria-label', `Card ${cardId + 1}: revealed`);
  const img = btn.querySelector('img');
  if (img) {
    img.src = `${IMAGES_PATH}${imageName}`;
  }
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
 * Apply the "wrong guess" visual state to a card element.
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
  announce('Cards hidden — find the matching groups!');
}

/**
 * Start a new round: generate a fresh grid, render it revealed, then hide after delay.
 */
export function startRound() {
  _groupsFound = 0;
  _flipped = [];
  _flipLock = true;

  _roundGrid = game.generateGrid(game.getLevel());
  renderGrid();
  updateStats();
  updateGroupsDisplay();

  const displayMs = game.getDisplayDurationMs(game.getLevel());
  const ms = displayMs < 1000
    ? `${displayMs}ms`
    : `${Math.ceil(displayMs / 1000)} second${Math.ceil(displayMs / 1000) !== 1 ? 's' : ''}`;

  if (_countdownEl) {
    _countdownEl.textContent = `Memorize! Cards hide in ${ms}…`;
    _countdownEl.hidden = false;
  }

  announce(
    `Level ${game.getLevel() + 1}. Memorize the ${_roundGrid.length} cards. They hide in ${ms}.`,
  );

  _hideTimer = setTimeout(hideAllCards, displayMs);
}

/**
 * Handle a card being clicked (or activated via keyboard).
 * Collects MATCH_SIZE flips before checking for a group match.
 * Ignores clicks when flip lock is active or the card is already matched/flipped.
 *
 * @param {number} cardId - The id of the clicked card.
 */
export function handleCardClick(cardId) {
  if (_flipLock) return;
  if (_flipped.includes(cardId)) return;

  const card = _roundGrid.find((c) => c.id === cardId);
  if (!card || card.matched) return;

  // Flip the card face-up
  revealCardEl(cardId, card.image);
  _flipped.push(cardId);

  if (_flipped.length < game.MATCH_SIZE) return;

  // MATCH_SIZE cards flipped — evaluate group
  _flipLock = true;
  const flippedCards = _flipped.map((id) => _roundGrid.find((c) => c.id === id));
  const images = flippedCards.map((c) => c.image);

  if (game.checkMatch(...images)) {
    // All MATCH_SIZE cards match
    flippedCards.forEach((c) => {
      c.matched = true;
      markCardMatched(c.id);
    });
    game.addCorrectGroup();
    _groupsFound += 1;
    updateStats();
    updateGroupsDisplay();
    announce('Match! Found a group.');
    _flipped = [];
    _flipLock = false;

    const totalGroups = _roundGrid.length / game.MATCH_SIZE;
    if (_groupsFound >= totalGroups) {
      onRoundComplete();
    }
  } else {
    // No match — play sound and flip back
    flippedCards.forEach((c) => markCardWrong(c.id));
    playWrongSound();
    announce('No match. Try again.');

    _flipBackTimer = setTimeout(() => {
      _flipped.forEach((id) => hideCardEl(id));
      _flipped = [];
      _flipLock = false;
    }, WRONG_FLIP_DELAY_MS);
  }
}

/**
 * Called when all groups in the current round have been found.
 * Advances to the next level and starts a new round.
 */
function onRoundComplete() {
  game.completeRound();
  announce(`Round complete! Starting level ${game.getLevel() + 1}.`);
  // Brief pause so the player sees the completed board before the next round starts
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
  _groupsFoundEl = _container.querySelector('#hsm-groups-found');
  _groupsTotalEl = _container.querySelector('#hsm-groups-total');
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
 * Stop the game, persist progress, and show the end-game panel.
 * Progress is saved asynchronously (fire-and-forget); the game result is returned synchronously.
 *
 * @returns {{ score: number, level: number, roundsCompleted: number, duration: number }}
 */
function stop() {
  clearTimers();
  const result = game.stopGame();

  // Save progress asynchronously — fire and forget
  (async () => {
    if (typeof window !== 'undefined' && window.api) {
      try {
        let existing = { playerId: 'default', games: {} };
        try {
          existing = await window.api.invoke('progress:load', { playerId: 'default' }) || existing;
        } catch {
          // If load fails, continue with defaults
        }
        const prev = (existing.games && existing.games['high-speed-memory']) || {};
        const updated = {
          ...existing,
          games: {
            ...existing.games,
            'high-speed-memory': {
              highScore: Math.max(result.score, prev.highScore || 0),
              sessionsPlayed: (prev.sessionsPlayed || 0) + 1,
              lastPlayed: new Date().toISOString(),
              highestLevel: Math.max(result.level, prev.highestLevel || 0),
            },
          },
        };
        await window.api.invoke('progress:save', { playerId: 'default', data: updated });
      } catch {
        // Swallow all progress save/load errors
      }
    }
  })();

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
  _groupsFound = 0;

  if (_gridEl) _gridEl.innerHTML = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_countdownEl) _countdownEl.hidden = true;
  if (_feedbackEl) _feedbackEl.textContent = '';

  updateStats();
  updateGroupsDisplay();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};

