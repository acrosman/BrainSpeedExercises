import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

jest.unstable_mockModule('../../../components/timerService.js', () => ({
  startTimer: jest.fn((onTick) => {
    if (typeof onTick === 'function') onTick(1000);
  }),
  stopTimer: jest.fn(() => 1000),
  resetTimer: jest.fn(),
  formatDuration: jest.fn(() => '00:01'),
}));

jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(() => Promise.resolve({})),
}));

jest.unstable_mockModule('../../../components/gameUtils.js', () => ({
  returnToMainMenu: jest.fn(),
}));

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playSuccessSound: jest.fn(),
  playFailureSound: jest.fn(),
}));

jest.unstable_mockModule('../game.js', () => ({
  RANKS: ['A', '2', '3'],
  SUITS: ['hearts', 'spades'],
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({
    score: 3,
    triggerHits: 2,
    misses: 1,
    falseAlarms: 1,
    cardsShown: 10,
    deckPasses: 0,
    lowestDisplayTime: 900,
    duration: 5000,
  })),
  dealNextCard: jest.fn(() => ({
    card: { rank: 'A', suit: 'hearts', isJoker: false },
    mustReact: false,
    displayDurationMs: 1200,
    deckIndex: 1,
    deckPasses: 0,
  })),
  respondToCurrentCard: jest.fn(() => 'hit'),
  getScore: jest.fn(() => 3),
  getTriggerHits: jest.fn(() => 2),
  getMisses: jest.fn(() => 1),
  getFalseAlarms: jest.fn(() => 1),
  getCardsShown: jest.fn(() => 10),
  getDeckPasses: jest.fn(() => 0),
  getDeckIndex: jest.fn(() => 1),
  getDisplayDurationMs: jest.fn(() => 900),
  getCurrentCard: jest.fn(() => ({ rank: 'A', suit: 'hearts', isJoker: false })),
  shouldReactNow: jest.fn(() => false),
  isRunning: jest.fn(() => true),
}));

const gameMock = await import('../game.js');
const timerServiceMock = await import('../../../components/timerService.js');
const saveScoreMock = await import('../../../components/scoreService.js');
const audioMock = await import('../../../components/audioService.js');

const indexModule = await import('../index.js');
const plugin = indexModule.default;
const {
  clearDealTimer,
  updateStats,
  renderCard,
  beginDealLoop,
  handleReaction,
  handleKeyDown,
  showEndPanel,
} = indexModule;

/**
 * Build a minimal container matching interface.html.
 *
 * @returns {HTMLElement}
 */
