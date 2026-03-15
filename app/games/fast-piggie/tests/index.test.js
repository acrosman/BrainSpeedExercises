import {
  describe, it, expect, beforeEach, afterEach, jest,
} from '@jest/globals';

// ---------------------------------------------------------------------------
// 1 — Mock game.js (must be called before dynamic import of index.js)
// ---------------------------------------------------------------------------
jest.unstable_mockModule('../game.js', () => ({
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({ score: 3, roundsPlayed: 5, duration: 12000 })),
  generateRound: jest.fn(() => ({
    wedgeCount: 6,
    displayDurationMs: 2000,
    outlierWedgeIndex: 2,
  })),
  checkAnswer: jest.fn(() => true),
  calculateWedgeIndex: jest.fn(() => 2),
  addScore: jest.fn(),
  getScore: jest.fn(() => 3),
  getRoundsPlayed: jest.fn(() => 5),
  getCurrentDifficulty: jest.fn(() => ({
    wedgeCount: 6,
    displayDurationMs: 2000,
  })),
  isRunning: jest.fn(() => true),
}));

const game = await import('../game.js');
const indexModule = await import('../index.js');
const plugin = indexModule.default;
const {
  loadImages,
  drawBoard,
  clearImages,
  highlightWedge,
  createAudioContext,
  playSuccessSound,
  playFailureSound,
} = indexModule;

// ---------------------------------------------------------------------------
// 2 — Canvas context stub
// ---------------------------------------------------------------------------
const ctx2d = {
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  arc: jest.fn(),
  closePath: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  drawImage: jest.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  save: jest.fn(),
  restore: jest.fn(),
  linearRampToValueAtTime: jest.fn(),
};

HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx2d);

// jsdom does not implement getBoundingClientRect — return a fixed rect
HTMLCanvasElement.prototype.getBoundingClientRect = jest.fn(() => ({
  left: 0,
  top: 0,
  width: 500,
  height: 500,
}));

// ---------------------------------------------------------------------------
// 3 — Image mock (trigger onload synchronously)
// ---------------------------------------------------------------------------
globalThis.Image = class {
  constructor() {
    this.naturalWidth = 768;
    this.naturalHeight = 512;
  }

  set src(_) {
    if (this.onload) this.onload();
  }
};

// ---------------------------------------------------------------------------
// 4 — AudioContext mock
// ---------------------------------------------------------------------------
const mockGain = {
  connect: jest.fn(),
  gain: {
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
  },
};
const mockOsc = {
  connect: jest.fn(),
  type: '',
  frequency: { setValueAtTime: jest.fn() },
  start: jest.fn(),
  stop: jest.fn(),
};
const mockAudioCtx = {
  currentTime: 0,
  destination: {},
  createGain: jest.fn(() => mockGain),
  createOscillator: jest.fn(() => mockOsc),
};
globalThis.AudioContext = jest.fn(() => mockAudioCtx);
globalThis.window = {
  ...globalThis.window,
  AudioContext: globalThis.AudioContext,
};

// ---------------------------------------------------------------------------
// 5 — DOM container helper
// ---------------------------------------------------------------------------
function buildContainer() {
  const div = document.createElement('div');
  div.innerHTML = `
    <section class="fast-piggie">
      <div id="fp-instructions" class="fp-instructions">
        <button id="fp-start-btn" class="fp-btn fp-btn--primary">Start Game</button>
      </div>
      <div id="fp-game-area" hidden>
        <canvas id="fp-canvas" width="500" height="500"></canvas>
        <div class="fp-stats">
          <span class="fp-stat">Round: <strong id="fp-round-count">0</strong></span>
          <span class="fp-stat">Score: <strong id="fp-score">0</strong></span>
        </div>
        <div id="fp-feedback" role="status" aria-live="assertive" class="fp-feedback sr-only"></div>
        <div id="fp-flash" class="fp-flash"></div>
        <div class="fp-controls">
          <button id="fp-continue-btn" class="fp-btn" hidden>Continue</button>
          <button id="fp-stop-btn" class="fp-btn fp-btn--secondary">End Game</button>
        </div>
      </div>
    </section>
  `;
  return div;
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
let container;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // Reset AudioContext singleton inside the module by resetting the mock
  globalThis.AudioContext.mockClear();
  container = buildContainer();
  plugin.init(container);
});

