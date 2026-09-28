/**
 * index.test.js — Tests for the Orbit Sprite Memory controller, including the tutorial
 * wiring and practice rounds.
 *
 * @file Tests for app/games/orbit-sprite-memory/index.js
 */

import { readFileSync } from 'node:fs';
import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';

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

jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(() => Promise.resolve(null)),
  loadProgress: jest.fn(() => Promise.resolve({ playerId: 'default', games: {} })),
  loadGameScore: jest.fn(() => Promise.resolve({})),
  clearHistory: jest.fn(() => Promise.resolve()),
}));
const scoreServiceMock = await import('../../../components/scoreService.js');

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playFeedbackSound: jest.fn(),
}));
const audioServiceMock = await import('../../../components/audioService.js');

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
  loadTutorialSteps: jest.fn(async () => [
    { title: 'Welcome to Orbit Sprite Memory', content: '<p>Welcome</p>' },
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
const tutorialServiceMock = await import('../../../components/tutorialService.js');

/** Whether the mocked game has a session running, so stop() takes the real path. */
let mockRunning = false;

jest.unstable_mockModule('../game.js', () => ({
  GAME_ID: 'orbit-sprite-memory',
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
  initGame: jest.fn(() => { mockRunning = false; }),
  startGame: jest.fn(() => { mockRunning = true; }),
  stopGame: jest.fn(() => {
    mockRunning = false;
    return {
      score: 4,
      level: 1,
      roundsPlayed: 6,
      duration: 5000,
    };
  }),
  getDisplayDurationMs: jest.fn(() => 900),
  getDistractorCount: jest.fn(() => 3),
  shuffle: jest.fn((value) => value),
  pickUnique: jest.fn((values, count) => values.slice(0, count)),
  buildPlaybackSequence: jest.fn(),
  assignPositions: jest.fn(),
  // Practice round: the target (sprite 6) is at positions 1, 4, and 5, unlike createRound.
  createPracticeRound: jest.fn(() => ({
    primarySpriteId: 6,
    distractorSpriteIds: [0, 7],
    steps: [
      { spriteId: 6, positionIndex: 4, isPrimary: true },
      { spriteId: 0, positionIndex: 0, isPrimary: false },
      { spriteId: 6, positionIndex: 1, isPrimary: true },
      { spriteId: 7, positionIndex: 3, isPrimary: false },
      { spriteId: 6, positionIndex: 5, isPrimary: true },
    ],
    primaryPositions: [4, 1, 5],
    shownPositions: [4, 0, 1, 3, 5],
    displayMs: 40,
  })),
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
  isRunning: jest.fn(() => mockRunning),
  getSpeedHistory: jest.fn(() => []),
}));

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const gameMock = await import('../game.js');
// The real tutorial module runs, on top of the mocked tutorialService.
const { PRACTICE_TEXT } = await import('../tutorial/tutorial.js');

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
  playRound,
  stopRound,
  getPositionButton,
  submitSelection,
  loadBestStatsFromProgress,
  returnToMainMenu,
  showEndPanel,
} = pluginModule;

/** Let pending promise callbacks (such as a tutorial launch) run. */
async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/**
 * Build a minimal DOM container matching interface.html, attached to the document.
 *
 * @returns {HTMLElement}
 */
function buildContainer() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div id="osm-instructions"></div>
    <div id="osm-game-area" hidden></div>
    <div id="osm-end-panel" hidden></div>
    <button id="osm-start-btn" type="button"></button>
    <button id="osm-replay-tutorial-btn" type="button"></button>
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
    <strong id="osm-session-timer">00:00</strong>
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

  test('togglePosition marks and unmarks button once input is enabled', async () => {
    await plugin.start();
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

  test('playRound plays the round it is given without a session', () => {
    const round = { ...gameMock.createRound(), primarySpriteId: 5 };
    gameMock.createRound.mockClear();
    gameMock.startGame.mockClear();

    playRound(round);
    expect(gameMock.createRound).not.toHaveBeenCalled();
    expect(gameMock.startGame).not.toHaveBeenCalled();
    expect(document.querySelector('#osm-target-preview').style.backgroundPosition)
      .toBe(getSpriteBackgroundPosition(5));

    jest.advanceTimersByTime(200);
    const buttons = document.querySelectorAll('.osm-choice-btn');
    expect(buttons).toHaveLength(5);
    [0, 2, 4].forEach((index) => buttons[index].click());
    expect(gameMock.evaluateSelection).toHaveBeenLastCalledWith(round, [0, 3, 7]);
  });

  test('stopRound cancels playback and clears the board', () => {
    playRound(gameMock.createRound());
    jest.advanceTimersByTime(40);
    expect(document.querySelector('#osm-active-sprite').hidden).toBe(false);

    stopRound();
    expect(document.querySelector('#osm-active-sprite').hidden).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(200);
    expect(document.querySelectorAll('.osm-choice-btn')).toHaveLength(0);
  });

  test('stopRound ignores choices on buttons still on the board', () => {
    playRound(gameMock.createRound());
    jest.advanceTimersByTime(200);
    const button = document.querySelector('.osm-choice-btn');

    stopRound();
    togglePosition(Number(button.dataset.position), button);
    expect(button.classList.contains('osm-choice-btn--selected')).toBe(false);
  });

  test('auto review records correct answers on third selection', async () => {
    await plugin.start();
    jest.advanceTimersByTime(400);

    const buttons = document.querySelectorAll('.osm-choice-btn');
    buttons[0].click();
    buttons[2].click();
    buttons[4].click();

    expect(gameMock.recordCorrectRound).toHaveBeenCalled();
  });

  test('auto review records incorrect answers on third selection', async () => {
    await plugin.start();
    jest.advanceTimersByTime(400);

    const buttons = document.querySelectorAll('.osm-choice-btn');
    buttons[1].click();
    buttons[2].click();
    buttons[3].click();

    expect(gameMock.recordIncorrectRound).toHaveBeenCalled();
  });

  test('manual submitSelection still works when invoked directly', async () => {
    await plugin.start();
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

  test('submitSelection runs reveal and nested next-round callbacks', async () => {
    await plugin.start();
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

  test('loadBestStatsFromProgress shows the record from loadGameScore', async () => {
    scoreServiceMock.loadGameScore.mockResolvedValueOnce({ highScore: 12, highestLevel: 4 });

    await loadBestStatsFromProgress();

    expect(scoreServiceMock.loadGameScore).toHaveBeenCalledWith('orbit-sprite-memory');
    expect(document.querySelector('#osm-best-score').textContent).toBe('12');
    expect(document.querySelector('#osm-best-level').textContent).toBe('5');
    expect(document.querySelector('#osm-final-best-score').textContent).toBe('12');
    expect(document.querySelector('#osm-final-best-level').textContent).toBe('5');
  });

  test('loadBestStatsFromProgress shows defaults for an empty record', async () => {
    scoreServiceMock.loadGameScore.mockResolvedValueOnce({});

    await loadBestStatsFromProgress();

    expect(document.querySelector('#osm-best-score').textContent).toBe('0');
    expect(document.querySelector('#osm-best-level').textContent).toBe('1');
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

  test('start toggles panels and starts game logic', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    expect(gameMock.startGame).toHaveBeenCalled();
    expect(container.querySelector('#osm-game-area').hidden).toBe(false);
    expect(container.querySelector('#osm-instructions').hidden).toBe(true);
  });

  test('start button click is wired to start gameplay', async () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.startGame.mockClear();

    container.querySelector('#osm-start-btn').click();
    await flushMicrotasks();

    expect(gameMock.startGame).toHaveBeenCalled();
    expect(container.querySelector('#osm-game-area').hidden).toBe(false);
  });

  test('stop returns result and shows end panel', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    const result = plugin.stop();
    expect(result.score).toBe(4);
    expect(container.querySelector('#osm-end-panel').hidden).toBe(false);
  });

  test('stop saves the session through saveScore', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
    scoreServiceMock.saveScore.mockClear();

    plugin.stop();

    expect(scoreServiceMock.saveScore).toHaveBeenCalledWith('orbit-sprite-memory', {
      score: 4,
      sessionDurationMs: 0,
      level: 1,
      lowestDisplayTime: 900,
    });
  });

  test('stop refreshes best stats from the record saveScore returns', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
    scoreServiceMock.saveScore.mockResolvedValueOnce({ highScore: 10, highestLevel: 3 });

    plugin.stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector('#osm-final-best-score').textContent).toBe('10');
    expect(container.querySelector('#osm-final-best-level').textContent).toBe('4');
  });

  test('reset returns to pre-game state', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    plugin.reset();
    expect(container.querySelector('#osm-game-area').hidden).toBe(true);
    expect(container.querySelector('#osm-instructions').hidden).toBe(false);
  });

  test('play-again and return buttons invoke handlers', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
    plugin.stop();

    let fired = false;
    window.addEventListener('bsx:return-to-main-menu', () => {
      fired = true;
    }, { once: true });

    container.querySelector('#osm-play-again-btn').click();
    await flushMicrotasks();
    expect(container.querySelector('#osm-game-area').hidden).toBe(false);

    container.querySelector('#osm-return-btn').click();
    expect(fired).toBe(true);
  });

  test('stop button and auto-review flow are wired', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    jest.advanceTimersByTime(400);
    const buttons = container.querySelectorAll('.osm-choice-btn');
    buttons[0].click();
    buttons[2].click();
    buttons[4].click();
    expect(gameMock.recordCorrectRound).toHaveBeenCalled();

    container.querySelector('#osm-stop-btn').click();
    expect(container.querySelector('#osm-end-panel').hidden).toBe(false);
  });

  test('stop keeps the end panel when saveScore resolves null', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
    scoreServiceMock.saveScore.mockResolvedValueOnce(null);

    plugin.stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector('#osm-end-panel').hidden).toBe(false);
  });
});