function buildContainer() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div id="cr-instructions"></div>
    <div id="cr-game-area" hidden></div>
    <div id="cr-end-panel" hidden></div>
    <button id="cr-start-btn"></button>
    <button id="cr-stop-btn"></button>
    <button id="cr-play-again-btn"></button>
    <button id="cr-return-btn"></button>
    <button id="cr-reaction-zone"></button>
    <div id="cr-card"></div>
    <span id="cr-card-label"></span>
    <p id="cr-feedback"></p>
    <strong id="cr-score">0</strong>
    <strong id="cr-hits">0</strong>
    <strong id="cr-misses">0</strong>
    <strong id="cr-false-alarms">0</strong>
    <strong id="cr-display-time">0</strong>
    <strong id="cr-deck-progress">0 / 52</strong>
    <strong id="cr-session-timer">00:00</strong>
    <dd id="cr-final-score">0</dd>
    <dd id="cr-final-hits">0</dd>
    <dd id="cr-final-misses">0</dd>
    <dd id="cr-final-false-alarms">0</dd>
    <dd id="cr-final-speed">0 ms</dd>
    <dd id="cr-final-deck-passes">0</dd>
  `;
  return el;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('utility exports before init', () => {
  test('clearDealTimer does not throw', () => {
    expect(() => clearDealTimer()).not.toThrow();
  });

  test('updateStats does not throw', () => {
    expect(() => updateStats()).not.toThrow();
  });

  test('renderCard does not throw', () => {
    expect(() => renderCard({ rank: 'A', suit: 'hearts', isJoker: false })).not.toThrow();
  });

  test('showEndPanel does not throw', () => {
    expect(() => showEndPanel({
      score: 0,
      triggerHits: 0,
      misses: 0,
      falseAlarms: 0,
      deckPasses: 0,
      lowestDisplayTime: 900,
    })).not.toThrow();
  });
});

describe('plugin contract', () => {
  test('exports expected plugin methods', () => {
    expect(typeof plugin.name).toBe('string');
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
    expect(typeof plugin.reset).toBe('function');
  });
});

describe('init', () => {
  test('accepts container', () => {
    const container = buildContainer();
    expect(() => plugin.init(container)).not.toThrow();
    expect(gameMock.initGame).toHaveBeenCalled();
  });

  test('accepts null', () => {
    expect(() => plugin.init(null)).not.toThrow();
  });
});

describe('start', () => {
  test('shows game area and hides instructions', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    expect(container.querySelector('#cr-game-area').hidden).toBe(false);
    expect(container.querySelector('#cr-instructions').hidden).toBe(true);
    expect(timerServiceMock.startTimer).toHaveBeenCalled();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  test('beginDealLoop schedules next deal', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    expect(gameMock.dealNextCard).toHaveBeenCalled();
  });
});

describe('reaction handlers', () => {
  test('handleReaction plays success sound on hit', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    gameMock.respondToCurrentCard.mockReturnValueOnce('hit');
    handleReaction();

    expect(audioMock.playSuccessSound).toHaveBeenCalled();
  });

  test('handleReaction plays failure sound on false alarm', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    gameMock.respondToCurrentCard.mockReturnValueOnce('false-alarm');
    handleReaction();

    expect(audioMock.playFailureSound).toHaveBeenCalled();
  });

  test('handleKeyDown ignores non-space keys', () => {
    const event = { key: 'Enter', preventDefault: jest.fn() };
    handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test('handleKeyDown triggers on space key', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    const event = { key: ' ', preventDefault: jest.fn() };
    handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

describe('renderCard', () => {
  test('renders normal card label', () => {
    const container = buildContainer();
    plugin.init(container);

    renderCard({ rank: 'A', suit: 'hearts', isJoker: false });
    expect(container.querySelector('#cr-card-label').textContent).toContain('A');
  });

  test('renders joker label', () => {
    const container = buildContainer();
    plugin.init(container);

    renderCard({ rank: 'JOKER', suit: 'joker', isJoker: true });
    expect(container.querySelector('#cr-card-label').textContent).toBe('Joker');
  });
});

describe('stop and reset', () => {
  test('stop returns game result and shows end panel', async () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    const result = plugin.stop();
    await Promise.resolve();

    expect(result).toMatchObject({ score: 3, triggerHits: 2 });
    expect(container.querySelector('#cr-end-panel').hidden).toBe(false);
    expect(saveScoreMock.saveScore).toHaveBeenCalled();
    expect(timerServiceMock.stopTimer).toHaveBeenCalled();
  });

  test('stop falls back when game is already not running', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.isRunning.mockReturnValueOnce(false);

    const result = plugin.stop();
    expect(result).toMatchObject({ score: 3, triggerHits: 2 });
  });

  test('reset returns to instructions panel', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    plugin.reset();

    expect(container.querySelector('#cr-instructions').hidden).toBe(false);
    expect(container.querySelector('#cr-game-area').hidden).toBe(true);
    expect(timerServiceMock.resetTimer).toHaveBeenCalled();
  });
});


describe('beginDealLoop guard', () => {
  test('returns early when game is not running', () => {
    gameMock.isRunning.mockReturnValueOnce(false);
    expect(() => beginDealLoop()).not.toThrow();
  });
});
