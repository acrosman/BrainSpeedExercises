/**
 * index.js — Orbit Sprite Memory plugin entry point.
 *
 * Controls DOM interactions, timed round playback, and plugin lifecycle.
 *
 * @file Orbit Sprite Memory game plugin (UI/controller layer).
 */

import * as game from './game.js';
import { playSuccessSound, playFailureSound } from '../../components/audioService.js';
import * as timerService from '../../components/timerService.js';
import { saveScore } from '../../components/scoreService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';

/** Delay before automatically starting the next round after answer submit. */
const NEXT_ROUND_DELAY_MS = 900;

/** How long to show all round images after selection review. */
const REVEAL_ALL_MS = 700;

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
let _returnBtn = null;

/** @type {HTMLElement|null} */
let _boardEl = null;

/** @type {HTMLElement|null} */
let _activeSpriteEl = null;

/** @type {HTMLElement|null} */
let _targetPreviewEl = null;

/** @type {HTMLElement|null} */
let _scoreEl = null;

/** @type {HTMLElement|null} */
let _levelEl = null;

/** @type {HTMLElement|null} */
let _streakEl = null;

/** @type {HTMLElement|null} */
let _displayTimeEl = null;

/** @type {HTMLElement|null} */
let _bestLevelEl = null;

/** @type {HTMLElement|null} */
let _bestScoreEl = null;

/** @type {HTMLElement|null} */
let _feedbackEl = null;

/** @type {HTMLElement|null} */
let _finalScoreEl = null;

/** @type {HTMLElement|null} */
let _finalLevelEl = null;

/** @type {HTMLElement|null} */
let _finalBestLevelEl = null;

/** @type {HTMLElement|null} */
let _finalBestScoreEl = null;

/** @type {HTMLElement|null} */
let _sessionTimerEl = null;

/** @type {ReturnType<typeof setTimeout>[]} */
let _timers = [];

/** @type {Set<number>} */
let _selectedPositions = new Set();

/** @type {boolean} */
let _inputEnabled = false;

/** @type {ReturnType<typeof game.createRound>|null} */
let _currentRound = null;

/**
 * Flashes board edge to indicate a reviewed answer.
 *
 * @param {'success'|'failure'} type - Flash type.
 */
export function flashBoard(type) {
  if (!_boardEl) return;
  _boardEl.classList.remove('osm-board--success', 'osm-board--failure');
  // Restart animation when reusing the same class.
  void _boardEl.offsetWidth;
  _boardEl.classList.add(type === 'success' ? 'osm-board--success' : 'osm-board--failure');
  _timers.push(setTimeout(() => {
    if (_boardEl) _boardEl.classList.remove('osm-board--success', 'osm-board--failure');
  }, 320));
}

/**
 * Restores board visuals to the default round-start appearance.
 */
export function resetBoardVisualState() {
  if (!_boardEl) return;
  _boardEl.classList.remove('osm-board--success', 'osm-board--failure');
}

/**
 * Calculates CSS background-position for one sprite id from a 4x2 sprite sheet.
 *
 * @param {number} spriteId - Zero-based sprite id.
 * @returns {string}
 */
export function getSpriteBackgroundPosition(spriteId) {
  const row = Math.floor(spriteId / game.SPRITE_COLUMNS);
  const col = spriteId % game.SPRITE_COLUMNS;
  const colPercent = game.SPRITE_COLUMNS > 1
    ? (col / (game.SPRITE_COLUMNS - 1)) * 100
    : 0;
  const rowPercent = game.SPRITE_ROWS > 1
    ? (row / (game.SPRITE_ROWS - 1)) * 100
    : 0;
  return `${colPercent}% ${rowPercent}%`;
}

/**
 * Computes percentage coordinates for a point on a circular board.
 *
 * @param {number} positionIndex - Index around the ring.
 * @param {number} totalPositions - Number of points in the ring.
 * @returns {{ left: number, top: number }}
 */
export function getCircleCoordinates(positionIndex, totalPositions) {
  const angle = -Math.PI / 2 + (2 * Math.PI * positionIndex) / totalPositions;
  const radius = 36;
  const left = 50 + Math.cos(angle) * radius;
  const top = 50 + Math.sin(angle) * radius;
  return { left, top };
}

