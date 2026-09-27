import { readFileSync } from 'node:fs';
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock timerService before other mocks and imports.
jest.unstable_mockModule('../../../components/timerService.js', () => ({
  startTimer: jest.fn((cb) => { if (typeof cb === 'function') cb(1000); }),
  stopTimer: jest.fn(() => 0),
  resetTimer: jest.fn(),
  getElapsedMs: jest.fn(() => 0),
  isTimerRunning: jest.fn(() => false),
  formatDuration: jest.fn(() => '00:00'),
  getTodayDateString: jest.fn(() => '2024-01-15'),
}));
await import('../../../components/timerService.js');

// Mock game.js so index.js can be tested in isolation.
jest.unstable_mockModule('../game.js', () => ({
  GAME_ID: 'high-speed-memory',
  PRIMARY_IMAGE: 'Primary.jpg',
  DISTRACTOR_IMAGES: ['Distractor1.jpg', 'Distractor2.jpg'],
  PRIMARY_COUNT: 3,
  ROUNDS_TO_LEVEL_UP: 3,
  BASE_DISPLAY_MS: 500,
  DISPLAY_DECREMENT_MS: 24,
  MIN_DISPLAY_MS: 20,
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({ score: 5, level: 2, roundsCompleted: 6, duration: 12000 })),
  getGridSize: jest.fn(() => ({ rows: 3, cols: 3 })),
  getDisplayDurationMs: jest.fn(() => 500),
  // 3×3 grid: cards 0, 4, 8 are Primary; rest are Distractors
  generateGrid: jest.fn(() => [
    { id: 0, image: 'Primary.jpg', matched: false },
    { id: 1, image: 'Distractor1.jpg', matched: false },
    { id: 2, image: 'Distractor2.jpg', matched: false },
    { id: 3, image: 'Distractor1.jpg', matched: false },
    { id: 4, image: 'Primary.jpg', matched: false },
    { id: 5, image: 'Distractor2.jpg', matched: false },
    { id: 6, image: 'Distractor1.jpg', matched: false },
    { id: 7, image: 'Distractor2.jpg', matched: false },
    { id: 8, image: 'Primary.jpg', matched: false },
  ]),
  // Practice grid: cards 1, 3, 5 are Primary, so it differs from the session grid.
  createPracticeRound: jest.fn(() => ({
    grid: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
      id, image: id % 2 === 1 && id < 6 ? 'Primary.jpg' : 'Distractor1.jpg', matched: false,
    })),
    displayMs: 1500,
  })),
  isPrimary: jest.fn((img) => img === 'Primary.jpg'),
  addCorrectGroup: jest.fn(),
  completeRound: jest.fn(),
  resetConsecutiveRounds: jest.fn(),
  getScore: jest.fn(() => 5),
  getLevel: jest.fn(() => 2),
  getRoundsCompleted: jest.fn(() => 6),
  getConsecutiveCorrectRounds: jest.fn(() => 1),
  isRunning: jest.fn(() => true),
  getSpeedHistory: jest.fn(() => []),
}));

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
  loadTutorialSteps: jest.fn(async () => [
    { title: 'Welcome to High Speed Memory', content: '<p>Welcome</p>' },
  ]),
  // Default replay: the player finishes the tutorial at once.
  runGuidedTutorial: jest.fn((options) => {
    options.onComplete();
    return { cancel: jest.fn(), isActive: () => false };
  }),
  // Default first start: the tutorial was already seen.
  runGuidedTutorialIfNeeded: jest.fn(async (options) => {
    options.onComplete();
    return null;
  }),
}));

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const {
  announce,
  updateStats,
  updateFoundDisplay,
  renderGrid,
  hideCardEl,
  revealCardEl,
  markCardMatched,
  markCardWrong,
  hideAllCards,
  revealPrimaryCards,
  startRound,
  handleCardClick,
  WRONG_FLIP_DELAY_MS,
} = pluginModule;

const gameMock = await import('../game.js');
const tutorialServiceMock = await import('../../../components/tutorialService.js');
// The real tutorial module runs, on top of the mocked tutorialService.
const { PRACTICE_TEXT } = await import('../tutorial/tutorial.js');

// ── Audio context mock (enables testing sound calls) ──────────────────────────

const mockOsc = {
  type: '',
  frequency: { setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() },
  connect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};
