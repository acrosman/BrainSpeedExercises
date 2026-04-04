import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';

jest.unstable_mockModule('../game.js', () => ({
  TOTAL_SPRITES: 8,
  SPRITE_COLUMNS: 4,
  SPRITE_ROWS: 2,
  MAX_POSITION_COUNT: 12,
  PRIMARY_SHOW_COUNT: 3,
  MAX_DISTRACTOR_SHOWS: 2,
  STREAK_TO_LEVEL_UP: 3,
  BASE_DISPLAY_MS: 1100,
  DISPLAY_DECREMENT_MS: 90,
  MIN_DISPLAY_MS: 250,
  BASE_DISTRACTOR_COUNT: 2,
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({
    score: 4,
    level: 1,
    roundsPlayed: 6,
    duration: 5000,
  })),
  getDisplayDurationMs: jest.fn(() => 900),
  getDistractorCount: jest.fn(() => 3),
  shuffle: jest.fn((value) => value),
  pickUnique: jest.fn((values, count) => values.slice(0, count)),
  buildPlaybackSequence: jest.fn(),
  assignPositions: jest.fn(),
  createRound: jest.fn(() => ({
    primarySpriteId: 2,
    distractorSpriteIds: [1, 3],
    steps: [
      { spriteId: 2, positionIndex: 0, isPrimary: true },
      { spriteId: 1, positionIndex: 2, isPrimary: false },
      { spriteId: 2, positionIndex: 3, isPrimary: true },
      { spriteId: 3, positionIndex: 5, isPrimary: false },
      { spriteId: 2, positionIndex: 7, isPrimary: true },
    ],
    primaryPositions: [0, 3, 7],
    shownPositions: [0, 2, 3, 5, 7],
    displayMs: 40,
  })),
  evaluateSelection: jest.fn((round, selected) => {
    const values = [...selected].sort((a, b) => a - b);
    return JSON.stringify(values) === JSON.stringify([0, 3, 7]);
  }),
  recordCorrectRound: jest.fn(),
  recordIncorrectRound: jest.fn(),
  getScore: jest.fn(() => 4),
  getLevel: jest.fn(() => 1),
  getRoundsPlayed: jest.fn(() => 6),
  getConsecutiveCorrect: jest.fn(() => 2),
  isRunning: jest.fn(() => false),
}));

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const gameMock = await import('../game.js');

const {
  flashBoard,
  getSpriteBackgroundPosition,
  getCircleCoordinates,
  announce,
  updateStats,
  clearTimers,
  clearChoiceButtons,
  renderChoiceButtons,
  togglePosition,
  showPlaybackStep,
  startPlayback,
  startRound,
  submitSelection,
  loadBestStatsFromProgress,
  returnToMainMenu,
  showEndPanel,
} = pluginModule;