/**
 * Announces status updates for assistive tech.
 *
 * @param {string} message - Announced text.
 */
export function announce(message) {
  if (_feedbackEl) {
    _feedbackEl.textContent = message;
  }
}

/**
 * Updates score, level, streak, and display time UI values.
 */
export function updateStats() {
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_levelEl) _levelEl.textContent = String(game.getLevel() + 1);
  if (_streakEl) _streakEl.textContent = String(game.getConsecutiveCorrect());
  if (_displayTimeEl) {
    _displayTimeEl.textContent = String(game.getDisplayDurationMs(game.getLevel()));
  }
}

/**
 * Updates the displayed all-time best stats for this game.
 *
 * @param {{ highScore?: number, highestLevel?: number }|undefined} progressEntry
 */
export function updateBestStats(progressEntry) {
  const bestScore = typeof progressEntry?.highScore === 'number' ? progressEntry.highScore : 0;
  const bestLevelZeroBased = typeof progressEntry?.highestLevel === 'number'
    ? progressEntry.highestLevel
    : 0;
  const bestLevel = bestLevelZeroBased + 1;

  if (_bestScoreEl) _bestScoreEl.textContent = String(bestScore);
  if (_bestLevelEl) _bestLevelEl.textContent = String(bestLevel);
  if (_finalBestScoreEl) _finalBestScoreEl.textContent = String(bestScore);
  if (_finalBestLevelEl) _finalBestLevelEl.textContent = String(bestLevel);
}

/**
 * Loads saved progress and refreshes the all-time best stats UI.
 *
 * @returns {Promise<void>}
 */
export async function loadBestStatsFromProgress() {
  if (typeof window === 'undefined' || !window.api) {
    updateBestStats(undefined);
    return;
  }

  try {
    const loaded = await window.api.invoke('progress:load', { playerId: 'default' });
    const progressEntry = loaded?.games?.['orbit-sprite-memory'];
    updateBestStats(progressEntry);
  } catch {
    updateBestStats(undefined);
  }
}

/**
 * Clears all scheduled timers.
 */
export function clearTimers() {
  _timers.forEach((timer) => clearTimeout(timer));
  _timers = [];
}

/**
 * Removes all selection circles from the board.
 */
export function clearChoiceButtons() {
  if (!_boardEl) return;
  const choices = _boardEl.querySelectorAll('.osm-choice-btn');
  choices.forEach((choice) => choice.remove());
}

/**
 * Removes any reveal sprites created for post-round feedback.
 */
export function clearRevealSprites() {
  if (!_boardEl) return;
  const reveals = _boardEl.querySelectorAll('.osm-reveal-sprite');
  reveals.forEach((node) => node.remove());
}

/**
 * Renders selectable circles for recall mode.
 *
 * @param {ReturnType<typeof game.createRound>} round - Round metadata.
 */
export function renderChoiceButtons(round) {
  if (!_boardEl) return;

  clearChoiceButtons();
  clearRevealSprites();

  const totalPositions = round.shownPositions.length;
  round.shownPositions.forEach((positionIndex) => {
    const coords = getCircleCoordinates(positionIndex, totalPositions);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'osm-choice-btn';
    button.setAttribute('aria-label', `Position ${positionIndex + 1}`);
    button.dataset.position = String(positionIndex);
    button.style.left = `${coords.left}%`;
    button.style.top = `${coords.top}%`;
    button.addEventListener('click', () => togglePosition(positionIndex, button));
    _boardEl.appendChild(button);
  });
}

/**
 * Toggles a selected position button.
 *
 * @param {number} positionIndex - Selected board position.
 * @param {HTMLElement} buttonEl - Position button element.
 */
export function togglePosition(positionIndex, buttonEl) {
  if (!_inputEnabled) return;

  if (_selectedPositions.has(positionIndex)) {
    _selectedPositions.delete(positionIndex);
    buttonEl.classList.remove('osm-choice-btn--selected');
  } else if (_selectedPositions.size < game.PRIMARY_SHOW_COUNT) {
    _selectedPositions.add(positionIndex);
    buttonEl.classList.add('osm-choice-btn--selected');
  }

  if (_selectedPositions.size === game.PRIMARY_SHOW_COUNT) {
    submitSelection();
  }
}