const mockGain = {
  gain: {
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
  },
  connect: jest.fn(),
};
const mockAudioCtx = {
  currentTime: 0,
  state: 'running',
  destination: {},
  createGain: jest.fn(() => mockGain),
  createOscillator: jest.fn(() => mockOsc),
};
globalThis.AudioContext = jest.fn(() => mockAudioCtx);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Let pending promise callbacks (such as a tutorial launch) run. */
async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/** Build a minimal DOM matching interface.html. */
function buildContainer() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div id="hsm-instructions"></div>
    <div id="hsm-game-area" hidden></div>
    <div id="hsm-end-panel" hidden></div>
    <button id="hsm-start-btn" type="button"></button>
    <button id="hsm-replay-tutorial-btn" type="button"></button>
    <button id="hsm-stop-btn" type="button"></button>
    <button id="hsm-play-again-btn" type="button"></button>
    <button id="hsm-return-btn" type="button"></button>
    <div id="hsm-grid"></div>
    <strong id="hsm-score">0</strong>
    <strong id="hsm-level">1</strong>
    <strong id="hsm-found">0</strong>
    <strong id="hsm-streak">0</strong>
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

  test('shows the game area and hides instructions', async () => {
    await plugin.start();
    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
    expect(container.querySelector('#hsm-instructions').hidden).toBe(true);
  });

  test('does nothing when called without a container', async () => {
    plugin.init(null);
    gameMock.startGame.mockClear();
    await expect(plugin.start()).resolves.toBeUndefined();
    expect(gameMock.startGame).not.toHaveBeenCalled();
  });

  test('start button click triggers start', async () => {
    const startBtn = container.querySelector('#hsm-start-btn');
    startBtn.click();
    await flushMicrotasks();
    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
  });
});

// ── stop ──────────────────────────────────────────────────────────────────────