function buildContainer() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div id="osm-instructions"></div>
    <div id="osm-game-area" hidden></div>
    <div id="osm-end-panel" hidden></div>
    <button id="osm-start-btn" type="button"></button>
    <button id="osm-stop-btn" type="button"></button>
    <button id="osm-play-again-btn" type="button"></button>
    <button id="osm-return-btn" type="button"></button>
    <div id="osm-board">
      <div id="osm-active-sprite" hidden></div>
      <div id="osm-feedback"></div>
    </div>
    <div id="osm-target-preview"></div>
    <strong id="osm-score">0</strong>
    <strong id="osm-level">1</strong>
    <strong id="osm-streak">0</strong>
    <strong id="osm-best-level">1</strong>
    <strong id="osm-best-score">0</strong>
    <strong id="osm-final-score">0</strong>
    <strong id="osm-final-level">1</strong>
    <strong id="osm-final-best-level">1</strong>
    <strong id="osm-final-best-score">0</strong>
  `;
  document.body.appendChild(el);
  return el;
}

describe('exported helper utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    plugin.init(buildContainer());
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  test('computes sprite sheet background positions', () => {
    expect(getSpriteBackgroundPosition(0)).toBe('0% 0%');
    expect(getSpriteBackgroundPosition(4)).toBe('0% 100%');
    expect(getSpriteBackgroundPosition(5)).toBe('33.33333333333333% 100%');
  });

  test('computes circular board coordinates', () => {
    const coords = getCircleCoordinates(0, 8);
    expect(coords.left).toBeCloseTo(50);
    expect(coords.top).toBeCloseTo(14);
  });

  test('announces status text and updates stat labels', () => {
    announce('hello');
    expect(document.querySelector('#osm-feedback').textContent).toBe('hello');

    updateStats();
    expect(document.querySelector('#osm-score').textContent).toBe('4');
    expect(document.querySelector('#osm-level').textContent).toBe('2');
    expect(document.querySelector('#osm-streak').textContent).toBe('2');
  });

  test('showPlaybackStep positions and reveals active sprite', () => {
    showPlaybackStep({ spriteId: 2, positionIndex: 3 }, 5);
    const sprite = document.querySelector('#osm-active-sprite');
    expect(sprite.hidden).toBe(false);
    expect(sprite.style.backgroundPosition).toContain('%');
  });

  test('clearTimers can run safely with pending timers', () => {
    const timer = setTimeout(() => { }, 1000);
    expect(timer).toBeTruthy();
    clearTimers();
  });

  test('clearChoiceButtons removes existing choice nodes', () => {
    const board = document.querySelector('#osm-board');
    const btn = document.createElement('button');
    btn.className = 'osm-choice-btn';
    board.appendChild(btn);

    clearChoiceButtons();
    expect(document.querySelectorAll('.osm-choice-btn')).toHaveLength(0);
  });

  test('renderChoiceButtons adds selectable nodes', () => {
    renderChoiceButtons({ shownPositions: [1, 2, 5] });
    expect(document.querySelectorAll('.osm-choice-btn')).toHaveLength(3);
  });

  test('togglePosition marks and unmarks button once input is enabled', () => {
    plugin.start();
    jest.advanceTimersByTime(400);

    const btn = document.querySelector('.osm-choice-btn');
    const position = Number(btn.dataset.position);
    togglePosition(position, btn);
    expect(btn.classList.contains('osm-choice-btn--selected')).toBe(true);

    togglePosition(position, btn);
    expect(btn.classList.contains('osm-choice-btn--selected')).toBe(false);
  });

  test('startPlayback schedules round playback and enables choices at end', () => {
    startPlayback(gameMock.createRound());
    jest.advanceTimersByTime(200);

    expect(document.querySelector('#osm-active-sprite').hidden).toBe(true);
    expect(document.querySelectorAll('.osm-choice-btn').length).toBeGreaterThan(0);
  });

  test('startRound requests round from game logic and sets target preview', () => {
    startRound();
    expect(gameMock.createRound).toHaveBeenCalled();
    expect(document.querySelector('#osm-target-preview').style.backgroundPosition).toContain('%');
  });

  test('auto review records correct answers on third selection', () => {
    plugin.start();
    jest.advanceTimersByTime(400);

    const buttons = document.querySelectorAll('.osm-choice-btn');
    buttons[0].click();
    buttons[2].click();
    buttons[4].click();

    expect(gameMock.recordCorrectRound).toHaveBeenCalled();
  });

  test('auto review records incorrect answers on third selection', () => {
    plugin.start();
    jest.advanceTimersByTime(400);

    const buttons = document.querySelectorAll('.osm-choice-btn');
    buttons[1].click();
    buttons[2].click();
    buttons[3].click();

    expect(gameMock.recordIncorrectRound).toHaveBeenCalled();
  });

  test('manual submitSelection still works when invoked directly', () => {
    plugin.start();
    jest.advanceTimersByTime(400);

    const buttons = document.querySelectorAll('.osm-choice-btn');
    buttons[1].click();
    buttons[2].click();
    buttons[3].click();
    submitSelection();

    expect(gameMock.recordIncorrectRound).toHaveBeenCalled();
  });

  test('returnToMainMenu dispatches menu event', () => {
    let fired = false;
    window.addEventListener('bsx:return-to-main-menu', () => {
      fired = true;
    }, { once: true });

    returnToMainMenu();
    expect(fired).toBe(true);
  });

  test('showEndPanel reveals summary values', () => {
    showEndPanel({ score: 9, level: 3 });
    expect(document.querySelector('#osm-end-panel').hidden).toBe(false);
    expect(document.querySelector('#osm-final-score').textContent).toBe('9');
    expect(document.querySelector('#osm-final-level').textContent).toBe('4');
  });

  test('flashBoard timeout callback removes flash classes', () => {
    const board = document.querySelector('#osm-board');
    flashBoard('success');
    expect(board.classList.contains('osm-board--success')).toBe(true);

    jest.runOnlyPendingTimers();
    expect(board.classList.contains('osm-board--success')).toBe(false);
  });

  test('submitSelection runs reveal and nested next-round callbacks', () => {
    plugin.start();
    jest.advanceTimersByTime(400);

    gameMock.createRound.mockClear();
    const buttons = document.querySelectorAll('.osm-choice-btn');
    buttons[0].click();
    buttons[2].click();
    buttons[4].click();

    jest.runOnlyPendingTimers();
    jest.runOnlyPendingTimers();

    expect(gameMock.createRound).toHaveBeenCalled();
  });

  test('loadBestStatsFromProgress reads saved best stats when API is available', async () => {
    const oldApi = globalThis.window.api;
    globalThis.window.api = {
      invoke: jest.fn().mockResolvedValue({
        games: {
          'orbit-sprite-memory': {
            highScore: 12,
            highestLevel: 4,
          },
        },
      }),
    };

    await loadBestStatsFromProgress();

    expect(document.querySelector('#osm-best-score').textContent).toBe('12');
    expect(document.querySelector('#osm-best-level').textContent).toBe('5');
    expect(document.querySelector('#osm-final-best-score').textContent).toBe('12');
    expect(document.querySelector('#osm-final-best-level').textContent).toBe('5');

    globalThis.window.api = oldApi;
  });

  test('loadBestStatsFromProgress handles API rejection gracefully (line 268)', async () => {
    const oldApi = globalThis.window.api;
    globalThis.window.api = {
      invoke: jest.fn().mockRejectedValue(new Error('network error')),
    };

    await loadBestStatsFromProgress();

    // catch block calls updateBestStats(undefined) → defaults to 0
    expect(document.querySelector('#osm-best-score').textContent).toBe('0');

    globalThis.window.api = oldApi;
  });
});

describe('plugin contract and lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  test('exposes plugin contract', () => {
    expect(typeof plugin.name).toBe('string');
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
    expect(typeof plugin.reset).toBe('function');
  });

  test('init accepts null container safely', () => {
    expect(() => plugin.init(null)).not.toThrow();
  });

  test('start toggles panels and starts game logic', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    expect(gameMock.startGame).toHaveBeenCalled();
    expect(container.querySelector('#osm-game-area').hidden).toBe(false);
    expect(container.querySelector('#osm-instructions').hidden).toBe(true);
  });

  test('start button click is wired to start gameplay', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.startGame.mockClear();

    container.querySelector('#osm-start-btn').click();

    expect(gameMock.startGame).toHaveBeenCalled();
    expect(container.querySelector('#osm-game-area').hidden).toBe(false);
  });

  test('stop returns result and shows end panel', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    const result = plugin.stop();
    expect(result.score).toBe(4);
    expect(container.querySelector('#osm-end-panel').hidden).toBe(false);
  });

  test('stop saves progress via window.api invoke', async () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    const mockApi = {
      invoke: jest.fn()
        .mockResolvedValueOnce({ playerId: 'default', games: {} })
        .mockResolvedValueOnce(undefined),
    };
    globalThis.window = globalThis.window || {};
    const oldApi = globalThis.window.api;
    globalThis.window.api = mockApi;

    plugin.stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockApi.invoke).toHaveBeenCalledWith(
      'progress:save',
      expect.objectContaining({
        playerId: 'default',
      }),
    );

    globalThis.window.api = oldApi;
  });

  test('stop merges existing orbit progress and keeps higher historical bests', async () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    const mockApi = {
      invoke: jest.fn()
        .mockResolvedValueOnce({
          playerId: 'default',
          games: {
            'orbit-sprite-memory': {
              highScore: 10,
              sessionsPlayed: 2,
              highestLevel: 3,
            },
          },
        })
        .mockResolvedValueOnce(undefined),
    };
    const oldApi = globalThis.window.api;
    globalThis.window.api = mockApi;

    plugin.stop();
    await Promise.resolve();
    await Promise.resolve();

    const saveCall = mockApi.invoke.mock.calls.find((call) => call[0] === 'progress:save');
    const saved = saveCall[1].data.games['orbit-sprite-memory'];
    expect(saved.highScore).toBe(10);
    expect(saved.highestLevel).toBe(3);
    expect(saved.sessionsPlayed).toBe(3);

    globalThis.window.api = oldApi;
  });

  test('reset returns to pre-game state', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    plugin.reset();
    expect(container.querySelector('#osm-game-area').hidden).toBe(true);
    expect(container.querySelector('#osm-instructions').hidden).toBe(false);
  });

  test('play-again and return buttons invoke handlers', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.stop();

    let fired = false;
    window.addEventListener('bsx:return-to-main-menu', () => {
      fired = true;
    }, { once: true });

    container.querySelector('#osm-play-again-btn').click();
    expect(container.querySelector('#osm-game-area').hidden).toBe(false);

    container.querySelector('#osm-return-btn').click();
    expect(fired).toBe(true);
  });

  test('stop button and auto-review flow are wired', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    jest.advanceTimersByTime(400);
    const buttons = container.querySelectorAll('.osm-choice-btn');
    buttons[0].click();
    buttons[2].click();
    buttons[4].click();
    expect(gameMock.recordCorrectRound).toHaveBeenCalled();

    container.querySelector('#osm-stop-btn').click();
    expect(container.querySelector('#osm-end-panel').hidden).toBe(false);
  });

  test('stop handles progress:load rejection in inner try-catch (line 579)', async () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    // progress:load rejects → inner catch sets existing to empty defaults
    // progress:save also rejects → outer catch swallows it
    const mockApi = {
      invoke: jest.fn().mockRejectedValue(new Error('IPC error')),
    };
    const oldApi = globalThis.window.api;
    globalThis.window.api = mockApi;

    plugin.stop();
    // Flush nested promise chains: outer IIFE → inner progress:load → inner catch
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // End panel should still appear despite progress errors
    expect(container.querySelector('#osm-end-panel').hidden).toBe(false);

    globalThis.window.api = oldApi;
  });
});