// ── Idle stop ─────────────────────────────────────────────────────────────────

describe('stop with no session running', () => {
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  test('returns the idle result without saving or showing the end panel', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.stopGame.mockClear();
    scoreServiceMock.saveScore.mockClear();

    expect(plugin.stop()).toEqual({
      score: 4, level: 1, roundsPlayed: 6, duration: 0,
    });
    expect(gameMock.stopGame).not.toHaveBeenCalled();
    expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
    expect(container.querySelector('#osm-end-panel').hidden).toBe(true);
    expect(container.querySelector('#osm-instructions').hidden).toBe(false);
  });
});

describe('getPositionButton', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('finds a rendered position button, or null', () => {
    plugin.init(buildContainer());
    renderChoiceButtons({ shownPositions: [1, 4] });
    expect(getPositionButton(4).getAttribute('aria-label')).toBe('Position 5');
    expect(getPositionButton(2)).toBeNull();
  });

  test('returns null without a board', () => {
    plugin.init(null);
    expect(getPositionButton(0)).toBeNull();
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
    plugin.init(container);
  });

  afterEach(() => {
    plugin.reset();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  test('start runs the guided tutorial if needed with the Orbit Sprite steps', async () => {
    await plugin.start();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'orbit-sprite-memory',
        container,
        introSteps: [{ title: 'Welcome to Orbit Sprite Memory', content: '<p>Welcome</p>' }],
        playPracticeRound: expect.any(Function),
        onComplete: expect.any(Function),
      }),
    );
    expect(gameMock.startGame).toHaveBeenCalledTimes(1);
  });

  test('replay tutorial button runs the guided tutorial and then starts the game', async () => {
    container.querySelector('#osm-replay-tutorial-btn').click();
    await flushMicrotasks();
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'orbit-sprite-memory',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(gameMock.startGame).toHaveBeenCalled();
    expect(container.querySelector('#osm-game-area').hidden).toBe(false);
  });

  test('does not start the game until the tutorial completes', async () => {
    const { options } = await startPendingTutorial();
    expect(gameMock.startGame).not.toHaveBeenCalled();
    expect(container.querySelector('#osm-game-area').hidden).toBe(true);

    options.onComplete();
    expect(gameMock.startGame).toHaveBeenCalled();
    expect(container.querySelector('#osm-game-area').hidden).toBe(false);
    expect(gameMock.createRound).toHaveBeenCalled();
  });
});

