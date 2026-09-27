/**
 * index.js — High Speed Memory game plugin entry point for BrainSpeedExercises.
 *
 * Handles all DOM, rendering, and event logic for the High Speed Memory game UI.
 * Exports the plugin contract for dynamic loading by the app shell.
 *
 * @file High Speed Memory game plugin (UI/controller layer).
 */

import * as game from './game.js';
import { playFailureSound, playSuccessSound } from '../../components/audioService.js';
import * as timerService from '../../components/timerService.js';
import { saveScore } from '../../components/scoreService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import { renderTrendChart } from '../../components/trendChartService.js';
import {
  cancelTutorial,
  finishPracticeRound,
  guidePracticeResponse,
  isPracticing,
  isTutorialActive,
  promptPracticeResponse,
  replayTutorial,
  startTutorialIfNeeded,
} from './tutorial/tutorial.js';

/**
 * Delay in ms before a wrongly-clicked Distractor card flips back face-down.
 */
export const WRONG_FLIP_DELAY_MS = 900;

/**
 * Duration in ms to show the correct (Primary) card positions after a wrong guess.
 * Matches the inter-round pause used after a correct round so the player has the
 * same amount of time to study the layout.
 */
const REVEAL_ANSWER_MS = 1200;

/**
 * Base path for card images relative to the renderer's root (app/index.html).
 * Images are stored alongside this game's own files.
 */
const IMAGES_PATH = 'games/high-speed-memory/images/';

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
let _replayTutorialBtn = null;

/** @type {HTMLElement|null} */
let _stopBtn = null;

/** @type {HTMLElement|null} */
let _playAgainBtn = null;

/** @type {HTMLElement|null} */
let _returnToMenuBtn = null;

/** @type {HTMLElement|null} */
let _gridEl = null;

/** @type {HTMLElement|null} */
let _scoreEl = null;

/** @type {HTMLElement|null} */
let _levelEl = null;

/** @type {HTMLElement|null} */
let _foundEl = null;

/** @type {HTMLElement|null} */
let _feedbackEl = null;

/** @type {HTMLElement|null} */
let _finalScoreEl = null;

/** @type {HTMLElement|null} */
let _finalLevelEl = null;

/** @type {HTMLElement|null} */
let _streakEl = null;

/** @type {HTMLElement|null} */
let _displayTimeEl = null;

/** @type {HTMLElement|null} */
let _sessionTimerEl = null;

/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;
/** @type {HTMLElement|null} */
let _trendEmptyEl = null;
/** @type {HTMLElement|null} */
let _trendLatestEl = null;

// ── Round state (reset each round) ────────────────────────────────────────────

/**
 * Current round's card data (from game.generateGrid).
 * @type {Array<{ id: number, image: string, matched: boolean }>}
 */
let _roundGrid = [];

/**
 * When true, card clicks are ignored (during reveal phase or wrong-card flip-back).
 * @type {boolean}
 */
let _flipLock = false;

/**
 * Number of Primary cards correctly found in the current round.
 * @type {number}
 */
let _primaryFound = 0;

/**
 * Pending setTimeout handle for restarting the round after a wrong guess.
 * @type {ReturnType<typeof setTimeout>|null}
 */
let _roundRestartTimer = null;

/**
 * Pending setTimeout handle for the brief answer-reveal phase after a wrong guess.
 * @type {ReturnType<typeof setTimeout>|null}
 */
let _answerRevealTimer = null;

/**
 * Pending setTimeout handle for hiding all cards after reveal phase.
 * @type {ReturnType<typeof setTimeout>|null}
 */
let _hideTimer = null;

/**
 * Pending setTimeout handle for starting the next round after a completed round.
 * @type {ReturnType<typeof setTimeout>|null}
 */
let _nextRoundTimer = null;

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
 * Update the score, level, streak, and display time displays.
 */
export function updateStats() {
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_levelEl) _levelEl.textContent = String(game.getLevel() + 1);
  if (_streakEl) _streakEl.textContent = String(game.getConsecutiveCorrectRounds());
  if (_displayTimeEl) {
    _displayTimeEl.textContent = String(game.getDisplayDurationMs(game.getLevel()));
  }
}

/**
 * Render the speed trend chart with the latest history.
 */
export function updateTrendChart() {
  renderTrendChart(
    { lineEl: _trendLineEl, emptyEl: _trendEmptyEl, latestEl: _trendLatestEl },
    game.getSpeedHistory(),
    game.getDisplayDurationMs(game.getLevel()),
  );
}

/**
 * Update the "Found: x/3" counter display.
 */