/**
 * Show each position's sprite briefly after scoring so the player can compare.
 *
 * @param {ReturnType<typeof game.createRound>} round - Round metadata.
 */
export function showRoundReveal(round) {
  if (!_boardEl || !round) return;

  clearChoiceButtons();
  clearRevealSprites();
  if (_activeSpriteEl) _activeSpriteEl.hidden = true;

  const spriteByPosition = {};
  round.steps.forEach((step) => {
    spriteByPosition[step.positionIndex] = step.spriteId;
  });

  const totalPositions = round.shownPositions.length;
  round.shownPositions.forEach((positionIndex) => {
    const spriteId = spriteByPosition[positionIndex];
    if (typeof spriteId !== 'number') return;
    const coords = getCircleCoordinates(positionIndex, totalPositions);
    const sprite = document.createElement('div');
    sprite.className = 'osm-sprite osm-reveal-sprite';
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.left = `${coords.left}%`;
    sprite.style.top = `${coords.top}%`;
    sprite.style.backgroundPosition = getSpriteBackgroundPosition(spriteId);
    _boardEl.appendChild(sprite);
  });
}

/**
 * Positions and shows the active sprite on the board.
 *
 * @param {{ spriteId: number, positionIndex: number }} step - Playback step.
 * @param {number} totalPositions - Total positions in this round's ring.
 */
export function showPlaybackStep(step, totalPositions) {
  if (!_activeSpriteEl) return;

  const coords = getCircleCoordinates(step.positionIndex, totalPositions);
  _activeSpriteEl.hidden = false;
  _activeSpriteEl.style.left = `${coords.left}%`;
  _activeSpriteEl.style.top = `${coords.top}%`;
  _activeSpriteEl.style.backgroundPosition = getSpriteBackgroundPosition(step.spriteId);
}

/**
 * Starts the timed playback sequence for this round.
 *
 * @param {ReturnType<typeof game.createRound>} round - Round data.
 */
export function startPlayback(round) {
  resetBoardVisualState();
  clearChoiceButtons();
  clearRevealSprites();
  _inputEnabled = false;
  _selectedPositions = new Set();

  const totalPositions = round.shownPositions.length;
  round.steps.forEach((step, index) => {
    _timers.push(setTimeout(() => {
      showPlaybackStep(step, totalPositions);
    }, round.displayMs * index));
  });

  const endDelay = round.displayMs * round.steps.length;
  _timers.push(setTimeout(() => {
    if (_activeSpriteEl) {
      _activeSpriteEl.hidden = true;
    }
    _inputEnabled = true;
    renderChoiceButtons(round);
    announce('Select the three positions where the target appeared.');
  }, endDelay));
}

/**
 * Starts a fresh round at the current level.
 */
export function startRound() {
  resetBoardVisualState();
  _currentRound = game.createRound(game.getLevel());

  if (_targetPreviewEl) {
    _targetPreviewEl.style.backgroundPosition = getSpriteBackgroundPosition(
      _currentRound.primarySpriteId,
    );
  }

  announce('Watch the circle. The target image appears three times.');
  startPlayback(_currentRound);
}

/**
 * Handles answer submission for the current round.
 */
export function submitSelection() {
  if (!_currentRound || !_inputEnabled) return;

  const selected = [..._selectedPositions];
  const isCorrect = game.evaluateSelection(_currentRound, selected);

  _inputEnabled = false;

  if (isCorrect) {
    game.recordCorrectRound();
    updateStats();
    flashBoard('success');
    playSuccessSound();
    announce('Correct. Reviewing positions before the next round.');
  } else {
    game.recordIncorrectRound();
    updateStats();
    flashBoard('failure');
    playFailureSound();
    announce('Incorrect. Reviewing positions before the next round.');
  }

  clearTimers();
  showRoundReveal(_currentRound);

  _timers.push(setTimeout(() => {
    clearRevealSprites();
    _timers.push(setTimeout(() => {
      startRound();
    }, NEXT_ROUND_DELAY_MS));
  }, REVEAL_ALL_MS));
}

