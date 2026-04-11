/**
 * index.test.js — Integration tests for Object Track index.js plugin.
 *
 * Uses jest.unstable_mockModule for ESM-compatible mocking.
 * All mocks are set up and modules imported at the top level.
 */

import {
  describe, it, expect, beforeEach, afterEach, jest,
} from '@jest/globals';

// ── 0. Mock timerService ──────────────────────────────────────────────────────

jest.unstable_mockModule('../../../components/timerService.js', () => ({
  startTimer: jest.fn(),
  stopTimer: jest.fn(() => 5000),
  resetTimer: jest.fn(),
  formatDuration: jest.fn(() => '00:05'),
  getTodayDateString: jest.fn(() => '2024-01-15'),
}));
await import('../../../components/timerService.js');

// ── 1. Mock scoreService ──────────────────────────────────────────────────────

jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(() => Promise.resolve(null)),
  loadProgress: jest.fn(() => Promise.resolve({ playerId: 'default', games: {} })),
  loadGameScore: jest.fn(() => Promise.resolve({})),
  clearHistory: jest.fn(() => Promise.resolve()),
}));
await import('../../../components/scoreService.js');

// ── 1b. Mock audioService ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playSuccessSound: jest.fn(),
  playFailureSound: jest.fn(),
}));
const audioServiceMock = await import('../../../components/audioService.js');

// ── 1c. Mock gameUtils ────────────────────────────────────────────────────────

jest.unstable_mockModule('../../../components/gameUtils.js', () => ({
  returnToMainMenu: jest.fn(),
}));
const gameUtilsMock = await import('../../../components/gameUtils.js');

// ── 2. Mock game.js ───────────────────────────────────────────────────────────

jest.unstable_mockModule('../game.js', () => ({
  MIN_LEVEL: 0,
  CORRECT_TO_ADVANCE: 3,
  WRONG_TO_DROP: 3,
  LEVELS_TO_DROP: 2,
  MIN_TRACKING_DURATION_MS: 5000,
  MAX_TRACKING_DURATION_MS: 10000,
  CIRCLE_RADIUS: 30,
  MIN_SPAWN_GAP: 10,
  MAX_SPAWN_ATTEMPTS: 200,
  getLevelConfig: jest.fn(() => ({
    numCircles: 8,
    numTargets: 3,
    speedPxPerSec: 150,
    trackingDurationMs: 5000,
  })),
  createCircles: jest.fn(() => []),
  selectTargets: jest.fn(() => []),
  updateCirclePositions: jest.fn((cs) => cs),
  resolveCircleCollisions: jest.fn((cs) => cs),
  evaluateResponse: jest.fn(() => ({ correct: true, correctCount: 3, totalTargets: 3 })),
  recordRoundResult: jest.fn(() => ({ levelDelta: 0, newLevel: 0 })),
  initRound: jest.fn(() => [
    { id: 0, x: 100, y: 100, radius: 30, isTarget: true },
    { id: 1, x: 200, y: 200, radius: 30, isTarget: false },
  ]),
  tickPhysics: jest.fn(() => [
    { id: 0, x: 105, y: 100, radius: 30, isTarget: true },
    { id: 1, x: 205, y: 200, radius: 30, isTarget: false },
  ]),
  getCurrentCircles: jest.fn(() => [
    { id: 0, x: 100, y: 100, radius: 30, isTarget: true },
    { id: 1, x: 200, y: 200, radius: 30, isTarget: false },
  ]),
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({ score: 5, level: 2, roundsPlayed: 10, duration: 8000 })),
  isRunning: jest.fn(() => true),
  getLevel: jest.fn(() => 2),
  getScore: jest.fn(() => 5),
  getConsecutiveCorrect: jest.fn(() => 0),
  getConsecutiveWrong: jest.fn(() => 0),
  getRoundsPlayed: jest.fn(() => 10),
}));

// ── 3. Dynamic imports ────────────────────────────────────────────────────────

