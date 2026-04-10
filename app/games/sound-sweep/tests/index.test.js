/**
 * index.test.js — Integration tests for the Sound Sweep plugin controller.
 */
import {
  jest,
  describe,
  test,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';

// Mock timerService before other imports.
jest.unstable_mockModule('../../../components/timerService.js', () => ({
  startTimer: jest.fn((cb) => { if (typeof cb === 'function') cb(1000); }),
  stopTimer: jest.fn(() => 0),
  resetTimer: jest.fn(),
  getElapsedMs: jest.fn(() => 0),
  isTimerRunning: jest.fn(() => false),
  formatDuration: jest.fn(() => '00:01'),
  getTodayDateString: jest.fn(() => '2024-01-15'),
}));
await import('../../../components/timerService.js');

jest.unstable_mockModule('../game.js', () => ({
  initGame:              jest.fn(),
  startGame:             jest.fn(),
  stopGame:              jest.fn(() => ({
    score: 4,
    level: 2,
    trialsCompleted: 7,
    duration: 4000,
  })),
  pickSequence:          jest.fn(() => 'up-down'),
  recordTrial:           jest.fn(() => ({
    level: 2,
    consecutiveCorrect: 1,
    consecutiveWrong: 0,
  })),
  getCurrentLevel:       jest.fn(() => 2),
  getCurrentLevelConfig: jest.fn(() => ({ sweepDurationMs: 200, isiMs: 200 })),
  getScore:              jest.fn(() => 4),
  getTrialsCompleted:    jest.fn(() => 7),
  getConsecutiveCorrect: jest.fn(() => 1),
  getConsecutiveWrong:   jest.fn(() => 0),
  isRunning:             jest.fn(() => true),
}));

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playSweepPair:     jest.fn(),
  playFeedbackSound: jest.fn(),
}));

jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(),
}));

const pluginModule     = await import('../index.js');
const plugin           = pluginModule.default;
const {
  announce,
  updateStats,
  handleSequenceResponse,
  handleKeyDown,
} = pluginModule;

const gameMock          = await import('../game.js');
const audioServiceMock  = await import('../../../components/audioService.js');
const scoreServiceMock  = await import('../../../components/scoreService.js');

// ── DOM helper ────────────────────────────────────────────────────────────────

/**
 * Build a minimal DOM structure matching interface.html element IDs.
 *
 * @returns {HTMLElement}
 */