describe('stop', () => {
  let container;

  beforeEach(async () => {
    jest.useFakeTimers();
    container = buildContainer();
    plugin.init(container);
    await plugin.start();
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

  test('clears pending round-restart timer on stop', () => {
    jest.runAllTimers(); // release flip lock
    handleCardClick(1); // Distractor — triggers round-restart timer
    expect(() => plugin.stop()).not.toThrow();
  });

  test('invokes window.api.invoke with correct progress:save format', async () => {
    const mockApi = {
      invoke: jest.fn()
        .mockResolvedValueOnce({ playerId: 'default', games: {} })
        .mockResolvedValueOnce(undefined),
    };
    globalThis.window = globalThis.window || {};
    const originalApi = globalThis.window.api;
    globalThis.window.api = mockApi;

    plugin.stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockApi.invoke).toHaveBeenCalledWith(
      'progress:save',
      expect.objectContaining({
        playerId: 'default',
        data: expect.objectContaining({
          games: expect.objectContaining({
            'high-speed-memory': expect.objectContaining({
              sessionsPlayed: expect.any(Number),
            }),
          }),
        }),
      }),
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

  beforeEach(async () => {
    jest.useFakeTimers();
    container = buildContainer();
    plugin.init(container);
    await plugin.start();
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
    expect(() => plugin.reset()).not.toThrow();
  });

  test('clears pending round-restart timer on reset', () => {
    jest.runAllTimers(); // release flip lock
    handleCardClick(1); // Distractor — triggers round-restart timer
    expect(() => plugin.reset()).not.toThrow();
  });
});

// ── play-again button ─────────────────────────────────────────────────────────

describe('play again button', () => {
  test('resets and restarts the game', async () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
    plugin.stop();

    const playAgainBtn = container.querySelector('#hsm-play-again-btn');
    playAgainBtn.click();
    await flushMicrotasks();

    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
    jest.useRealTimers();
  });
});

// ── return-to-menu button ─────────────────────────────────────────────────────

describe('return to menu button', () => {
  test('dispatches bsx:return-to-main-menu event when clicked', async () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
    plugin.stop();

    let eventFired = false;
    const handler = () => { eventFired = true; };
    window.addEventListener('bsx:return-to-main-menu', handler, { once: true });

    const returnBtn = container.querySelector('#hsm-return-btn');
    returnBtn.click();

    expect(eventFired).toBe(true);
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
    expect(container.querySelector('#hsm-level').textContent).toBe('3');
  });

  test('updates streak element', () => {
    const container = buildContainer();
    plugin.init(container);
    updateStats();
    // getConsecutiveCorrectRounds mock returns 1
    expect(container.querySelector('#hsm-streak').textContent).toBe('1');
  });

  test('does not throw when elements are absent', () => {
    plugin.init(document.createElement('div'));
    expect(() => updateStats()).not.toThrow();
  });
});

// ── updateFoundDisplay ────────────────────────────────────────────────────────

describe('updateFoundDisplay', () => {
  test('does not throw when found element is absent', () => {
    plugin.init(document.createElement('div'));
    expect(() => updateFoundDisplay()).not.toThrow();
  });

  test('updates found element', () => {
    const container = buildContainer();
    plugin.init(container);
    updateFoundDisplay();
    expect(container.querySelector('#hsm-found').textContent).toBe('0');
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
    expect(buttons.length).toBe(9); // 3×3 mock grid
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

  test('each card button contains an img element', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    const btn = container.querySelector('[data-id="0"]');
    expect(btn.querySelector('img')).not.toBeNull();
    jest.useRealTimers();
  });

  test('pressing Enter on a card triggers handleCardClick', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // hide cards so flipLock is false

    const btn = container.querySelector('[data-id="0"]'); // Primary card
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(btn.classList.contains('hsm-card--matched')).toBe(true);
    jest.useRealTimers();
  });

  test('pressing Space on a card triggers handleCardClick', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers();

    const btn = container.querySelector('[data-id="0"]'); // Primary card
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(btn.classList.contains('hsm-card--matched')).toBe(true);
    jest.useRealTimers();
  });

  test('pressing other keys does not trigger handleCardClick', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers();

    const btn = container.querySelector('[data-id="0"]'); // Primary card
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    // Primary card should NOT be matched since Tab was pressed
    expect(btn.classList.contains('hsm-card--matched')).toBe(false);
    jest.useRealTimers();
  });

  test('clicking a card button triggers handleCardClick (click event listener)', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // hide cards so flipLock is false

    const btn = container.querySelector('[data-id="0"]'); // Primary card
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(btn.classList.contains('hsm-card--matched')).toBe(true);
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

  test('hideCardEl hides the img element and updates aria-label', () => {
    const btn = container.querySelector('[data-id="0"]');
    hideCardEl(0);
    const img = btn.querySelector('img');
    expect(img.style.display).toBe('none');
    expect(btn.getAttribute('aria-label')).toContain('face down');
  });

  test('revealCardEl adds revealed class', () => {
    const btn = container.querySelector('[data-id="0"]');
    revealCardEl(0, 'Primary.jpg');
    expect(btn.classList.contains('hsm-card--revealed')).toBe(true);
  });

  test('revealCardEl un-hides the img element and sets the correct src', () => {
    const btn = container.querySelector('[data-id="0"]');
    hideCardEl(0);
    revealCardEl(0, 'Primary.jpg');
    const img = btn.querySelector('img');
    expect(img.style.display).toBe('');
    expect(img.src).toContain('Primary.jpg');
  });

  test('markCardMatched adds matched class, disables button, and updates aria-label', () => {
    markCardMatched(0);
    const btn = container.querySelector('[data-id="0"]');
    expect(btn.classList.contains('hsm-card--matched')).toBe(true);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-label')).toContain('matched');
  });

  test('markCardWrong adds wrong class', () => {
    markCardWrong(1);
    const btn = container.querySelector('[data-id="1"]');
    expect(btn.classList.contains('hsm-card--wrong')).toBe(true);
  });

  test('hideCardEl does not throw for unknown card id', () => {
    expect(() => hideCardEl(9999)).not.toThrow();
  });

  test('revealCardEl does not throw for unknown card id', () => {
    expect(() => revealCardEl(9999, 'Primary.jpg')).not.toThrow();
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
  test('hides all un-matched cards', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    hideAllCards();
    // All cards should be face-down (no hsm-card--revealed class)
    const cards = container.querySelectorAll('#hsm-grid .hsm-card');
    cards.forEach((btn) => {
      expect(btn.classList.contains('hsm-card--revealed')).toBe(false);
    });
    jest.useRealTimers();
  });

  test('allows card clicks after reveal phase (flip lock released)', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    hideAllCards(); // flip lock should now be false
    // A Primary card click should now be processed (not blocked)
    handleCardClick(0);
    const btn = container.querySelector('[data-id="0"]');
    expect(btn.classList.contains('hsm-card--matched')).toBe(true);
    jest.useRealTimers();
  });

  test('does not throw when container is absent', () => {
    plugin.init(document.createElement('div'));
    expect(() => hideAllCards()).not.toThrow();
  });
});

// ── revealPrimaryCards ────────────────────────────────────────────────────────

describe('revealPrimaryCards', () => {
  test('reveals all unmatched Primary cards', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    // Hide all cards first so they start face-down
    hideAllCards();
    revealPrimaryCards();
    // Cards 0, 4, 8 are Primary in the mock grid — they should now be revealed
    [0, 4, 8].forEach((id) => {
      const btn = container.querySelector(`[data-id="${id}"]`);
      expect(btn.classList.contains('hsm-card--revealed')).toBe(true);
    });
    jest.useRealTimers();
  });

  test('does not reveal Distractor cards', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    hideAllCards();
    revealPrimaryCards();
    // Cards 1, 2, 3, 5, 6, 7 are Distractors — they should remain face-down
    [1, 2, 3, 5, 6, 7].forEach((id) => {
      const btn = container.querySelector(`[data-id="${id}"]`);
      expect(btn.classList.contains('hsm-card--revealed')).toBe(false);
    });
    jest.useRealTimers();
  });

  test('does not reveal already-matched Primary cards', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock
    handleCardClick(0); // match card 0 (Primary)
    hideAllCards();
    revealPrimaryCards();
    // Card 0 is matched and should not gain the revealed class again via revealPrimaryCards
    const btn = container.querySelector('[data-id="0"]');
    expect(btn.classList.contains('hsm-card--matched')).toBe(true);
    jest.useRealTimers();
  });

  test('does not throw when container is absent', () => {
    plugin.init(document.createElement('div'));
    expect(() => revealPrimaryCards()).not.toThrow();
  });
});

