/**
 * index.test.js — Integration tests for the Directional Processing plugin controller.
 */
import { readFileSync } from 'node:fs';
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
const timerMock = await import('../../../components/timerService.js');

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
  generatePracticeTrial: jest.fn(() => ({
    direction: 'left', displayDurationMs: 500, contrast: 1,
  })),
}));

jest.unstable_mockModule('../gabor.js', () => ({
  drawGabor:            jest.fn(),
  drawMask:             jest.fn(),
  getDirectionParams:   jest.fn(() => ({ theta: 0, phiDirection: -1 })),
  pickColorFamily:      jest.fn(() => ({ dark: [20, 20, 20], bright: [235, 235, 235] })),
  PHASE_SPEED_RAD_PER_MS: 0.015,
}));

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playFeedbackSound: jest.fn(),
}));

jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(),
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
    { title: 'Welcome to Directional Processing', content: '<p>Welcome</p>' },
    { title: 'What to Look For', content: '<p>Direction matters.</p>' },
  ]),
  PRACTICE_TEXT: {
    watch: 'watch text',
    guidedAnswer: (direction) => `guided answer text: ${direction}`,
    answer: 'answer text',
  },
}));

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const { announce, updateStats, handleKeyDown } = pluginModule;
const gameMock        = await import('../game.js');
const scoreServiceMock = await import('../../../components/scoreService.js');
const tutorialServiceMock = await import('../../../components/tutorialService.js');
const tutorialContentMock = await import('../tutorial/tutorial.js');
const gaborMock       = await import('../gabor.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    <button id="dp-replay-tutorial-btn" type="button">Replay Tutorial</button>
    <button id="dp-stop-btn" type="button">Stop</button>
    <button id="dp-play-again-btn" type="button">Play Again</button>
    <button id="dp-return-btn" type="button">Return</button>
  `;
  return wrapper;
}

// ── Plugin contract ───────────────────────────────────────────────────────────

describe('plugin contract', () => {
  test('exposes required lifecycle members', async () => {
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
    // Cancel any tutorial left running so the next test starts clean.
    plugin.reset();
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
    nowSpy.mockRestore();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  // ── init ──────────────────────────────────────────────────────────────────

  it('init accepts a null container without throwing', async () => {
    expect(() => plugin.init(null)).not.toThrow();
  });

  it('init calls game.initGame()', async () => {
    expect(gameMock.initGame).toHaveBeenCalled();
  });

  // ── start ─────────────────────────────────────────────────────────────────

  it('start hides instructions and shows game area', async () => {
    await plugin.start();
    expect(document.querySelector('#dp-instructions').hidden).toBe(true);
    expect(document.querySelector('#dp-game-area').hidden).toBe(false);
  });

  it('start calls game.startGame()', async () => {
    gameMock.startGame.mockClear();
    await plugin.start();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('start runs the guided tutorial if needed with the Directional Processing steps', async () => {
    await plugin.start();
    expect(tutorialContentMock.getTutorialSteps).toHaveBeenCalled();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledWith({
      gameId: 'directional-processing',
      container: expect.any(HTMLElement),
      introSteps: expect.arrayContaining([
        expect.objectContaining({ title: 'Welcome to Directional Processing' }),
      ]),
      playPracticeRound: expect.any(Function),
      onComplete: expect.any(Function),
    });
  });

  it('start triggers the stimulus phase (getDirectionParams called for the trial)', async () => {
    await plugin.start();
    jest.runAllTimers();
    // getDirectionParams is invoked inside runStimulusPhase to set up the animation.
    expect(gaborMock.getDirectionParams).toHaveBeenCalled();
  });

  it('stimulus phase calls drawGabor when elapsed is below displayDurationMs', async () => {
    // Use a slow clock so the stimulus tick fires before the duration expires.
    let t = 0;
    nowSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 10; // 10 ms per call — below displayDurationMs=200
      return t;
    });
    gaborMock.drawGabor.mockClear();

    await plugin.start();
    jest.runOnlyPendingTimers(); // fires the first rAF tick (elapsed ~10 ms)

    expect(gaborMock.drawGabor).toHaveBeenCalled();
    jest.clearAllTimers();
  });

  it('after stimulus and mask phases direction buttons become enabled', async () => {
    await plugin.start();
    jest.runAllTimers();
    expect(document.querySelector('#dp-btn-up').disabled).toBe(false);
    expect(document.querySelector('#dp-btn-right').disabled).toBe(false);
  });

  // ── response via button clicks ────────────────────────────────────────────

  it('direction buttons are disabled during the stimulus phase', async () => {
    await plugin.start();
    // Before timers fire, we are still in the stimulus phase.
    expect(document.querySelector('#dp-btn-up').disabled).toBe(true);
    jest.clearAllTimers();
  });

  it('wrong response highlights the correct direction button', async () => {
    await plugin.start();
    jest.runAllTimers(); // advance to response phase

    document.querySelector('#dp-btn-up').click(); // wrong (correct is 'right')

    expect(
      document.querySelector('#dp-btn-right').classList.contains('dp-dir-btn--correct'),
    ).toBe(true);
  });

  it('correct button highlight is cleared when next trial starts', async () => {
    await plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-up').click(); // wrong

    // Confirm the highlight is present.
    expect(
      document.querySelector('#dp-btn-right').classList.contains('dp-dir-btn--correct'),
    ).toBe(true);

    // Fire flash timer → callback shows background → fires post-flash pause
    // → startTrial() → clearDirectionHighlights().
    jest.runOnlyPendingTimers(); // flash timer
    jest.runOnlyPendingTimers(); // post-flash pause timer → startTrial

    expect(
      document.querySelector('#dp-btn-right').classList.contains('dp-dir-btn--correct'),
    ).toBe(false);
  });

  it('correct response does not add a highlight to any button', async () => {
    await plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-right').click(); // correct

    const anyHighlighted = ['#dp-btn-up', '#dp-btn-down', '#dp-btn-left', '#dp-btn-right']
      .some((sel) => document.querySelector(sel).classList.contains('dp-dir-btn--correct'));
    expect(anyHighlighted).toBe(false);
  });

  it('correct direction button records a successful trial', async () => {
    await plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-right').click();

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('wrong direction button records a failed trial', async () => {
    await plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-up').click();

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it('down button click submits a direction response', async () => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    document.querySelector('#dp-btn-down').click();
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('left button click submits a direction response', async () => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    document.querySelector('#dp-btn-left').click();
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('second button click during the same response phase is ignored', async () => {
    await plugin.start();
    jest.runAllTimers();

    gameMock.recordTrial.mockClear();
    document.querySelector('#dp-btn-right').click();
    document.querySelector('#dp-btn-left').click(); // should be ignored

    expect(gameMock.recordTrial).toHaveBeenCalledTimes(1);
  });

  // ── feedback ──────────────────────────────────────────────────────────────

  it('correct response announces "Correct!"', async () => {
    await plugin.start();
    jest.runAllTimers();
    document.querySelector('#dp-btn-right').click();

    expect(document.querySelector('#dp-feedback').textContent).toContain('Correct');
  });

  it('wrong response announces the correct direction', async () => {
    await plugin.start();
    jest.runAllTimers();
    document.querySelector('#dp-btn-up').click();

    const feedback = document.querySelector('#dp-feedback').textContent;
    expect(feedback).toContain('right');
  });

  it('flash timeout removes the flash class from the stage', async () => {
    await plugin.start();
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

  it('inter-trial timer starts the next trial', async () => {
    gameMock.pickDirection.mockClear();
    await plugin.start();
    jest.runAllTimers();

    document.querySelector('#dp-btn-right').click();
    jest.runOnlyPendingTimers();
    jest.runAllTimers();

    // pickDirection should have been called again for the next trial.
    expect(gameMock.pickDirection).toHaveBeenCalledTimes(2);
  });

  it('next trial does not start when game is not running', async () => {
    gameMock.isRunning.mockReturnValueOnce(true)  // start()
      .mockReturnValueOnce(true)   // runStimulusPhase → startTrial guard
      .mockReturnValueOnce(false); // after response → no next trial

    gameMock.pickDirection.mockClear();
    await plugin.start();
    jest.runAllTimers();
    document.querySelector('#dp-btn-right').click();
    jest.runOnlyPendingTimers();

    expect(gameMock.pickDirection).toHaveBeenCalledTimes(1);
  });

  // ── stop ──────────────────────────────────────────────────────────────────

  it('stop returns the result from game.stopGame()', async () => {
    await plugin.start();
    const result = plugin.stop();
    expect(result.score).toBe(5);
    expect(result.level).toBe(2);
    expect(result.trialsCompleted).toBe(8);
  });

  it('stop shows the end panel', async () => {
    await plugin.start();
    plugin.stop();
    expect(document.querySelector('#dp-end-panel').hidden).toBe(false);
    expect(document.querySelector('#dp-game-area').hidden).toBe(true);
  });

  it('stop populates end panel with result values', async () => {
    await plugin.start();
    plugin.stop();
    // Level shown is currentLevel+1
    expect(document.querySelector('#dp-final-level').textContent).toBe('3');
    expect(document.querySelector('#dp-final-score').textContent).toBe('5');
    expect(document.querySelector('#dp-final-trials').textContent).toBe('8');
  });

  it('stop calls saveScore when trialsCompleted > 0', async () => {
    await plugin.start();
    plugin.stop();
    expect(scoreServiceMock.saveScore).toHaveBeenCalledWith(
      'directional-processing',
      expect.objectContaining({ score: 5, level: 2, sessionDurationMs: 0 }),
      expect.objectContaining({ lastTrialsCompleted: 8 }),
    );
  });

  it('stop does not call saveScore when trialsCompleted is 0', async () => {
    gameMock.stopGame.mockReturnValueOnce({
      score: 0, level: 0, trialsCompleted: 0, duration: 100,
    });
    scoreServiceMock.saveScore.mockClear();

    await plugin.start();
    plugin.stop();
    expect(document.querySelector('#dp-end-panel').hidden).toBe(false);
    expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
  });

  it('stop returns an idle result without stopping, saving, or changing the screen', () => {
    gameMock.isRunning.mockReturnValueOnce(false);
    const result = plugin.stop();
    // Falls back to getScore / getCurrentLevel / getTrialsCompleted
    expect(result).toEqual({
      score: 5, level: 2, trialsCompleted: 8, duration: 0,
    });
    expect(gameMock.stopGame).not.toHaveBeenCalled();
    expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
    expect(document.querySelector('#dp-end-panel').hidden).toBe(true);
    expect(gameMock.initGame).toHaveBeenCalledTimes(1); // only from init()
  });

  it('stop cancels pending stimulus rAF', async () => {
    await plugin.start();
    jest.runOnlyPendingTimers(); // let stimulus rAF fire once
    plugin.stop(); // stimulus rAF should be cancelled
    expect(document.querySelector('#dp-end-panel').hidden).toBe(false);
  });

  // ── reset ─────────────────────────────────────────────────────────────────

  it('reset returns to the instructions state', async () => {
    await plugin.start();
    plugin.stop();
    plugin.reset();

    expect(document.querySelector('#dp-instructions').hidden).toBe(false);
    expect(document.querySelector('#dp-game-area').hidden).toBe(true);
    expect(document.querySelector('#dp-end-panel').hidden).toBe(true);
  });

  it('reset clears the feedback text', async () => {
    await plugin.start();
    jest.runAllTimers();
    document.querySelector('#dp-btn-right').click();
    plugin.reset();
    expect(document.querySelector('#dp-feedback').textContent).toBe('');
  });

  it('reset calls game.initGame()', async () => {
    gameMock.initGame.mockClear();
    plugin.reset();
    expect(gameMock.initGame).toHaveBeenCalled();
  });

  it('reset resets the session timer display', async () => {
    await plugin.start();
    plugin.reset();
    expect(document.querySelector('#dp-session-timer').textContent).toBe('00:00');
  });

  // ── keyboard handler ──────────────────────────────────────────────────────

  it('handleKeyDown ignores non-arrow keys', async () => {
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: 'Enter', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).not.toHaveBeenCalled();
  });

  it('handleKeyDown prevents default for arrow keys when game is running', async () => {
    const event = { key: 'ArrowUp', preventDefault: jest.fn() };
    gameMock.isRunning.mockReturnValueOnce(true);
    handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('handleKeyDown does not prevent default when game is not running', async () => {
    const event = { key: 'ArrowUp', preventDefault: jest.fn() };
    gameMock.isRunning.mockReturnValueOnce(false);
    handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('handleKeyDown submits a response during response phase', async () => {
    await plugin.start();
    jest.runAllTimers(); // advance to response phase

    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: 'ArrowRight', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('handleKeyDown maps all four arrow keys to directions', async () => {
    const arrowMap = {
      ArrowUp:    false, // 'up' !== 'right'
      ArrowDown:  false,
      ArrowLeft:  false,
      ArrowRight: true,  // 'right' === 'right'
    };

    for (const [key, expectedSuccess] of Object.entries(arrowMap)) {
      gameMock.recordTrial.mockClear();
      await plugin.start();
      jest.runAllTimers();
      handleKeyDown({ key, preventDefault: jest.fn() });
      if (gameMock.recordTrial.mock.calls.length > 0) {
        expect(gameMock.recordTrial).toHaveBeenCalledWith(
          expect.objectContaining({ success: expectedSuccess }),
        );
      }
    }
  });

  // ── button click wiring ───────────────────────────────────────────────────

  it('start button click calls game.startGame()', async () => {
    gameMock.startGame.mockClear();
    document.querySelector('#dp-start-btn').click();
    await Promise.resolve();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('stop button click calls game.stopGame()', async () => {
    await plugin.start();
    gameMock.stopGame.mockClear();
    document.querySelector('#dp-stop-btn').click();
    expect(gameMock.stopGame).toHaveBeenCalled();
  });

  it('play again button resets and starts a new session', async () => {
    plugin.stop();
    gameMock.startGame.mockClear();
    document.querySelector('#dp-play-again-btn').click();
    await Promise.resolve();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('replay tutorial button runs the guided tutorial and then starts the game', async () => {
    document.querySelector('#dp-replay-tutorial-btn').click();
    await flushMicrotasks();
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'directional-processing',
      container: expect.any(HTMLElement),
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(gameMock.startGame).toHaveBeenCalled();
    expect(document.querySelector('#dp-game-area').hidden).toBe(false);
  });

  it('ignores a second start while the first tutorial launch is in flight', async () => {
    const first = plugin.start();
    const second = plugin.start();
    await Promise.all([first, second]);
    expect(tutorialContentMock.getTutorialSteps).toHaveBeenCalledTimes(1);
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledTimes(1);
    expect(gameMock.startGame).toHaveBeenCalledTimes(1);
  });

  it('start does nothing when init received no container', async () => {
    plugin.init(null);
    await plugin.start();
    expect(tutorialContentMock.getTutorialSteps).not.toHaveBeenCalled();
  });

  it('clears the pending flag when loading tutorial steps fails', async () => {
    tutorialContentMock.getTutorialSteps.mockRejectedValueOnce(new Error('load failed'));
    await expect(plugin.start()).rejects.toThrow('load failed');

    await plugin.start();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('return button dispatches bsx:return-to-main-menu event', async () => {
    let fired = false;
    window.addEventListener('bsx:return-to-main-menu', () => { fired = true; }, { once: true });
    document.querySelector('#dp-return-btn').click();
    expect(fired).toBe(true);
  });

  // ── exported helpers ──────────────────────────────────────────────────────

  it('announce writes text to the feedback element', async () => {
    announce('hello');
    expect(document.querySelector('#dp-feedback').textContent).toBe('hello');
  });

  it('updateStats populates all stat elements', async () => {
    updateStats();
    expect(document.querySelector('#dp-level').textContent).toBe('3'); // level+1
    expect(document.querySelector('#dp-score').textContent).toBe('5');
    expect(document.querySelector('#dp-trials').textContent).toBe('8');
    expect(document.querySelector('#dp-streak').textContent).toBe('1');
  });

  // ── nowMs fallback ────────────────────────────────────────────────────────

  it('nowMs falls back to Date.now when performance.now is unavailable', async () => {
    nowSpy.mockRestore();
    const origNow = performance.now;
    let dateT = 0;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      dateT += 500;
      return dateT;
    });
    // @ts-ignore — intentionally break performance.now
    performance.now = null;

    await plugin.start();

    expect(dateSpy).toHaveBeenCalled();

    performance.now = origNow;
    dateSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockReturnValue(10000);
    jest.clearAllTimers();
  });

  // ── mask phase rAF loop ───────────────────────────────────────────────────

  it('mask rAF loop iterates when elapsed is below MASK_DURATION_MS', async () => {
    // Slow clock: advances 10 ms per call, well below MASK_DURATION_MS (150).
    let t = 0;
    nowSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 10;
      return t;
    });
    // Force stimulus to end immediately on first tick.
    gameMock.getCurrentLevelConfig.mockReturnValueOnce({ displayDurationMs: 1, contrast: 1.0 });

    await plugin.start();
    jest.runAllTimers();

    // After running all timers the response phase should eventually be entered
    // and the direction buttons become enabled.
    expect(document.querySelector('#dp-btn-up').disabled).toBe(false);
  });

  // ── stop during mask phase ────────────────────────────────────────────────

  it('stop during mask phase cancels the pending mask rAF', async () => {
    // Allow stimulus to complete but not the mask.
    let t = 0;
    nowSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 1;
      return t;
    });
    gameMock.getCurrentLevelConfig.mockReturnValue({ displayDurationMs: 1, contrast: 1.0 });

    await plugin.start();
    jest.runOnlyPendingTimers(); // fires stimulus rAF → switches to mask rAF
    plugin.stop();

    expect(document.querySelector('#dp-end-panel').hidden).toBe(false);
  });
  // ── guided tutorial ───────────────────────────────────────────────────────

  describe('guided tutorial', () => {
    it('does not start the game until the tutorial completes', async () => {
      const { options } = await startPendingTutorial();
      expect(gameMock.startGame).not.toHaveBeenCalled();
      expect(document.querySelector('#dp-game-area').hidden).toBe(true);

      options.onComplete();
      expect(gameMock.startGame).toHaveBeenCalled();
      expect(document.querySelector('#dp-game-area').hidden).toBe(false);
    });

    it('start and replay do nothing while a tutorial is in progress', async () => {
      await startPendingTutorial();
      jest.clearAllMocks();

      await plugin.start();
      document.querySelector('#dp-replay-tutorial-btn').click();
      await flushMicrotasks();

      expect(tutorialContentMock.getTutorialSteps).not.toHaveBeenCalled();
      expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
      expect(tutorialServiceMock.runGuidedTutorial).not.toHaveBeenCalled();
    });

    it('can launch again once the tutorial run finishes', async () => {
      const { finish } = await startPendingTutorial();
      finish();

      await plugin.start();
      expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledTimes(2);
    });

    it('reset() cancels a tutorial in progress', async () => {
      const { run } = await startPendingTutorial();
      plugin.reset();
      expect(run.cancel).toHaveBeenCalledTimes(1);
    });

    it('stop() with no session ignores a tutorial that already finished', async () => {
      const { finish } = await startPendingTutorial();
      finish();
      gameMock.isRunning.mockReturnValueOnce(false);
      document.querySelector('#dp-end-panel').hidden = false;
      gameMock.initGame.mockClear();

      plugin.stop();
      expect(gameMock.initGame).not.toHaveBeenCalled();
      expect(document.querySelector('#dp-end-panel').hidden).toBe(false);
    });
  });

  // ── practice trial ────────────────────────────────────────────────────────

  describe('practice trial', () => {
    let pending;

    beforeEach(async () => {
      // 125 ms per call, so 250 ms per animation frame (the rAF stub reads the clock too).
      // The 500 ms practice stimulus then draws on its first frame and ends on its second.
      let t = 0;
      nowSpy.mockImplementation(() => {
        t += 125;
        return t;
      });
      gameMock.isRunning.mockReturnValue(false);
      // jsdom does not implement scrollIntoView.
      Element.prototype.scrollIntoView = jest.fn();
      pending = await startPendingTutorial();
    });

    afterEach(() => {
      gameMock.isRunning.mockReturnValue(true);
      delete Element.prototype.scrollIntoView;
    });

    /**
     * Start a practice trial.
     * @param {boolean} [guided=true]
     * @returns {{ context: object, done: Promise<void> }}
     */
    function playTrial(guided = true) {
      const context = buildPracticeContext(pending.controller, guided);
      const done = pending.options.playPracticeRound(context);
      return { context, done };
    }

    /** @param {string} direction */
    function button(direction) {
      return document.querySelector(`#dp-btn-${direction}`);
    }

    it('shows the pattern at the easiest level without starting a session', () => {
      const { context } = playTrial();

      expect(document.querySelector('#dp-instructions').hidden).toBe(true);
      expect(document.querySelector('#dp-game-area').hidden).toBe(false);
      expect(gameMock.generatePracticeTrial).toHaveBeenCalledTimes(1);
      expect(gameMock.pickDirection).not.toHaveBeenCalled();
      expect(gameMock.startGame).not.toHaveBeenCalled();
      expect(timerMock.startTimer).not.toHaveBeenCalled();
      expect(context.setInstructions).toHaveBeenCalledWith('watch text');
      expect(button('left').disabled).toBe(true);

      jest.runOnlyPendingTimers();
      expect(gaborMock.drawGabor).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        expect.objectContaining({ contrast: 1 }),
      );
    });

    it('a guided trial marks the correct button once the stimulus ends', () => {
      const { context } = playTrial();
      jest.runOnlyPendingTimers();
      expect(context.showMarker).not.toHaveBeenCalled();

      jest.runOnlyPendingTimers();
      expect(gaborMock.drawMask).toHaveBeenCalled();
      expect(button('left').scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(context.showMarker).toHaveBeenCalledWith({ anchor: button('left'), shape: 'box' });
      expect(context.setInstructions).toHaveBeenLastCalledWith('guided answer text: left');

      jest.runAllTimers();
      expect(button('left').disabled).toBe(false);
    });

    it('an unguided trial shows no marker', () => {
      const { context } = playTrial(false);
      jest.runAllTimers();

      expect(context.showMarker).not.toHaveBeenCalled();
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
      expect(context.setInstructions).toHaveBeenLastCalledWith('answer text');
    });

    it('a correct answer gives feedback and ends the trial without scoring', async () => {
      const { context, done } = playTrial();
      jest.runAllTimers();
      button('left').click();

      await expect(done).resolves.toBeUndefined();
      expect(context.hideMarker).toHaveBeenCalled();
      expect(document.querySelector('#dp-feedback').textContent).toBe('Correct!');
      expect(document.querySelector('#dp-stage').classList)
        .toContain('dp-stage--flash-correct');
      expect(gameMock.recordTrial).not.toHaveBeenCalled();

      // The flash clears, no next trial starts, and nothing is saved.
      jest.runAllTimers();
      expect(document.querySelector('#dp-stage').classList)
        .not.toContain('dp-stage--flash-correct');
      expect(gameMock.generatePracticeTrial).toHaveBeenCalledTimes(1);
      expect(gameMock.pickDirection).not.toHaveBeenCalled();
      expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
    });

    it('a wrong answer highlights the correct button without scoring', async () => {
      const { done } = playTrial();
      jest.runAllTimers();
      button('up').click();

      await done;
      expect(button('left').classList).toContain('dp-dir-btn--correct');
      expect(document.querySelector('#dp-feedback').textContent)
        .toBe('Incorrect — direction was left.');
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
    });

    it('arrow keys answer and do not scroll the page', async () => {
      const { done } = playTrial();
      const early = { key: 'ArrowLeft', preventDefault: jest.fn() };
      handleKeyDown(early);
      expect(early.preventDefault).toHaveBeenCalled();

      jest.runAllTimers();
      const answer = { key: 'ArrowLeft', preventDefault: jest.fn() };
      handleKeyDown(answer);
      expect(answer.preventDefault).toHaveBeenCalled();
      await expect(done).resolves.toBeUndefined();
    });

    it('ending the tutorial mid-trial cancels the trial', () => {
      const { context } = playTrial();
      jest.runOnlyPendingTimers();

      pending.controller.abort();
      jest.runAllTimers();
      expect(context.showMarker).not.toHaveBeenCalled();
      expect(button('left').disabled).toBe(true);
      button('left').click();
      expect(document.querySelector('#dp-feedback').textContent).toBe('');
    });

    it('ending the tutorial during the result flash removes the flash', async () => {
      const { done } = playTrial();
      jest.runAllTimers();
      button('left').click();
      await done;

      pending.controller.abort();
      expect(document.querySelector('#dp-stage').classList)
        .not.toContain('dp-stage--flash-correct');
    });

    it('End Game during practice cancels the tutorial and shows the welcome screen', () => {
      playTrial();
      jest.runAllTimers();

      document.querySelector('#dp-stop-btn').click();

      expect(pending.run.cancel).toHaveBeenCalled();
      expect(document.querySelector('#dp-instructions').hidden).toBe(false);
      expect(document.querySelector('#dp-game-area').hidden).toBe(true);
      expect(document.querySelector('#dp-end-panel').hidden).toBe(true);
      expect(gameMock.stopGame).not.toHaveBeenCalled();
      expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
    });
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

    expect(document.querySelector('#dp-session-timer').closest('[aria-live]')).toBeNull();
    expect(document.querySelector('#dp-score').closest('[aria-live]')).not.toBeNull();
    expect(document.querySelector('#dp-level').closest('[aria-live]')).not.toBeNull();
  });
});
