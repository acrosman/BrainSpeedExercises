/**
 * index.js — Fast Piggie game plugin entry point for BrainSpeedExercises.
 *
 * Handles all DOM, rendering, and event logic for the Fast Piggie game UI.
 * Exports the plugin contract for dynamic loading by the app shell.
 *
 * @file Fast Piggie game plugin (UI/controller layer).
 */

import * as game from './game.js';
import { playSuccessSound, playFailureSound } from '../../components/audioService.js';
import * as timerService from '../../components/timerService.js';
import { saveScore } from '../../components/scoreService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import { renderTrendChart } from '../../components/trendChartService.js';

/** Number of pixels to trim from each side of the sprite-sheet centre seam. */
const SPRITE_INSET = 2;

/**
 * Renders a cropped region of an image into a new offscreen canvas.
 * By isolating each sprite half this way, browser interpolation cannot
 * bleed seam pixels from the adjacent half when the image is drawn small.
 * @param {HTMLImageElement} img - Source image.
 * @param {number} sx - Source x offset in the image.
 * @param {number} sw - Width of the region to copy.
 * @param {number} sh - Height of the region to copy.
 * @returns {HTMLCanvasElement}
 */
function cropToCanvas(img, sx, sw, sh) {
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(img, sx, 0, sw, sh, 0, 0, sw, sh);
  return canvas;
}

/**
 * Loads and splits the piggie sprite image into two halves for the game.
 * @param {string} src - Image source URL.
 * @returns {Promise<Array<{image: HTMLCanvasElement, sx: number, sw: number, sh: number}>>}
 */