// ── startRound ────────────────────────────────────────────────────────────────

describe('startRound', () => {
  test('populates the grid with card buttons', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    expect(container.querySelectorAll('#hsm-grid button').length).toBeGreaterThan(0);
    jest.useRealTimers();
  });

  test('sets flip lock during the reveal phase', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    // During reveal, a Primary card click should be ignored (flip lock active)
    const btn = container.querySelector('[data-id="0"]');
    expect(btn.classList.contains('hsm-card--matched')).toBe(false);
    jest.useRealTimers();
  });

  test('hides cards after the display duration', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers();
    // All cards should now be face-down
    const cards = container.querySelectorAll('#hsm-grid .hsm-card');
    cards.forEach((btn) => {
      expect(btn.classList.contains('hsm-card--revealed')).toBe(false);
    });
    jest.useRealTimers();
  });

  test('does nothing when the game is not running', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    gameMock.generateGrid.mockClear();
    gameMock.isRunning.mockReturnValueOnce(false);
    startRound();
    expect(gameMock.generateGrid).not.toHaveBeenCalled();
    expect(container.querySelectorAll('#hsm-grid button').length).toBe(0);
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

  test('ignores clicks when flip lock is active', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound(); // flip lock active during reveal
    expect(() => handleCardClick(0)).not.toThrow();
    // flip lock prevents card from being matched
    const btn = container.querySelector('[data-id="0"]');
    expect(btn.classList.contains('hsm-card--matched')).toBe(false);
  });

  test('ignores clicks on matched cards', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock
    handleCardClick(0); // Primary → matched
    expect(() => handleCardClick(0)).not.toThrow(); // already matched
  });

  test('marks Primary card as matched on click', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock
    handleCardClick(0); // Primary card
    const btn = container.querySelector('[data-id="0"]');
    expect(btn.classList.contains('hsm-card--matched')).toBe(true);
  });

  test('marks Distractor card with wrong class', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock
    handleCardClick(1); // Distractor1.jpg
    const btn = container.querySelector('[data-id="1"]');
    expect(btn.classList.contains('hsm-card--wrong')).toBe(true);
  });

  test('calls resetConsecutiveRounds when a Distractor card is clicked', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock
    gameMock.resetConsecutiveRounds.mockClear();
    handleCardClick(1); // Distractor1.jpg — wrong guess
    expect(gameMock.resetConsecutiveRounds).toHaveBeenCalledTimes(1);
  });

  test('does not call resetConsecutiveRounds when a Primary card is clicked', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock
    gameMock.resetConsecutiveRounds.mockClear();
    handleCardClick(0); // Primary.jpg — correct
    expect(gameMock.resetConsecutiveRounds).not.toHaveBeenCalled();
  });

  test('restarts the round after a wrong guess delay', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock
    gameMock.generateGrid.mockClear();
    handleCardClick(1); // Distractor — triggers round-restart timer
    jest.runAllTimers(); // fires answer-reveal timer, then restart timer → generateGrid()
    expect(gameMock.generateGrid).toHaveBeenCalledTimes(1);
  });

  test('reveals Primary card positions after wrong guess before restarting', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock and hide all cards
    handleCardClick(1); // Distractor — wrong guess
    // Advance past WRONG_FLIP_DELAY_MS but not REVEAL_ANSWER_MS yet
    jest.advanceTimersByTime(WRONG_FLIP_DELAY_MS);
    // Primary cards (0, 4, 8) should now be revealed briefly
    [0, 4, 8].forEach((id) => {
      const btn = container.querySelector(`[data-id="${id}"]`);
      expect(btn.classList.contains('hsm-card--revealed')).toBe(true);
    });
    jest.runAllTimers(); // complete the restart
  });

  test('advances to next round when all PRIMARY_COUNT Primary cards found', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock

    // Cards 0, 4, 8 are Primary in the mock grid
    handleCardClick(0);
    handleCardClick(4);
    handleCardClick(8); // 3rd Primary → triggers onRoundComplete

    expect(gameMock.completeRound).toHaveBeenCalled();
    jest.runAllTimers(); // inter-round delay
  });

  test('plays success sound when all PRIMARY_COUNT Primary cards are found', () => {
    const container = buildContainer();
    plugin.init(container);
    startRound();
    jest.runAllTimers(); // release flip lock

    mockAudioCtx.createOscillator.mockClear();
    // Cards 0, 4, 8 are Primary in the mock grid
    handleCardClick(0);
    handleCardClick(4);
    handleCardClick(8); // 3rd Primary → triggers onRoundComplete → playSuccessSound

    expect(mockAudioCtx.createOscillator).toHaveBeenCalled();
  });

  test('stopping during the inter-round pause cancels the next round', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
    jest.runAllTimers(); // release flip lock

    handleCardClick(0);
    handleCardClick(4);
    handleCardClick(8); // 3rd Primary → schedules the next round

    plugin.stop();
    gameMock.generateGrid.mockClear();
    jest.advanceTimersByTime(5000);

    expect(gameMock.generateGrid).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});

