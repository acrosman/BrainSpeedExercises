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
  playCardFlickSound: jest.fn(),
}));

jest.unstable_mockModule('../../../components/trendChartService.js', () => ({
  renderTrendChart: jest.fn(),
}));

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
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

jest.unstable_mockModule('../tutorial/tutorial.js', () => ({
  getTutorialSteps: jest.fn(async () => [
    { title: 'Welcome to Card Rat', content: '<p>Welcome</p>' },
    { title: 'Find the Main Play Area', content: '<p>Layout</p>' },
  ]),
  PRACTICE_TEXT: {
    watch: 'watch text',
    guidedSlap: { pair: 'pair text', sandwich: 'sandwich text', joker: 'joker text' },
  },
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
    missedTrigger: false,
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
  getDeckSize: jest.fn(() => 55),
  getDisplayDurationMs: jest.fn(() => 900),
  getLowestDisplayTimeMs: jest.fn(() => 900),
  getSpeedHistory: jest.fn(() => [1200, 1100, 1000]),
  getCurrentCard: jest.fn(() => ({ rank: 'A', suit: 'hearts', isJoker: false })),
  shouldReactNow: jest.fn(() => false),
  isRunning: jest.fn(() => true),
  calculateDisplayDuration: jest.fn(() => 1400),
  // A short script: two cards to let pass, then a pair.
  getPracticeSequence: jest.fn(() => [
    { rank: '4', suit: 'hearts', isJoker: false },
    { rank: '7', suit: 'spades', isJoker: false },
    { rank: '7', suit: 'hearts', isJoker: false },
  ]),
  getSlapReason: jest.fn((_twoBack, previous, card) => (
    previous && previous.rank === card.rank ? 'pair' : null
  )),
}));

const gameMock = await import('../game.js');
const timerServiceMock = await import('../../../components/timerService.js');
const saveScoreMock = await import('../../../components/scoreService.js');
const audioMock = await import('../../../components/audioService.js');
const trendChartServiceMock = await import('../../../components/trendChartService.js');
const tutorialServiceMock = await import('../../../components/tutorialService.js');
const tutorialContentMock = await import('../tutorial/tutorial.js');

const indexModule = await import('../index.js');
const plugin = indexModule.default;
const {
  clearDealTimer,
  updateStats,
  renderCard,
  renderDeckBack,
  beginDealLoop,
  handleReaction,
  handleKeyDown,
  attachGlobalKeyListener,
  detachGlobalKeyListener,
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
  jest.useFakeTimers();
  jest.clearAllMocks();
  detachGlobalKeyListener();
});

afterEach(() => {
  // Cancel any tutorial left running so the next test starts clean.
  plugin.reset();
  detachGlobalKeyListener();
  jest.useRealTimers();
  document.body.innerHTML = '';
});

/** Let pending promise callbacks (such as a tutorial launch) run. */
async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

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

/**
 * Build a practice-round context like the one the tutorial runner passes in.
 * @param {AbortController} controller - Supplies the context's signal.
 * @param {boolean} [guided=true]
 * @returns {object}
 */
function buildPracticeContext(controller, guided = true) {
  return {
    round: guided ? 1 : 2,
    maxRounds: 2,
    guided,
    signal: controller.signal,
    setInstructions: jest.fn(),
    showMarker: jest.fn(),
    hideMarker: jest.fn(),
  };
}