export function loadImages(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const halfW = img.naturalWidth / 2;
      const h = img.naturalHeight;
      const croppedW = halfW - SPRITE_INSET;
      resolve([
        { image: cropToCanvas(img, 0, croppedW, h), sx: 0, sw: croppedW, sh: h },
        { image: cropToCanvas(img, halfW + SPRITE_INSET, croppedW, h), sx: 0, sw: croppedW, sh: h },
      ]);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Draws the game board with wedges and (optionally) images.
 * When imageCount < wedgeCount, images are assigned to random slots.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {number} wedgeCount
 * @param {number} imageCount
 * @param {Array} images
 * @param {number} outlierIndex
 * @param {boolean} showImages
 * @param {Array<number>} [slotAssignment] Optional: array of slot indices for images
 */
export function drawBoard(
  ctx, width, height, wedgeCount, imageCount, images, outlierIndex,
  showImages, slotAssignment,
) {
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 10;
  const angleStep = (2 * Math.PI) / wedgeCount;

  // Use provided slotAssignment for image placement, or generate if not provided.
  let slots = [];
  if (showImages && imageCount < wedgeCount) {
    if (Array.isArray(slotAssignment) && slotAssignment.length === imageCount) {
      slots = slotAssignment.slice();
    } else {
      // Generate a random slot assignment (for test/direct usage)
      slots = Array.from({ length: wedgeCount }, (_, i) => i);
      for (let i = slots.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      slots = slots.slice(0, imageCount).sort((a, b) => a - b);
    }
  } else {
    slots = Array.from({ length: imageCount }, (_, i) => i);
  }

  // Generate stagger offsets for each wedge (consistent per draw)
  const staggerOffsets = Array.from({ length: wedgeCount }, (_, idx) => {
    // Use a deterministic pseudo-random offset per wedge for consistency
    // Range: -0.24 to +0.24 (as a fraction of radius)
    const base = Math.sin(idx * 2.3 + wedgeCount) * 0.5 + Math.cos(idx * 1.7 - wedgeCount) * 0.5;
    return base * 0.24; // increased for more staggering
  });

  // Capture the outlier's draw parameters to render it last (on top of distractors).
  let outlierDraw = null;

  for (let i = 0; i < wedgeCount; i += 1) {
    const startAngle = -Math.PI / 2 + i * angleStep;
    const endAngle = startAngle + angleStep;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    if (showImages) {
      // If this wedge is assigned an image, draw it
      let imageIdx = -1;
      if (imageCount < wedgeCount) {
        imageIdx = slots.indexOf(i);
      } else if (i < imageCount) {
        imageIdx = i;
      }
      if (imageIdx !== -1) {
        const entry = imageIdx === outlierIndex ? images[1] : images[0];
        if (entry && entry.image) {
          const midAngle = startAngle + angleStep / 2;
          // Stagger: add offset to base radius
          const stagger = staggerOffsets[i] || 0;
          const imgRadius = radius * 0.6 * (1 + stagger);
          const imgCx = cx + Math.cos(midAngle) * imgRadius;
          const imgCy = cy + Math.sin(midAngle) * imgRadius;
          const drawH = radius * 0.35;
          const drawW = drawH * (entry.sw / entry.sh);
          if (imageIdx === outlierIndex) {
            // Save outlier draw params — it will be rendered last to appear on top.
            outlierDraw = {
              entry, imgCx, imgCy, drawH, drawW,
            };
          } else {
            ctx.drawImage(
              entry.image, entry.sx, 0, entry.sw, entry.sh,
              imgCx - drawW / 2, imgCy - drawH / 2, drawW, drawH,
            );
          }
        }
      }
    }
  }

  // Draw the outlier (target) image last so it always appears on top of all distractors.
  if (outlierDraw) {
    const {
      entry, imgCx, imgCy, drawH, drawW,
    } = outlierDraw;
    ctx.drawImage(
      entry.image, entry.sx, 0, entry.sw, entry.sh,
      imgCx - drawW / 2, imgCy - drawH / 2, drawW, drawH,
    );
  }
}

/**
 * Clears the board and removes all images.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {number} wedgeCount
 */
export function clearImages(ctx, width, height, wedgeCount) {
  drawBoard(ctx, width, height, wedgeCount, wedgeCount, [null, null], -1, false);
}

/**
 * Highlights a specific wedge on the board.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {number} wedgeIndex
 * @param {number} wedgeCount
 * @param {string} color
 */
export function highlightWedge(ctx, width, height, wedgeIndex, wedgeCount, color) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 10;
  const angleStep = (2 * Math.PI) / wedgeCount;

  const startAngle = -Math.PI / 2 + wedgeIndex * angleStep;
  const endAngle = startAngle + angleStep;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// DOM references — populated by init()
let _canvas = null;
let _ctx = null;
let _startBtn = null;
let _stopBtn = null;
let _scoreEl = null;
let _roundEl = null;
let _displayTimeEl = null;
let _feedbackEl = null;
let _flashEl = null;
let _instructionsEl = null;
let _gameAreaEl = null;
let _endPanelEl = null;
let _playAgainBtn = null;
let _returnToMenuBtn = null;
let _finalScoreEl = null;
let _finalHighScoreEl = null;

/** @type {HTMLElement|null} */
let _sessionTimerEl = null;

/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;
/** @type {HTMLElement|null} */
let _trendEmptyEl = null;
/** @type {HTMLElement|null} */
let _trendLatestEl = null;

// Game state
let _images = null; // [commonImage, outlierImage]
let _currentRound = null; // { wedgeCount, displayDurationMs, outlierWedgeIndex, slotAssignment }
let _clickEnabled = false;
let _selectedWedge = -1; // for keyboard navigation
let _hoveredWedge = -1; // for mouse hover highlighting
let _roundTimer = null; // setTimeout handle

/**
 * Updates the score, round count, and display time in the UI.
 */
function _updateStats() {
  if (_scoreEl) _scoreEl.textContent = game.getScore();
  if (_roundEl) _roundEl.textContent = game.getRoundsPlayed();
  if (_displayTimeEl) _displayTimeEl.textContent = game.getCurrentDifficulty().displayDurationMs;
}

/**
 * Renders the speed trend chart with the latest history.
 */
function _updateTrendChart() {
  renderTrendChart(
    { lineEl: _trendLineEl, emptyEl: _trendEmptyEl, latestEl: _trendLatestEl },
    game.getSpeedHistory(),
    game.getCurrentDifficulty().displayDurationMs,
  );
}

/**
 * Triggers a visual flash for correct/wrong answers.
 * @param {string} type - 'correct' or 'wrong'
 */
function _triggerFlash(type) {
  if (!_flashEl) return;
  _flashEl.classList.remove('fp-flash--correct', 'fp-flash--wrong');
  // Force reflow so re-adding the same class restarts the animation
  void _flashEl.offsetWidth;
  _flashEl.classList.add(
    type === 'correct' ? 'fp-flash--correct' : 'fp-flash--wrong',
  );
  setTimeout(() => {
    _flashEl.classList.remove('fp-flash--correct', 'fp-flash--wrong');
  }, 600);
}

/**
 * Highlights the currently selected wedge for keyboard navigation.
 */
function _highlightKeyboardSelection() {
  if (!_currentRound || _selectedWedge < 0) return;
  const { wedgeCount } = _currentRound;
  const { width, height } = _canvas;
  clearImages(_ctx, width, height, wedgeCount);
  highlightWedge(
    _ctx,
    width,
    height,
    _selectedWedge,
    wedgeCount,
    'rgba(0, 95, 204, 0.35)',
  );
}

/**
 * Starts a new round and handles image display/hide timing.
 */
function _runRound() {
  if (!game.isRunning()) return;

  _clickEnabled = false;
  _selectedWedge = -1;
  const round = game.generateRound(game.getLevel(), game.getSpeedLevel());
  const { wedgeCount, imageCount, displayDurationMs, outlierWedgeIndex } = round;
  // Generate slot assignment if needed
  let slotAssignment = null;
  if (imageCount < wedgeCount) {
    slotAssignment = Array.from({ length: wedgeCount }, (_, i) => i);
    for (let i = slotAssignment.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [slotAssignment[i], slotAssignment[j]] = [slotAssignment[j], slotAssignment[i]];
    }
    slotAssignment = slotAssignment.slice(0, imageCount).sort((a, b) => a - b);
  }
  _currentRound = { ...round, slotAssignment };

  const { width, height } = _canvas;
  drawBoard(
    _ctx, width, height, wedgeCount, imageCount, _images,
    outlierWedgeIndex, true, slotAssignment,
  );

  _roundTimer = setTimeout(() => {
    clearImages(_ctx, width, height, wedgeCount);
    _currentRound._imagesHiddenAt = Date.now();
    _clickEnabled = true;
    _hoveredWedge = -1;
    _selectedWedge = -1;
    _canvas.focus();
  }, displayDurationMs);
}

/**
 * Handles keyboard navigation and selection.
 * @param {KeyboardEvent} event
 */
function _handleKeydown(event) {
  if (!_clickEnabled || !_currentRound) return;
  const { wedgeCount } = _currentRound;

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    _selectedWedge = (_selectedWedge + 1) % wedgeCount;
    _highlightKeyboardSelection();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    _selectedWedge = (_selectedWedge - 1 + wedgeCount) % wedgeCount;
    _highlightKeyboardSelection();
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (_selectedWedge >= 0) _resolveRound(_selectedWedge);
  }
}

/**
 * Calculates which wedge was clicked or hovered.
 * @param {MouseEvent} event
 * @returns {number}
 */
function _getCanvasWedge(event) {
  const rect = _canvas.getBoundingClientRect();
  const scaleX = _canvas.width / rect.width;
  const scaleY = _canvas.height / rect.height;
  const cx = _canvas.width / 2;
  const cy = _canvas.height / 2;
  const radius = Math.min(_canvas.width, _canvas.height) / 2 - 10;
  return game.calculateWedgeIndex(
    (event.clientX - rect.left) * scaleX,
    (event.clientY - rect.top) * scaleY,
    cx,
    cy,
    radius,
    _currentRound.wedgeCount,
  );
}

/**
 * Handles mouse movement for wedge highlighting.
 * @param {MouseEvent} event
 */
function _handleMouseMove(event) {
  if (!_clickEnabled || !_currentRound) return;
  const wedge = _getCanvasWedge(event);
  if (wedge === _hoveredWedge && _selectedWedge < 0) return;
  _hoveredWedge = wedge;
  _selectedWedge = -1;
  const { wedgeCount } = _currentRound;
  const { width, height } = _canvas;
  clearImages(_ctx, width, height, wedgeCount);
  if (wedge !== -1) {
    highlightWedge(_ctx, width, height, wedge, wedgeCount, 'rgba(0, 95, 204, 0.25)');
  }
}

/**
 * Handles mouse leaving the canvas (removes highlight).
 */
function _handleMouseLeave() {
  if (!_clickEnabled || !_currentRound) return;
  _hoveredWedge = -1;
  const { wedgeCount } = _currentRound;
  const { width, height } = _canvas;
  clearImages(_ctx, width, height, wedgeCount);
}

/**
 * Handles mouse click on the canvas.
 * @param {MouseEvent} event
 */
function _handleClick(event) {
  if (!_clickEnabled || !_currentRound) return;
  const wedge = _getCanvasWedge(event);
  if (wedge === -1) return; // Outside circle — ignore
  _resolveRound(wedge);
}

/**
 * Resolves the displayed outlier image index to its actual wedge slot.
 * @param {object} round
 * @returns {number}
 */
function _getCorrectWedgeIndex(round) {
  const {
    outlierWedgeIndex,
    slotAssignment,
    imageCount,
    wedgeCount,
  } = round;

  if (slotAssignment && imageCount < wedgeCount) {
    return slotAssignment[outlierWedgeIndex] ?? -1;
  }

  return outlierWedgeIndex;
}

/**
 * Show the end-game panel with the latest score summary.
 * @param {number} score
 * @param {number} highScore
 */
function _showEndPanel(score, highScore) {
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;
  if (_finalScoreEl) _finalScoreEl.textContent = String(score);
  if (_finalHighScoreEl) _finalHighScoreEl.textContent = String(highScore);
}

/**
 * Resolves the round after a wedge is selected, updates state and feedback.
 * @param {number} wedge
 */
function _resolveRound(wedge) {
  _clickEnabled = false;

  // Destructure with line break for lint compliance, and remove unused displayDurationMs
  const {
    wedgeCount,
    outlierWedgeIndex,
    slotAssignment,
    imageCount,
    displayDurationMs,
  } = _currentRound;
  const { width, height } = _canvas;
  const correctWedgeIndex = _getCorrectWedgeIndex(_currentRound);
  // Map clicked wedge to image index if slotAssignment is used
  let answerIdx = wedge;
  if (slotAssignment && imageCount < wedgeCount) {
    answerIdx = slotAssignment.indexOf(wedge);
  }
  const correct = game.checkAnswer(answerIdx, outlierWedgeIndex);

  // Track answer speed (time from images hidden to answer)
  // We'll store the time when images are hidden in _currentRound._imagesHiddenAt
  let answerSpeedMs = null;
  if (_currentRound._imagesHiddenAt != null) {
    answerSpeedMs = Date.now() - _currentRound._imagesHiddenAt;
  }

  if (correct) {
    game.addScore(imageCount, answerSpeedMs, displayDurationMs);
    highlightWedge(
      _ctx,
      width,
      height,
      wedge,
      wedgeCount,
      'rgba(40, 167, 69, 0.45)',
    );
    playSuccessSound();
    _triggerFlash('correct');
    _feedbackEl.textContent = 'Correct! Well spotted.';
  } else {
    highlightWedge(
      _ctx,
      width,
      height,
      wedge,
      wedgeCount,
      'rgba(220, 53, 69, 0.45)',
    );
    // Reveal the correct wedge in yellow
    if (correctWedgeIndex !== -1) {
      highlightWedge(
        _ctx,
        width,
        height,
        correctWedgeIndex,
        wedgeCount,
        'rgba(255, 193, 7, 0.65)',
      );
    }
    game.addMiss(imageCount, displayDurationMs);
    playFailureSound();
    _triggerFlash('wrong');
    _feedbackEl.textContent = 'Not quite — the different piggie is highlighted.';
  }

  _updateStats();
  _updateTrendChart();
  // Auto-advance to next round after a short delay.
  if (game.isRunning()) {
    setTimeout(() => {
      _runRound();
    }, 1000);
  }
}

/**
 * Fast Piggie plugin contract for dynamic loading by the app shell.
 * Implements { name, init, start, stop, reset }.
 */
export default {
  name: 'Fast Piggie',

  /**
   * Initialize the plugin and bind DOM events.
   * @param {HTMLElement} container
   */
  init(container) {
    _instructionsEl = container.querySelector('#fp-instructions');
    _gameAreaEl = container.querySelector('#fp-game-area');
    _endPanelEl = container.querySelector('#fp-end-panel');
    _startBtn = container.querySelector('#fp-start-btn');
    _canvas = container.querySelector('#fp-canvas');
    _ctx = _canvas.getContext('2d');
    _stopBtn = container.querySelector('#fp-stop-btn');
    _playAgainBtn = container.querySelector('#fp-play-again-btn');
    _returnToMenuBtn = container.querySelector('#fp-return-btn');
    _scoreEl = container.querySelector('#fp-score');
    _roundEl = container.querySelector('#fp-round-count');
    _displayTimeEl = container.querySelector('#fp-display-time');
    _feedbackEl = container.querySelector('#fp-feedback');
    _flashEl = container.querySelector('#fp-flash');
    _finalScoreEl = container.querySelector('#fp-final-score');
    _finalHighScoreEl = container.querySelector('#fp-final-high-score');
    _sessionTimerEl = container.querySelector('#fp-session-timer');
    _trendLineEl = container.querySelector('#fp-trend-line');
    _trendEmptyEl = container.querySelector('#fp-trend-empty');
    _trendLatestEl = container.querySelector('#fp-trend-latest');

    // Pre-load images
    const base = new URL('../fast-piggie/images/', import.meta.url).href;
    loadImages(`${base}PiggiesSource.jpg`)
      .then((imgs) => {
        _images = imgs;
      })
      .catch(() => {
        // Images failed to load — the game can still run without them
        _images = [null, null];
      });

    // Bind events
    _startBtn.addEventListener('click', () => this.start());
    _canvas.addEventListener('click', _handleClick);
    _canvas.addEventListener('mousemove', _handleMouseMove);
    _canvas.addEventListener('mouseleave', _handleMouseLeave);
    _canvas.addEventListener('keydown', _handleKeydown);
    _stopBtn.addEventListener('click', () => this.stop());
    if (_playAgainBtn) {
      _playAgainBtn.addEventListener('click', () => {
        this.reset();
        this.start();
      });
    }
    if (_returnToMenuBtn) {
      _returnToMenuBtn.addEventListener('click', () => returnToMainMenu());
    }
  },

  /**
   * Start the game and first round.
   */
  start() {
    if (_instructionsEl) _instructionsEl.hidden = true;
    if (_gameAreaEl) _gameAreaEl.hidden = false;
    if (_endPanelEl) _endPanelEl.hidden = true;
    game.startGame();
    timerService.startTimer((elapsedMs) => {
      if (_sessionTimerEl) {
        _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
      }
    });
    _updateStats();
    _runRound();
  },

  /**
   * Stop the game, persist progress, and show final score.
   * @returns {Promise<object>} Game result
   */
  async stop() {
    if (_roundTimer) {
      clearTimeout(_roundTimer);
      _roundTimer = null;
    }
    _clickEnabled = false;
    const result = game.stopGame();
    const sessionDurationMs = timerService.stopTimer();

    // Hide the stop button synchronously so it is gone immediately.
    _stopBtn.hidden = true;

    const bestStats = game.getBestStats();
    const savedRecord = await saveScore('fast-piggie', {
      score: result.score,
      sessionDurationMs,
      level: typeof bestStats.maxScore === 'number' ? bestStats.maxScore : undefined,
      lowestDisplayTime: typeof bestStats.lowestRoundDisplayMs === 'number'
        ? bestStats.lowestRoundDisplayMs
        : undefined,
    }, (prev) => ({
      maxPiggies: Math.max(
        typeof bestStats.mostGuineaPigs === 'number' ? bestStats.mostGuineaPigs : 0,
        prev.maxPiggies || 0,
      ),
    }));

    const highScore = savedRecord ? savedRecord.highScore : result.score;
    _showEndPanel(result.score, highScore);
    if (_feedbackEl) {
      _feedbackEl.textContent = `Game over! Final score: ${result.score} in ${result.roundsPlayed} rounds.`;
    }
    return result;
  },

  /**
   * Reset the game to its initial state.
   */
  reset() {
    if (_roundTimer) {
      clearTimeout(_roundTimer);
      _roundTimer = null;
    }
    game.initGame();
    _clickEnabled = false;
    _currentRound = null;
    _selectedWedge = -1;
    _hoveredWedge = -1;
    timerService.resetTimer();
    if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';
    if (_ctx && _canvas) {
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    }
    _updateStats();
    _updateTrendChart();
    _feedbackEl.textContent = '';
    _stopBtn.hidden = false;
    if (_instructionsEl) _instructionsEl.hidden = false;
    if (_gameAreaEl) _gameAreaEl.hidden = true;
    if (_endPanelEl) _endPanelEl.hidden = true;
  },
};