export { returnToMainMenu } from '../../components/gameUtils.js';

/**
 * Shows the end panel with final score information.
 *
 * @param {{ score: number, level: number }} result - End-game result.
 */
export function showEndPanel(result) {
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;
  if (_finalScoreEl) _finalScoreEl.textContent = String(result.score);
  if (_finalLevelEl) _finalLevelEl.textContent = String(result.level + 1);
}

/** Human-readable plugin name. */
const name = 'Orbit Sprite Memory';

/**
 * Initializes the plugin and wires UI events.
 *
 * @param {HTMLElement|null} gameContainer - Injected game container.
 */
function init(gameContainer) {
  _container = gameContainer;
  game.initGame();
  clearTimers();

  if (!_container) return;

  _instructionsEl = _container.querySelector('#osm-instructions');
  _gameAreaEl = _container.querySelector('#osm-game-area');
  _endPanelEl = _container.querySelector('#osm-end-panel');
  _startBtn = _container.querySelector('#osm-start-btn');
  _stopBtn = _container.querySelector('#osm-stop-btn');
  _playAgainBtn = _container.querySelector('#osm-play-again-btn');
  _returnBtn = _container.querySelector('#osm-return-btn');
  _boardEl = _container.querySelector('#osm-board');
  _activeSpriteEl = _container.querySelector('#osm-active-sprite');
  _targetPreviewEl = _container.querySelector('#osm-target-preview');
  _scoreEl = _container.querySelector('#osm-score');
  _levelEl = _container.querySelector('#osm-level');
  _streakEl = _container.querySelector('#osm-streak');
  _displayTimeEl = _container.querySelector('#osm-display-time');
  _bestLevelEl = _container.querySelector('#osm-best-level');
  _bestScoreEl = _container.querySelector('#osm-best-score');
  _feedbackEl = _container.querySelector('#osm-feedback');
  _finalScoreEl = _container.querySelector('#osm-final-score');
  _finalLevelEl = _container.querySelector('#osm-final-level');
  _finalBestLevelEl = _container.querySelector('#osm-final-best-level');
  _finalBestScoreEl = _container.querySelector('#osm-final-best-score');
  _sessionTimerEl = _container.querySelector('#osm-session-timer');

  if (_startBtn) _startBtn.addEventListener('click', () => start());
  if (_stopBtn) _stopBtn.addEventListener('click', () => stop());
  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      start();
    });
  }
  if (_returnBtn) _returnBtn.addEventListener('click', () => returnToMainMenu());

  loadBestStatsFromProgress();
  updateStats();
}

/**
 * Starts gameplay and first round playback.
 */
function start() {
  game.startGame();
  resetBoardVisualState();

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });

  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_gameAreaEl) _gameAreaEl.hidden = false;

  startRound();
}

/**
 * Stops gameplay, saves progress, and displays end panel.
 *
 * @returns {{ score: number, level: number, roundsPlayed: number, duration: number }}
 */
function stop() {
  clearTimers();
  resetBoardVisualState();
  const result = game.stopGame();
  const sessionDurationMs = timerService.stopTimer();

  // Persist progress — fire and forget (never blocks the UI).
  saveScore('orbit-sprite-memory', {
    score: result.score,
    sessionDurationMs,
    level: result.level,
    lowestDisplayTime: game.getDisplayDurationMs(result.level),
  }).then((record) => {
    if (record) updateBestStats(record);
  });

  showEndPanel(result);
  return result;
}

/**
 * Resets UI and logic state to pre-start mode.
 */
function reset() {
  clearTimers();
  resetBoardVisualState();
  game.initGame();

  timerService.resetTimer();
  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';

  _currentRound = null;
  _inputEnabled = false;
  _selectedPositions = new Set();

  if (_activeSpriteEl) _activeSpriteEl.hidden = true;
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_feedbackEl) _feedbackEl.textContent = '';

  clearChoiceButtons();
  clearRevealSprites();
  loadBestStatsFromProgress();
  updateStats();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