// ── Practice rounds ───────────────────────────────────────────────────────────

describe('practice round', () => {
  let container;
  let pending;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView = jest.fn();
    container = buildContainer();
    plugin.init(container);
    pending = await startPendingTutorial();
  });

  afterEach(() => {
    plugin.reset();
    jest.useRealTimers();
    delete Element.prototype.scrollIntoView;
    document.body.innerHTML = '';
  });

  /**
   * Start a practice round, like the tutorial runner does.
   * @param {boolean} [guided=true]
   * @returns {{ context: object, done: Promise<object> }}
   */
  function playPractice(guided = true) {
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

  /** Run the playback (5 steps of 40 ms) so the position buttons take clicks. */
  const endPlayback = () => jest.advanceTimersByTime(200);

  /** @param {number} position */
  const spot = (position) => container.querySelector(`.osm-choice-btn[data-position="${position}"]`);

  test('plays the practice round without starting a session', () => {
    const { context } = playPractice();

    expect(container.querySelector('#osm-instructions').hidden).toBe(true);
    expect(container.querySelector('#osm-game-area').hidden).toBe(false);
    expect(container.querySelector('#osm-board').scrollIntoView)
      .toHaveBeenCalledWith({ block: 'nearest' });
    expect(gameMock.createPracticeRound).toHaveBeenCalled();
    expect(gameMock.createRound).not.toHaveBeenCalled();
    expect(gameMock.startGame).not.toHaveBeenCalled();
    expect(container.querySelector('#osm-target-preview').style.backgroundPosition)
      .toBe(getSpriteBackgroundPosition(6));
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);

    endPlayback();
    expect(container.querySelectorAll('.osm-choice-btn')).toHaveLength(5);
  });

  test('a guided round rings each target spot in turn without scoring', () => {
    const { context } = playPractice();
    endPlayback();
    expect(spot(4).scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: spot(4) });
    expect(context.setInstructions)
      .toHaveBeenLastCalledWith(PRACTICE_TEXT.guided(0, 'Position 5'));

    // A spot the target never used does not move the ring.
    spot(0).click();
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: spot(4) });
    expect(context.setInstructions)
      .toHaveBeenLastCalledWith(PRACTICE_TEXT.guided(0, 'Position 5'));

    // Clearing it and choosing the ringed spot moves the ring on.
    spot(0).click();
    spot(4).click();
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: spot(1) });
    expect(context.setInstructions)
      .toHaveBeenLastCalledWith(PRACTICE_TEXT.guided(1, 'Position 2'));
    expect(gameMock.recordCorrectRound).not.toHaveBeenCalled();
    expect(gameMock.recordIncorrectRound).not.toHaveBeenCalled();
  });

  test('choosing every target spot resolves the round as correct', async () => {
    gameMock.evaluateSelection.mockReturnValueOnce(true);
    const { context, done } = playPractice();
    endPlayback();
    [4, 1, 5].forEach((position) => spot(position).click());

    await expect(done).resolves.toEqual({
      correct: true, feedback: PRACTICE_TEXT.result(true),
    });
    expect(gameMock.evaluateSelection).toHaveBeenLastCalledWith(
      gameMock.createPracticeRound.mock.results[0].value, [4, 1, 5],
    );
    expect(context.hideMarker).toHaveBeenCalled();
    expect(container.querySelector('#osm-feedback').textContent)
      .toBe(PRACTICE_TEXT.result(true));
    expect(audioServiceMock.playFeedbackSound).toHaveBeenCalledWith(true);
    expect(gameMock.recordCorrectRound).not.toHaveBeenCalled();
    expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();

    // The rabbits stay in their spots, and no next round starts.
    jest.advanceTimersByTime(5000);
    expect(container.querySelectorAll('.osm-reveal-sprite')).toHaveLength(5);
    expect(gameMock.createRound).not.toHaveBeenCalled();
  });

  test('a miss reveals the rabbits and resolves with feedback', async () => {
    const { done } = playPractice();
    endPlayback();
    [0, 1, 3].forEach((position) => spot(position).click());

    await expect(done).resolves.toEqual({
      correct: false, feedback: PRACTICE_TEXT.result(false),
    });
    expect(container.querySelectorAll('.osm-reveal-sprite')).toHaveLength(5);
    expect(container.querySelector('#osm-board').classList.contains('osm-board--failure'))
      .toBe(true);
    expect(audioServiceMock.playFeedbackSound).toHaveBeenCalledWith(false);
    expect(container.querySelector('#osm-feedback').textContent)
      .not.toBe(PRACTICE_TEXT.result(false));
    expect(gameMock.recordIncorrectRound).not.toHaveBeenCalled();
  });

  test('an unguided round only prompts for the answer', () => {
    const { context } = playPractice(false);
    endPlayback();
    spot(0).click();
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
    expect(context.showMarker).not.toHaveBeenCalled();
  });

  test('ending the tutorial stops the round', () => {
    playPractice();
    pending.controller.abort();
    expect(jest.getTimerCount()).toBe(0);
    endPlayback();
    expect(container.querySelectorAll('.osm-choice-btn')).toHaveLength(0);
  });

  test('End Game during practice cancels the tutorial and returns to the welcome panel',
    async () => {
      playPractice();
      container.querySelector('#osm-stop-btn').click();
      await flushMicrotasks();

      expect(pending.run.cancel).toHaveBeenCalled();
      expect(gameMock.stopGame).not.toHaveBeenCalled();
      expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
      expect(container.querySelector('#osm-instructions').hidden).toBe(false);
      expect(container.querySelector('#osm-game-area').hidden).toBe(true);
      expect(container.querySelector('#osm-end-panel').hidden).toBe(true);
    });
});

// ── session duration ──────────────────────────────────────────────────────────

describe('session duration', () => {
  let timerMod;

  beforeEach(async () => {
    timerMod = await import('../../../components/timerService.js');
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  test('passes the stopped timer duration to saveScore', () => {
    timerMod.stopTimer.mockReturnValueOnce(90000);

    plugin.stop();

    expect(scoreServiceMock.saveScore).toHaveBeenCalledWith(
      'orbit-sprite-memory',
      expect.objectContaining({ sessionDurationMs: 90000 }),
    );
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

    expect(document.querySelector('#osm-session-timer').closest('[aria-live]')).toBeNull();
    expect(document.querySelector('#osm-score').closest('[aria-live]')).not.toBeNull();
    expect(document.querySelector('#osm-level').closest('[aria-live]')).not.toBeNull();
  });
});