// ── dailyTime accumulation ────────────────────────────────────────────────────

describe('dailyTime accumulation', () => {
  let timerMod;

  beforeEach(async () => {
    timerMod = await import('../../../components/timerService.js');
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete globalThis.window.api;
  });

  test('writes dailyTime[today] into saved progress when stopTimer returns > 0', async () => {
    timerMod.stopTimer.mockReturnValueOnce(90000);
    timerMod.getTodayDateString.mockReturnValue('2024-01-15');

    const mockProgress = { playerId: 'default', games: {} };
    const savedPayloads = [];
    globalThis.window.api = {
      invoke: jest.fn((channel, payload) => {
        if (channel === 'progress:load') return Promise.resolve(mockProgress);
        if (channel === 'progress:save') {
          savedPayloads.push(payload);
          return Promise.resolve();
        }
        return Promise.resolve();
      }),
    };

    plugin.stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(savedPayloads[0].data.games['high-speed-memory'].dailyTime['2024-01-15']).toBe(90000);
  });

  test('accumulates dailyTime on top of an existing entry for the same day', async () => {
    timerMod.stopTimer.mockReturnValueOnce(60000);
    timerMod.getTodayDateString.mockReturnValue('2024-01-15');

    const mockProgress = {
      playerId: 'default',
      games: {
        'high-speed-memory': {
          highScore: 0,
          sessionsPlayed: 1,
          dailyTime: { '2024-01-15': 30000 },
        },
      },
    };
    const savedPayloads = [];
    globalThis.window.api = {
      invoke: jest.fn((channel, payload) => {
        if (channel === 'progress:load') return Promise.resolve(mockProgress);
        if (channel === 'progress:save') {
          savedPayloads.push(payload);
          return Promise.resolve();
        }
        return Promise.resolve();
      }),
    };

    plugin.stop();
    await Promise.resolve();
    await Promise.resolve();

    // 30000 (existing) + 60000 (new) = 90000
    expect(savedPayloads[0].data.games['high-speed-memory'].dailyTime['2024-01-15']).toBe(90000);
  });
});