function buildContainer() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="ss-instructions"></div>
    <div id="ss-game-area" hidden></div>
    <div id="ss-end-panel" hidden></div>
    <div id="ss-feedback"></div>
    <p id="ss-status" tabindex="-1"></p>
    <strong id="ss-level">1</strong>
    <strong id="ss-score">0</strong>
    <strong id="ss-trials">0</strong>
    <strong id="ss-streak">0</strong>
    <strong id="ss-session-timer">00:00</strong>
    <strong id="ss-final-level">1</strong>
    <strong id="ss-final-score">0</strong>
    <strong id="ss-final-trials">0</strong>
    <button id="ss-btn-uu" type="button" disabled>Up-Up</button>
    <button id="ss-btn-ud" type="button" disabled>Up-Down</button>
    <button id="ss-btn-du" type="button" disabled>Down-Up</button>
    <button id="ss-btn-dd" type="button" disabled>Down-Down</button>
    <button id="ss-start-btn" type="button">Start</button>
    <button id="ss-stop-btn" type="button">Stop</button>
    <button id="ss-play-again-btn" type="button">Play Again</button>
    <button id="ss-return-btn" type="button">Return</button>
    <button id="ss-replay-btn" type="button" disabled>Replay</button>
  `;
  return wrapper;
}

// ── Plugin contract ───────────────────────────────────────────────────────────

describe('plugin contract', () => {
  test('exposes required lifecycle members', () => {
    expect(typeof plugin.name).toBe('string');
    expect(plugin.name.length).toBeGreaterThan(0);
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
    expect(typeof plugin.reset).toBe('function');
  });
});

// ── Main lifecycle ────────────────────────────────────────────────────────────

describe('sound-sweep plugin', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    const container = buildContainer();
    document.body.appendChild(container);
    plugin.init(container);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  // ── init ──────────────────────────────────────────────────────────────────

  it('init accepts a null container without throwing', () => {
    expect(() => plugin.init(null)).not.toThrow();
  });

  it('init calls game.initGame()', () => {
    expect(gameMock.initGame).toHaveBeenCalled();
  });

  // ── start ─────────────────────────────────────────────────────────────────

  it('start hides instructions and shows game area', () => {
    plugin.start();
    expect(document.querySelector('#ss-instructions').hidden).toBe(true);
    expect(document.querySelector('#ss-game-area').hidden).toBe(false);
  });

  it('start moves focus to #ss-status', () => {
    plugin.start();
    expect(document.activeElement).toBe(document.querySelector('#ss-status'));
    jest.clearAllTimers();
  });

  it('start clears feedback text', () => {
    // Simulate leftover feedback from a previous round
    document.querySelector('#ss-feedback').textContent = 'Old feedback';
    plugin.start();
    expect(document.querySelector('#ss-feedback').textContent).toBe('');
    jest.clearAllTimers();
  });

  it('start calls game.startGame()', () => {
    gameMock.startGame.mockClear();
    plugin.start();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('start calls playSweepPair for the first trial', () => {
    audioServiceMock.playSweepPair.mockClear();
    plugin.start();
    expect(audioServiceMock.playSweepPair).toHaveBeenCalled();
  });

  it('start calls playSweepPair with the picked sequence split into directions', () => {
    audioServiceMock.playSweepPair.mockClear();
    plugin.start();
    // pickSequence returns 'up-down' → split to ['up', 'down']
    expect(audioServiceMock.playSweepPair).toHaveBeenCalledWith(
      ['up', 'down'],
      expect.objectContaining({ sweepDurationMs: 200, isiMs: 200 }),
    );
  });

  it('response buttons are disabled during sweep playback', () => {
    plugin.start();
    expect(document.querySelector('#ss-btn-uu').disabled).toBe(true);
    jest.clearAllTimers();
  });

  it('response buttons become enabled after the post-sweep wait', () => {
    plugin.start();
    jest.runAllTimers();
    expect(document.querySelector('#ss-btn-uu').disabled).toBe(false);
    expect(document.querySelector('#ss-btn-ud').disabled).toBe(false);
    expect(document.querySelector('#ss-btn-du').disabled).toBe(false);
    expect(document.querySelector('#ss-btn-dd').disabled).toBe(false);
  });

  it('status shows "Listen..." during sweep playback', () => {
    plugin.start();
    expect(document.querySelector('#ss-status').textContent).toContain('Listen');
    jest.clearAllTimers();
  });

  it('status changes to response prompt after the wait', () => {
    plugin.start();
    jest.runAllTimers();
    const status = document.querySelector('#ss-status').textContent;
    expect(status).toMatch(/sequence/i);
  });

  // ── response via button clicks ────────────────────────────────────────────

  it('correct response (up-down) records a successful trial', () => {
    plugin.start();
    jest.runAllTimers();

    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-ud').click(); // 'up-down' matches mock

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('wrong response records a failed trial', () => {
    plugin.start();
    jest.runAllTimers();

    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-uu').click(); // 'up-up' ≠ 'up-down'

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it('down-up button click records a trial', () => {
    plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-du').click();
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('down-down button click records a trial', () => {
    plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-dd').click();
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('second button click during the same response phase is ignored', () => {
    plugin.start();
    jest.runAllTimers();

    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-ud').click();
    document.querySelector('#ss-btn-uu').click(); // should be ignored

    expect(gameMock.recordTrial).toHaveBeenCalledTimes(1);
  });

  it('button click before response phase is ignored', () => {
    plugin.start(); // buttons still disabled
    gameMock.recordTrial.mockClear();
    handleSequenceResponse('up-down');
    // _responseEnabled is false, so nothing should be recorded
    expect(gameMock.recordTrial).not.toHaveBeenCalled();
    jest.clearAllTimers();
  });

  // ── feedback ──────────────────────────────────────────────────────────────

  it('correct response announces "Correct!"', () => {
    plugin.start();
    jest.runAllTimers();
    document.querySelector('#ss-btn-ud').click();

    expect(document.querySelector('#ss-feedback').textContent).toContain('Correct');
  });

  it('wrong response announces the correct sequence', () => {
    plugin.start();
    jest.runAllTimers();
    document.querySelector('#ss-btn-uu').click();

    const feedback = document.querySelector('#ss-feedback').textContent;
    expect(feedback).toContain('Up');
    expect(feedback).toContain('Down');
  });

  it('playFeedbackSound is called with true for a correct response', () => {
    plugin.start();
    jest.runAllTimers();
    audioServiceMock.playFeedbackSound.mockClear();
    document.querySelector('#ss-btn-ud').click();
    expect(audioServiceMock.playFeedbackSound).toHaveBeenCalledWith(true);
  });

  it('playFeedbackSound is called with false for a wrong response', () => {
    plugin.start();
    jest.runAllTimers();
    audioServiceMock.playFeedbackSound.mockClear();
    document.querySelector('#ss-btn-uu').click();
    expect(audioServiceMock.playFeedbackSound).toHaveBeenCalledWith(false);
  });

  // ── inter-trial timer ─────────────────────────────────────────────────────

  it('inter-trial timer starts the next trial (pickSequence called again)', () => {
    gameMock.pickSequence.mockClear();
    plugin.start();
    jest.runAllTimers(); // advance to response phase

    document.querySelector('#ss-btn-ud').click();
    jest.runOnlyPendingTimers(); // inter-trial delay
    jest.runAllTimers();         // next sweep wait

    expect(gameMock.pickSequence).toHaveBeenCalledTimes(2);
  });

  it('next trial does not start when game is not running after response', () => {
    gameMock.isRunning
      .mockReturnValueOnce(true)   // start()
      .mockReturnValueOnce(true)   // startTrial guard
      .mockReturnValueOnce(false); // after response

    gameMock.pickSequence.mockClear();
    plugin.start();
    jest.runAllTimers();
    document.querySelector('#ss-btn-ud').click();
    jest.runOnlyPendingTimers();

    expect(gameMock.pickSequence).toHaveBeenCalledTimes(1);
  });

  // ── replay button ─────────────────────────────────────────────────────────

  it('replay button is enabled during response phase', () => {
    plugin.start();
    jest.runAllTimers();
    expect(document.querySelector('#ss-replay-btn').disabled).toBe(false);
  });

  it('replay button is disabled during sweep playback', () => {
    plugin.start();
    expect(document.querySelector('#ss-replay-btn').disabled).toBe(true);
    jest.clearAllTimers();
  });

  it('replay button calls playSweepPair again', () => {
    plugin.start();
    jest.runAllTimers();
    audioServiceMock.playSweepPair.mockClear();
    document.querySelector('#ss-replay-btn').click();
    expect(audioServiceMock.playSweepPair).toHaveBeenCalled();
  });

  // ── stop ──────────────────────────────────────────────────────────────────

  it('stop returns the result from game.stopGame()', () => {
    plugin.start();
    const result = plugin.stop();
    expect(result.score).toBe(4);
    expect(result.level).toBe(2);
    expect(result.trialsCompleted).toBe(7);
  });

  it('stop shows the end panel', () => {
    plugin.start();
    plugin.stop();
    expect(document.querySelector('#ss-end-panel').hidden).toBe(false);
    expect(document.querySelector('#ss-game-area').hidden).toBe(true);
  });

  it('stop populates end panel with result values', () => {
    plugin.start();
    plugin.stop();
    expect(document.querySelector('#ss-final-level').textContent).toBe('3'); // level+1
    expect(document.querySelector('#ss-final-score').textContent).toBe('4');
    expect(document.querySelector('#ss-final-trials').textContent).toBe('7');
  });

  it('stop calls saveScore when trialsCompleted > 0', () => {
    plugin.start();
    plugin.stop();
    expect(scoreServiceMock.saveScore).toHaveBeenCalledWith(
      'sound-sweep',
      expect.objectContaining({ score: 4, level: 2, sessionDurationMs: 0 }),
    );
  });

  it('stop does not call saveScore when trialsCompleted is 0', () => {
    gameMock.isRunning.mockReturnValueOnce(false);
    gameMock.getTrialsCompleted.mockReturnValueOnce(0);
    scoreServiceMock.saveScore.mockClear();

    plugin.stop();
    expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
  });

  it('stop returns idle result when game is not running', () => {
    gameMock.isRunning.mockReturnValueOnce(false);
    const result = plugin.stop();
    expect(result.score).toBe(4);
    expect(result.level).toBe(2);
  });

  it('stop cancels the pending sweep-wait timer', () => {
    plugin.start();
    // Wait timer is pending (sweep not done yet).
    plugin.stop();
    expect(document.querySelector('#ss-end-panel').hidden).toBe(false);
  });

  // ── reset ─────────────────────────────────────────────────────────────────

  it('reset returns to the instructions state', () => {
    plugin.start();
    plugin.stop();
    plugin.reset();

    expect(document.querySelector('#ss-instructions').hidden).toBe(false);
    expect(document.querySelector('#ss-game-area').hidden).toBe(true);
    expect(document.querySelector('#ss-end-panel').hidden).toBe(true);
  });

  it('reset clears the feedback text', () => {
    plugin.start();
    jest.runAllTimers();
    document.querySelector('#ss-btn-ud').click();
    plugin.reset();
    expect(document.querySelector('#ss-feedback').textContent).toBe('');
  });

  it('reset calls game.initGame()', () => {
    gameMock.initGame.mockClear();
    plugin.reset();
    expect(gameMock.initGame).toHaveBeenCalled();
  });

  it('reset resets the session timer display', () => {
    plugin.start();
    plugin.reset();
    expect(document.querySelector('#ss-session-timer').textContent).toBe('00:00');
  });

  // ── keyboard handler ──────────────────────────────────────────────────────

  it('handleKeyDown ignores non-digit keys', () => {
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: 'ArrowUp', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).not.toHaveBeenCalled();
  });

  it('handleKeyDown key 1 maps to up-up', () => {
    plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '1', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }), // 'up-up' ≠ 'up-down'
    );
  });

  it('handleKeyDown key 2 maps to up-down (correct sequence)', () => {
    plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '2', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('handleKeyDown key 3 maps to down-up', () => {
    plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '3', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('handleKeyDown key 4 maps to down-down', () => {
    plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '4', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('handleKeyDown during sweep phase does not record a trial', () => {
    plugin.start(); // response not yet enabled
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '2', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).not.toHaveBeenCalled();
    jest.clearAllTimers();
  });

  it('calling init() multiple times does not accumulate keydown handlers', () => {
    // Re-initialise twice more to simulate returning to the game multiple times.
    const container = buildContainer();
    document.body.appendChild(container);
    plugin.init(container);
    plugin.init(container);

    // Advance to response phase.
    plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();

    // Dispatch a real DOM keydown event — should fire only once even though
    // init() was called multiple times.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(gameMock.recordTrial).toHaveBeenCalledTimes(1);
    jest.clearAllTimers();
  });

  // ── button click wiring ───────────────────────────────────────────────────

  it('start button click starts the game', () => {
    gameMock.startGame.mockClear();
    document.querySelector('#ss-start-btn').click();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('stop button click ends the game', () => {
    plugin.start();
    gameMock.stopGame.mockClear();
    document.querySelector('#ss-stop-btn').click();
    expect(gameMock.stopGame).toHaveBeenCalled();
  });

  it('play again button resets and starts a new session', () => {
    plugin.stop();
    gameMock.startGame.mockClear();
    document.querySelector('#ss-play-again-btn').click();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('return button dispatches bsx:return-to-main-menu event', () => {
    let fired = false;
    window.addEventListener('bsx:return-to-main-menu', () => { fired = true; }, { once: true });
    document.querySelector('#ss-return-btn').click();
    expect(fired).toBe(true);
  });

  // ── exported helpers ──────────────────────────────────────────────────────

  it('announce writes text to status element only', () => {
    announce('test message');
    expect(document.querySelector('#ss-status').textContent).toBe('test message');
    // feedback element is not written by announce(); it stays empty
    expect(document.querySelector('#ss-feedback').textContent).toBe('');
  });

  it('updateStats populates all stat elements', () => {
    updateStats();
    expect(document.querySelector('#ss-level').textContent).toBe('3'); // level+1
    expect(document.querySelector('#ss-score').textContent).toBe('4');
    expect(document.querySelector('#ss-trials').textContent).toBe('7');
    expect(document.querySelector('#ss-streak').textContent).toBe('1');
  });

  it('handleSequenceResponse with correct sequence updates stats', () => {
    plugin.start();
    jest.runAllTimers();
    gameMock.getScore.mockReturnValueOnce(5);

    handleSequenceResponse('up-down');
    expect(document.querySelector('#ss-score').textContent).toBe('5');
  });
});

// ── Null-guard paths (empty container) ───────────────────────────────────────
// These tests exercise the false branches of all the `if (element)` guards
// by initialising the plugin with an empty container that has no children.

describe('null-guard paths — empty container', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    plugin.init(document.createElement('div'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('announce does not throw when feedback/status elements are absent', () => {
    expect(() => announce('hello')).not.toThrow();
  });

  it('updateStats does not throw when stat elements are absent', () => {
    expect(() => updateStats()).not.toThrow();
  });

  it('start does not throw when game-area / instructions elements are absent', () => {
    expect(() => plugin.start()).not.toThrow();
    jest.clearAllTimers();
  });

  it('stop does not throw when end-panel elements are absent', () => {
    plugin.start();
    expect(() => plugin.stop()).not.toThrow();
  });

  it('reset does not throw when all optional elements are absent', () => {
    expect(() => plugin.reset()).not.toThrow();
  });

  it('handleSequenceResponse does not throw when feedback element is absent', () => {
    plugin.start();
    jest.runAllTimers();
    expect(() => handleSequenceResponse('up-down')).not.toThrow();
    jest.clearAllTimers();
  });
});

// ── replayCurrentSweep before any trial ──────────────────────────────────────

describe('replay before trial starts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    const container = buildContainer();
    document.body.appendChild(container);
    plugin.init(container);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('clicking replay before any trial does not call playSweepPair', () => {
    // Reset so _currentSequence is null, then click replay.
    plugin.reset();
    audioServiceMock.playSweepPair.mockClear();
    document.querySelector('#ss-replay-btn').click();
    expect(audioServiceMock.playSweepPair).not.toHaveBeenCalled();
  });
});