afterEach(() => {
  plugin.reset();
  jest.useRealTimers();
});

// ===========================================================================
// Plugin contract
// ===========================================================================
describe('default export — plugin contract', () => {
  it('is an object', () => {
    expect(typeof plugin).toBe('object');
  });

  it('has a name property', () => {
    expect(plugin).toHaveProperty('name');
  });

  it('name equals "Fast Piggie"', () => {
    expect(plugin.name).toBe('Fast Piggie');
  });

  it('has an init function', () => {
    expect(typeof plugin.init).toBe('function');
  });

  it('has a start function', () => {
    expect(typeof plugin.start).toBe('function');
  });

  it('has a stop function', () => {
    expect(typeof plugin.stop).toBe('function');
  });

  it('has a reset function', () => {
    expect(typeof plugin.reset).toBe('function');
  });
});

// ===========================================================================
// Named exports
// ===========================================================================
describe('named exports', () => {
  it('loadImages is a function', () => {
    expect(typeof loadImages).toBe('function');
  });

  it('loadImages returns a Promise', () => {
    const result = loadImages('a.png');
    expect(result).toBeInstanceOf(Promise);
  });

  it('drawBoard is a function', () => {
    expect(typeof drawBoard).toBe('function');
  });

  it('clearImages is a function', () => {
    expect(typeof clearImages).toBe('function');
  });

  it('highlightWedge is a function', () => {
    expect(typeof highlightWedge).toBe('function');
  });

  it('createAudioContext is a function', () => {
    expect(typeof createAudioContext).toBe('function');
  });

  it('playSuccessSound is a function', () => {
    expect(typeof playSuccessSound).toBe('function');
  });

  it('playFailureSound is a function', () => {
    expect(typeof playFailureSound).toBe('function');
  });
});