describe('utility exports before init', () => {
  test('clearDealTimer does not throw', () => {
    expect(() => clearDealTimer()).not.toThrow();
  });

  test('updateStats does not throw', () => {
    expect(() => updateStats()).not.toThrow();
    expect(trendChartServiceMock.renderTrendChart).toHaveBeenCalled();
  });

  test('renderCard does not throw', () => {
    expect(() => renderCard({ rank: 'A', suit: 'hearts', isJoker: false })).not.toThrow();
  });

  test('renderDeckBack sets deck-back image and accessibility label', () => {
    const container = buildContainer();
    plugin.init(container);

    expect(() => renderDeckBack()).not.toThrow();
    const deckEl = container.querySelector('#cr-deck-card');
    expect(deckEl.style.backgroundImage).toContain('card-back.png');
    expect(deckEl.style.backgroundPosition).toBe('center');
    expect(deckEl.getAttribute('aria-label')).toBe('Deck back');
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

  test('attachGlobalKeyListener and detachGlobalKeyListener do not throw', () => {
    expect(() => attachGlobalKeyListener()).not.toThrow();
    expect(() => detachGlobalKeyListener()).not.toThrow();
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
  test('shows game area and hides instructions', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    expect(container.querySelector('#cr-game-area').hidden).toBe(false);
    expect(container.querySelector('#cr-instructions').hidden).toBe(true);
    expect(timerServiceMock.startTimer).toHaveBeenCalled();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  test('beginDealLoop schedules next deal', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();
    expect(gameMock.dealNextCard).toHaveBeenCalled();
    expect(container.querySelector('#cr-feedback').textContent).toContain('sandwich');
  });

  test('beginDealLoop plays card flick sound on each deal', async () => {
    const container = buildContainer();
    plugin.init(container);
    audioMock.playCardFlickSound.mockClear();
    await plugin.start();
    expect(audioMock.playCardFlickSound).toHaveBeenCalled();
  });

  test('beginDealLoop skips card sound when card sound toggle is off', async () => {
    const container = buildContainer();
    plugin.init(container);
    container.querySelector('#cr-card-sound-toggle').checked = false;
    audioMock.playCardFlickSound.mockClear();
    await plugin.start();
    expect(audioMock.playCardFlickSound).not.toHaveBeenCalled();
  });

  test('beginDealLoop plays failure sound when a trigger is missed', () => {
    const container = buildContainer();
    plugin.init(container);
    audioMock.playFailureSound.mockClear();
    gameMock.dealNextCard.mockReturnValueOnce({
      card: { rank: 'A', suit: 'hearts', isJoker: false },
      mustReact: false,
      missedTrigger: true,
      displayDurationMs: 1200,
      deckIndex: 2,
      deckPasses: 0,
    });

    beginDealLoop();

    expect(audioMock.playFailureSound).toHaveBeenCalled();
  });

  test('Space key on document reacts without card focus', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    document.dispatchEvent(event);

    expect(gameMock.respondToCurrentCard).toHaveBeenCalled();
  });

  test('deal loop timer callback continues the loop', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    gameMock.dealNextCard.mockClear();
    jest.advanceTimersByTime(1200);

    expect(gameMock.dealNextCard).toHaveBeenCalled();
  });
});

describe('reaction handlers', () => {
  test('handleReaction plays success sound on hit', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    gameMock.respondToCurrentCard.mockReturnValueOnce('hit');
    handleReaction();

    expect(audioMock.playSuccessSound).toHaveBeenCalled();
  });

  test('handleReaction plays failure sound on false alarm', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    gameMock.respondToCurrentCard.mockReturnValueOnce('false-alarm');
    handleReaction();

    expect(audioMock.playFailureSound).toHaveBeenCalled();
  });

  test('handleKeyDown ignores non-space keys', () => {
    const event = { key: 'Enter', preventDefault: jest.fn() };
    handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test('handleKeyDown triggers on space key', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    const event = { key: ' ', preventDefault: jest.fn() };
    handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('handleKeyDown accepts legacy "Space" key value', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    const event = { key: 'Space', preventDefault: jest.fn() };
    handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('handleKeyDown accepts legacy "Spacebar" key value', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    const event = { key: 'Spacebar', preventDefault: jest.fn() };
    handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('handleKeyDown does nothing when game is not running', () => {
    gameMock.isRunning.mockReturnValueOnce(false);
    const event = { key: ' ', preventDefault: jest.fn() };
    handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('renderCard', () => {
  test('sets accessibility label for a normal card', () => {
    const container = buildContainer();
    plugin.init(container);

    renderCard({ rank: 'A', suit: 'hearts', isJoker: false });
    const cardLabel = container.querySelector('#cr-card').getAttribute('aria-label');
    expect(cardLabel).toBe('Current card: A♥');
  });

  test('sets accessibility label for a joker card', () => {
    const container = buildContainer();
    plugin.init(container);

    renderCard({ rank: 'JOKER', suit: 'joker', isJoker: true });
    const cardLabel = container.querySelector('#cr-card').getAttribute('aria-label');
    expect(cardLabel).toBe('Current card: Joker');
  });

  test('uses sprite image for normal cards', () => {
    const container = buildContainer();
    plugin.init(container);

    renderCard({ rank: 'A', suit: 'hearts', isJoker: false });
    const cardEl = container.querySelector('#cr-card');
    expect(cardEl.style.backgroundImage).toContain('cards-sprite.png');
    expect(cardEl.style.backgroundPosition).toContain('-');
  });

  test('uses dedicated joker image for joker cards', () => {
    const container = buildContainer();
    plugin.init(container);

    const cardEl = container.querySelector('#cr-card');
    renderCard({ rank: 'JOKER', suit: 'joker', isJoker: true });
    expect(cardEl.style.backgroundImage).toContain('joker1.png');
  });

});

describe('stop and reset', () => {
  test('stop returns game result and shows end panel', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    const result = plugin.stop();
    await Promise.resolve();

    expect(result).toMatchObject({ score: 3, triggerHits: 2 });
    expect(container.querySelector('#cr-end-panel').hidden).toBe(false);
    expect(saveScoreMock.saveScore).toHaveBeenCalled();
    expect(timerServiceMock.stopTimer).toHaveBeenCalled();

    const extraFieldsCallback = saveScoreMock.saveScore.mock.calls[0][2];
    // The mock stop result has triggerHits=2, so max(1, 2) should produce 2.
    const merged = extraFieldsCallback({ bestTriggerHits: 1 });
    expect(merged.bestTriggerHits).toBe(2);
  });

  test('stop with no session returns an idle result without saving or changing the screen', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.isRunning.mockReturnValueOnce(false);
    gameMock.initGame.mockClear();

    const result = plugin.stop();
    expect(result).toMatchObject({ score: 3, triggerHits: 2, duration: 0 });
    expect(gameMock.stopGame).not.toHaveBeenCalled();
    expect(saveScoreMock.saveScore).not.toHaveBeenCalled();
    expect(timerServiceMock.stopTimer).not.toHaveBeenCalled();
    expect(container.querySelector('#cr-end-panel').hidden).toBe(true);
    expect(gameMock.initGame).not.toHaveBeenCalled();
  });

  test('reset returns to instructions panel', async () => {
    const container = buildContainer();
    plugin.init(container);
    await plugin.start();

    plugin.reset();

    expect(container.querySelector('#cr-instructions').hidden).toBe(false);
    expect(container.querySelector('#cr-game-area').hidden).toBe(true);
    expect(timerServiceMock.resetTimer).toHaveBeenCalled();
  });
});

describe('hint toggle', () => {
  test('hides and shows hint text when toggled', () => {
    const container = buildContainer();
    plugin.init(container);
    const hintToggle = container.querySelector('#cr-hint-toggle');
    const feedback = container.querySelector('#cr-feedback');

    expect(feedback.hidden).toBe(false);

    hintToggle.checked = false;
    hintToggle.dispatchEvent(new Event('change'));
    expect(feedback.hidden).toBe(true);

    hintToggle.checked = true;
    hintToggle.dispatchEvent(new Event('change'));
    expect(feedback.hidden).toBe(false);
  });
});


describe('beginDealLoop guard', () => {
  test('returns early when game is not running', () => {
    gameMock.isRunning.mockReturnValueOnce(false);
    expect(() => beginDealLoop()).not.toThrow();
  });
});

describe('global key listener helpers', () => {
  test('attachGlobalKeyListener is idempotent', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');
    attachGlobalKeyListener();
    attachGlobalKeyListener();
    expect(addSpy).toHaveBeenCalledTimes(1);
    detachGlobalKeyListener();
  });

  test('detachGlobalKeyListener is idempotent', () => {
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    detachGlobalKeyListener();
    detachGlobalKeyListener();
    expect(removeSpy).toHaveBeenCalledTimes(0);
  });

  test('detachGlobalKeyListener remains idempotent after an attach/detach cycle', () => {
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    attachGlobalKeyListener();
    detachGlobalKeyListener();
    detachGlobalKeyListener();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  test('multiple attach/detach calls keep listener transitions stable', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    attachGlobalKeyListener();
    attachGlobalKeyListener();
    detachGlobalKeyListener();
    detachGlobalKeyListener();

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('tutorial', () => {
  let container;

  beforeEach(() => {
    container = buildContainer();
    plugin.init(container);
  });

  test('start runs the guided tutorial if needed with the Card Rat steps', async () => {
    await plugin.start();
    expect(tutorialContentMock.getTutorialSteps).toHaveBeenCalled();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledWith({
      gameId: 'card-rat',
      container,
      introSteps: expect.arrayContaining([
        expect.objectContaining({ title: 'Welcome to Card Rat' }),
      ]),
      playPracticeRound: expect.any(Function),
      onComplete: expect.any(Function),
    });
  });

  test('does not start the game until the tutorial completes', async () => {
    const { options } = await startPendingTutorial();
    expect(gameMock.startGame).not.toHaveBeenCalled();
    expect(container.querySelector('#cr-game-area').hidden).toBe(true);

    options.onComplete();
    expect(gameMock.startGame).toHaveBeenCalled();
    expect(container.querySelector('#cr-game-area').hidden).toBe(false);
  });

  test('replay tutorial button runs the guided tutorial and then starts the game', async () => {
    container.querySelector('#cr-replay-tutorial-btn').click();
    await flushMicrotasks();
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'card-rat',
      container,
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  test('start, replay, and play again do nothing while a tutorial is in progress', async () => {
    await startPendingTutorial();
    jest.clearAllMocks();

    await plugin.start();
    container.querySelector('#cr-replay-tutorial-btn').click();
    container.querySelector('#cr-play-again-btn').click();
    await flushMicrotasks();

    expect(tutorialContentMock.getTutorialSteps).not.toHaveBeenCalled();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(tutorialServiceMock.runGuidedTutorial).not.toHaveBeenCalled();
  });

  test('can launch again once the tutorial run finishes', async () => {
    const { finish } = await startPendingTutorial();
    finish();

    await plugin.start();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledTimes(2);
  });

  test('ignores a second start while the first tutorial launch is in flight', async () => {
    const first = plugin.start();
    const second = plugin.start();
    await Promise.all([first, second]);
    expect(tutorialContentMock.getTutorialSteps).toHaveBeenCalledTimes(1);
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledTimes(1);
    expect(gameMock.startGame).toHaveBeenCalledTimes(1);
  });

  test('clears the pending flag when loading tutorial steps fails', async () => {
    tutorialContentMock.getTutorialSteps.mockRejectedValueOnce(new Error('load failed'));
    await expect(plugin.start()).rejects.toThrow('load failed');

    await plugin.start();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledTimes(1);
  });

  test('start does nothing when init received no container', async () => {
    plugin.init(null);
    await plugin.start();
    expect(tutorialContentMock.getTutorialSteps).not.toHaveBeenCalled();
    plugin.init(container);
  });

  test('reset() cancels a tutorial in progress', async () => {
    const { run } = await startPendingTutorial();
    plugin.reset();
    expect(run.cancel).toHaveBeenCalledTimes(1);
  });

  test('stop() with no session ignores a tutorial that already finished', async () => {
    const { finish } = await startPendingTutorial();
    finish();
    gameMock.isRunning.mockReturnValueOnce(false);
    container.querySelector('#cr-end-panel').hidden = false;
    gameMock.initGame.mockClear();

    plugin.stop();
    expect(gameMock.initGame).not.toHaveBeenCalled();
    expect(container.querySelector('#cr-end-panel').hidden).toBe(false);
  });
});

describe('practice round', () => {
  let container;
  let pending;

  beforeEach(async () => {
    container = buildContainer();
    plugin.init(container);
    gameMock.isRunning.mockReturnValue(false);
    pending = await startPendingTutorial();
  });

  afterEach(() => {
    gameMock.isRunning.mockReturnValue(true);
  });

  /**
   * Start a practice round.
   * @param {boolean} [guided=true]
   * @returns {{ context: object, done: Promise<void> }}
   */
  function playRound(guided = true) {
    const context = buildPracticeContext(pending.controller, guided);
    const done = pending.options.playPracticeRound(context);
    return { context, done };
  }

  /** @returns {string} The current card's accessible name. */
  function cardLabel() {
    return container.querySelector('#cr-card').getAttribute('aria-label');
  }

  /** @returns {string} The hint under the cards. */
  function feedback() {
    return container.querySelector('#cr-feedback').textContent;
  }

  /** Deal the rest of the script: two more cards at the 1400 ms practice pace. */
  function dealToLastCard() {
    jest.advanceTimersByTime(1400 * 2);
  }

  test('deals the scripted cards at the easiest pace without starting a session', () => {
    const { context } = playRound();

    expect(container.querySelector('#cr-instructions').hidden).toBe(true);
    expect(container.querySelector('#cr-game-area').hidden).toBe(false);
    expect(gameMock.getPracticeSequence).toHaveBeenCalledWith(1);
    expect(gameMock.calculateDisplayDuration).toHaveBeenCalledWith(0);
    expect(context.setInstructions).toHaveBeenCalledWith('watch text');
    expect(cardLabel()).toBe('Current card: 4♥');
    expect(feedback()).toBe('Wait for a pair, sandwich, or joker.');
    expect(audioMock.playCardFlickSound).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1399);
    expect(cardLabel()).toBe('Current card: 4♥');
    jest.advanceTimersByTime(1);
    expect(cardLabel()).toBe('Current card: 7♠');

    expect(gameMock.startGame).not.toHaveBeenCalled();
    expect(gameMock.dealNextCard).not.toHaveBeenCalled();
    expect(timerServiceMock.startTimer).not.toHaveBeenCalled();
  });

  test('a guided round marks the slap control and explains the last card', () => {
    const { context } = playRound();
    jest.advanceTimersByTime(1400);
    expect(context.showMarker).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1400);
    expect(cardLabel()).toBe('Current card: 7♥');
    expect(feedback()).toBe('SLAP now! (Space or click)');
    expect(context.showMarker).toHaveBeenCalledWith({
      anchor: container.querySelector('#cr-reaction-zone'),
      shape: 'box',
    });
    expect(context.setInstructions).toHaveBeenLastCalledWith('pair text');

    // The card to slap waits for the player.
    jest.advanceTimersByTime(10000);
    expect(cardLabel()).toBe('Current card: 7♥');
    expect(audioMock.playCardFlickSound).toHaveBeenCalledTimes(3);
  });

  test('an unguided round shows no marker', () => {
    const { context } = playRound(false);
    dealToLastCard();

    expect(gameMock.getPracticeSequence).toHaveBeenCalledWith(2);
    expect(context.showMarker).not.toHaveBeenCalled();
    expect(context.setInstructions).toHaveBeenCalledTimes(1);
  });

  test('respects the card sound toggle', () => {
    container.querySelector('#cr-card-sound-toggle').checked = false;
    playRound();
    dealToLastCard();
    expect(audioMock.playCardFlickSound).not.toHaveBeenCalled();
  });

  test('an early slap gets too-soon feedback and the cards keep coming', () => {
    const { context } = playRound();
    container.querySelector('#cr-reaction-zone').click();

    expect(feedback()).toBe('Too soon — only react to pairs, sandwiches, or jokers.');
    expect(audioMock.playFailureSound).toHaveBeenCalledTimes(1);
    expect(context.hideMarker).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1400);
    expect(cardLabel()).toBe('Current card: 7♠');
    expect(gameMock.respondToCurrentCard).not.toHaveBeenCalled();
  });

  test('slapping the last card ends the round without scoring', async () => {
    const { context, done } = playRound();
    dealToLastCard();
    container.querySelector('#cr-reaction-zone').click();

    await expect(done).resolves.toBeUndefined();
    expect(context.hideMarker).toHaveBeenCalled();
    expect(feedback()).toBe('Nice slap!');
    expect(audioMock.playSuccessSound).toHaveBeenCalledTimes(1);
    expect(gameMock.respondToCurrentCard).not.toHaveBeenCalled();
    expect(saveScoreMock.saveScore).not.toHaveBeenCalled();
  });

  test('Space slaps from anywhere during practice', async () => {
    const { done } = playRound();
    dealToLastCard();

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await expect(done).resolves.toBeUndefined();
    expect(gameMock.respondToCurrentCard).not.toHaveBeenCalled();
  });

  test('ending the tutorial mid-round stops the cards and the Space listener', () => {
    const { context } = playRound();

    pending.controller.abort();
    jest.advanceTimersByTime(10000);
    expect(cardLabel()).toBe('Current card: 4♥');
    expect(context.showMarker).not.toHaveBeenCalled();

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('End Game during practice cancels the tutorial and shows the welcome screen', () => {
    playRound();
    jest.advanceTimersByTime(1400);

    container.querySelector('#cr-stop-btn').click();

    expect(pending.run.cancel).toHaveBeenCalled();
    expect(container.querySelector('#cr-instructions').hidden).toBe(false);
    expect(container.querySelector('#cr-game-area').hidden).toBe(true);
    expect(container.querySelector('#cr-end-panel').hidden).toBe(true);
    expect(gameMock.stopGame).not.toHaveBeenCalled();
    expect(saveScoreMock.saveScore).not.toHaveBeenCalled();
  });
});
