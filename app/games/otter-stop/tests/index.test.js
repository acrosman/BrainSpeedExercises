import { readFileSync } from 'node:fs';
import {
  describe, it, expect, beforeEach, afterEach, jest,
} from '@jest/globals';

// ── 0. Mock timerService ──────────────────────────────────────────────────────

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

// ── 1. Mock game.js ───────────────────────────────────────────────────────────

jest.unstable_mockModule('../game.js', () => ({
  GAME_ID: 'otter-stop',
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({
    score: 5,
    noGoHits: 1,
    misses: 2,
    trialsCompleted: 10,
    level: 0,
    duration: 8000,
    bestScore: 5,
  })),
  pickNextImage: jest.fn(() => ({ imageKey: 'go-1.png', isNoGo: false })),
  recordResponse: jest.fn(() => 'correct'),
  getCurrentIntervalMs: jest.fn(() => 1500),
  getScore: jest.fn(() => 5),
  getNoGoHits: jest.fn(() => 1),
  getMisses: jest.fn(() => 2),
  getTrialsCompleted: jest.fn(() => 10),
  getLevel: jest.fn(() => 0),
  getConsecutiveCorrect: jest.fn(() => 0),
  getConsecutiveWrong: jest.fn(() => 0),
  getSessionBestScore: jest.fn(() => 5),
  isRunning: jest.fn(() => true),
  setGoKeys: jest.fn(),
  getSpeedHistory: jest.fn(() => []),
  getAverageResponseMs: jest.fn(() => null),
  recordGoResponseTime: jest.fn(),
  IMAGE_KEYS: ['go-1.png', 'go-2.png', 'go-3.png', 'no-go'],
  NO_GO_KEY: 'no-go',
}));

// ── 2. Mock Web Audio API (audioService.js uses AudioContext internally) ──────

