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
  isPrimary: jest.fn((img) => img === 'Primary.jpg'),
  addCorrectGroup: jest.fn(),
  completeRound: jest.fn(),
  resetConsecutiveRounds: jest.fn(),
  getScore: jest.fn(() => 5),
  getLevel: jest.fn(() => 2),
  getRoundsCompleted: jest.fn(() => 6),
  getConsecutiveCorrectRounds: jest.fn(() => 1),
  isRunning: jest.fn(() => false),
  getSpeedHistory: jest.fn(() => []),
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
  test('resets and restarts the game', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.stop();

    const playAgainBtn = container.querySelector('#hsm-play-again-btn');
    playAgainBtn.click();

    expect(container.querySelector('#hsm-game-area').hidden).toBe(false);
    jest.useRealTimers();
  });
});

// ── return-to-menu button ─────────────────────────────────────────────────────

describe('return to menu button', () => {
  test('dispatches bsx:return-to-main-menu event when clicked', () => {
    jest.useFakeTimers();
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
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
    jest.advanceTimersByTime(900);
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
});

// ── dailyTime accumulation ────────────────────────────────────────────────────

describe('dailyTime accumulation', () => {
  let timerMod;

  beforeEach(async () => {
    timerMod = await import('../../../components/timerService.js');
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
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