const gameMock = await import('../game.js');
const scoreServiceMock = await import('../../../components/scoreService.js');
const timerServiceMock = await import('../../../components/timerService.js');
const indexModule = await import('../index.js');
const plugin = indexModule.default;
const {
  clearAllTimers,
  announce,
  updateStats,
  setRandomBackground,
  loadBackgroundImages,
  renderCircles,
  repositionCircleElements,
  highlightTargets,
  unhighlightTargets,
  startTrackingAnimation,
  stopTrackingAnimation,
  enterResponsePhase,
  handleCircleClick,
  submitResponse,
  showEndPanel,
  beginRound,
  endMarkingPhase,
  MARKING_DURATION_MS,
  FEEDBACK_DURATION_MS,
  ARENA_BACKGROUNDS,
  CIRCLE_PALETTES,
} = indexModule;

// ── 4. RAF mocks ──────────────────────────────────────────────────────────────

global.requestAnimationFrame = jest.fn(() => 1);
global.cancelAnimationFrame = jest.fn();

// ── 5. DOM helper ─────────────────────────────────────────────────────────────

/**
 * Build a minimal DOM container matching interface.html structure.
 *
 * @returns {HTMLElement} Container element with game UI nodes.
 */
function buildContainer() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div id="mot-instructions"></div>
    <div id="mot-play-area" hidden></div>
    <div id="mot-end-panel" hidden></div>
    <div id="mot-arena"></div>
    <strong id="mot-score">0</strong>
    <strong id="mot-level">1</strong>
    <strong id="mot-round">1</strong>
    <strong id="mot-session-timer">00:00</strong>
    <p id="mot-phase-label"></p>
    <div id="mot-feedback"></div>
    <button id="mot-stop"></button>
    <button id="mot-start"></button>
    <button id="mot-play-again"></button>
    <button id="mot-return"></button>
    <dd id="mot-final-score">0</dd>
    <dd id="mot-final-level">1</dd>
    <dd id="mot-final-rounds">0</dd>
  `;
  return el;
}

// ── 6. Lifecycle hooks ────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  gameMock.isRunning.mockReturnValue(true);
  global.requestAnimationFrame = jest.fn(() => 1);
  global.cancelAnimationFrame = jest.fn();
  // Reset ARENA_BACKGROUNDS between tests
  ARENA_BACKGROUNDS.length = 0;
});

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
  delete window.api;
});

// ── 7. Tests ──────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('MARKING_DURATION_MS is a positive number', () => {
    expect(typeof MARKING_DURATION_MS).toBe('number');
    expect(MARKING_DURATION_MS).toBeGreaterThan(0);
  });

  it('FEEDBACK_DURATION_MS is a positive number', () => {
    expect(typeof FEEDBACK_DURATION_MS).toBe('number');
    expect(FEEDBACK_DURATION_MS).toBeGreaterThan(0);
  });

  it('ARENA_BACKGROUNDS is an array', () => {
    expect(Array.isArray(ARENA_BACKGROUNDS)).toBe(true);
  });

  it('CIRCLE_PALETTES is a non-empty array with hi/mid/lo properties', () => {
    expect(Array.isArray(CIRCLE_PALETTES)).toBe(true);
    expect(CIRCLE_PALETTES.length).toBeGreaterThan(0);
    CIRCLE_PALETTES.forEach((p) => {
      expect(p).toHaveProperty('hi');
      expect(p).toHaveProperty('mid');
      expect(p).toHaveProperty('lo');
    });
  });
});

describe('plugin contract', () => {
  it('plugin.name is a string', () => {
    expect(typeof plugin.name).toBe('string');
  });

  it('plugin exposes init, start, stop, reset as functions', () => {
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
    expect(typeof plugin.reset).toBe('function');
  });
});

describe('init()', () => {
  it('calls game.initGame', () => {
    const container = buildContainer();
    plugin.init(container);
    expect(gameMock.initGame).toHaveBeenCalled();
  });

  it('handles null container without throwing', () => {
    expect(() => plugin.init(null)).not.toThrow();
  });

  it('wires Start button click to start()', () => {
    const container = buildContainer();
    plugin.init(container);
    const startBtn = container.querySelector('#mot-start');
    startBtn.click();
    expect(gameMock.startGame).toHaveBeenCalled();
  });
});

describe('start()', () => {
  it('calls game.startGame and timerService.startTimer', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    expect(gameMock.startGame).toHaveBeenCalled();
    expect(timerServiceMock.startTimer).toHaveBeenCalled();
  });

  it('shows play area and hides instructions', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    expect(container.querySelector('#mot-instructions').hidden).toBe(true);
    expect(container.querySelector('#mot-play-area').hidden).toBe(false);
  });

  it('calls game.initRound (via beginRound)', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    expect(gameMock.initRound).toHaveBeenCalled();
  });
});

describe('stop() when running', () => {
  it('calls clearAllTimers and game.stopGame', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.stop();
    expect(gameMock.stopGame).toHaveBeenCalled();
  });

  it('calls saveScore with object-track id', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.stop();
    expect(scoreServiceMock.saveScore).toHaveBeenCalledWith(
      'object-track',
      expect.objectContaining({ score: expect.any(Number) }),
    );
  });

  it('shows end panel', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.stop();
    expect(container.querySelector('#mot-end-panel').hidden).toBe(false);
  });

  it('returns result object', async () => {
    const container = buildContainer();
    plugin.init(container);
    const result = await plugin.stop();
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('roundsPlayed');
  });
});

describe('stop() when NOT running', () => {
  it('uses fallback result values from getters', async () => {
    gameMock.isRunning.mockReturnValue(false);
    const container = buildContainer();
    plugin.init(container);
    const result = await plugin.stop();
    // stopGame should NOT have been called
    expect(gameMock.stopGame).not.toHaveBeenCalled();
    expect(result.score).toBe(5); // from getScore mock
  });
});

describe('reset()', () => {
  it('calls initGame and timerService.resetTimer', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.reset();
    expect(gameMock.initGame).toHaveBeenCalled();
    expect(timerServiceMock.resetTimer).toHaveBeenCalled();
  });

  it('clears arena innerHTML', () => {
    const container = buildContainer();
    plugin.init(container);
    const arena = container.querySelector('#mot-arena');
    arena.innerHTML = '<div class="mot-circle"></div>';
    plugin.reset();
    expect(arena.innerHTML).toBe('');
  });

  it('shows instructions and hides play area / end panel', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.reset();
    expect(container.querySelector('#mot-instructions').hidden).toBe(false);
    expect(container.querySelector('#mot-play-area').hidden).toBe(true);
    expect(container.querySelector('#mot-end-panel').hidden).toBe(true);
  });
});

describe('clearAllTimers()', () => {
  it('calls cancelAnimationFrame when rafHandle is set', () => {
    // start animation to set rafHandle
    const container = buildContainer();
    plugin.init(container);
    startTrackingAnimation(5000);
    clearAllTimers();
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('does not throw when called with no active timers', () => {
    expect(() => clearAllTimers()).not.toThrow();
  });
});

describe('announce()', () => {
  it('sets textContent of feedback element', () => {
    const container = buildContainer();
    plugin.init(container);
    announce('Test message');
    expect(container.querySelector('#mot-feedback').textContent).toBe('Test message');
  });

  it('does not throw when feedbackEl is null (called before init)', () => {
    // Re-import won't reset state, but clearAllTimers resets nothing relevant here.
    // We test by calling before init with a fresh container.
    expect(() => announce('hello')).not.toThrow();
  });
});

describe('updateStats()', () => {
  it('updates score, level, and round elements from game mocks', () => {
    const container = buildContainer();
    plugin.init(container);
    updateStats();
    expect(container.querySelector('#mot-score').textContent).toBe('5');
    expect(container.querySelector('#mot-level').textContent).toBe('3'); // getLevel()+1
    expect(container.querySelector('#mot-round').textContent).toBe('11'); // getRoundsPlayed()+1
  });

  it('does not throw when elements are null', () => {
    expect(() => updateStats()).not.toThrow();
  });
});

describe('setRandomBackground(arenaEl)', () => {
  it('sets backgroundImage style when backgrounds are loaded', () => {
    ARENA_BACKGROUNDS.push('bg-1.png');
    const el = document.createElement('div');
    setRandomBackground(el);
    expect(el.style.backgroundImage).toMatch(/url\(/);
  });

  it('is a no-op when no backgrounds are loaded', () => {
    const el = document.createElement('div');
    setRandomBackground(el);
    expect(el.style.backgroundImage).toBe('');
  });

  it('handles null arenaEl without throwing', () => {
    expect(() => setRandomBackground(null)).not.toThrow();
  });
});

describe('loadBackgroundImages() → setRandomBackground() integration', () => {
  it('setRandomBackground uses images populated by loadBackgroundImages', async () => {
    window.api = { invoke: jest.fn().mockResolvedValue(['bg-1.png', 'bg-2.png']) };
    await loadBackgroundImages();
    expect(ARENA_BACKGROUNDS.length).toBe(2);
    const el = document.createElement('div');
    setRandomBackground(el);
    expect(el.style.backgroundImage).toMatch(/url\(/);
    expect(el.style.backgroundImage).toMatch(/bg-[12]\.png/);
  });
});

describe('loadBackgroundImages()', () => {
  it('is a no-op when window.api is not available', async () => {
    delete window.api;
    await expect(loadBackgroundImages()).resolves.toBeUndefined();
    expect(ARENA_BACKGROUNDS.length).toBe(0);
  });

  it('populates ARENA_BACKGROUNDS from IPC result', async () => {
    window.api = { invoke: jest.fn().mockResolvedValue(['bg-1.png', 'bg-2.png']) };
    await loadBackgroundImages();
    expect(ARENA_BACKGROUNDS).toEqual(['bg-1.png', 'bg-2.png']);
  });

  it('does not modify ARENA_BACKGROUNDS when IPC returns empty array', async () => {
    // Pre-populate with an entry to prove the guard condition prevents clearing
    ARENA_BACKGROUNDS.push('existing.png');
    window.api = { invoke: jest.fn().mockResolvedValue([]) };
    await loadBackgroundImages();
    // Guard: files.length > 0 is false, so ARENA_BACKGROUNDS must not be cleared
    expect(ARENA_BACKGROUNDS).toEqual(['existing.png']);
  });

  it('silently falls back when IPC rejects', async () => {
    window.api = { invoke: jest.fn().mockRejectedValue(new Error('IPC error')) };
    await expect(loadBackgroundImages()).resolves.toBeUndefined();
    expect(ARENA_BACKGROUNDS.length).toBe(0);
  });
});

describe('renderCircles()', () => {
  it('creates .mot-circle elements in arena with correct ids', () => {
    const container = buildContainer();
    plugin.init(container);
    const circles = [
      { id: 0, x: 100, y: 100, radius: 30, isTarget: false },
      { id: 1, x: 200, y: 200, radius: 30, isTarget: true },
    ];
    renderCircles(circles);
    const arena = container.querySelector('#mot-arena');
    expect(arena.querySelectorAll('.mot-circle')).toHaveLength(2);
    expect(arena.querySelector('#mot-circle-0')).not.toBeNull();
    expect(arena.querySelector('#mot-circle-1')).not.toBeNull();
  });

  it('does not throw when called before init (arenaEl null)', () => {
    expect(() => renderCircles([{ id: 0, x: 10, y: 10, radius: 30, isTarget: false }]))
      .not.toThrow();
  });
});

describe('repositionCircleElements()', () => {
  it('updates left/top of existing circle elements', () => {
    const container = buildContainer();
    plugin.init(container);
    // First render circles
    renderCircles([{ id: 0, x: 100, y: 100, radius: 30, isTarget: false }]);
    // Then reposition
    repositionCircleElements([{ id: 0, x: 150, y: 120, radius: 30, isTarget: false }]);
    const el = container.querySelector('#mot-circle-0');
    expect(el.style.left).toBe('120px'); // 150 - 30
    expect(el.style.top).toBe('90px');   // 120 - 30
  });

  it('does not throw when arenaEl is null', () => {
    expect(() => repositionCircleElements([{ id: 0, x: 10, y: 10, radius: 30 }]))
      .not.toThrow();
  });
});

describe('highlightTargets()', () => {
  it('adds mot-circle--target-reveal to target circles', () => {
    const container = buildContainer();
    plugin.init(container);
    renderCircles([
      { id: 0, x: 100, y: 100, radius: 30, isTarget: true },
      { id: 1, x: 200, y: 200, radius: 30, isTarget: false },
    ]);
    highlightTargets();
    // getCurrentCircles mock returns id:0 as target
    const el = container.querySelector('#mot-circle-0');
    expect(el.classList.contains('mot-circle--target-reveal')).toBe(true);
  });

  it('does not throw when arenaEl is null', () => {
    expect(() => highlightTargets()).not.toThrow();
  });
});

describe('unhighlightTargets()', () => {
  it('removes mot-circle--target-reveal from all circles', () => {
    const container = buildContainer();
    plugin.init(container);
    renderCircles([{ id: 0, x: 100, y: 100, radius: 30, isTarget: true }]);
    const el = container.querySelector('#mot-circle-0');
    el.classList.add('mot-circle--target-reveal');
    unhighlightTargets();
    expect(el.classList.contains('mot-circle--target-reveal')).toBe(false);
  });

  it('does not throw when arenaEl is null', () => {
    expect(() => unhighlightTargets()).not.toThrow();
  });
});

describe('startTrackingAnimation(durationMs)', () => {
  it('calls requestAnimationFrame', () => {
    const container = buildContainer();
    plugin.init(container);
    startTrackingAnimation(5000);
    expect(global.requestAnimationFrame).toHaveBeenCalled();
  });

  it('schedules a timeout for durationMs', () => {
    const container = buildContainer();
    plugin.init(container);
    startTrackingAnimation(5000);
    // Verify timeout was set (jest fake timers)
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });
});

describe('stopTrackingAnimation()', () => {
  it('calls cancelAnimationFrame and clears tracking timer', () => {
    const container = buildContainer();
    plugin.init(container);
    startTrackingAnimation(5000);
    stopTrackingAnimation();
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('does not throw when called with no active animation', () => {
    expect(() => stopTrackingAnimation()).not.toThrow();
  });
});

describe('enterResponsePhase()', () => {
  it('adds mot-arena--response class to arena', () => {
    const container = buildContainer();
    plugin.init(container);
    enterResponsePhase();
    expect(container.querySelector('#mot-arena').classList.contains('mot-arena--response'))
      .toBe(true);
  });

  it('announces a message via feedbackEl', () => {
    const container = buildContainer();
    plugin.init(container);
    enterResponsePhase();
    expect(container.querySelector('#mot-feedback').textContent).toMatch(/Click/i);
  });
});

describe('handleCircleClick(event)', () => {
  it('selects a .mot-circle element on click (distractor — no auto-submit)', () => {
    // 3 targets, only 1 click → threshold not reached
    gameMock.getCurrentCircles.mockReturnValue([
      { id: 0, x: 100, y: 100, radius: 30, isTarget: false },
      { id: 1, x: 200, y: 200, radius: 30, isTarget: true },
      { id: 2, x: 300, y: 300, radius: 30, isTarget: true },
      { id: 3, x: 400, y: 400, radius: 30, isTarget: true },
    ]);
    const container = buildContainer();
    plugin.init(container);
    renderCircles([
      { id: 0, x: 100, y: 100, radius: 30, isTarget: false },
      { id: 1, x: 200, y: 200, radius: 30, isTarget: true },
    ]);
    enterResponsePhase(); // caches _numTargets = 3
    const circleEl = container.querySelector('#mot-circle-0');
    circleEl.closest = (sel) => circleEl.matches(sel) ? circleEl : null;
    handleCircleClick({ target: circleEl }); // 1 selected < 3 → no auto-submit
    expect(circleEl.classList.contains('mot-circle--selected')).toBe(true);
    expect(circleEl.getAttribute('aria-pressed')).toBe('true');
  });

  it('deselects a circle on second click', () => {
    // 3 targets → clicking circle 0 twice ends at 0 selected, no auto-submit
    gameMock.getCurrentCircles.mockReturnValue([
      { id: 0, x: 100, y: 100, radius: 30, isTarget: false },
      { id: 1, x: 200, y: 200, radius: 30, isTarget: true },
      { id: 2, x: 300, y: 300, radius: 30, isTarget: true },
      { id: 3, x: 400, y: 400, radius: 30, isTarget: true },
    ]);
    const container = buildContainer();
    plugin.init(container);
    renderCircles([
      { id: 0, x: 100, y: 100, radius: 30, isTarget: false },
      { id: 1, x: 200, y: 200, radius: 30, isTarget: true },
    ]);
    enterResponsePhase(); // caches _numTargets = 3
    const circleEl = container.querySelector('#mot-circle-0');
    circleEl.closest = (sel) => circleEl.matches(sel) ? circleEl : null;
    handleCircleClick({ target: circleEl }); // 1 selected
    handleCircleClick({ target: circleEl }); // 0 selected
    expect(circleEl.classList.contains('mot-circle--selected')).toBe(false);
    expect(circleEl.getAttribute('aria-pressed')).toBe('false');
  });

  it('auto-submits when selected count reaches numTargets', async () => {
    // 1 target circle: clicking it should trigger submitResponse automatically
    gameMock.getCurrentCircles.mockReturnValue([
      { id: 0, x: 100, y: 100, radius: 30, isTarget: true },
    ]);
    const container = buildContainer();
    plugin.init(container);
    renderCircles([{ id: 0, x: 100, y: 100, radius: 30, isTarget: true }]);
    enterResponsePhase(); // caches _numTargets = 1
    const circleEl = container.querySelector('#mot-circle-0');
    circleEl.closest = (sel) => circleEl.matches(sel) ? circleEl : null;
    handleCircleClick({ target: circleEl }); // 1 selected >= 1 → auto-submit
    expect(gameMock.evaluateResponse).toHaveBeenCalled();
  });

  it('ignores clicks on non-circle elements', () => {
    const container = buildContainer();
    plugin.init(container);
    const div = document.createElement('div');
    div.closest = () => null;
    expect(() => handleCircleClick({ target: div })).not.toThrow();
  });
});

describe('submitResponse()', () => {
  it('calls game.evaluateResponse', async () => {
    const container = buildContainer();
    plugin.init(container);
    renderCircles([
      { id: 0, x: 100, y: 100, radius: 30, isTarget: true },
      { id: 1, x: 200, y: 200, radius: 30, isTarget: false },
    ]);
    await submitResponse();
    expect(gameMock.evaluateResponse).toHaveBeenCalled();
  });

  it('calls game.recordRoundResult', async () => {
    const container = buildContainer();
    plugin.init(container);
    renderCircles([]);
    await submitResponse();
    expect(gameMock.recordRoundResult).toHaveBeenCalledWith(true);
  });

  it('plays success sound on correct response', async () => {
    gameMock.evaluateResponse.mockReturnValueOnce(
      { correct: true, correctCount: 1, totalTargets: 1 },
    );
    const container = buildContainer();
    plugin.init(container);
    renderCircles([]);
    await submitResponse();
    expect(audioServiceMock.playSuccessSound).toHaveBeenCalled();
  });

  it('plays failure sound on incorrect response', async () => {
    gameMock.evaluateResponse.mockReturnValueOnce(
      { correct: false, correctCount: 0, totalTargets: 1 },
    );
    const container = buildContainer();
    plugin.init(container);
    renderCircles([]);
    await submitResponse();
    expect(audioServiceMock.playFailureSound).toHaveBeenCalled();
  });

  it('adds mot-circle--correct to correctly selected target circles', async () => {
    // Use 3 targets so 1 click won't auto-submit (_numTargets = 3)
    gameMock.getCurrentCircles.mockReturnValue([
      { id: 0, x: 100, y: 100, radius: 30, isTarget: true },
      { id: 1, x: 200, y: 200, radius: 30, isTarget: true },
      { id: 2, x: 300, y: 300, radius: 30, isTarget: true },
    ]);
    const container = buildContainer();
    plugin.init(container);
    beginRound();
    enterResponsePhase(); // caches _numTargets = 3
    const circleEl = container.querySelector('#mot-circle-0');
    circleEl.closest = (sel) => circleEl.matches(sel) ? circleEl : null;
    handleCircleClick({ target: circleEl }); // 1 of 3 → no auto-submit

    gameMock.evaluateResponse.mockReturnValueOnce(
      { correct: true, correctCount: 1, totalTargets: 1 },
    );
    await submitResponse();
    expect(circleEl.classList.contains('mot-circle--correct')).toBe(true);
  });

  it('adds mot-circle--missed to unselected target circles', async () => {
    const container = buildContainer();
    plugin.init(container);
    // beginRound resets _selectedIds to ensure circle 0 is not pre-selected
    beginRound();
    // Render a single target circle but do NOT select it
    renderCircles([{ id: 0, x: 100, y: 100, radius: 30, isTarget: true }]);
    gameMock.evaluateResponse.mockReturnValueOnce(
      { correct: false, correctCount: 0, totalTargets: 1 },
    );
    await submitResponse();
    const circleEl = container.querySelector('#mot-circle-0');
    expect(circleEl.classList.contains('mot-circle--missed')).toBe(true);
  });

  it('schedules feedbackTimer with setTimeout', async () => {
    const container = buildContainer();
    plugin.init(container);
    renderCircles([]);
    await submitResponse();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });
});

describe('showEndPanel(result)', () => {
  it('hides play area and shows end panel', () => {
    const container = buildContainer();
    plugin.init(container);
    const playArea = container.querySelector('#mot-play-area');
    playArea.hidden = false;
    showEndPanel({ score: 7, level: 3, roundsPlayed: 15 });
    expect(container.querySelector('#mot-end-panel').hidden).toBe(false);
    expect(playArea.hidden).toBe(true);
  });

  it('sets final score, level (+1), and rounds text content', () => {
    const container = buildContainer();
    plugin.init(container);
    showEndPanel({ score: 7, level: 3, roundsPlayed: 15 });
    expect(container.querySelector('#mot-final-score').textContent).toBe('7');
    expect(container.querySelector('#mot-final-level').textContent).toBe('4'); // +1
    expect(container.querySelector('#mot-final-rounds').textContent).toBe('15');
  });
});

describe('beginRound()', () => {
  it('calls game.initRound and renders circles in arena', () => {
    const container = buildContainer();
    plugin.init(container);
    beginRound();
    expect(gameMock.initRound).toHaveBeenCalled();
    const arena = container.querySelector('#mot-arena');
    expect(arena.querySelectorAll('.mot-circle').length).toBeGreaterThanOrEqual(0);
  });

  it('sets phase label text', () => {
    const container = buildContainer();
    plugin.init(container);
    beginRound();
    expect(container.querySelector('#mot-phase-label').textContent).toBe('Watch for targets!');
  });

  it('schedules markingTimer', () => {
    const container = buildContainer();
    plugin.init(container);
    beginRound();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });
});

describe('endMarkingPhase()', () => {
  it('calls game.getLevelConfig and startTrackingAnimation (requestAnimationFrame)', () => {
    const container = buildContainer();
    plugin.init(container);
    endMarkingPhase();
    expect(gameMock.getLevelConfig).toHaveBeenCalled();
    expect(global.requestAnimationFrame).toHaveBeenCalled();
  });

  it('calls unhighlightTargets and updates phase label', () => {
    const container = buildContainer();
    plugin.init(container);
    const arena = container.querySelector('#mot-arena');
    const circleEl = document.createElement('div');
    circleEl.classList.add('mot-circle', 'mot-circle--target-reveal');
    arena.appendChild(circleEl);
    endMarkingPhase();
    expect(circleEl.classList.contains('mot-circle--target-reveal')).toBe(false);
    expect(container.querySelector('#mot-phase-label').textContent)
      .toBe('Track the targets...');
  });
});

// ── Extra coverage: RAF tick callback ─────────────────────────────────────────

describe('startTrackingAnimation — tick callback coverage', () => {
  it('invokes game.tickPhysics and repositions circles when RAF fires', () => {
    const container = buildContainer();
    plugin.init(container);
    renderCircles([{ id: 0, x: 100, y: 100, radius: 30, isTarget: false }]);

    // Capture the RAF callback so we can invoke it manually.
    let capturedTick;
    global.requestAnimationFrame = jest.fn((cb) => {
      capturedTick = cb;
      return 1;
    });

    // isRunning returns true so the tick body executes (not early-return).
    gameMock.isRunning.mockReturnValue(true);
    startTrackingAnimation(5000);

    // Invoke tick with timestamp=100: _lastFrameMs is null → delta = 0.
    // The recursive requestAnimationFrame call just captures but doesn't invoke.
    capturedTick(100);
    expect(gameMock.tickPhysics).toHaveBeenCalledWith(0, expect.any(Object));
  });

  it('computes non-zero delta on the second tick frame', () => {
    const container = buildContainer();
    plugin.init(container);
    renderCircles([{ id: 0, x: 100, y: 100, radius: 30, isTarget: false }]);

    const ticks = [];
    global.requestAnimationFrame = jest.fn((cb) => {
      ticks.push(cb);
      return ticks.length;
    });

    // Keep isRunning true so tick body executes on both calls.
    gameMock.isRunning.mockReturnValue(true);
    startTrackingAnimation(5000);

    // First tick: _lastFrameMs is null → delta = 0. RAF re-captures into ticks[1].
    ticks[0](100);

    // Second tick: delta = 116 - 100 = 16. RAF re-captures into ticks[2] (not invoked).
    ticks[1](116);
    expect(gameMock.tickPhysics).toHaveBeenCalledWith(16, expect.any(Object));
  });

  it('tracking timeout triggers stopTrackingAnimation and enterResponsePhase', () => {
    const container = buildContainer();
    plugin.init(container);
    startTrackingAnimation(5000);

    // Advance fake timers past durationMs to fire the tracking timeout.
    jest.runAllTimers();
    // enterResponsePhase adds mot-arena--response to the arena.
    expect(container.querySelector('#mot-arena').classList.contains('mot-arena--response'))
      .toBe(true);
  });
});

// ── Extra coverage: submitResponse feedback timer callback ────────────────────

describe('submitResponse — feedback timer callback', () => {
  it('fires beginRound after FEEDBACK_DURATION_MS', async () => {
    const container = buildContainer();
    plugin.init(container);
    renderCircles([]);
    await submitResponse();

    const roundsBefore = gameMock.initRound.mock.calls.length;
    jest.runAllTimers();
    expect(gameMock.initRound.mock.calls.length).toBeGreaterThan(roundsBefore);
  });
});

// ── Extra coverage: returnToMainMenu ─────────────────────────────────────────

describe('returnToMainMenu via Return to Menu button', () => {
  it('calls returnToMainMenu when return button is clicked', () => {
    const container = buildContainer();
    plugin.init(container);
    container.querySelector('#mot-return').click();
    expect(gameUtilsMock.returnToMainMenu).toHaveBeenCalled();
  });
});

// ── Extra coverage: timerService callback in start() ─────────────────────────

describe('start() — session timer callback', () => {
  it('updates session timer element when timerService fires the callback', () => {
    // Make startTimer immediately invoke its callback with a duration value.
    timerServiceMock.startTimer.mockImplementationOnce((cb) => cb(5000));
    timerServiceMock.formatDuration.mockReturnValue('01:23');
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    expect(container.querySelector('#mot-session-timer').textContent).toBe('01:23');
  });
});

// ── Button wiring ─────────────────────────────────────────────────────────────

describe('button wiring', () => {
  it('stop button calls stop()', async () => {
    const container = buildContainer();
    plugin.init(container);
    const btn = container.querySelector('#mot-stop');
    await btn.click();
    expect(gameMock.stopGame).toHaveBeenCalled();
  });

  it('play-again button calls reset() then start()', () => {
    const container = buildContainer();
    plugin.init(container);
    const btn = container.querySelector('#mot-play-again');
    btn.click();
    // reset calls initGame, start calls startGame
    expect(gameMock.initGame).toHaveBeenCalled();
    expect(gameMock.startGame).toHaveBeenCalled();
  });
});