export function updateFoundDisplay() {
  if (_foundEl) _foundEl.textContent = String(_primaryFound);
}

/**
 * Build and inject the card grid DOM for the current round.
 * Clears any existing grid content first.
 * Cards are rendered face-up during the reveal phase.
 */
export function renderGrid() {
  if (!_gridEl) return;
  _gridEl.innerHTML = '';

  // Grids are always square, so the size follows from the card count.
  const size = Math.sqrt(_roundGrid.length);
  _gridEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  _gridEl.style.gridTemplateRows = `repeat(${size}, 1fr)`;

  _roundGrid.forEach((card) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hsm-card hsm-card--revealed';
    btn.setAttribute('aria-label', `Card ${card.id + 1}`);
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
}

/**
 * Find the button for a card in the current grid.
 * @param {number} cardId - The id of the card.
 * @returns {HTMLButtonElement|null}
 */
function getCardEl(cardId) {
  return _gridEl && _gridEl.querySelector(`[data-id="${cardId}"]`);
}

/**
 * Flip a single card face-down in the DOM (does not modify _roundGrid state).
 * Hides the card image and removes the revealed styling.
 * @param {number} cardId - The id of the card to hide.
 */
export function hideCardEl(cardId) {
  const btn = getCardEl(cardId);
  if (!btn) return;
  btn.classList.remove('hsm-card--revealed', 'hsm-card--wrong');
  btn.setAttribute('aria-label', `Card ${cardId + 1}: face down`);
  const img = btn.querySelector('img');
  if (img) img.style.display = 'none';
}

/**
 * Flip a card face-up in the DOM.
 * @param {number} cardId - The id of the card to reveal.
 * @param {string} imageName - The image filename to display.
 */
export function revealCardEl(cardId, imageName) {
  const btn = getCardEl(cardId);
  if (!btn) return;
  btn.classList.add('hsm-card--revealed');
  btn.classList.remove('hsm-card--wrong');
  btn.setAttribute('aria-label', `Card ${cardId + 1}: revealed`);
  const img = btn.querySelector('img');
  if (img) {
    img.src = `${IMAGES_PATH}${imageName}`;
    img.style.display = '';
  }
}

/**
 * Apply the "matched" visual state to a card element (correctly found Primary card).
 * @param {number} cardId - The id of the card to mark as matched.
 */
export function markCardMatched(cardId) {
  const btn = getCardEl(cardId);
  if (!btn) return;
  btn.classList.add('hsm-card--matched');
  btn.classList.remove('hsm-card--revealed', 'hsm-card--wrong');
  btn.disabled = true;
  btn.setAttribute('aria-label', `Card ${cardId + 1}: matched`);
  const img = btn.querySelector('img');
  if (img) img.style.display = '';
}

/**
 * Apply the "wrong guess" visual state to a card element.
 * @param {number} cardId - The id of the card to mark as wrong.
 */
export function markCardWrong(cardId) {
  const btn = getCardEl(cardId);
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
  _flipLock = false;
  announce(`Cards hidden — find the ${game.PRIMARY_COUNT} matching cards!`);
  if (isPracticing()) promptPracticeResponse();
}

/**
 * Reveal all unmatched Primary cards so the player can see the correct positions.
 * Called briefly after a wrong guess before restarting the round.
 */
export function revealPrimaryCards() {
  _roundGrid.forEach((card) => {
    if (!card.matched && game.isPrimary(card.image)) {
      revealCardEl(card.id, card.image);
    }
  });
}

/**
 * Show `grid` face up, then flip it face down after `displayMs`. Card clicks are ignored
 * until then.
 *
 * @param {Array<{ id: number, image: string, matched: boolean }>} grid - The round's cards.
 * @param {number} displayMs - How long the cards stay face up, in ms.
 */
function playRound(grid, displayMs) {
  _primaryFound = 0;
  _flipLock = true;
  _roundGrid = grid;
  renderGrid();
  updateFoundDisplay();
  _hideTimer = setTimeout(hideAllCards, displayMs);
}

/**
 * Start a new round: generate a fresh grid, render it revealed, then hide after delay.
 * Does nothing if the game is no longer running.
 */
export function startRound() {
  if (!game.isRunning()) return;

  const level = game.getLevel();
  playRound(game.generateGrid(level), game.getDisplayDurationMs(level));
  updateStats();
  announce(`Level ${level + 1}. Find the ${game.PRIMARY_COUNT} matching cards.`);
}

/**
 * Handle a card click (or keyboard activation).
 * Each click is evaluated immediately:
 *  - Primary card → mark found; advance level when all PRIMARY_COUNT are found.
 *  - Distractor card → play wrong-guess sound and flip back after WRONG_FLIP_DELAY_MS.
 * Clicks are ignored during the reveal phase (flip lock) or on already-matched cards.
 *
 * @param {number} cardId - The id of the clicked card.
 */
export function handleCardClick(cardId) {
  if (_flipLock) return;

  const card = _roundGrid.find((c) => c.id === cardId);
  if (!card || card.matched) return;

  // Reveal the card so the player can see what they clicked
  revealCardEl(cardId, card.image);

  if (game.isPrimary(card.image)) {
    onPrimaryFound(card);
  } else {
    onWrongGuess(cardId);
  }
}

/**
 * Keep a correctly found Primary card face up. In a session it scores, and finding the last
 * one completes the round. In a practice round nothing is scored: the tutorial rings the next
 * card, or takes the result once all are found.
 *
 * @param {{ id: number, matched: boolean }} card - The Primary card that was clicked.
 */
function onPrimaryFound(card) {
  const practicing = isPracticing();
  card.matched = true;
  markCardMatched(card.id);
  _primaryFound += 1;
  if (!practicing) {
    game.addCorrectGroup();
    updateStats();
  }
  updateFoundDisplay();
  announce(`Found one! ${_primaryFound} of ${game.PRIMARY_COUNT} found.`);

  if (_primaryFound < game.PRIMARY_COUNT) {
    if (practicing) guidePracticeResponse();
  } else if (practicing) {
    playSuccessSound();
    finishPracticeRound(true);
  } else {
    onRoundComplete();
  }
}

/**
 * Mark a wrong guess and lock the board. In a session this breaks the streak, then shows
 * where the Primary cards were and replays the round with a new grid. In a practice round
 * the Primary cards are shown at once and the tutorial offers the retry.
 *
 * @param {number} cardId - The id of the Distractor card that was clicked.
 */
function onWrongGuess(cardId) {
  markCardWrong(cardId);
  playFailureSound();
  _flipLock = true;
  clearTimers();

  if (isPracticing()) {
    revealPrimaryCards();
    finishPracticeRound(false);
    return;
  }

  game.resetConsecutiveRounds();
  updateStats();
  updateTrendChart();
  announce('Wrong guess! The round will restart.');

  _roundRestartTimer = setTimeout(() => {
    revealPrimaryCards();
    announce('Here are the target card positions.');
    _answerRevealTimer = setTimeout(() => {
      startRound();
    }, REVEAL_ANSWER_MS);
  }, WRONG_FLIP_DELAY_MS);
}

/**
 * Called when all PRIMARY_COUNT cards in the current round have been found.
 * Advances the level-up streak (and level if streak reaches ROUNDS_TO_LEVEL_UP),
 * then starts the next round after a brief pause.
 */
function onRoundComplete() {
  game.completeRound();
  playSuccessSound();
  updateStats();
  updateTrendChart();

  // After completeRound: consecutiveCorrectRounds resets to 0 on level advance
  const leveledUp = game.getConsecutiveCorrectRounds() === 0;
  if (leveledUp) {
    announce(`Level up! Welcome to level ${game.getLevel() + 1}.`);
  } else {
    const streak = game.getConsecutiveCorrectRounds();
    const needed = game.ROUNDS_TO_LEVEL_UP;
    announce(
      `Round complete! ${streak} of ${needed} in a row — ${needed - streak} more to level up!`,
    );
  }

  // Brief pause so the player sees the completed board before the next round starts
  _nextRoundTimer = setTimeout(() => {
    _nextRoundTimer = null;
    startRound();
  }, 1200);
}

/**
 * Clear any pending timers (used during stop/reset).
 */
function clearTimers() {
  if (_roundRestartTimer !== null) {
    clearTimeout(_roundRestartTimer);
    _roundRestartTimer = null;
  }
  if (_answerRevealTimer !== null) {
    clearTimeout(_answerRevealTimer);
    _answerRevealTimer = null;
  }
  if (_hideTimer !== null) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }
  if (_nextRoundTimer !== null) {
    clearTimeout(_nextRoundTimer);
    _nextRoundTimer = null;
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

/**
 * Show the game area, with no leftover feedback, in place of the welcome and end panels.
 */
function showGameArea() {
  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_gameAreaEl) _gameAreaEl.hidden = false;
  announce('');
}

/**
 * Start a gameplay session immediately without tutorial gating.
 */
function beginGameSession() {
  game.startGame();

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });

  showGameArea();
  startRound();
}

