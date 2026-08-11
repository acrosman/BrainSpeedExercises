import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

jest.unstable_mockModule('../../../components/timerService.js', () => ({
  startTimer: jest.fn(),
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
  playCardFlickSound: jest.fn(),
}));

jest.unstable_mockModule('../../../components/trendChartService.js', () => ({
  renderTrendChart: jest.fn(),
}));

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
  showTutorial: jest.fn((_gameId, _steps, _container, onComplete) => {
    if (typeof onComplete === 'function') onComplete();
    return document.createElement('div');
  }),
  showTutorialIfNeeded: jest.fn(async (_gameId, _steps, _container, onComplete) => {
    if (typeof onComplete === 'function') onComplete();
    return null;
  }),
}));

jest.unstable_mockModule('../game.js', () => ({
  RANKS: ['A', '2', '3'],
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
    missedTrigger: false,
    displayDurationMs: 1200,
  })),
  respondToCurrentCard: jest.fn(() => 'hit'),
  getScore: jest.fn(() => 3),
  getTriggerHits: jest.fn(() => 2),
  getMisses: jest.fn(() => 1),
  getFalseAlarms: jest.fn(() => 1),
  getCardsShown: jest.fn(() => 10),
  getDeckPasses: jest.fn(() => 0),
  getDeckIndex: jest.fn(() => 1),
  getDeckSize: jest.fn(() => 55),
  getDisplayDurationMs: jest.fn(() => 900),
  getLowestDisplayTimeMs: jest.fn(() => 900),
  getSpeedHistory: jest.fn(() => [1200, 1100, 1000]),
  isRunning: jest.fn(() => true),
}));

const tutorialServiceMock = await import('../../../components/tutorialService.js');
const plugin = (await import('../index.js')).default;
const { TUTORIAL_STEPS } = await import('../tutorial.js');

/**
 * Build a minimal game container with tutorial action controls.
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
    <button id="cr-replay-tutorial-btn"></button>
    <button id="cr-stop-btn"></button>
    <button id="cr-play-again-btn"></button>
    <button id="cr-return-btn"></button>
    <button id="cr-reaction-zone"></button>
    <input id="cr-card-sound-toggle" type="checkbox" checked>
    <input id="cr-hint-toggle" type="checkbox" checked>
    <div id="cr-deck-card"></div>
    <div id="cr-card"></div>
    <p id="cr-feedback"></p>
    <strong id="cr-score">0</strong>
    <strong id="cr-hits">0</strong>
    <strong id="cr-misses">0</strong>
    <strong id="cr-false-alarms">0</strong>
    <strong id="cr-display-time">0</strong>
    <strong id="cr-deck-progress">0 / 55</strong>
    <strong id="cr-session-timer">00:00</strong>
    <polyline id="cr-trend-line"></polyline>
    <p id="cr-trend-empty"></p>
    <strong id="cr-trend-latest"></strong>
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
  jest.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Card Rat tutorial content', () => {
  test('includes screenshot step with highlighted gameplay regions', () => {
    const screenshotStep = TUTORIAL_STEPS.find(
      (step) => step.title === 'Find the Main Play Area',
    );

    expect(screenshotStep).toBeDefined();
    expect(screenshotStep.content).toContain('tutorialScreenshot.png');
    expect(screenshotStep.content).toContain('card-rat__tutorial-highlight--stats');
    expect(screenshotStep.content).toContain('card-rat__tutorial-highlight--cards');
    expect(screenshotStep.content).toContain('card-rat__tutorial-highlight--controls');
  });
});

describe('Card Rat tutorial flow', () => {
  test('start calls showTutorialIfNeeded before starting gameplay', async () => {
    const container = buildContainer();
    plugin.init(container);

    await plugin.start();

    expect(tutorialServiceMock.showTutorialIfNeeded).toHaveBeenCalledWith(
      'card-rat',
      expect.any(Array),
      container,
      expect.any(Function),
    );
    expect(container.querySelector('#cr-game-area').hidden).toBe(false);
    expect(container.querySelector('#cr-instructions').hidden).toBe(true);
  });

  test('replay button calls showTutorial with current container', () => {
    const container = buildContainer();
    plugin.init(container);

    container.querySelector('#cr-replay-tutorial-btn').click();

    expect(tutorialServiceMock.showTutorial).toHaveBeenCalledWith(
      'card-rat',
      expect.any(Array),
      container,
      expect.any(Function),
    );
  });

  test('replay button does nothing when tutorial overlay is already open', () => {
    const container = buildContainer();
    plugin.init(container);

    const overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    container.appendChild(overlay);
    tutorialServiceMock.showTutorial.mockClear();

    container.querySelector('#cr-replay-tutorial-btn').click();

    expect(tutorialServiceMock.showTutorial).not.toHaveBeenCalled();
  });
});
