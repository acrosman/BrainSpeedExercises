
/**
 * index.js — Fast Piggie game plugin entry point for BrainSpeedExercises.
 *
 * Handles all DOM, rendering, and event logic for the Fast Piggie game UI.
 * Exports the plugin contract for dynamic loading by the app shell.
 *
 * @file Fast Piggie game plugin (UI/controller layer).
 */

import * as game from './game.js';

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
          const imgCx = cx + Math.cos(midAngle) * radius * 0.6;
          const imgCy = cy + Math.sin(midAngle) * radius * 0.6;
          const drawH = radius * 0.35;
          const drawW = drawH * (entry.sw / entry.sh);
          ctx.drawImage(
            entry.image, entry.sx, 0, entry.sw, entry.sh,
            imgCx - drawW / 2, imgCy - drawH / 2, drawW, drawH,
          );
        }
      }
    }
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
let _feedbackEl = null;
let _flashEl = null;
let _instructionsEl = null;
let _gameAreaEl = null;

// Game state
let _images = null; // [commonImage, outlierImage]
let _currentRound = null; // { wedgeCount, displayDurationMs, outlierWedgeIndex, slotAssignment }
let _clickEnabled = false;
let _selectedWedge = -1; // for keyboard navigation
let _hoveredWedge = -1; // for mouse hover highlighting
let _roundTimer = null; // setTimeout handle

let _audioCtx = null;

/**
 * Creates or returns the singleton AudioContext for sound effects.
 * @returns {AudioContext}
 */
export function createAudioContext() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

/**
 * Plays a single tone for sound feedback.
 * @param {AudioContext} audioCtx
 * @param {number} frequency
 * @param {number} startTime
 * @param {number} duration
 */
function playTone(audioCtx, frequency, startTime, duration) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startTime);

  // Gentle envelope: ramp up then down to avoid clicks
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * Plays the success sound sequence.
 * @param {AudioContext} audioCtx
 */
export function playSuccessSound(audioCtx) {
  const now = audioCtx.currentTime;
  playTone(audioCtx, 440, now, 0.15);
  playTone(audioCtx, 660, now + 0.16, 0.15);
}

/**
 * Plays the failure sound sequence.
 * @param {AudioContext} audioCtx
 */
export function playFailureSound(audioCtx) {
  const now = audioCtx.currentTime;
  playTone(audioCtx, 330, now, 0.15);
  playTone(audioCtx, 220, now + 0.16, 0.15);
}

/**
 * Updates the score and round count in the UI.
 */
function _updateStats() {
  if (_scoreEl) _scoreEl.textContent = game.getScore();
  if (_roundEl) _roundEl.textContent = game.getRoundsPlayed();
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
  const round = game.generateRound(game.getLevel());
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
 * Resolves the round after a wedge is selected, updates state and feedback.
 * @param {number} wedge
 */
function _resolveRound(wedge) {
  _clickEnabled = false;

  const { wedgeCount, outlierWedgeIndex, slotAssignment, imageCount } = _currentRound;
  const { width, height } = _canvas;
  // Map clicked wedge to image index if slotAssignment is used
  let answerIdx = wedge;
  if (slotAssignment && imageCount < wedgeCount) {
    answerIdx = slotAssignment.indexOf(wedge);
  }
  const correct = game.checkAnswer(answerIdx, outlierWedgeIndex);

  const audioCtx = createAudioContext();

  if (correct) {
    game.addScore();
    highlightWedge(
      _ctx,
      width,
      height,
      wedge,
      wedgeCount,
      'rgba(40, 167, 69, 0.45)',
    );
    playSuccessSound(audioCtx);
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
    highlightWedge(
      _ctx,
      width,
      height,
      outlierWedgeIndex,
      wedgeCount,
      'rgba(255, 193, 7, 0.65)',
    );
    game.addMiss();
    playFailureSound(audioCtx);
    _triggerFlash('wrong');
    _feedbackEl.textContent = 'Not quite — the different piggie is highlighted.';
  }

  _updateStats();
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
    _startBtn = container.querySelector('#fp-start-btn');
    _canvas = container.querySelector('#fp-canvas');
    _ctx = _canvas.getContext('2d');
    _stopBtn = container.querySelector('#fp-stop-btn');
    _scoreEl = container.querySelector('#fp-score');
    _roundEl = container.querySelector('#fp-round-count');
    _feedbackEl = container.querySelector('#fp-feedback');
    _flashEl = container.querySelector('#fp-flash');

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
  },

  /**
   * Start the game and first round.
   */
  start() {
    if (_instructionsEl) _instructionsEl.hidden = true;
    if (_gameAreaEl) _gameAreaEl.hidden = false;
    game.startGame();
    _updateStats();
    _runRound();
  },

  /**
   * Stop the game, persist progress, and show final score.
   * @returns {object} Game result
   */
  stop() {
    if (_roundTimer) {
      clearTimeout(_roundTimer);
      _roundTimer = null;
    }
    _clickEnabled = false;
    const result = game.stopGame();

    // Persist progress (guard for test environment where window.api is absent)
    if (typeof window !== 'undefined' && window.api) {
      window.api.invoke('progress:load', { playerId: 'default' })
        .then((existing) => {
          const gameEntry = (existing.games && existing.games['fast-piggie']) || {
            highScore: 0,
            sessionsPlayed: 0,
            lastPlayed: null,
          };
          const updated = {
            ...existing,
            games: {
              ...existing.games,
              'fast-piggie': {
                highScore: Math.max(gameEntry.highScore, result.score),
                sessionsPlayed: gameEntry.sessionsPlayed + 1,
                lastPlayed: new Date().toISOString(),
              },
            },
          };
          return window.api.invoke('progress:save', { playerId: 'default', data: updated });
        })
        .catch(() => {
          // Progress save failure is non-fatal — game continues normally
        });
    }

    _feedbackEl.textContent =
      `Game over! Final score: ${result.score} in ${result.roundsPlayed} rounds.`;
    _stopBtn.hidden = true;
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
    if (_ctx && _canvas) {
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    }
    _updateStats();
    _feedbackEl.textContent = '';
    _stopBtn.hidden = false;
    if (_instructionsEl) _instructionsEl.hidden = false;
    if (_gameAreaEl) _gameAreaEl.hidden = true;
  },
};