/**
 * Round controls the tutorial uses to play practice rounds with the real grid, reveal timing,
 * and card controls.
 *
 * @type {import('./tutorial/tutorial.js').PracticeRoundControls}
 */
const PRACTICE_CONTROLS = Object.freeze({
  showGameArea,
  playRound,
  stopRound() {
    clearTimers();
    _flipLock = true;
  },
  getCard: getCardEl,
  announce,
});

/**
 * Options for launching the tutorial from this game.
 *
 * @returns {import('./tutorial/tutorial.js').TutorialLaunchOptions}
 */
function tutorialOptions() {
  return { container: _container, controls: PRACTICE_CONTROLS, onComplete: beginGameSession };
}

/**
 * Build the result returned by stop() when no session is running.
 *
 * @returns {{ score: number, level: number, roundsCompleted: number, duration: number }}
 */
function buildIdleResult() {
  return {
    score: game.getScore(),
    level: game.getLevel(),
    roundsCompleted: game.getRoundsCompleted(),
    duration: 0,
  };
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
  _replayTutorialBtn = _container.querySelector('#hsm-replay-tutorial-btn');
  _stopBtn = _container.querySelector('#hsm-stop-btn');
  _playAgainBtn = _container.querySelector('#hsm-play-again-btn');
  _returnToMenuBtn = _container.querySelector('#hsm-return-btn');
  _gridEl = _container.querySelector('#hsm-grid');
  _scoreEl = _container.querySelector('#hsm-score');
  _levelEl = _container.querySelector('#hsm-level');
  _foundEl = _container.querySelector('#hsm-found');
  _feedbackEl = _container.querySelector('#hsm-feedback');
  _finalScoreEl = _container.querySelector('#hsm-final-score');
  _finalLevelEl = _container.querySelector('#hsm-final-level');
  _streakEl = _container.querySelector('#hsm-streak');
  _displayTimeEl = _container.querySelector('#hsm-display-time');
  _sessionTimerEl = _container.querySelector('#hsm-session-timer');
  _trendLineEl = _container.querySelector('#hsm-trend-line');
  _trendEmptyEl = _container.querySelector('#hsm-trend-empty');
  _trendLatestEl = _container.querySelector('#hsm-trend-latest');

  if (_startBtn) {
    _startBtn.addEventListener('click', () => { void start(); });
  }
  // Replay always shows the tutorial, then starts a session.
  if (_replayTutorialBtn) {
    _replayTutorialBtn.addEventListener('click', () => {
      void replayTutorial(tutorialOptions());
    });
  }
  if (_stopBtn) {
    _stopBtn.addEventListener('click', () => stop());
  }
  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      void start();
    });
  }
  if (_returnToMenuBtn) {
    _returnToMenuBtn.addEventListener('click', () => returnToMainMenu());
  }
}

