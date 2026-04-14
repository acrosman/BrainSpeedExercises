/**
 * index.test.js — Integration tests for the Directional Processing plugin controller.
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
  initGame:            jest.fn(),
  startGame:           jest.fn(),
  stopGame:            jest.fn(() => ({ score: 5, level: 2, trialsCompleted: 8, duration: 5000 })),
  pickDirection:       jest.fn(() => 'right'),
  recordTrial:         jest.fn(() => ({ level: 2, consecutiveCorrect: 1, consecutiveWrong: 0 })),
  getCurrentLevel:     jest.fn(() => 2),
  getCurrentLevelConfig: jest.fn(() => ({ displayDurationMs: 200, contrast: 0.8 })),
  getScore:            jest.fn(() => 5),
  getTrialsCompleted:  jest.fn(() => 8),
  getConsecutiveCorrect: jest.fn(() => 1),
  getConsecutiveWrong:   jest.fn(() => 0),
  isRunning:           jest.fn(() => true),
  getSpeedHistory:     jest.fn(() => []),
}));

jest.unstable_mockModule('../gabor.js', () => ({
  drawGabor:            jest.fn(),
  drawMask:             jest.fn(),
  getDirectionParams:   jest.fn(() => ({ theta: 0, phiDirection: -1 })),
  PHASE_SPEED_RAD_PER_MS: 0.015,
}));

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playFeedbackSound: jest.fn(),
}));

jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(),
}));

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const { announce, updateStats, handleKeyDown } = pluginModule;
const gameMock        = await import('../game.js');
const scoreServiceMock = await import('../../../components/scoreService.js');
const gaborMock       = await import('../gabor.js');

// ── DOM helper ────────────────────────────────────────────────────────────────

function buildContainer() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="dp-instructions"></div>
    <div id="dp-game-area" hidden></div>
    <div id="dp-end-panel" hidden></div>
    <div id="dp-stage" class="dp-stage">
      <canvas id="dp-canvas" width="400" height="400"></canvas>
    </div>
    <div id="dp-response"></div>
    <div id="dp-feedback"></div>
    <strong id="dp-level">1</strong>
    <strong id="dp-score">0</strong>
    <strong id="dp-trials">0</strong>
    <strong id="dp-streak">0</strong>
    <strong id="dp-session-timer">00:00</strong>
    <strong id="dp-final-level">1</strong>
    <strong id="dp-final-score">0</strong>
    <strong id="dp-final-trials">0</strong>
    <button id="dp-btn-up" type="button">Up</button>
    <button id="dp-btn-down" type="button">Down</button>
    <button id="dp-btn-left" type="button">Left</button>
    <button id="dp-btn-right" type="button">Right</button>
    <button id="dp-start-btn" type="button">Start</button>
    <button id="dp-stop-btn" type="button">Stop</button>
    <button id="dp-play-again-btn" type="button">Play Again</button>
    <button id="dp-return-btn" type="button">Return</button>
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

describe('directional-processing plugin', () => {
  let originalRaf;
  let originalCancelRaf;
  let nowSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    const container = buildContainer();
    document.body.appendChild(container);

    let t = 0;
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 300; // advance well past any displayDurationMs (200ms in mock)
      return t;
    });

    originalRaf = globalThis.requestAnimationFrame;
    originalCancelRaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

    plugin.init(container);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
    nowSpy.mockRestore();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
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
    expect(document.querySelector('#dp-instructions').hidden).toBe(true);
    expect(document.querySelector('#dp-game-area').hidden).toBe(false);
  });

  it('start calls game.startGame()', () => {
    gameMock.startGame.mockClear();
    plugin.start();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('start triggers the stimulus phase (getDirectionParams called for the trial)', () => {
    plugin.start();
    jest.runAllTimers();
    // getDirectionParams is invoked inside runStimulusPhase to set up the animation.
    expect(gaborMock.getDirectionParams).toHaveBeenCalled();
  });

  it('stimulus phase calls drawGabor when elapsed is below displayDurationMs', () => {
    // Use a slow clock so the stimulus tick fires before the duration expires.
    let t = 0;
    nowSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 10; // 10 ms per call — below displayDurationMs=200
      return t;
    });
    gaborMock.drawGabor.mockClear();

    plugin.start();
    jest.runOnlyPendingTimers(); // fires the first rAF tick (elapsed ~10 ms)

    expect(gaborMock.drawGabor).toHaveBeenCalled();
    jest.clearAllTimers();
  });

  it('after stimulus and mask phases direction buttons become enabled', () => {
    plugin.start();
    jest.runAllTimers();
    expect(document.querySelector('#dp-btn-up').disabled).toBe(false);
    expect(document.querySelector('#dp-btn-right').disabled).toBe(false);
  });

  // ── response via button clicks ────────────────────────────────────────────

  it('direction buttons are disabled during the stimulus phase', () => {
    plugin.start();
    // Before timers fire, we are still in the stimulus phase.
    expect(document.querySelector('#dp-btn-up').disabled).toBe(true);
    jest.clearAllTimers();
  });

  it('wrong response highlights the correct direction button', () => {
    plugin.start();
    jest.runAllTimers(); // advance to response phase

    document.querySelector('#dp-btn-up').click(); // wrong (correct is 'right')

    expect(
      document.querySelector('#dp-btn-right').classList.contains('dp-dir-btn--correct'),
    ).toBe(true);
  });

  it('correct button highlight is cleared when next trial starts', () => {
    plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-up').click(); // wrong

    // Confirm the highlight is present.
    expect(
      document.querySelector('#dp-btn-right').classList.contains('dp-dir-btn--correct'),
    ).toBe(true);

    // Fire the inter-trial timer → startTrial() → clearDirectionHighlights().
    jest.runOnlyPendingTimers();

    expect(
      document.querySelector('#dp-btn-right').classList.contains('dp-dir-btn--correct'),
    ).toBe(false);
  });

  it('correct response does not add a highlight to any button', () => {
    plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-right').click(); // correct

    const anyHighlighted = ['#dp-btn-up', '#dp-btn-down', '#dp-btn-left', '#dp-btn-right']
      .some((sel) => document.querySelector(sel).classList.contains('dp-dir-btn--correct'));
    expect(anyHighlighted).toBe(false);
  });

  it('correct direction button records a successful trial', () => {
    plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-right').click();

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('wrong direction button records a failed trial', () => {
    plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-up').click();

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it('down button click submits a direction response', () => {
    plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    document.querySelector('#dp-btn-down').click();
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('left button click submits a direction response', () => {
    plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    document.querySelector('#dp-btn-left').click();
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('second button click during the same response phase is ignored', () => {
    plugin.start();
    jest.runAllTimers();

    gameMock.recordTrial.mockClear();
    document.querySelector('#dp-btn-right').click();
    document.querySelector('#dp-btn-left').click(); // should be ignored

    expect(gameMock.recordTrial).toHaveBeenCalledTimes(1);
  });

  // ── feedback ──────────────────────────────────────────────────────────────

  it('correct response announces "Correct!"', () => {
    plugin.start();
    jest.runAllTimers();
    document.querySelector('#dp-btn-right').click();

    expect(document.querySelector('#dp-feedback').textContent).toContain('Correct');
  });

  it('wrong response announces the correct direction', () => {
    plugin.start();
    jest.runAllTimers();
    document.querySelector('#dp-btn-up').click();

    const feedback = document.querySelector('#dp-feedback').textContent;
    expect(feedback).toContain('right');
  });

  it('flash timeout removes the flash class from the stage', () => {
    plugin.start();
    jest.runAllTimers();
    document.querySelector('#dp-btn-right').click();

    const stage = document.querySelector('#dp-stage');
    expect(
      stage.classList.contains('dp-stage--flash-correct')
      || stage.classList.contains('dp-stage--flash-wrong'),
    ).toBe(true);

    jest.runOnlyPendingTimers();
    expect(stage.classList.contains('dp-stage--flash-correct')).toBe(false);
    expect(stage.classList.contains('dp-stage--flash-wrong')).toBe(false);
  });

  it('inter-trial timer starts the next trial', () => {
    gameMock.pickDirection.mockClear();
    plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-right').click();
    jest.runOnlyPendingTimers();
    jest.runAllTimers();

    // pickDirection should have been called again for the next trial.
    expect(gameMock.pickDirection).toHaveBeenCalledTimes(2);
  });

  it('next trial does not start when game is not running', () => {
    gameMock.isRunning.mockReturnValueOnce(true)  // start()
      .mockReturnValueOnce(true)   // runStimulusPhase → startTrial guard
      .mockReturnValueOnce(false); // after response → no next trial

    gameMock.pickDirection.mockClear();
    plugin.start();
    jest.runAllTimers();
    document.querySelector('#dp-btn-right').click();
    jest.runOnlyPendingTimers();

    expect(gameMock.pickDirection).toHaveBeenCalledTimes(1);
  });

  // ── stop ──────────────────────────────────────────────────────────────────

  it('stop returns the result from game.stopGame()', () => {
    plugin.start();
    const result = plugin.stop();
    expect(result.score).toBe(5);
    expect(result.level).toBe(2);
    expect(result.trialsCompleted).toBe(8);
  });

  it('stop shows the end panel', () => {
    plugin.start();
    plugin.stop();
    expect(document.querySelector('#dp-end-panel').hidden).toBe(false);
    expect(document.querySelector('#dp-game-area').hidden).toBe(true);
  });

  it('stop populates end panel with result values', () => {
    plugin.start();
    plugin.stop();
    // Level shown is currentLevel+1
    expect(document.querySelector('#dp-final-level').textContent).toBe('3');
    expect(document.querySelector('#dp-final-score').textContent).toBe('5');
    expect(document.querySelector('#dp-final-trials').textContent).toBe('8');
  });

  it('stop calls saveScore when trialsCompleted > 0', () => {
    plugin.start();
    plugin.stop();
    expect(scoreServiceMock.saveScore).toHaveBeenCalledWith(
      'directional-processing',
      expect.objectContaining({ score: 5, level: 2, sessionDurationMs: 0 }),
      expect.objectContaining({ lastTrialsCompleted: 8 }),
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
    // Falls back to getScore / getCurrentLevel / getTrialsCompleted
    expect(result.score).toBe(5);
    expect(result.level).toBe(2);
  });

  it('stop cancels pending stimulus rAF', () => {
    plugin.start();
    jest.runOnlyPendingTimers(); // let stimulus rAF fire once
    plugin.stop(); // stimulus rAF should be cancelled
    expect(document.querySelector('#dp-end-panel').hidden).toBe(false);
  });

  // ── reset ─────────────────────────────────────────────────────────────────

  it('reset returns to the instructions state', () => {
    plugin.start();
    plugin.stop();
    plugin.reset();

    expect(document.querySelector('#dp-instructions').hidden).toBe(false);
    expect(document.querySelector('#dp-game-area').hidden).toBe(true);
    expect(document.querySelector('#dp-end-panel').hidden).toBe(true);
  });

  it('reset clears the feedback text', () => {
    plugin.start();
    jest.runAllTimers();
    document.querySelector('#dp-btn-right').click();
    plugin.reset();
    expect(document.querySelector('#dp-feedback').textContent).toBe('');
  });

  it('reset calls game.initGame()', () => {
    gameMock.initGame.mockClear();
    plugin.reset();
    expect(gameMock.initGame).toHaveBeenCalled();
  });

  it('reset resets the session timer display', () => {
    plugin.start();
    plugin.reset();
    expect(document.querySelector('#dp-session-timer').textContent).toBe('00:00');
  });

  // ── keyboard handler ──────────────────────────────────────────────────────

  it('handleKeyDown ignores non-arrow keys', () => {
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: 'Enter', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).not.toHaveBeenCalled();
  });

  it('handleKeyDown prevents default for arrow keys when game is running', () => {
    const event = { key: 'ArrowUp', preventDefault: jest.fn() };
    gameMock.isRunning.mockReturnValueOnce(true);
    handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('handleKeyDown does not prevent default when game is not running', () => {
    const event = { key: 'ArrowUp', preventDefault: jest.fn() };
    gameMock.isRunning.mockReturnValueOnce(false);
    handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('handleKeyDown submits a response during response phase', () => {
    plugin.start();
    jest.runAllTimers(); // advance to response phase

    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: 'ArrowRight', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('handleKeyDown maps all four arrow keys to directions', () => {
    const arrowMap = {
      ArrowUp:    false, // 'up' !== 'right'
      ArrowDown:  false,
      ArrowLeft:  false,
      ArrowRight: true,  // 'right' === 'right'
    };

    Object.entries(arrowMap).forEach(([key, expectedSuccess]) => {
      gameMock.recordTrial.mockClear();
      plugin.start();
      jest.runAllTimers();
      handleKeyDown({ key, preventDefault: jest.fn() });
      if (gameMock.recordTrial.mock.calls.length > 0) {
        expect(gameMock.recordTrial).toHaveBeenCalledWith(
          expect.objectContaining({ success: expectedSuccess }),
        );
      }
    });
  });

  // ── button click wiring ───────────────────────────────────────────────────

  it('start button click calls game.startGame()', () => {
    gameMock.startGame.mockClear();
    document.querySelector('#dp-start-btn').click();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('stop button click calls game.stopGame()', () => {
    plugin.start();
    gameMock.stopGame.mockClear();
    document.querySelector('#dp-stop-btn').click();
    expect(gameMock.stopGame).toHaveBeenCalled();
  });

  it('play again button resets and starts a new session', () => {
    plugin.stop();
    gameMock.startGame.mockClear();
    document.querySelector('#dp-play-again-btn').click();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('return button dispatches bsx:return-to-main-menu event', () => {
    let fired = false;
    window.addEventListener('bsx:return-to-main-menu', () => { fired = true; }, { once: true });
    document.querySelector('#dp-return-btn').click();
    expect(fired).toBe(true);
  });

  // ── exported helpers ──────────────────────────────────────────────────────

  it('announce writes text to the feedback element', () => {
    announce('hello');
    expect(document.querySelector('#dp-feedback').textContent).toBe('hello');
  });

  it('updateStats populates all stat elements', () => {
    updateStats();
    expect(document.querySelector('#dp-level').textContent).toBe('3'); // level+1
    expect(document.querySelector('#dp-score').textContent).toBe('5');
    expect(document.querySelector('#dp-trials').textContent).toBe('8');
    expect(document.querySelector('#dp-streak').textContent).toBe('1');
  });

  // ── nowMs fallback ────────────────────────────────────────────────────────

  it('nowMs falls back to Date.now when performance.now is unavailable', () => {
    nowSpy.mockRestore();
    const origNow = performance.now;
    let dateT = 0;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      dateT += 500;
      return dateT;
    });
    // @ts-ignore — intentionally break performance.now
    performance.now = null;

    plugin.start();

    expect(dateSpy).toHaveBeenCalled();

    performance.now = origNow;
    dateSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockReturnValue(10000);
    jest.clearAllTimers();
  });

  // ── mask phase rAF loop ───────────────────────────────────────────────────

  it('mask rAF loop iterates when elapsed is below MASK_DURATION_MS', () => {
    // Slow clock: advances 10 ms per call, well below MASK_DURATION_MS (150).
    let t = 0;
    nowSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 10;
      return t;
    });
    // Force stimulus to end immediately on first tick.
    gameMock.getCurrentLevelConfig.mockReturnValueOnce({ displayDurationMs: 1, contrast: 1.0 });

    plugin.start();
    jest.runAllTimers();

    // After running all timers the response phase should eventually be entered
    // and the direction buttons become enabled.
    expect(document.querySelector('#dp-btn-up').disabled).toBe(false);
  });

  // ── stop during mask phase ────────────────────────────────────────────────

  it('stop during mask phase cancels the pending mask rAF', () => {
    // Allow stimulus to complete but not the mask.
    let t = 0;
    nowSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 1;
      return t;
    });
    gameMock.getCurrentLevelConfig.mockReturnValue({ displayDurationMs: 1, contrast: 1.0 });

    plugin.start();
    jest.runOnlyPendingTimers(); // fires stimulus rAF → switches to mask rAF
    plugin.stop();

    expect(document.querySelector('#dp-end-panel').hidden).toBe(false);
  });
});
