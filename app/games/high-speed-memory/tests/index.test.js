import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock game.js so index.js can be tested in isolation.
jest.unstable_mockModule('../game.js', () => ({
  SYMBOLS: ['★', '♠', '♥', '♦', '♣', '☀', '☽', '✿', '♪', '✈', '⚽', '🎯', '🔔', '🌊', '🍀', '💎'],
  GRID_CONFIGS: [[2, 2], [2, 3]],
  BASE_DISPLAY_MS: 3000,
  DISPLAY_DECREMENT_MS: 200,
  MIN_DISPLAY_MS: 800,
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({ score: 5, level: 2, roundsCompleted: 2, duration: 12000 })),
  getGridSize: jest.fn(() => ({ rows: 2, cols: 2 })),
  getDisplayDurationMs: jest.fn(() => 3000),
  generateGrid: jest.fn(() => [
    { id: 0, symbol: '★', matched: false },
    { id: 1, symbol: '♠', matched: false },
    { id: 2, symbol: '★', matched: false },
    { id: 3, symbol: '♠', matched: false },
  ]),
  checkMatch: jest.fn((a, b) => a === b),
  addCorrectPair: jest.fn(),
  completeRound: jest.fn(),
  getScore: jest.fn(() => 5),
  getLevel: jest.fn(() => 2),
  getRoundsCompleted: jest.fn(() => 2),
  isRunning: jest.fn(() => false),
}));

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const {
  announce,
  updateStats,
  updatePairsDisplay,
  renderGrid,
  hideCardEl,
  revealCardEl,
  markCardMatched,
  markCardWrong,
  hideAllCards,
  startRound,
  handleCardClick,
} = pluginModule;