/**
 * Start a gameplay session, showing the tutorial first if the player has not seen it.
 *
 * @returns {Promise<void>}
 */
function start() {
  return startTutorialIfNeeded(tutorialOptions());
}

/**
 * Stop the game, persist progress, and show the end-game panel.
 * Progress is saved asynchronously (fire-and-forget); the game result is returned synchronously.
 *
 * With no session running (on the welcome screen, during the tutorial, or when the app
 * quits after a session ended) there is nothing to save and the screen is left alone,
 * except that leaving a tutorial this way cancels it and returns to the welcome screen.
 *
 * @returns {{ score: number, level: number, roundsCompleted: number, duration: number }}
 */
function stop() {
  clearTimers();

  if (!game.isRunning()) {
    if (isTutorialActive()) reset();
    return buildIdleResult();
  }

  const result = game.stopGame();
  const sessionDurationMs = timerService.stopTimer();

  // Persist progress — fire and forget (never blocks the UI).
  saveScore(game.GAME_ID, {
    score: result.score,
    sessionDurationMs,
    level: result.level,
    lowestDisplayTime: game.getDisplayDurationMs(result.level),
  });

  showEndPanel(result);
  return result;
}

/**
 * Reset the game to its initial state without reloading interface.html.
 */
function reset() {
  cancelTutorial();
  clearTimers();
  game.initGame();

  timerService.resetTimer();
  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';

  _roundGrid = [];
  _flipLock = false;
  _primaryFound = 0;

  if (_gridEl) _gridEl.innerHTML = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_feedbackEl) _feedbackEl.textContent = '';
  if (_streakEl) _streakEl.textContent = '0';

  updateStats();
  updateFoundDisplay();
  updateTrendChart();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};