// ── Guided tutorial ───────────────────────────────────────────────────────────

/**
 * Make the next start() open a guided tutorial that stays in progress until the test
 * calls finish(). Like the real runner, cancel() aborts the practice signal and ends the run.
 * @returns {Promise<{ options: object, run: object, controller: AbortController,
 *   finish: () => void }>}
 */
async function startPendingTutorial() {
  let options = null;
  let active = true;
  const controller = new AbortController();
  const finish = () => { active = false; };
  const run = {
    cancel: jest.fn(() => {
      controller.abort();
      finish();
    }),
    isActive: jest.fn(() => active),
  };
  tutorialServiceMock.runGuidedTutorialIfNeeded.mockImplementationOnce(async (opts) => {
    options = opts;
    return run;
  });
  await plugin.start();
  return {
    options, run, controller, finish,
  };
}

describe('guided tutorial', () => {
  let container;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    container = buildContainer();
    document.body.appendChild(container);
    plugin.init(container);
  });

  afterEach(() => {
    plugin.reset();
    container.remove();
    jest.useRealTimers();
  });

  test('start runs the guided tutorial if needed with the High Speed Memory steps', async () => {
    await plugin.start();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'high-speed-memory',
        container,
        introSteps: [{ title: 'Welcome to High Speed Memory', content: '<p>Welcome</p>' }],
        playPracticeRound: expect.any(Function),
        onComplete: expect.any(Function),
      }),
    );
    expect(gameMock.startGame).toHaveBeenCalledTimes(1);
  });

  test('replay tutorial button runs the guided tutorial and then starts the game', async () => {
    container.querySelector('#hsm-replay-tutorial-btn').click();
    await flushMicrotasks();
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'high-speed-memory',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(gameMock.startGame).toHaveBeenCalled();
    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
  });

  test('does not start the game until the tutorial completes', async () => {
    const { options } = await startPendingTutorial();
    expect(gameMock.startGame).not.toHaveBeenCalled();
    expect(container.querySelector('#hsm-game-area').hidden).toBe(true);

    options.onComplete();
    expect(gameMock.startGame).toHaveBeenCalled();
    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
    expect(gameMock.generateGrid).toHaveBeenCalled();
  });

  test('stop() with no session returns an idle result without saving or changing screens',
    () => {
      gameMock.isRunning.mockReturnValueOnce(false);
      const result = plugin.stop();
      expect(result).toEqual({
        score: 5, level: 2, roundsCompleted: 6, duration: 0,
      });
      expect(gameMock.stopGame).not.toHaveBeenCalled();
      expect(container.querySelector('#hsm-end-panel').hidden).toBe(true);
    });
});

// ── Practice rounds ───────────────────────────────────────────────────────────

