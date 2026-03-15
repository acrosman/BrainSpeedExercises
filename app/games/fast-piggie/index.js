import * as game from './game.js';

export function loadImages(commonSrc, outlierSrc) {
  function load(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }
  return Promise.all([load(commonSrc), load(outlierSrc)]);
}

export function drawBoard(ctx, width, height, wedgeCount, images, outlierIndex, showImages) {
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 10;
  const angleStep = (2 * Math.PI) / wedgeCount;

  for (let i = 0; i < wedgeCount; i += 1) {
    const startAngle = -Math.PI / 2 + i * angleStep;
    const endAngle = startAngle + angleStep;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#343a40';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (showImages) {
      const img = i === outlierIndex ? images[1] : images[0];
      const midAngle = startAngle + angleStep / 2;
      const imgCx = cx + Math.cos(midAngle) * radius * 0.6;
      const imgCy = cy + Math.sin(midAngle) * radius * 0.6;
      const imgSize = radius * 0.35;
      ctx.drawImage(img, imgCx - imgSize / 2, imgCy - imgSize / 2, imgSize, imgSize);
    }
  }
}

export function clearImages(ctx, width, height, wedgeCount) {
  drawBoard(ctx, width, height, wedgeCount, [null, null], -1, false);
}

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
let _continueBtn = null;
let _stopBtn = null;
let _scoreEl = null;
let _roundEl = null;
let _feedbackEl = null;
let _flashEl = null;

// Game state
let _images = null; // [commonImage, outlierImage]
let _currentRound = null; // { wedgeCount, displayDurationMs, outlierWedgeIndex }
let _clickEnabled = false;
let _selectedWedge = -1; // for keyboard navigation
let _roundTimer = null; // setTimeout handle

let _audioCtx = null;

export function createAudioContext() {
  if (!_audioCtx) {

    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

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

export function playSuccessSound(audioCtx) {
  const now = audioCtx.currentTime;
  playTone(audioCtx, 440, now, 0.15);
  playTone(audioCtx, 660, now + 0.16, 0.15);
}

export function playFailureSound(audioCtx) {
  const now = audioCtx.currentTime;
  playTone(audioCtx, 330, now, 0.15);
  playTone(audioCtx, 220, now + 0.16, 0.15);
}

function _updateStats() {
  if (_scoreEl) _scoreEl.textContent = game.getScore();
  if (_roundEl) _roundEl.textContent = game.getRoundsPlayed();
}

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

function _runRound() {
  if (!game.isRunning()) return;

  _clickEnabled = false;
  _selectedWedge = -1;
  _currentRound = game.generateRound(game.getRoundsPlayed());

  const { wedgeCount, displayDurationMs, outlierWedgeIndex } = _currentRound;
  const { width, height } = _canvas;

  // Show images
  drawBoard(_ctx, width, height, wedgeCount, _images, outlierWedgeIndex, true);

  // Hide images after displayDurationMs, then enable clicking
  _roundTimer = setTimeout(() => {
    clearImages(_ctx, width, height, wedgeCount);
    _clickEnabled = true;
    _canvas.focus();
    // Reset keyboard selection
    _selectedWedge = 0;
    _highlightKeyboardSelection();
  }, displayDurationMs);
}

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

function _handleClick(event) {
  if (!_clickEnabled || !_currentRound) return;

  const rect = _canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // Scale click coords to canvas drawing buffer
  const scaleX = _canvas.width / rect.width;
  const scaleY = _canvas.height / rect.height;

  const { wedgeCount } = _currentRound;
  const cx = _canvas.width / 2;
  const cy = _canvas.height / 2;
  const radius = Math.min(_canvas.width, _canvas.height) / 2 - 10;

  const wedge = game.calculateWedgeIndex(
    clickX * scaleX,
    clickY * scaleY,
    cx,
    cy,
    radius,
    wedgeCount,
  );

  if (wedge === -1) return; // Outside circle — ignore

  _resolveRound(wedge);
}

function _resolveRound(wedge) {
  _clickEnabled = false;

  const { wedgeCount, outlierWedgeIndex } = _currentRound;
  const { width, height } = _canvas;
  const correct = game.checkAnswer(wedge, outlierWedgeIndex);

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
    playFailureSound(audioCtx);
    _triggerFlash('wrong');
    _feedbackEl.textContent = 'Not quite — the different piggie is highlighted.';
  }

  _updateStats();
  _continueBtn.hidden = false;
}

export default {
  name: 'Fast Piggie',

  init(container) {
    _canvas = container.querySelector('#fp-canvas');
    _ctx = _canvas.getContext('2d');
    _continueBtn = container.querySelector('#fp-continue-btn');
    _stopBtn = container.querySelector('#fp-stop-btn');
    _scoreEl = container.querySelector('#fp-score');
    _roundEl = container.querySelector('#fp-round-count');
    _feedbackEl = container.querySelector('#fp-feedback');
    _flashEl = container.querySelector('#fp-flash');

    // Pre-load images
    const base = new URL('../fast-piggie/images/', import.meta.url).href;
    loadImages(`${base}guinea-pig-common.png`, `${base}guinea-pig-outlier.png`)
      .then((imgs) => {
        _images = imgs;
      })
      .catch(() => {
        // Images failed to load — the game can still run without them
        _images = [null, null];
      });

    // Bind events
    _canvas.addEventListener('click', _handleClick);
    _canvas.addEventListener('keydown', _handleKeydown);
    _continueBtn.addEventListener('click', () => _runRound());
    _stopBtn.addEventListener('click', () => this.stop());
  },

  start() {
    game.startGame();
    _updateStats();
    _continueBtn.hidden = true;
    _runRound();
  },

  stop() {
    if (_roundTimer) {
      clearTimeout(_roundTimer);
      _roundTimer = null;
    }
    _clickEnabled = false;
    const result = game.stopGame();

    // Persist progress (guard for test environment where window.api is absent)
    if (typeof window !== 'undefined' && window.api) {
      window.api.invoke('progress:load', 'default')
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
          return window.api.invoke('progress:save', 'default', updated);
        })
        .catch(() => {
          // Progress save failure is non-fatal — game continues normally
        });
    }

    _feedbackEl.textContent =
      `Game over! Final score: ${result.score} in ${result.roundsPlayed} rounds.`;
    _continueBtn.hidden = true;
    _stopBtn.hidden = true;
    return result;
  },

  reset() {
    if (_roundTimer) {
      clearTimeout(_roundTimer);
      _roundTimer = null;
    }
    game.initGame();
    _clickEnabled = false;
    _currentRound = null;
    _selectedWedge = -1;
    if (_ctx && _canvas) {
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    }
    _updateStats();
    _feedbackEl.textContent = '';
    _continueBtn.hidden = true;
    _stopBtn.hidden = false;
  },
};