const gameMock = await import('../game.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal DOM matching interface.html. */
function buildContainer() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div id="hsm-instructions"></div>
    <div id="hsm-game-area" hidden></div>
    <div id="hsm-end-panel" hidden></div>
    <button id="hsm-start-btn" type="button"></button>
    <button id="hsm-stop-btn" type="button"></button>
    <button id="hsm-play-again-btn" type="button"></button>
    <div id="hsm-grid"></div>
    <strong id="hsm-score">0</strong>
    <strong id="hsm-level">1</strong>
    <strong id="hsm-pairs-found">0</strong>
    <strong id="hsm-pairs-total">0</strong>
    <div id="hsm-countdown" hidden></div>
    <div id="hsm-feedback"></div>
    <strong id="hsm-final-score">0</strong>
    <strong id="hsm-final-level">1</strong>
  `;
  return el;
}

// ── Plugin contract ───────────────────────────────────────────────────────────

describe('plugin contract', () => {
  test('exposes a string name', () => {
    expect(typeof plugin.name).toBe('string');
    expect(plugin.name.length).toBeGreaterThan(0);
  });

  test('exposes init, start, stop, and reset functions', () => {
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
    expect(typeof plugin.reset).toBe('function');
  });
});

// ── init ──────────────────────────────────────────────────────────────────────

describe('init', () => {
  test('accepts a DOM container without throwing', () => {
    expect(() => plugin.init(buildContainer())).not.toThrow();
  });

  test('accepts null without throwing', () => {
    expect(() => plugin.init(null)).not.toThrow();
  });
});

// ── start ─────────────────────────────────────────────────────────────────────

describe('start', () => {
  let container;

  beforeEach(() => {
    jest.useFakeTimers();
    container = buildContainer();
    plugin.init(container);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows the game area and hides instructions', () => {
    plugin.start();
    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
    expect(container.querySelector('#hsm-instructions').hidden).toBe(true);
  });

  test('does not throw when called without a container', () => {
    plugin.init(null);
    expect(() => plugin.start()).not.toThrow();
  });

  test('start button click triggers start', () => {
    const startBtn = container.querySelector('#hsm-start-btn');
    startBtn.click();
    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
  });
});

// ── stop ──────────────────────────────────────────────────────────────────────

describe('stop', () => {
  let container;

  beforeEach(() => {
    jest.useFakeTimers();
    container = buildContainer();
    plugin.init(container);
    plugin.start();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns the result from game logic', () => {
    const result = plugin.stop();
    expect(result).toMatchObject({ score: 5, level: 2 });
  });

  test('shows the end panel', () => {
    plugin.stop();
    expect(container.querySelector('#hsm-end-panel').hidden).toBe(false);
  });

  test('updates the final score display', () => {
    plugin.stop();
    expect(container.querySelector('#hsm-final-score').textContent).toBe('5');
  });

  test('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => plugin.stop()).not.toThrow();
  });

  test('stop button click triggers stop', () => {
    const stopBtn = container.querySelector('#hsm-stop-btn');
    stopBtn.click();
    expect(container.querySelector('#hsm-end-panel').hidden).toBe(false);
  });

  test('clears pending flip-back timer on stop', () => {
    // Release the flip lock by running the reveal timer
    jest.runAllTimers();
    // Create a non-matching flip to set the flip-back timer
    handleCardClick(0); // flip card 0 (★)
    handleCardClick(1); // flip card 1 (♠) — no match, flip-back timer pending
    // stop() should clear the pending timer without throwing
    expect(() => plugin.stop()).not.toThrow();
  });

  test('invokes window.api progress save when api is available', async () => {
    const mockApi = { invoke: jest.fn().mockResolvedValue(undefined) };
    globalThis.window = globalThis.window || {};
    const originalApi = globalThis.window.api;
    globalThis.window.api = mockApi;

    plugin.stop();

    await Promise.resolve();

    expect(mockApi.invoke).toHaveBeenCalledWith(
      'progress:save',
      expect.objectContaining({ gameId: 'high-speed-memory' }),
    );
    globalThis.window.api = originalApi;
  });

  test('swallows errors from window.api.invoke', async () => {
    const mockApi = { invoke: jest.fn().mockRejectedValue(new Error('ipc error')) };
    globalThis.window = globalThis.window || {};
    const originalApi = globalThis.window.api;
    globalThis.window.api = mockApi;

    expect(() => plugin.stop()).not.toThrow();
    await Promise.resolve();

    globalThis.window.api = originalApi;
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('reset', () => {
  let container;

  beforeEach(() => {
    jest.useFakeTimers();
    container = buildContainer();
    plugin.init(container);
    plugin.start();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('hides the game area', () => {
    plugin.reset();
    expect(container.querySelector('#hsm-game-area').hidden).toBe(true);
  });

  test('shows the instructions panel', () => {
    plugin.reset();
    expect(container.querySelector('#hsm-instructions').hidden).toBe(false);
  });

  test('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => plugin.reset()).not.toThrow();
  });

  test('clears pending hide timer on reset', () => {
    // startRound creates a hide timer; reset should clear it
    expect(() => plugin.reset()).not.toThrow();
  });

  test('clears pending flip-back timer on reset', () => {
    // Release the flip lock by running the reveal timer
    jest.runAllTimers();
    // Create a non-matching flip to create a pending flip-back timer
    handleCardClick(0);
    handleCardClick(1); // no match, flip-back timer pending
    expect(() => plugin.reset()).not.toThrow();
  });
});

// ── play-again button ─────────────────────────────────────────────────────────

describe('play again button', () => {
  test('resets and restarts the game', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.stop(); // show end panel

    const playAgainBtn = container.querySelector('#hsm-play-again-btn');
    playAgainBtn.click();

    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
    jest.useRealTimers();
  });
});

// ── announce ──────────────────────────────────────────────────────────────────

describe('announce', () => {
  test('sets feedback element text content', () => {
    const container = buildContainer();
    plugin.init(container);
    announce('Test message');
    expect(container.querySelector('#hsm-feedback').textContent).toBe('Test message');
  });

  test('does not throw when feedback element is absent', () => {
    plugin.init(document.createElement('div'));
    expect(() => announce('hello')).not.toThrow();
  });
});

// ── updateStats ───────────────────────────────────────────────────────────────

describe('updateStats', () => {
  test('updates score and level elements', () => {
    const container = buildContainer();
    plugin.init(container);
    updateStats();
    expect(container.querySelector('#hsm-score').textContent).toBe('5');
    expect(container.querySelector('#hsm-level').textContent).toBe('3'); // level 2 + 1
  });

  test('does not throw when elements are absent', () => {
    plugin.init(document.createElement('div'));
    expect(() => updateStats()).not.toThrow();
  });
});

// ── updatePairsDisplay ────────────────────────────────────────────────────────

describe('updatePairsDisplay', () => {
  test('does not throw when pairs element is absent', () => {
    plugin.init(document.createElement('div'));
    expect(() => updatePairsDisplay()).not.toThrow();
  });

  test('updates pairs found element', () => {
    const container = buildContainer();
    plugin.init(container);
    updatePairsDisplay();
    expect(container.querySelector('#hsm-pairs-found').textContent).toBe('0');
  });
});

// ── renderGrid ────────────────────────────────────────────────────────────────

describe('renderGrid', () => {
  test('creates one button per card in the mocked grid', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    const buttons = container.querySelectorAll('#hsm-grid button');
    expect(buttons.length).toBe(4);
    jest.useRealTimers();
  });

  test('does not throw when grid element is absent', () => {
    plugin.init(document.createElement('div'));
    expect(() => renderGrid()).not.toThrow();
  });

  test('buttons have data-id attributes', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    const btn = container.querySelector('[data-id="0"]');
    expect(btn).not.toBeNull();
    jest.useRealTimers();
  });

  test('pressing Enter on a card triggers handleCardClick', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // hide cards so flipLock is false

    const btn = container.querySelector('[data-id="0"]');
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // Card should now be revealed
    expect(btn.classList.contains('hsm-card--revealed')).toBe(true);
    jest.useRealTimers();
  });

  test('pressing Space on a card triggers handleCardClick', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // hide cards

    const btn = container.querySelector('[data-id="0"]');
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(btn.classList.contains('hsm-card--revealed')).toBe(true);
    jest.useRealTimers();
  });

  test('pressing other keys on a card does not trigger handleCardClick', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // hide cards

    const btn = container.querySelector('[data-id="0"]');
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    // Card should remain hidden (not revealed)
    expect(btn.classList.contains('hsm-card--revealed')).toBe(false);
    jest.useRealTimers();
  });
});

// ── hideCardEl / revealCardEl / markCardMatched / markCardWrong ───────────────

describe('card element manipulation', () => {
  let container;

  beforeEach(() => {
    jest.useFakeTimers();
    container = buildContainer();
    plugin.init(container);
    startRound();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('hideCardEl removes revealed class', () => {
    const btn = container.querySelector('[data-id="0"]');
    btn.classList.add('hsm-card--revealed');
    hideCardEl(0);
    expect(btn.classList.contains('hsm-card--revealed')).toBe(false);
  });

  test('revealCardEl adds revealed class and sets textContent', () => {
    const btn = container.querySelector('[data-id="0"]');
    revealCardEl(0, '★');
    expect(btn.classList.contains('hsm-card--revealed')).toBe(true);
    expect(btn.textContent).toBe('★');
  });

  test('markCardMatched adds matched class and disables button', () => {
    markCardMatched(0);
    const btn = container.querySelector('[data-id="0"]');
    expect(btn.classList.contains('hsm-card--matched')).toBe(true);
    expect(btn.disabled).toBe(true);
  });

  test('markCardWrong adds wrong class', () => {
    markCardWrong(0);
    const btn = container.querySelector('[data-id="0"]');
    expect(btn.classList.contains('hsm-card--wrong')).toBe(true);
  });

  test('hideCardEl does not throw for unknown card id', () => {
    expect(() => hideCardEl(9999)).not.toThrow();
  });

  test('revealCardEl does not throw for unknown card id', () => {
    expect(() => revealCardEl(9999, '?')).not.toThrow();
  });

  test('markCardMatched does not throw for unknown card id', () => {
    expect(() => markCardMatched(9999)).not.toThrow();
  });

  test('markCardWrong does not throw for unknown card id', () => {
    expect(() => markCardWrong(9999)).not.toThrow();
  });
});

// ── hideAllCards ──────────────────────────────────────────────────────────────

describe('hideAllCards', () => {
  test('hides the countdown and un-matched cards', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();

    hideAllCards();
    const countdown = container.querySelector('#hsm-countdown');
    expect(countdown.hidden).toBe(true);
    jest.useRealTimers();
  });

  test('does not throw when container is absent', () => {
    plugin.init(document.createElement('div'));
    expect(() => hideAllCards()).not.toThrow();
  });
});

// ── startRound ────────────────────────────────────────────────────────────────

describe('startRound', () => {
  test('populates the grid with card buttons', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    const buttons = container.querySelectorAll('#hsm-grid button');
    expect(buttons.length).toBeGreaterThan(0);
    jest.useRealTimers();
  });

  test('shows the countdown banner', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    expect(container.querySelector('#hsm-countdown').hidden).toBe(false);
    jest.useRealTimers();
  });

  test('hides cards after the display duration', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers();
    expect(container.querySelector('#hsm-countdown').hidden).toBe(true);
    jest.useRealTimers();
  });
});

// ── handleCardClick ───────────────────────────────────────────────────────────

describe('handleCardClick', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('ignores clicks on matched cards', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // hide cards
    // Match cards 0 and 2 (both ★)
    handleCardClick(0);
    handleCardClick(2);
    jest.runAllTimers();
    // clicking a matched card again should be a no-op
    expect(() => handleCardClick(0)).not.toThrow();
  });

  test('ignores the same card being clicked twice', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // hide cards
    handleCardClick(0);
    expect(() => handleCardClick(0)).not.toThrow();
  });

  test('flips non-matching pair back after delay', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // hide cards
    // Cards 0 ('★') and 1 ('♠') do NOT match
    handleCardClick(0);
    handleCardClick(1);
    const btn0 = container.querySelector('[data-id="0"]');
    expect(btn0.classList.contains('hsm-card--wrong')).toBe(true);
    jest.runAllTimers(); // trigger flip-back
    expect(btn0.classList.contains('hsm-card--revealed')).toBe(false);
  });

  test('does nothing when flip lock is active', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound(); // flip lock is active during reveal phase
    expect(() => handleCardClick(0)).not.toThrow();
  });

  test('advances to next round when all pairs matched', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // hide cards

    // Match all pairs: (0,★)+(2,★) then (1,♠)+(3,♠)
    handleCardClick(0);
    handleCardClick(2); // match ★ — pairsFound = 1
    handleCardClick(1);
    handleCardClick(3); // match ♠ — pairsFound = 2, triggers onRoundComplete

    // completeRound should have been called
    expect(gameMock.completeRound).toHaveBeenCalled();

    // After the inter-round delay, startRound fires again
    jest.runAllTimers();
  });
});