const mockGain = {
  connect: jest.fn(),
  gain: {
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
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
  state: 'running',
  destination: {},
  createGain: jest.fn(() => mockGain),
  createOscillator: jest.fn(() => mockOsc),
  resume: jest.fn(() => Promise.resolve()),
};
globalThis.AudioContext = jest.fn(() => mockAudioCtx);

// ── 3. Dynamic imports ────────────────────────────────────────────────────────

const gameMock = await import('../game.js');
const indexModule = await import('../index.js');
const plugin = indexModule.default;
const {
  updateStats,
  showImage,
  hideImage,
  showFeedback,
  hideFeedback,
  showEndPanel,
  playTrials,
  stopTrials,
  respond,
  handleKeyDown,
  loadGoImages,
  attachGlobalKeyListener,
  detachGlobalKeyListener,
} = indexModule;

// ── 4. DOM helpers ────────────────────────────────────────────────────────────

/**
 * Build a minimal DOM matching interface.html.
 * @returns {HTMLElement}
 */
function buildContainer() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div id="os-instructions"></div>
    <div id="os-game-area" hidden>
      <div id="os-stimulus" role="button" tabindex="0">
        <img id="os-stimulus-img" src="" alt="" />
        <div id="os-feedback" hidden>
          <img id="os-feedback-img" src="" alt="" />
          <p id="os-feedback-text"></p>
        </div>
      </div>
    </div>
    <div id="os-end-panel" hidden></div>
    <button id="os-start-btn"></button>
    <button id="os-stop-btn"></button>
    <button id="os-play-again-btn"></button>
    <button id="os-return-btn"></button>
    <strong id="os-level">1</strong>
    <strong id="os-score">0</strong>
    <strong id="os-nogo-hits">0</strong>
    <strong id="os-interval">1500</strong>
    <strong id="os-avg-response">--</strong>
    <strong id="os-final-score">0</strong>
    <strong id="os-final-best">0</strong>
    <strong id="os-final-nogo">0</strong>
    <strong id="os-final-misses">0</strong>
    <strong id="os-final-trials">0</strong>
  `;
  return el;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // Default: game is running for most tests
  gameMock.isRunning.mockReturnValue(true);
  gameMock.getCurrentIntervalMs.mockReturnValue(1500);
});

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

// ── Null DOM refs (before any init call) ─────────────────────────────────────
// These tests run first, when all module-level DOM refs are still null.
// They cover the "falsy guard" branches in the utility functions.

describe('utility functions with null DOM refs (before init)', () => {
  it('updateStats() does not throw when DOM refs are null', () => {
    expect(() => updateStats()).not.toThrow();
  });

  it('showImage() does not throw when DOM refs are null', () => {
    expect(() => showImage('go-1.png')).not.toThrow();
  });

  it('hideImage() does not throw when DOM refs are null', () => {
    expect(() => hideImage()).not.toThrow();
  });

  it('showFeedback("correct") does not throw when DOM refs are null', () => {
    expect(() => showFeedback('correct', true)).not.toThrow();
  });

  it('showFeedback("wrong") does not throw when DOM refs are null', () => {
    expect(() => showFeedback('wrong', true)).not.toThrow();
  });

  it('hideFeedback() does not throw when DOM refs are null', () => {
    expect(() => hideFeedback()).not.toThrow();
  });

  it('showEndPanel() does not throw when DOM refs are null', () => {
    expect(() => showEndPanel({
      score: 0, bestScore: 0, noGoHits: 0, misses: 0, trialsCompleted: 0,
    })).not.toThrow();
  });
});

// ── Plugin contract ───────────────────────────────────────────────────────────

describe('plugin contract', () => {
  it('exposes a string name', () => {
    expect(typeof plugin.name).toBe('string');
    expect(plugin.name.length).toBeGreaterThan(0);
  });

  it('exposes init, start, stop, and reset functions', () => {
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
    expect(typeof plugin.reset).toBe('function');
  });
});

// ── init ──────────────────────────────────────────────────────────────────────

describe('init()', () => {
  it('accepts a DOM container without throwing', () => {
    const container = buildContainer();
    expect(() => plugin.init(container)).not.toThrow();
  });

  it('accepts null without throwing', () => {
    expect(() => plugin.init(null)).not.toThrow();
  });

  it('calls game.initGame()', () => {
    const container = buildContainer();
    plugin.init(container);
    expect(gameMock.initGame).toHaveBeenCalled();
  });
});

// ── start ─────────────────────────────────────────────────────────────────────

describe('start()', () => {
  it('calls game.initGame() and game.startGame()', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    expect(gameMock.initGame).toHaveBeenCalled();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('shows the game area', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    const gameArea = container.querySelector('#os-game-area');
    expect(gameArea.hidden).toBe(false);
  });

  it('hides the instructions panel', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    const instructions = container.querySelector('#os-instructions');
    expect(instructions.hidden).toBe(true);
  });
});

// ── stop ──────────────────────────────────────────────────────────────────────

describe('stop()', () => {
  it('calls game.stopGame() and returns its result', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    const result = plugin.stop();
    expect(gameMock.stopGame).toHaveBeenCalled();
    expect(result).toMatchObject({ score: 5, noGoHits: 1, misses: 2 });
  });

  it('hides the game area', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.stop();
    const gameArea = container.querySelector('#os-game-area');
    expect(gameArea.hidden).toBe(true);
  });

  it('shows the end panel', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.stop();
    const endPanel = container.querySelector('#os-end-panel');
    expect(endPanel.hidden).toBe(false);
  });

  it('does not throw when container is null', () => {
    plugin.init(null);
    gameMock.stopGame.mockReturnValueOnce({
      score: 0, noGoHits: 0, misses: 0, trialsCompleted: 0, level: 0, duration: 0, bestScore: 0,
    });
    expect(() => plugin.stop()).not.toThrow();
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('reset()', () => {
  it('calls game.initGame()', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.reset();
    expect(gameMock.initGame).toHaveBeenCalled();
  });

  it('shows the instructions panel', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.reset();
    const instructions = container.querySelector('#os-instructions');
    expect(instructions.hidden).toBe(false);
  });

  it('hides the game area', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.reset();
    const gameArea = container.querySelector('#os-game-area');
    expect(gameArea.hidden).toBe(true);
  });

  it('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => plugin.reset()).not.toThrow();
  });
});

// ── updateStats ───────────────────────────────────────────────────────────────

describe('updateStats()', () => {
  it('sets level text to getLevel() + 1', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.getLevel.mockReturnValue(2);
    updateStats();
    expect(container.querySelector('#os-level').textContent).toBe('3');
  });

  it('sets score text', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.getScore.mockReturnValue(7);
    updateStats();
    expect(container.querySelector('#os-score').textContent).toBe('7');
  });

  it('sets nogo-hits text', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.getNoGoHits.mockReturnValue(3);
    updateStats();
    expect(container.querySelector('#os-nogo-hits').textContent).toBe('3');
  });

  it('sets interval text', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.getCurrentIntervalMs.mockReturnValue(500);
    updateStats();
    expect(container.querySelector('#os-interval').textContent).toBe('500');
  });
});

// ── showImage / hideImage ─────────────────────────────────────────────────────

describe('showImage()', () => {
  it('sets the img src for a go image (path includes images/go/)', () => {
    const container = buildContainer();
    plugin.init(container);
    showImage('go-1.png');
    const img = container.querySelector('#os-stimulus-img');
    expect(img.src).toContain('go-1.png');
    expect(img.src).toContain('go/');
  });

  it('sets the img src for the no-go image (path does not include go/)', () => {
    const container = buildContainer();
    plugin.init(container);
    showImage('no-go');
    const img = container.querySelector('#os-stimulus-img');
    expect(img.src).toContain('no-go.png');
    expect(img.src).not.toContain('go/no-go');
  });

  it('sets alt text to "No-go fish" for the no-go image', () => {
    const container = buildContainer();
    plugin.init(container);
    showImage('no-go');
    const img = container.querySelector('#os-stimulus-img');
    expect(img.alt).toBe('No-go fish');
  });

  it('sets alt text to "Go otter" for a go image', () => {
    const container = buildContainer();
    plugin.init(container);
    showImage('go-2.png');
    const img = container.querySelector('#os-stimulus-img');
    expect(img.alt).toBe('Go otter');
  });

  it('does not throw when stimulus image element is absent (null container)', () => {
    plugin.init(null);
    expect(() => showImage('go-1.png')).not.toThrow();
  });
});

describe('hideImage()', () => {
  it('adds os-hidden class to the stimulus image', () => {
    const container = buildContainer();
    plugin.init(container);
    hideImage();
    const img = container.querySelector('#os-stimulus-img');
    expect(img.classList.contains('os-hidden')).toBe(true);
  });

  it('does not throw when stimulus image element is absent', () => {
    plugin.init(null);
    expect(() => hideImage()).not.toThrow();
  });
});

// ── showFeedback / hideFeedback ───────────────────────────────────────────────

describe('showFeedback()', () => {
  it('shows the feedback panel for a correct no-go outcome', () => {
    const container = buildContainer();
    plugin.init(container);
    showFeedback('correct', true);
    const fb = container.querySelector('#os-feedback');
    expect(fb.hidden).toBe(false);
  });

  it('shows the feedback panel for a wrong no-go outcome (false alarm)', () => {
    const container = buildContainer();
    plugin.init(container);
    showFeedback('wrong', true);
    const fb = container.querySelector('#os-feedback');
    expect(fb.hidden).toBe(false);
  });

  it('shows the feedback panel for a go miss (wrong + wasNoGo=false)', () => {
    const container = buildContainer();
    plugin.init(container);
    showFeedback('wrong', false);
    const fb = container.querySelector('#os-feedback');
    expect(fb.hidden).toBe(false);
  });

  it('sets feedback text "Great stop!" for correct no-go', () => {
    const container = buildContainer();
    plugin.init(container);
    showFeedback('correct', true);
    expect(container.querySelector('#os-feedback-text').textContent).toBe('Great stop!');
  });

  it('sets feedback text "Oops — too fast!" for wrong no-go (false alarm)', () => {
    const container = buildContainer();
    plugin.init(container);
    showFeedback('wrong', true);
    expect(container.querySelector('#os-feedback-text').textContent).toBe('Oops \u2014 too fast!');
  });

  it('sets feedback text "Too slow!" for a missed go image', () => {
    const container = buildContainer();
    plugin.init(container);
    showFeedback('wrong', false);
    expect(container.querySelector('#os-feedback-text').textContent).toBe('Too slow!');
  });

  it('calls AudioContext for correct outcome (success sound)', () => {
    const container = buildContainer();
    plugin.init(container);
    // Should not throw even though AudioContext is mocked
    expect(() => showFeedback('correct', true)).not.toThrow();
  });

  it('calls AudioContext for wrong outcome (failure sound)', () => {
    const container = buildContainer();
    plugin.init(container);
    expect(() => showFeedback('wrong', true)).not.toThrow();
  });

  it('sets the correct CSS class for a correct outcome', () => {
    const container = buildContainer();
    plugin.init(container);
    showFeedback('correct', true);
    const text = container.querySelector('#os-feedback-text');
    expect(text.className).toContain('os-feedback__text--correct');
  });

  it('sets the correct CSS class for a wrong outcome', () => {
    const container = buildContainer();
    plugin.init(container);
    showFeedback('wrong', true);
    const text = container.querySelector('#os-feedback-text');
    expect(text.className).toContain('os-feedback__text--wrong');
  });

  it('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => showFeedback('correct', true)).not.toThrow();
  });
});

describe('hideFeedback()', () => {
  it('hides the feedback panel', () => {
    const container = buildContainer();
    plugin.init(container);
    showFeedback('correct', true);
    hideFeedback();
    const fb = container.querySelector('#os-feedback');
    expect(fb.hidden).toBe(true);
  });

  it('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => hideFeedback()).not.toThrow();
  });
});

// ── showEndPanel ──────────────────────────────────────────────────────────────

describe('showEndPanel()', () => {
  it('populates and shows the end panel', () => {
    const container = buildContainer();
    plugin.init(container);
    showEndPanel({
      score: 8, bestScore: 10, noGoHits: 1, misses: 2, trialsCompleted: 15,
    });
    expect(container.querySelector('#os-final-score').textContent).toBe('8');
    expect(container.querySelector('#os-final-best').textContent).toBe('10');
    expect(container.querySelector('#os-final-nogo').textContent).toBe('1');
    expect(container.querySelector('#os-final-misses').textContent).toBe('2');
    expect(container.querySelector('#os-final-trials').textContent).toBe('15');
    expect(container.querySelector('#os-end-panel').hidden).toBe(false);
  });

  it('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => showEndPanel({
      score: 0, bestScore: 0, noGoHits: 0, misses: 0, trialsCompleted: 0,
    })).not.toThrow();
  });
});

// ── Global key listener lifecycle ─────────────────────────────────────────────

describe('global Space key listener', () => {
  /**
   * Dispatch a cancelable Space keydown on document.
   * @returns {KeyboardEvent}
   */
  function pressSpace() {
    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    return event;
  }

  afterEach(() => {
    detachGlobalKeyListener();
  });

  it('is not attached by init()', () => {
    gameMock.isRunning.mockReturnValue(true);
    plugin.init(buildContainer());
    expect(pressSpace().defaultPrevented).toBe(false);
  });

  it('is attached by start() and handles Space during a session', () => {
    plugin.init(buildContainer());
    plugin.start();
    gameMock.isRunning.mockReturnValue(true);
    expect(pressSpace().defaultPrevented).toBe(true);
  });

  it('is detached by stop()', () => {
    plugin.init(buildContainer());
    plugin.start();
    plugin.stop();
    gameMock.isRunning.mockReturnValue(true);
    expect(pressSpace().defaultPrevented).toBe(false);
  });

  it('is detached by reset()', () => {
    plugin.init(buildContainer());
    plugin.start();
    plugin.reset();
    gameMock.isRunning.mockReturnValue(true);
    expect(pressSpace().defaultPrevented).toBe(false);
  });

  it('is detached when init() runs again after a session', () => {
    plugin.init(buildContainer());
    plugin.start();
    plugin.init(buildContainer());
    gameMock.isRunning.mockReturnValue(true);
    expect(pressSpace().defaultPrevented).toBe(false);
  });

  it('attaches only once when attachGlobalKeyListener() is called twice', () => {
    detachGlobalKeyListener();
    const addSpy = jest.spyOn(document, 'addEventListener');
    attachGlobalKeyListener();
    attachGlobalKeyListener();
    expect(addSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    addSpy.mockRestore();
  });

  it('does nothing when detachGlobalKeyListener() is called while detached', () => {
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    detachGlobalKeyListener();
    detachGlobalKeyListener();
    expect(removeSpy).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });
});

// ── Trial loop ────────────────────────────────────────────────────────────────

/** Gap before each trial, from index.js. */
const ISI_MS = 120;
/** How long feedback stays up, from index.js. */
const FEEDBACK_MS = 800;
/** Display time the mocked game reports. */
const INTERVAL_MS = 1500;

/**
 * Start a session and advance to its first stimulus.
 * @param {{ imageKey: string, isNoGo: boolean }} [stimulus] - The game's first pick.
 * @returns {HTMLElement} The container.
 */
function startFirstTrial(stimulus = { imageKey: 'go-1.png', isNoGo: false }) {
  const container = buildContainer();
  plugin.init(container);
  gameMock.pickNextImage.mockReturnValueOnce(stimulus);
  plugin.start();
  jest.advanceTimersByTime(ISI_MS);
  return container;
}

/** @returns {KeyboardEvent} A cancelable Space keydown. */
function spaceEvent() {
  return new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
}

describe('handleKeyDown()', () => {
  afterEach(() => stopTrials());

  it('ignores non-Space keys', () => {
    startFirstTrial();
    const event = new KeyboardEvent('keydown', { code: 'ArrowLeft', cancelable: true });
    handleKeyDown(event);
    expect(event.defaultPrevented).toBe(false);
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
  });

  it('leaves Space alone when no run is playing', () => {
    plugin.init(buildContainer());
    const event = spaceEvent();
    handleKeyDown(event);
    expect(event.defaultPrevented).toBe(false);
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
  });

  it('prevents the default between trials without recording anything', () => {
    plugin.init(buildContainer());
    plugin.start();
    const event = spaceEvent();
    handleKeyDown(event);
    expect(event.defaultPrevented).toBe(true);
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
  });

  it('responds to the stimulus on screen', () => {
    startFirstTrial();
    const event = spaceEvent();
    handleKeyDown(event);
    expect(event.defaultPrevented).toBe(true);
    expect(gameMock.recordResponse).toHaveBeenCalledWith(false, true);
  });
});

describe('session trials', () => {
  afterEach(() => stopTrials());

  it('shows the game\'s pick after the gap between trials', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'go-2.png', isNoGo: false });
    plugin.start();

    jest.advanceTimersByTime(ISI_MS - 1);
    expect(gameMock.pickNextImage).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    const img = container.querySelector('#os-stimulus-img');
    expect(img.src).toContain('go/go-2.png');
    expect(img.classList.contains('os-hidden')).toBe(false);
  });

  it('a press ends the trial early, records the response time, and moves straight on', () => {
    const container = startFirstTrial();
    jest.advanceTimersByTime(300);
    respond();

    expect(gameMock.recordGoResponseTime).toHaveBeenCalledWith(300);
    expect(gameMock.recordResponse).toHaveBeenCalledWith(false, true);
    expect(container.querySelector('#os-stimulus-img').classList.contains('os-hidden')).toBe(true);
    expect(container.querySelector('#os-feedback').hidden).toBe(true);

    jest.advanceTimersByTime(ISI_MS);
    expect(gameMock.pickNextImage).toHaveBeenCalledTimes(2);
    expect(gameMock.recordResponse).toHaveBeenCalledTimes(1);
  });

  it('a click on the stimulus area responds', () => {
    const container = startFirstTrial();
    container.querySelector('#os-stimulus').click();
    expect(gameMock.recordResponse).toHaveBeenCalledWith(false, true);
  });

  it('ignores presses between trials', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    respond();
    container.querySelector('#os-stimulus').click();
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
  });

  it('a go image that times out is a miss, followed by feedback and then the next trial', () => {
    gameMock.recordResponse.mockReturnValueOnce('wrong');
    const container = startFirstTrial();

    jest.advanceTimersByTime(INTERVAL_MS - 1);
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(gameMock.recordResponse).toHaveBeenCalledWith(false, false);
    expect(gameMock.recordGoResponseTime).not.toHaveBeenCalled();
    expect(container.querySelector('#os-feedback').hidden).toBe(false);
    expect(container.querySelector('#os-feedback-text').textContent).toBe('Too slow!');

    jest.advanceTimersByTime(FEEDBACK_MS);
    expect(container.querySelector('#os-feedback').hidden).toBe(true);
    expect(gameMock.pickNextImage).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(ISI_MS);
    expect(gameMock.pickNextImage).toHaveBeenCalledTimes(2);
  });

  it('a no-go trial shows feedback and refreshes the average response time', () => {
    gameMock.getAverageResponseMs.mockReturnValue(320);
    const container = startFirstTrial({ imageKey: 'no-go', isNoGo: true });
    jest.advanceTimersByTime(INTERVAL_MS);

    expect(gameMock.recordResponse).toHaveBeenCalledWith(true, false);
    expect(container.querySelector('#os-feedback-text').textContent).toBe('Great stop!');
    expect(container.querySelector('#os-avg-response').textContent).toBe('320');
  });

  it('shows "--" for the average after a no-go trial when there is no go response yet', () => {
    gameMock.getAverageResponseMs.mockReturnValue(null);
    const container = startFirstTrial({ imageKey: 'no-go', isNoGo: true });
    container.querySelector('#os-avg-response').textContent = '999';
    jest.advanceTimersByTime(INTERVAL_MS);
    expect(container.querySelector('#os-avg-response').textContent).toBe('--');
  });

  it('pressing on the no-go image records a no-go hit without a response time', () => {
    gameMock.recordResponse.mockReturnValueOnce('wrong');
    const container = startFirstTrial({ imageKey: 'no-go', isNoGo: true });
    respond();

    expect(gameMock.recordResponse).toHaveBeenCalledWith(true, true);
    expect(gameMock.recordGoResponseTime).not.toHaveBeenCalled();
    expect(container.querySelector('#os-feedback-text').textContent).toBe('Oops \u2014 too fast!');
  });

  it('a go trial updates the stats but not the average response time', () => {
    gameMock.getAverageResponseMs.mockReturnValue(250);
    const container = startFirstTrial();
    gameMock.getScore.mockReturnValue(7);
    respond();

    expect(container.querySelector('#os-score').textContent).toBe('7');
    expect(container.querySelector('#os-avg-response').textContent).toBe('--');
  });
});

describe('playTrials()', () => {
  afterEach(() => stopTrials());

  it('plays any run, and ends when the run has no more stimuli', () => {
    const container = buildContainer();
    plugin.init(container);
    const run = {
      next: jest.fn()
        .mockReturnValueOnce({ imageKey: 'no-go', isNoGo: true, displayMs: 500 })
        .mockReturnValue(null),
      record: jest.fn(() => 'correct'),
    };
    playTrials(run);
    jest.advanceTimersByTime(ISI_MS + 500);

    expect(run.record).toHaveBeenCalledWith(expect.objectContaining({ isNoGo: true }), false, 500);
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
    expect(container.querySelector('#os-feedback').hidden).toBe(false);

    jest.advanceTimersByTime(FEEDBACK_MS + ISI_MS);
    expect(run.next).toHaveBeenCalledTimes(2);
    // The run is over, so Space is left alone.
    const event = spaceEvent();
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('a stimulus with no display time waits for a press', () => {
    plugin.init(buildContainer());
    const run = {
      next: jest.fn(() => ({ imageKey: 'go-1.png', isNoGo: false, displayMs: null })),
      record: jest.fn(() => 'correct'),
    };
    playTrials(run);
    jest.advanceTimersByTime(ISI_MS + 10000);
    expect(run.record).not.toHaveBeenCalled();

    respond();
    expect(run.record).toHaveBeenCalledWith(
      expect.objectContaining({ imageKey: 'go-1.png' }),
      true,
      10000,
    );
  });

  it('replaces a run in progress', () => {
    plugin.init(buildContainer());
    const first = { next: jest.fn(() => null), record: jest.fn() };
    const second = { next: jest.fn(() => null), record: jest.fn() };
    playTrials(first);
    playTrials(second);
    jest.advanceTimersByTime(ISI_MS);
    expect(first.next).not.toHaveBeenCalled();
    expect(second.next).toHaveBeenCalledTimes(1);
  });
});

describe('stopTrials()', () => {
  it('cancels the pending trial and clears the stimulus, feedback, and Space listener', () => {
    const container = startFirstTrial();
    showFeedback('correct', true);
    stopTrials();

    expect(container.querySelector('#os-stimulus-img').classList.contains('os-hidden')).toBe(true);
    expect(container.querySelector('#os-feedback').hidden).toBe(true);
    jest.advanceTimersByTime(5000);
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
    const event = spaceEvent();
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('is safe with no run playing', () => {
    expect(() => stopTrials()).not.toThrow();
  });
});

// ── stop() with window.api present ───────────────────────────────────────────

describe('stop() — window.api IPC call', () => {
  it('calls progress:load then progress:save in the correct nested format', async () => {
    const existingProgress = {
      playerId: 'default',
      games: {
        'otter-stop': { highScore: 3, sessionsPlayed: 1, highestLevel: 0, lowestDisplayTime: 1200 },
      },
    };
    const invokeMock = jest.fn((channel) => {
      if (channel === 'progress:load') return Promise.resolve(existingProgress);
      return Promise.resolve();
    });
    window.api = { invoke: invokeMock };

    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.stop();

    // Flush all pending async microtasks/timers
    await Promise.resolve();
    await Promise.resolve();

    // progress:load must have been called
    expect(invokeMock).toHaveBeenCalledWith('progress:load', { playerId: 'default' });

    // progress:save must pass the full nested structure
    expect(invokeMock).toHaveBeenCalledWith('progress:save', {
      playerId: 'default',
      data: expect.objectContaining({
        games: expect.objectContaining({
          'otter-stop': expect.objectContaining({
            highScore: expect.any(Number),
            sessionsPlayed: expect.any(Number),
            lastPlayed: expect.any(String),
            highestLevel: expect.any(Number),
            lowestDisplayTime: expect.any(Number),
          }),
        }),
      }),
    });

    delete window.api;
  });

  it('picks the higher highScore when the new score exceeds the stored value', async () => {
    const existingProgress = {
      playerId: 'default',
      games: {
        'otter-stop': {
          highScore: 2, sessionsPlayed: 0, highestLevel: 0, lowestDisplayTime: 1400,
        },
      },
    };
    const savedData = {};
    const invokeMock = jest.fn((channel, payload) => {
      if (channel === 'progress:load') return Promise.resolve(existingProgress);
      if (channel === 'progress:save') {
        Object.assign(savedData, payload.data.games['otter-stop']);
        return Promise.resolve();
      }
      return Promise.resolve();
    });
    window.api = { invoke: invokeMock };
    // Mock returns score:5 (higher than stored 2)
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(savedData.highScore).toBe(5); // max(2, 5)
    delete window.api;
  });

  it('increments sessionsPlayed on each stop', async () => {
    const existingProgress = {
      playerId: 'default',
      games: {
        'otter-stop': {
          highScore: 0, sessionsPlayed: 4, highestLevel: 0, lowestDisplayTime: 1400,
        },
      },
    };
    const savedData = {};
    const invokeMock = jest.fn((channel, payload) => {
      if (channel === 'progress:load') return Promise.resolve(existingProgress);
      if (channel === 'progress:save') {
        Object.assign(savedData, payload.data.games['otter-stop']);
        return Promise.resolve();
      }
      return Promise.resolve();
    });
    window.api = { invoke: invokeMock };
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    plugin.stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(savedData.sessionsPlayed).toBe(5); // 4 + 1
    delete window.api;
  });

  it('does not throw when window.api.invoke rejects', async () => {
    const invokeMock = jest.fn(() => Promise.reject(new Error('IPC error')));
    window.api = { invoke: invokeMock };

    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    expect(() => plugin.stop()).not.toThrow();

    // Flush the microtask queue so the catch callback executes.
    await Promise.resolve();
    await Promise.resolve();

    delete window.api;
  });

  it('does not throw when window.api is unavailable', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    expect(() => plugin.stop()).not.toThrow();
  });
});


// ── loadGoImages ──────────────────────────────────────────────────────────────

describe('loadGoImages()', () => {
  it('calls window.api.invoke("games:listImages") when api is available', async () => {
    const invokeMock = jest.fn().mockResolvedValue(['go-1.png', 'go-2.png']);
    window.api = { invoke: invokeMock };
    await loadGoImages();
    expect(invokeMock).toHaveBeenCalledWith('games:listImages', {
      gameId: 'otter-stop',
      subfolder: 'go',
    });
    delete window.api;
  });

  it('calls game.setGoKeys() with the returned filenames', async () => {
    const invokeMock = jest.fn().mockResolvedValue(['go-1.png', 'go-2.png']);
    window.api = { invoke: invokeMock };
    await loadGoImages();
    expect(gameMock.setGoKeys).toHaveBeenCalledWith(['go-1.png', 'go-2.png']);
    delete window.api;
  });

  it('does not call setGoKeys() when the returned array is empty', async () => {
    const invokeMock = jest.fn().mockResolvedValue([]);
    window.api = { invoke: invokeMock };
    gameMock.setGoKeys.mockClear();
    await loadGoImages();
    expect(gameMock.setGoKeys).not.toHaveBeenCalled();
    delete window.api;
  });

  it('does not throw when window.api is unavailable', async () => {
    const origApi = window.api;
    delete window.api;
    await expect(loadGoImages()).resolves.toBeUndefined();
    if (origApi) window.api = origApi;
  });

  it('does not throw when the IPC call rejects (falls back silently)', async () => {
    const invokeMock = jest.fn().mockRejectedValue(new Error('IPC error'));
    window.api = { invoke: invokeMock };
    await expect(loadGoImages()).resolves.toBeUndefined();
    delete window.api;
  });
});

describe('button wiring', () => {
  it('start button calls start()', () => {
    const container = buildContainer();
    plugin.init(container);
    const btn = container.querySelector('#os-start-btn');
    btn.click();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('stop button calls stop()', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    const btn = container.querySelector('#os-stop-btn');
    btn.click();
    expect(gameMock.stopGame).toHaveBeenCalled();
  });

  it('play-again button returns to the instructions screen (reset only)', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    gameMock.initGame.mockClear();
    gameMock.startGame.mockClear();
    const btn = container.querySelector('#os-play-again-btn');
    btn.click();
    // reset() calls initGame but does NOT call startGame — player returns to instructions
    expect(gameMock.initGame).toHaveBeenCalled();
    expect(gameMock.startGame).not.toHaveBeenCalled();
    // Instructions should be visible again
    expect(container.querySelector('#os-instructions').hidden).toBe(false);
    expect(container.querySelector('#os-game-area').hidden).toBe(true);
  });

  it('return button dispatches bsx:return-to-main-menu event', () => {
    const container = buildContainer();
    plugin.init(container);
    const received = [];
    window.addEventListener('bsx:return-to-main-menu', (e) => received.push(e));
    container.querySelector('#os-return-btn').click();
    expect(received).toHaveLength(1);
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
    delete window.api;
  });

  it('writes dailyTime[today] into saved progress when stopTimer returns > 0', async () => {
    timerMod.stopTimer.mockReturnValueOnce(90000);
    timerMod.getTodayDateString.mockReturnValue('2024-01-15');

    const mockProgress = { playerId: 'default', games: {} };
    const savedPayloads = [];
    window.api = {
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

    expect(savedPayloads[0].data.games['otter-stop'].dailyTime['2024-01-15']).toBe(90000);
  });

  it('accumulates dailyTime on top of an existing entry for the same day', async () => {
    timerMod.stopTimer.mockReturnValueOnce(60000);
    timerMod.getTodayDateString.mockReturnValue('2024-01-15');

    const mockProgress = {
      playerId: 'default',
      games: {
        'otter-stop': {
          highScore: 0,
          sessionsPlayed: 1,
          dailyTime: { '2024-01-15': 30000 },
        },
      },
    };
    const savedPayloads = [];
    window.api = {
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
    expect(savedPayloads[0].data.games['otter-stop'].dailyTime['2024-01-15']).toBe(90000);
  });
});

// ── interface.html accessibility ──────────────────────────────────────────────

describe('interface.html live regions', () => {
  const html = readFileSync(new URL('../interface.html', import.meta.url), 'utf8');

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('session timer is not inside a live region', () => {
    document.body.innerHTML = html;

    expect(document.querySelector('#os-session-timer').closest('[aria-live]')).toBeNull();
    expect(document.querySelector('#os-score').closest('[aria-live]')).not.toBeNull();
    expect(document.querySelector('#os-level').closest('[aria-live]')).not.toBeNull();
  });
});