describe('practice round', () => {
  let container;
  let pending;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    gameMock.isRunning.mockReturnValue(false);
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView = jest.fn();
    container = buildContainer();
    document.body.appendChild(container);
    plugin.init(container);
    pending = await startPendingTutorial();
  });

  afterEach(() => {
    plugin.reset();
    container.remove();
    gameMock.isRunning.mockReturnValue(true);
    delete Element.prototype.scrollIntoView;
    jest.useRealTimers();
  });

  /**
   * Start a practice round, like the tutorial runner does.
   * @param {boolean} [guided=true]
   * @returns {{ context: object, done: Promise<object> }}
   */
  function playRound(guided = true) {
    const context = {
      round: guided ? 1 : 2,
      attempt: 1,
      maxRounds: 2,
      guided,
      signal: pending.controller.signal,
      setInstructions: jest.fn(),
      showMarker: jest.fn(),
      hideMarker: jest.fn(),
    };
    const done = pending.options.playPracticeRound(context);
    return { context, done };
  }

  /** @param {number} id */
  const card = (id) => container.querySelector(`[data-id="${id}"]`);

  test('shows the starting grid without starting a session', () => {
    const { context } = playRound();

    expect(container.querySelector('#hsm-instructions').hidden).toBe(true);
    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
    expect(container.querySelectorAll('#hsm-grid .hsm-card--revealed')).toHaveLength(9);
    expect(container.querySelector('#hsm-grid').style.gridTemplateColumns)
      .toBe('repeat(3, 1fr)');
    expect(gameMock.createPracticeRound).toHaveBeenCalledTimes(1);
    expect(gameMock.generateGrid).not.toHaveBeenCalled();
    expect(gameMock.startGame).not.toHaveBeenCalled();
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);

    // Clicks are ignored while the cards are face up.
    handleCardClick(1);
    expect(card(1).classList.contains('hsm-card--matched')).toBe(false);
  });

  test('a guided round rings each greyhound in turn without scoring', () => {
    const { context } = playRound();
    expect(context.showMarker).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1500);
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: card(1), shape: 'box' });
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.guided(0));

    card(1).click();
    expect(card(1).classList.contains('hsm-card--matched')).toBe(true);
    expect(container.querySelector('#hsm-found').textContent).toBe('1');
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: card(3), shape: 'box' });
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.guided(1));
    expect(gameMock.addCorrectGroup).not.toHaveBeenCalled();
  });

  test('finding every greyhound resolves the round as correct', async () => {
    const { done } = playRound();
    jest.advanceTimersByTime(1500);
    [1, 3, 5].forEach((id) => handleCardClick(id));

    await expect(done).resolves.toEqual({ correct: true, feedback: PRACTICE_TEXT.result(true) });
    expect(container.querySelector('#hsm-feedback').textContent)
      .toBe(PRACTICE_TEXT.result(true));
    expect(gameMock.completeRound).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a wrong card shows the greyhounds and resolves as a miss', async () => {
    const { done } = playRound();
    jest.advanceTimersByTime(1500);
    handleCardClick(0);

    await expect(done).resolves.toEqual({
      correct: false, feedback: PRACTICE_TEXT.result(false),
    });
    expect(card(0).classList.contains('hsm-card--wrong')).toBe(true);
    [1, 3, 5].forEach((id) => {
      expect(card(id).classList.contains('hsm-card--revealed')).toBe(true);
    });
    expect(gameMock.resetConsecutiveRounds).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    // The board stays locked until the tutorial replays the round.
    handleCardClick(1);
    expect(card(1).classList.contains('hsm-card--matched')).toBe(false);
  });

  test('an unguided round only prompts for the answer', () => {
    const { context } = playRound(false);
    jest.advanceTimersByTime(1500);
    handleCardClick(1);
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
    expect(context.showMarker).not.toHaveBeenCalled();
  });

  test('ending the tutorial stops the round', () => {
    playRound();
    pending.controller.abort();
    expect(jest.getTimerCount()).toBe(0);
    handleCardClick(1);
    expect(card(1).classList.contains('hsm-card--matched')).toBe(false);
  });

  test('End Game during practice cancels the tutorial and returns to the welcome panel', () => {
    playRound();
    container.querySelector('#hsm-stop-btn').click();

    expect(pending.run.cancel).toHaveBeenCalled();
    expect(gameMock.stopGame).not.toHaveBeenCalled();
    expect(container.querySelector('#hsm-instructions').hidden).toBe(false);
    expect(container.querySelector('#hsm-game-area').hidden).toBe(true);
    expect(container.querySelector('#hsm-end-panel').hidden).toBe(true);
  });
});

// ── interface.html accessibility ──────────────────────────────────────────────

describe('interface.html live regions', () => {
  const html = readFileSync(new URL('../interface.html', import.meta.url), 'utf8');

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('session timer is not inside a live region', () => {
    document.body.innerHTML = html;

    expect(document.querySelector('#hsm-session-timer').closest('[aria-live]')).toBeNull();
    expect(document.querySelector('#hsm-score').closest('[aria-live]')).not.toBeNull();
    expect(document.querySelector('#hsm-level').closest('[aria-live]')).not.toBeNull();
  });
});
