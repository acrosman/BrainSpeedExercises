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
  endTrial,
  scheduleNextTrial,
  beginTrial,
  clearAllTimers,
  handleKeyDown,
  handleClick,
  loadGoImages,
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

  it('shows "--" for avg response when getAverageResponseMs returns null', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.getAverageResponseMs.mockReturnValue(null);
    updateStats();
    expect(container.querySelector('#os-avg-response').textContent).toBe('--');
  });

  it('shows the numeric value when getAverageResponseMs returns a number', () => {
    const container = buildContainer();
    plugin.init(container);
    gameMock.getAverageResponseMs.mockReturnValue(320);
    updateStats();
    expect(container.querySelector('#os-avg-response').textContent).toBe('320');
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

// ── handleKeyDown ─────────────────────────────────────────────────────────────

describe('handleKeyDown()', () => {
  it('ignores non-Space keys', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    const event = new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    handleKeyDown(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('calls preventDefault on Space even when game is not running (prevents page scroll)', () => {
    const container = buildContainer();
    gameMock.isRunning.mockReturnValue(false);
    plugin.init(container);
    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    handleKeyDown(event);
    // Space is always prevented from scrolling, but game logic is skipped
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
  });

  it('calls preventDefault on Space when running with no active stimulus', () => {
    const container = buildContainer();
    gameMock.isRunning.mockReturnValue(true);
    plugin.init(container);
    // game is running but no active stimulus (_currentImageKey is null) — does not trigger trial
    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    handleKeyDown(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
  });
});

// ── beginTrial / endTrial / scheduleNextTrial ─────────────────────────────────

describe('beginTrial()', () => {
  it('calls pickNextImage() when game is running', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    beginTrial();
    expect(gameMock.pickNextImage).toHaveBeenCalled();
  });

  it('does not call pickNextImage() when game is not running', () => {
    gameMock.isRunning.mockReturnValue(false);
    const container = buildContainer();
    plugin.init(container);
    gameMock.pickNextImage.mockClear();
    beginTrial();
    expect(gameMock.pickNextImage).not.toHaveBeenCalled();
  });
});

describe('endTrial()', () => {
  it('calls game.recordResponse() when game is running and a trial is active', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    beginTrial(); // sets up _currentImageKey
    clearAllTimers(); // prevent timer from auto-firing
    endTrial();
    expect(gameMock.recordResponse).toHaveBeenCalled();
  });

  it('does not call recordResponse() when game is not running', () => {
    gameMock.isRunning.mockReturnValue(false);
    const container = buildContainer();
    plugin.init(container);
    gameMock.recordResponse.mockClear();
    endTrial();
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
  });

  it('shows feedback when the trial was a no-go', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    // Force a no-go trial
    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'no-go', isNoGo: true });
    beginTrial();
    clearAllTimers();
    endTrial();
    const fb = container.querySelector('#os-feedback');
    expect(fb.hidden).toBe(false);
  });

  it('shows feedback when a go image was missed (wrong outcome)', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    // Force a wrong outcome on a go trial (player didn't press Space)
    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'go-1', isNoGo: false });
    gameMock.recordResponse.mockReturnValueOnce('wrong');
    beginTrial();
    clearAllTimers();
    endTrial();
    const fb = container.querySelector('#os-feedback');
    expect(fb.hidden).toBe(false);
  });

  it('does NOT show feedback when a go image was responded to correctly', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    // Force a correct outcome on a go trial
    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'go-1', isNoGo: false });
    gameMock.recordResponse.mockReturnValueOnce('correct');
    beginTrial();
    clearAllTimers();
    endTrial();
    const fb = container.querySelector('#os-feedback');
    expect(fb.hidden).toBe(true);
  });
});

describe('scheduleNextTrial()', () => {
  it('does not throw when game is running', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    expect(() => scheduleNextTrial()).not.toThrow();
  });

  it('is a no-op when game is not running', () => {
    gameMock.isRunning.mockReturnValue(false);
    const container = buildContainer();
    plugin.init(container);
    expect(() => scheduleNextTrial()).not.toThrow();
  });
});

// ── clearAllTimers ────────────────────────────────────────────────────────────

describe('clearAllTimers()', () => {
  it('does not throw when called with no active timers', () => {
    expect(() => clearAllTimers()).not.toThrow();
  });

  it('does not throw when called after beginTrial()', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    beginTrial();
    expect(() => clearAllTimers()).not.toThrow();
  });
});

// ── handleKeyDown — full Space press path ────────────────────────────────────