// ===========================================================================
// init(container)
// ===========================================================================
describe('init(container)', () => {
  it('does not throw with a valid container', () => {
    expect(() => plugin.init(buildContainer())).not.toThrow();
  });

  it('queries #fp-canvas from the container', () => {
    const spy = jest.spyOn(container, 'querySelector');
    plugin.init(container);
    expect(spy).toHaveBeenCalledWith('#fp-canvas');
  });

  it('binds a click listener to the canvas', () => {
    const canvas = container.querySelector('#fp-canvas');
    const spy = jest.spyOn(canvas, 'addEventListener');
    plugin.init(container);
    expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('binds a keydown listener to the canvas', () => {
    const canvas = container.querySelector('#fp-canvas');
    const spy = jest.spyOn(canvas, 'addEventListener');
    plugin.init(container);
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('binds a click listener to #fp-start-btn', () => {
    const btn = container.querySelector('#fp-start-btn');
    const spy = jest.spyOn(btn, 'addEventListener');
    plugin.init(container);
    expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('binds a click listener to #fp-continue-btn', () => {
    const btn = container.querySelector('#fp-continue-btn');
    const spy = jest.spyOn(btn, 'addEventListener');
    plugin.init(container);
    expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('binds a click listener to #fp-stop-btn', () => {
    const btn = container.querySelector('#fp-stop-btn');
    const spy = jest.spyOn(btn, 'addEventListener');
    plugin.init(container);
    expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('binds a mousemove listener to the canvas', () => {
    const canvas = container.querySelector('#fp-canvas');
    const spy = jest.spyOn(canvas, 'addEventListener');
    plugin.init(container);
    expect(spy).toHaveBeenCalledWith('mousemove', expect.any(Function));
  });

  it('binds a mouseleave listener to the canvas', () => {
    const canvas = container.querySelector('#fp-canvas');
    const spy = jest.spyOn(canvas, 'addEventListener');
    plugin.init(container);
    expect(spy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
  });
});

// ===========================================================================
// start()
// ===========================================================================
describe('start()', () => {
  it('calls game.startGame()', () => {
    plugin.start();
    expect(game.startGame).toHaveBeenCalled();
  });

  it('calls game.generateRound() via _runRound', () => {
    plugin.start();
    expect(game.generateRound).toHaveBeenCalled();
  });

  it('sets #fp-continue-btn hidden', () => {
    const btn = container.querySelector('#fp-continue-btn');
    btn.hidden = false; // ensure it starts visible
    plugin.start();
    expect(btn.hidden).toBe(true);
  });

  it('hides #fp-instructions', () => {
    const instructions = container.querySelector('#fp-instructions');
    instructions.hidden = false;
    plugin.start();
    expect(instructions.hidden).toBe(true);
  });

  it('shows #fp-game-area', () => {
    const gameArea = container.querySelector('#fp-game-area');
    gameArea.hidden = true;
    plugin.start();
    expect(gameArea.hidden).toBe(false);
  });
});

// ===========================================================================
// stop()
// ===========================================================================
describe('stop()', () => {
  beforeEach(() => {
    plugin.start();
  });

  it('calls game.stopGame()', () => {
    plugin.stop();
    expect(game.stopGame).toHaveBeenCalled();
  });

  it('returns the object from game.stopGame()', () => {
    const result = plugin.stop();
    expect(result).toEqual({ score: 3, roundsPlayed: 5, duration: 12000 });
  });

  it('sets #fp-feedback to a non-empty string', () => {
    plugin.stop();
    const feedback = container.querySelector('#fp-feedback');
    expect(feedback.textContent.length).toBeGreaterThan(0);
  });

  it('sets #fp-stop-btn hidden', () => {
    plugin.stop();
    const btn = container.querySelector('#fp-stop-btn');
    expect(btn.hidden).toBe(true);
  });
});

// ===========================================================================
// reset()
// ===========================================================================
describe('reset()', () => {
  beforeEach(() => {
    plugin.start();
    plugin.stop();
  });

  it('calls game.initGame()', () => {
    plugin.reset();
    expect(game.initGame).toHaveBeenCalled();
  });

  it('sets #fp-continue-btn hidden', () => {
    plugin.reset();
    const btn = container.querySelector('#fp-continue-btn');
    expect(btn.hidden).toBe(true);
  });

  it('shows #fp-stop-btn (not hidden)', () => {
    plugin.reset();
    const btn = container.querySelector('#fp-stop-btn');
    expect(btn.hidden).toBe(false);
  });

  it('clears #fp-feedback text content to ""', () => {
    plugin.reset();
    const feedback = container.querySelector('#fp-feedback');
    expect(feedback.textContent).toBe('');
  });

  it('calls ctx.clearRect(0, 0, 500, 500)', () => {
    plugin.reset();
    expect(ctx2d.clearRect).toHaveBeenCalledWith(0, 0, 500, 500);
  });

  it('shows #fp-instructions', () => {
    plugin.reset();
    const instructions = container.querySelector('#fp-instructions');
    expect(instructions.hidden).toBe(false);
  });

  it('hides #fp-game-area', () => {
    plugin.reset();
    const gameArea = container.querySelector('#fp-game-area');
    expect(gameArea.hidden).toBe(true);
  });
});

// ===========================================================================
// _handleClick — correct answer branch
// ===========================================================================
describe('_handleClick — correct answer (calculateWedgeIndex returns 2)', () => {
  beforeEach(() => {
    game.calculateWedgeIndex.mockReturnValue(2);
    game.checkAnswer.mockReturnValue(true);
    plugin.start();
    // Advance past displayDurationMs to enable clicking
    jest.runAllTimers();
  });

  function fireClick() {
    const canvas = container.querySelector('#fp-canvas');
    canvas.dispatchEvent(new MouseEvent('click', {
      clientX: 250,
      clientY: 100,
      bubbles: true,
    }));
  }

  it('calls game.addScore()', () => {
    fireClick();
    expect(game.addScore).toHaveBeenCalled();
  });

  it('calls playSuccessSound (createOscillator called on audio context)', () => {
    mockAudioCtx.createOscillator.mockClear();
    fireClick();
    expect(mockAudioCtx.createOscillator).toHaveBeenCalled();
  });

  it('sets #fp-continue-btn visible (not hidden)', () => {
    fireClick();
    const btn = container.querySelector('#fp-continue-btn');
    expect(btn.hidden).toBe(false);
  });

  it('#fp-feedback contains "Correct" (case-insensitive)', () => {
    fireClick();
    const feedback = container.querySelector('#fp-feedback');
    expect(feedback.textContent.toLowerCase()).toContain('correct');
  });

  it('#fp-flash has class fp-flash--correct before timeout', () => {
    fireClick();
    const flash = container.querySelector('#fp-flash');
    expect(flash.classList.contains('fp-flash--correct')).toBe(true);
  });
});

// ===========================================================================
// _handleClick — wrong answer branch
// ===========================================================================
describe('_handleClick — wrong answer (checkAnswer returns false)', () => {
  beforeEach(() => {
    game.calculateWedgeIndex.mockReturnValue(4);
    game.checkAnswer.mockReturnValue(false);
    plugin.start();
    jest.runAllTimers();
  });

  function fireClick() {
    const canvas = container.querySelector('#fp-canvas');
    canvas.dispatchEvent(new MouseEvent('click', {
      clientX: 250,
      clientY: 450,
      bubbles: true,
    }));
  }

  it('does NOT call game.addScore()', () => {
    fireClick();
    expect(game.addScore).not.toHaveBeenCalled();
  });

  it('calls playFailureSound (createOscillator called on audio context)', () => {
    mockAudioCtx.createOscillator.mockClear();
    fireClick();
    expect(mockAudioCtx.createOscillator).toHaveBeenCalled();
  });

  it('sets #fp-continue-btn visible', () => {
    fireClick();
    const btn = container.querySelector('#fp-continue-btn');
    expect(btn.hidden).toBe(false);
  });

  it('#fp-feedback contains "not quite" or "different" (case-insensitive)', () => {
    fireClick();
    const text = container.querySelector('#fp-feedback').textContent.toLowerCase();
    expect(text.includes('not quite') || text.includes('different')).toBe(true);
  });

  it('#fp-flash has class fp-flash--wrong', () => {
    fireClick();
    const flash = container.querySelector('#fp-flash');
    expect(flash.classList.contains('fp-flash--wrong')).toBe(true);
  });
});

// ===========================================================================
// _handleClick — outside circle (calculateWedgeIndex returns -1)
// ===========================================================================
describe('_handleClick — click outside circle', () => {
  beforeEach(() => {
    game.calculateWedgeIndex.mockReturnValue(-1);
    game.checkAnswer.mockReturnValue(true);
    plugin.start();
    jest.runAllTimers();
  });

  function fireClick() {
    const canvas = container.querySelector('#fp-canvas');
    canvas.dispatchEvent(new MouseEvent('click', {
      clientX: 1,
      clientY: 1,
      bubbles: true,
    }));
  }

  it('does NOT call game.checkAnswer', () => {
    fireClick();
    expect(game.checkAnswer).not.toHaveBeenCalled();
  });

  it('#fp-continue-btn remains hidden', () => {
    fireClick();
    const btn = container.querySelector('#fp-continue-btn');
    expect(btn.hidden).toBe(true);
  });
});

// ===========================================================================
// _handleKeydown
// ===========================================================================
describe('_handleKeydown', () => {
  beforeEach(() => {
    game.calculateWedgeIndex.mockReturnValue(2);
    game.checkAnswer.mockReturnValue(true);
    plugin.start();
    // Advance past displayDurationMs so _clickEnabled becomes true
    jest.runAllTimers();
    ctx2d.clearRect.mockClear();
    ctx2d.beginPath.mockClear();
  });

  it('ArrowRight increments _selectedWedge (clearImages called on canvas context)', () => {
    const canvas = container.querySelector('#fp-canvas');
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    // clearImages redraws the board — triggers beginPath calls
    expect(ctx2d.beginPath).toHaveBeenCalled();
  });

  it('Enter calls _resolveRound (game.checkAnswer called)', () => {
    const canvas = container.querySelector('#fp-canvas');
    // Navigate to a wedge first, then confirm with Enter
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(game.checkAnswer).toHaveBeenCalled();
  });

  it('ArrowRight calls event.preventDefault()', () => {
    const canvas = container.querySelector('#fp-canvas');
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    canvas.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});

// ===========================================================================
// Additional helper coverage
// ===========================================================================
describe('drawBoard()', () => {
  it('calls ctx.clearRect then draws wedges', () => {
    drawBoard(ctx2d, 500, 500, 4, [null, null], -1, false);
    expect(ctx2d.clearRect).toHaveBeenCalledWith(0, 0, 500, 500);
    expect(ctx2d.beginPath).toHaveBeenCalled();
  });

  it('calls ctx.drawImage when showImages is true and images are provided', () => {
    const fakeImgEl = { naturalWidth: 768, naturalHeight: 512 };
    const fakeWrappers = [
      { image: fakeImgEl, sx: 0, sw: 384, sh: 512 },
      { image: fakeImgEl, sx: 384, sw: 384, sh: 512 },
    ];
    ctx2d.drawImage.mockClear();
    drawBoard(ctx2d, 500, 500, 4, fakeWrappers, 1, true);
    expect(ctx2d.drawImage).toHaveBeenCalled();
  });

  it('calls ctx.drawImage with 9 arguments (sprite clipping)', () => {
    const fakeImgEl = { naturalWidth: 768, naturalHeight: 512 };
    const fakeWrappers = [
      { image: fakeImgEl, sx: 0, sw: 384, sh: 512 },
      { image: fakeImgEl, sx: 384, sw: 384, sh: 512 },
    ];
    ctx2d.drawImage.mockClear();
    drawBoard(ctx2d, 500, 500, 4, fakeWrappers, 1, true);
    expect(ctx2d.drawImage).toHaveBeenCalledWith(
      expect.any(Object), expect.any(Number), 0,
      384, 512,
      expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number),
    );
  });
});

describe('highlightWedge()', () => {
  it('calls ctx.beginPath and ctx.fill', () => {
    ctx2d.beginPath.mockClear();
    ctx2d.fill.mockClear();
    highlightWedge(ctx2d, 500, 500, 0, 6, 'red');
    expect(ctx2d.beginPath).toHaveBeenCalled();
    expect(ctx2d.fill).toHaveBeenCalled();
  });
});

describe('createAudioContext()', () => {
  it('returns an AudioContext instance', () => {
    const ctx = createAudioContext();
    expect(ctx).toBe(mockAudioCtx);
  });

  it('returns the same instance on repeated calls (singleton)', () => {
    const ctx1 = createAudioContext();
    const ctx2 = createAudioContext();
    expect(ctx1).toBe(ctx2);
  });
});

describe('playSuccessSound()', () => {
  it('creates an oscillator and gain node', () => {
    mockAudioCtx.createOscillator.mockClear();
    playSuccessSound(mockAudioCtx);
    expect(mockAudioCtx.createOscillator).toHaveBeenCalled();
    expect(mockAudioCtx.createGain).toHaveBeenCalled();
  });
});

describe('playFailureSound()', () => {
  it('creates an oscillator and gain node', () => {
    mockAudioCtx.createOscillator.mockClear();
    playFailureSound(mockAudioCtx);
    expect(mockAudioCtx.createOscillator).toHaveBeenCalled();
    expect(mockAudioCtx.createGain).toHaveBeenCalled();
  });
});

describe('loadImages()', () => {
  it('resolves with two wrapper objects when image loads', async () => {
    const imgs = await loadImages('a.png');
    expect(imgs).toHaveLength(2);
  });

  it('each wrapper has image, sx, sw, sh properties', async () => {
    const imgs = await loadImages('a.png');
    expect(imgs[0]).toMatchObject({ image: expect.any(Object), sx: 0, sw: 382, sh: 512 });
    expect(imgs[1]).toMatchObject({ image: expect.any(Object), sx: 0, sw: 382, sh: 512 });
  });

  it('returns a Promise', () => {
    const result = loadImages('a.png');
    expect(result).toBeInstanceOf(Promise);
  });
});

// ===========================================================================
// _handleKeydown — additional key navigation coverage
// ===========================================================================
describe('_handleKeydown — ArrowLeft navigation', () => {
  beforeEach(() => {
    plugin.start();
    jest.runAllTimers();
  });

  it('ArrowLeft calls event.preventDefault()', () => {
    const canvas = container.querySelector('#fp-canvas');
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    canvas.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('ArrowUp calls event.preventDefault()', () => {
    const canvas = container.querySelector('#fp-canvas');
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    canvas.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('Space key calls _resolveRound (game.checkAnswer called)', () => {
    const canvas = container.querySelector('#fp-canvas');
    // Navigate to a wedge first, then confirm with Space
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(game.checkAnswer).toHaveBeenCalled();
  });

  it('unknown key does not call game.checkAnswer', () => {
    const canvas = container.querySelector('#fp-canvas');
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(game.checkAnswer).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// _handleKeydown — guard: not active when _clickEnabled is false
// ===========================================================================
describe('_handleKeydown — guard when click not enabled', () => {
  it('does nothing if _clickEnabled is false (before displayDurationMs)', () => {
    plugin.start();
    // Do NOT advance timers — _clickEnabled stays false
    const canvas = container.querySelector('#fp-canvas');
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(game.checkAnswer).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// _handleMouseMove
// ===========================================================================
describe('_handleMouseMove', () => {
  beforeEach(() => {
    game.calculateWedgeIndex.mockReturnValue(2);
    plugin.start();
    jest.runAllTimers();
    ctx2d.clearRect.mockClear();
    ctx2d.fill.mockClear();
  });

  function fireMouseMove(clientX = 250, clientY = 200) {
    container.querySelector('#fp-canvas').dispatchEvent(
      new MouseEvent('mousemove', { clientX, clientY, bubbles: true }),
    );
  }

  it('does nothing when _clickEnabled is false', () => {
    plugin.reset();
    plugin.start(); // timers not advanced — _clickEnabled stays false
    ctx2d.clearRect.mockClear();
    fireMouseMove();
    expect(ctx2d.clearRect).not.toHaveBeenCalled();
  });

  it('redraws the board when hovering a new wedge', () => {
    fireMouseMove();
    expect(ctx2d.clearRect).toHaveBeenCalled();
  });

  it('highlights the hovered wedge (fill called for highlight)', () => {
    const fillCallsBefore = ctx2d.fill.mock.calls.length;
    fireMouseMove();
    // drawBoard fills each wedge once, plus highlightWedge fills once more
    expect(ctx2d.fill.mock.calls.length).toBeGreaterThan(fillCallsBefore);
  });

  it('does not redraw when the same wedge is hovered again', () => {
    fireMouseMove();
    ctx2d.clearRect.mockClear();
    fireMouseMove(255, 205); // calculateWedgeIndex still returns 2
    expect(ctx2d.clearRect).not.toHaveBeenCalled();
  });

  it('redraws when keyboard selection was active and mouse moves to same wedge', () => {
    // Establish keyboard selection via ArrowRight
    container.querySelector('#fp-canvas').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    ctx2d.clearRect.mockClear();
    // Mouse moves to wedge 2 (_hoveredWedge is still -1 at this point)
    fireMouseMove();
    expect(ctx2d.clearRect).toHaveBeenCalled();
  });
});

// ===========================================================================
// _handleMouseLeave
// ===========================================================================
describe('_handleMouseLeave', () => {
  beforeEach(() => {
    game.calculateWedgeIndex.mockReturnValue(2);
    plugin.start();
    jest.runAllTimers();
    // Establish a hover state first
    container.querySelector('#fp-canvas').dispatchEvent(
      new MouseEvent('mousemove', { clientX: 250, clientY: 200, bubbles: true }),
    );
    ctx2d.clearRect.mockClear();
  });

  it('clears the hover highlight when the mouse leaves', () => {
    container.querySelector('#fp-canvas').dispatchEvent(
      new MouseEvent('mouseleave', { bubbles: true }),
    );
    expect(ctx2d.clearRect).toHaveBeenCalled();
  });

  it('does nothing when _clickEnabled is false', () => {
    plugin.reset();
    plugin.start(); // timers not advanced
    ctx2d.clearRect.mockClear();
    container.querySelector('#fp-canvas').dispatchEvent(
      new MouseEvent('mouseleave', { bubbles: true }),
    );
    expect(ctx2d.clearRect).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// _handleClick — guard: click before round is active
// ===========================================================================
describe('_handleClick — guard when click not enabled', () => {
  it('does nothing if _clickEnabled is false', () => {
    plugin.start();
    // Do NOT advance timers
    const canvas = container.querySelector('#fp-canvas');
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 250, clientY: 100, bubbles: true }));
    expect(game.checkAnswer).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// _runRound — guard: does not run if game is not running
// ===========================================================================
describe('_runRound — guard when game is not running', () => {
  it('does not call generateRound if isRunning returns false', () => {
    game.isRunning.mockReturnValueOnce(false);
    plugin.start();
    expect(game.generateRound).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// continue button triggers _runRound
// ===========================================================================
describe('continue button', () => {
  it('clicking continue triggers a new round (generateRound called again)', () => {
    game.checkAnswer.mockReturnValue(true);
    game.calculateWedgeIndex.mockReturnValue(2);
    plugin.start();
    jest.runAllTimers();

    const canvas = container.querySelector('#fp-canvas');
    canvas.dispatchEvent(new MouseEvent('click', {
      clientX: 250, clientY: 100, bubbles: true,
    }));

    game.generateRound.mockClear();
    const continueBtn = container.querySelector('#fp-continue-btn');
    continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(game.generateRound).toHaveBeenCalled();
  });
});

// ===========================================================================
// stop button triggers stop()
// ===========================================================================
describe('stop button', () => {
  it('clicking stop button calls game.stopGame()', () => {
    plugin.start();
    const stopBtn = container.querySelector('#fp-stop-btn');
    stopBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(game.stopGame).toHaveBeenCalled();
  });
});

// ===========================================================================
// stop() cancels pending round timer
// ===========================================================================
describe('stop() timer cleanup', () => {
  it('clears the round timer on stop', () => {
    plugin.start();
    // Timer is pending — stop should clear it without throwing
    expect(() => plugin.stop()).not.toThrow();
  });
});

// ===========================================================================
// reset() timer cleanup
// ===========================================================================
describe('reset() timer cleanup', () => {
  it('clears any pending round timer on reset', () => {
    plugin.start();
    expect(() => plugin.reset()).not.toThrow();
  });
});

// ===========================================================================
// Progress saving
// ===========================================================================
describe('progress saving', () => {
  it('calls window.api.invoke("progress:load") then ("progress:save") on stop', async () => {
    const mockProgress = { playerId: 'default', games: {} };
    const mockApi = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce(mockProgress)
        .mockResolvedValueOnce(undefined),
    };
    globalThis.api = mockApi;

    plugin.init(buildContainer());
    plugin.start();
    plugin.stop();

    await Promise.resolve();
    await Promise.resolve();

    expect(mockApi.invoke).toHaveBeenCalledWith('progress:load', 'default');
    expect(mockApi.invoke).toHaveBeenCalledWith(
      'progress:save',
      'default',
      expect.objectContaining({
        games: expect.objectContaining({
          'fast-piggie': expect.objectContaining({
            sessionsPlayed: 1,
            lastPlayed: expect.any(String),
          }),
        }),
      }),
    );

    delete globalThis.api;
  });

  it('does not throw if progress:load rejects', async () => {
    const mockApi = {
      invoke: jest.fn().mockRejectedValue(new Error('IPC error')),
    };
    globalThis.api = mockApi;

    plugin.init(buildContainer());
    plugin.start();
    expect(() => plugin.stop()).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();

    delete globalThis.api;
  });

  it('preserves existing highScore when new score is lower', async () => {
    const mockProgress = {
      playerId: 'default',
      games: {
        'fast-piggie': { highScore: 10, sessionsPlayed: 3, lastPlayed: null },
      },
    };
    const mockApi = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce(mockProgress)
        .mockResolvedValueOnce(undefined),
    };
    globalThis.api = mockApi;

    plugin.init(buildContainer());
    plugin.start();
    plugin.stop();

    await Promise.resolve();
    await Promise.resolve();

    const saveCall = mockApi.invoke.mock.calls.find((c) => c[0] === 'progress:save');
    expect(saveCall[2].games['fast-piggie'].highScore).toBe(10);

    delete globalThis.api;
  });
});