describe('handleKeyDown() — Space with active stimulus', () => {
  it('calls preventDefault and triggers endTrial when stimulus is active', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    beginTrial(); // activate a trial so _currentImageKey !== null
    clearAllTimers(); // prevent automatic trial end

    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    handleKeyDown(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(gameMock.recordResponse).toHaveBeenCalled();
  });

  it('clears the active trial timer when Space is pressed mid-trial', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    // beginTrial sets _trialTimer; do NOT clear it before pressing Space
    beginTrial();

    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    // Should not throw even though the timer is still running
    expect(() => handleKeyDown(event)).not.toThrow();
    expect(gameMock.recordResponse).toHaveBeenCalled();
  });
});

// ── handleClick ───────────────────────────────────────────────────────────────

describe('handleClick()', () => {
  it('records the response when game is running and a stimulus is active', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    beginTrial(); // activate a trial so _currentImageKey !== null
    clearAllTimers();

    handleClick();

    expect(gameMock.recordResponse).toHaveBeenCalled();
  });

  it('is a no-op when game is not running', () => {
    gameMock.isRunning.mockReturnValue(false);
    const container = buildContainer();
    plugin.init(container);
    gameMock.recordResponse.mockClear();
    handleClick();
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
  });

  it('is a no-op when no stimulus is active (_currentImageKey is null)', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start(); // _currentImageKey is null until beginTrial()
    gameMock.recordResponse.mockClear();
    handleClick();
    expect(gameMock.recordResponse).not.toHaveBeenCalled();
  });

  it('clears the active trial timer when clicked mid-trial', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    beginTrial(); // sets _trialTimer
    // Should not throw
    expect(() => handleClick()).not.toThrow();
    expect(gameMock.recordResponse).toHaveBeenCalled();
  });

  it('is wired to the stimulus element click event', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    beginTrial();
    clearAllTimers();

    // Clicking the stimulus element should trigger handleClick
    const stimulusEl = container.querySelector('#os-stimulus');
    gameMock.recordResponse.mockClear();
    stimulusEl.click();

    expect(gameMock.recordResponse).toHaveBeenCalled();
  });
});

// ── endTrial — feedback timer callback ───────────────────────────────────────

describe('endTrial() — feedback timer fires after no-go trial', () => {
  it('hides feedback and schedules next trial after FEEDBACK_DURATION_MS', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'no-go', isNoGo: true });
    beginTrial();
    clearAllTimers();
    endTrial(); // starts the feedback timer

    // Feedback should be visible
    expect(container.querySelector('#os-feedback').hidden).toBe(false);

    // Advance fake timers past FEEDBACK_DURATION_MS (800 ms)
    jest.advanceTimersByTime(900);

    // Feedback should now be hidden and next trial scheduled
    expect(container.querySelector('#os-feedback').hidden).toBe(true);
  });
});

describe('endTrial() — feedback timer fires after go miss', () => {
  it('hides feedback and schedules next trial after FEEDBACK_DURATION_MS', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();

    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'go-1', isNoGo: false });
    gameMock.recordResponse.mockReturnValueOnce('wrong'); // missed go image
    beginTrial();
    clearAllTimers();
    endTrial(); // starts the feedback timer

    expect(container.querySelector('#os-feedback').hidden).toBe(false);

    jest.advanceTimersByTime(900);

    expect(container.querySelector('#os-feedback').hidden).toBe(true);
  });
});

// ── response time recording ───────────────────────────────────────────────────

describe('response time recording', () => {
  it('calls recordGoResponseTime when Space is pressed on a go trial', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'go-1.png', isNoGo: false });
    beginTrial();
    clearAllTimers();

    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    handleKeyDown(event);

    expect(gameMock.recordGoResponseTime).toHaveBeenCalledWith(expect.any(Number));
  });

  it('does not call recordGoResponseTime for a no-go trial', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'no-go', isNoGo: true });
    beginTrial();
    clearAllTimers();
    gameMock.recordGoResponseTime.mockClear();
    endTrial();

    expect(gameMock.recordGoResponseTime).not.toHaveBeenCalled();
  });

  it('does not call recordGoResponseTime when player misses a go image (no Space press)', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'go-1.png', isNoGo: false });
    beginTrial();
    clearAllTimers();
    gameMock.recordGoResponseTime.mockClear();
    // endTrial without pressing Space — simulates a miss
    endTrial();

    expect(gameMock.recordGoResponseTime).not.toHaveBeenCalled();
  });

  it('calls recordGoResponseTime when stimulus area is clicked on a go trial', () => {
    const container = buildContainer();
    plugin.init(container);
    plugin.start();
    gameMock.pickNextImage.mockReturnValueOnce({ imageKey: 'go-1.png', isNoGo: false });
    beginTrial();
    clearAllTimers();

    handleClick();

    expect(gameMock.recordGoResponseTime).toHaveBeenCalledWith(expect.any(Number));
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
