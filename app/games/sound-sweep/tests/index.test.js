/**
 * index.test.js — Integration tests for the Sound Sweep plugin controller.
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
  GAME_ID: 'sound-sweep',
  SEQUENCES:             ['up-up', 'up-down', 'down-up', 'down-down'],
  formatSequence:        jest.fn(() => 'Up-Down'),
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
  getSpeedHistory:       jest.fn(() => []),
  generatePracticeTrial: jest.fn(() => ({
    sequence: 'down-up', sweepDurationMs: 600, isiMs: 600,
  })),
}));

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playSweepPair:     jest.fn(),
  playFeedbackSound: jest.fn(),
}));

jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(),
}));

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
  loadTutorialSteps: jest.fn(async () => [
    { title: 'Welcome to Sound Sweep', content: '<p>Welcome</p>' },
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
const tutorialServiceMock = await import('../../../components/tutorialService.js');
// The real tutorial module runs, on top of the mocked tutorialService.
const { PRACTICE_TEXT } = await import('../tutorial/tutorial.js');

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
    <button id="ss-replay-tutorial-btn" type="button">Replay Tutorial</button>
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
    // Cancel any tutorial left running so the next test starts clean.
    plugin.reset();
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

  it('start hides instructions and shows game area', async () => {
    await plugin.start();
    expect(document.querySelector('#ss-instructions').hidden).toBe(true);
    expect(document.querySelector('#ss-game-area').hidden).toBe(false);
  });

  it('start moves focus to #ss-status', async () => {
    await plugin.start();
    expect(document.activeElement).toBe(document.querySelector('#ss-status'));
    jest.clearAllTimers();
  });

  it('start clears feedback text', async () => {
    // Simulate leftover feedback from a previous round
    document.querySelector('#ss-feedback').textContent = 'Old feedback';
    await plugin.start();
    expect(document.querySelector('#ss-feedback').textContent).toBe('');
    jest.clearAllTimers();
  });

  it('start calls game.startGame()', async () => {
    gameMock.startGame.mockClear();
    await plugin.start();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('start calls playSweepPair for the first trial', async () => {
    audioServiceMock.playSweepPair.mockClear();
    await plugin.start();
    expect(audioServiceMock.playSweepPair).toHaveBeenCalled();
  });

  it('start calls playSweepPair with the picked sequence split into directions', async () => {
    audioServiceMock.playSweepPair.mockClear();
    await plugin.start();
    // pickSequence returns 'up-down' → split to ['up', 'down']
    expect(audioServiceMock.playSweepPair).toHaveBeenCalledWith(
      ['up', 'down'],
      expect.objectContaining({ sweepDurationMs: 200, isiMs: 200 }),
    );
  });

  it('response buttons are disabled during sweep playback', async () => {
    await plugin.start();
    expect(document.querySelector('#ss-btn-uu').disabled).toBe(true);
    jest.clearAllTimers();
  });

  it('response buttons become enabled after the post-sweep wait', async () => {
    await plugin.start();
    jest.runAllTimers();
    expect(document.querySelector('#ss-btn-uu').disabled).toBe(false);
    expect(document.querySelector('#ss-btn-ud').disabled).toBe(false);
    expect(document.querySelector('#ss-btn-du').disabled).toBe(false);
    expect(document.querySelector('#ss-btn-dd').disabled).toBe(false);
  });

  it('status shows "Listen..." during sweep playback', async () => {
    await plugin.start();
    expect(document.querySelector('#ss-status').textContent).toContain('Listen');
    jest.clearAllTimers();
  });

  it('status changes to response prompt after the wait', async () => {
    await plugin.start();
    jest.runAllTimers();
    const status = document.querySelector('#ss-status').textContent;
    expect(status).toMatch(/sequence/i);
  });

  // ── response via button clicks ────────────────────────────────────────────

  it('correct response (up-down) records a successful trial', async () => {
    await plugin.start();
    jest.runAllTimers();

    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-ud').click(); // 'up-down' matches mock

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('wrong response records a failed trial', async () => {
    await plugin.start();
    jest.runAllTimers();

    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-uu').click(); // 'up-up' ≠ 'up-down'

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it('down-up button click records a trial', async () => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-du').click();
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('down-down button click records a trial', async () => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-dd').click();
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('second button click during the same response phase is ignored', async () => {
    await plugin.start();
    jest.runAllTimers();

    gameMock.recordTrial.mockClear();
    document.querySelector('#ss-btn-ud').click();
    document.querySelector('#ss-btn-uu').click(); // should be ignored

    expect(gameMock.recordTrial).toHaveBeenCalledTimes(1);
  });

  it('button click before response phase is ignored', async () => {
    await plugin.start(); // buttons still disabled
    gameMock.recordTrial.mockClear();
    handleSequenceResponse('up-down');
    // _responseEnabled is false, so nothing should be recorded
    expect(gameMock.recordTrial).not.toHaveBeenCalled();
    jest.clearAllTimers();
  });

  // ── feedback ──────────────────────────────────────────────────────────────

  it('correct response announces "Correct!"', async () => {
    await plugin.start();
    jest.runAllTimers();
    document.querySelector('#ss-btn-ud').click();

    expect(document.querySelector('#ss-feedback').textContent).toContain('Correct');
  });

  it('wrong response announces the correct sequence', async () => {
    await plugin.start();
    jest.runAllTimers();
    document.querySelector('#ss-btn-uu').click();

    const feedback = document.querySelector('#ss-feedback').textContent;
    expect(feedback).toContain('Up');
    expect(feedback).toContain('Down');
  });

  it('playFeedbackSound is called with true for a correct response', async () => {
    await plugin.start();
    jest.runAllTimers();
    audioServiceMock.playFeedbackSound.mockClear();
    document.querySelector('#ss-btn-ud').click();
    expect(audioServiceMock.playFeedbackSound).toHaveBeenCalledWith(true);
  });

  it('playFeedbackSound is called with false for a wrong response', async () => {
    await plugin.start();
    jest.runAllTimers();
    audioServiceMock.playFeedbackSound.mockClear();
    document.querySelector('#ss-btn-uu').click();
    expect(audioServiceMock.playFeedbackSound).toHaveBeenCalledWith(false);
  });

  // ── inter-trial timer ─────────────────────────────────────────────────────

  it('inter-trial timer starts the next trial (pickSequence called again)', async () => {
    gameMock.pickSequence.mockClear();
    await plugin.start();
    jest.runAllTimers(); // advance to response phase

    document.querySelector('#ss-btn-ud').click();
    jest.runOnlyPendingTimers(); // inter-trial delay
    jest.runAllTimers();         // next sweep wait

    expect(gameMock.pickSequence).toHaveBeenCalledTimes(2);
  });

  it('next trial does not start when game is not running after response', async () => {
    gameMock.isRunning
      .mockReturnValueOnce(true)   // startTrial guard
      .mockReturnValueOnce(false); // after response

    gameMock.pickSequence.mockClear();
    await plugin.start();
    jest.runAllTimers();
    document.querySelector('#ss-btn-ud').click();
    jest.runOnlyPendingTimers();

    expect(gameMock.pickSequence).toHaveBeenCalledTimes(1);
  });

  // ── replay button ─────────────────────────────────────────────────────────

  it('replay button is enabled during response phase', async () => {
    await plugin.start();
    jest.runAllTimers();
    expect(document.querySelector('#ss-replay-btn').disabled).toBe(false);
  });

  it('replay button is disabled during sweep playback', async () => {
    await plugin.start();
    expect(document.querySelector('#ss-replay-btn').disabled).toBe(true);
    jest.clearAllTimers();
  });

  it('replay button replays the same pair at the timing it was played with', async () => {
    await plugin.start();
    jest.runAllTimers();
    audioServiceMock.playSweepPair.mockClear();
    gameMock.getCurrentLevelConfig.mockReturnValueOnce({ sweepDurationMs: 50, isiMs: 50 });
    document.querySelector('#ss-replay-btn').click();
    expect(audioServiceMock.playSweepPair).toHaveBeenCalledWith(
      ['up', 'down'],
      { sweepDurationMs: 200, isiMs: 200 },
    );
  });

  it('replay button is disabled once the player answers', async () => {
    await plugin.start();
    jest.runAllTimers();
    document.querySelector('#ss-btn-ud').click();
    expect(document.querySelector('#ss-replay-btn').disabled).toBe(true);
  });

  // ── stop ──────────────────────────────────────────────────────────────────

  it('stop returns the result from game.stopGame()', async () => {
    await plugin.start();
    const result = plugin.stop();
    expect(result.score).toBe(4);
    expect(result.level).toBe(2);
    expect(result.trialsCompleted).toBe(7);
  });

  it('stop shows the end panel', async () => {
    await plugin.start();
    plugin.stop();
    expect(document.querySelector('#ss-end-panel').hidden).toBe(false);
    expect(document.querySelector('#ss-game-area').hidden).toBe(true);
  });

  it('stop populates end panel with result values', async () => {
    await plugin.start();
    plugin.stop();
    expect(document.querySelector('#ss-final-level').textContent).toBe('3'); // level+1
    expect(document.querySelector('#ss-final-score').textContent).toBe('4');
    expect(document.querySelector('#ss-final-trials').textContent).toBe('7');
  });

  it('stop calls saveScore when trialsCompleted > 0', async () => {
    await plugin.start();
    plugin.stop();
    expect(scoreServiceMock.saveScore).toHaveBeenCalledWith(
      'sound-sweep',
      expect.objectContaining({ score: 4, level: 2, sessionDurationMs: 0 }),
    );
  });

  it('stop does not call saveScore when a session ends with no trials', async () => {
    await plugin.start();
    gameMock.stopGame.mockReturnValueOnce({
      score: 0, level: 0, trialsCompleted: 0, duration: 100,
    });

    plugin.stop();
    expect(document.querySelector('#ss-end-panel').hidden).toBe(false);
    expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
  });

  it('stop with no session returns the idle result and leaves the screen alone', () => {
    gameMock.isRunning.mockReturnValueOnce(false);
    const result = plugin.stop();
    expect(result).toEqual({
      score: 4, level: 2, trialsCompleted: 7, duration: 0,
    });
    expect(gameMock.stopGame).not.toHaveBeenCalled();
    expect(timerMock.stopTimer).not.toHaveBeenCalled();
    expect(document.querySelector('#ss-end-panel').hidden).toBe(true);
    expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
  });

  it('stop cancels the pending sweep-wait timer', async () => {
    await plugin.start();
    // Wait timer is pending (sweep not done yet).
    plugin.stop();
    jest.runAllTimers();
    expect(document.querySelector('#ss-btn-uu').disabled).toBe(true);
    expect(document.querySelector('#ss-end-panel').hidden).toBe(false);
  });

  it('stop during the response phase closes responses and Replay', async () => {
    await plugin.start();
    jest.runAllTimers();
    plugin.stop();
    expect(document.querySelector('#ss-btn-uu').disabled).toBe(true);
    expect(document.querySelector('#ss-replay-btn').disabled).toBe(true);
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '2' });
    expect(gameMock.recordTrial).not.toHaveBeenCalled();
  });

  // ── reset ─────────────────────────────────────────────────────────────────

  it('reset returns to the instructions state', async () => {
    await plugin.start();
    plugin.stop();
    plugin.reset();

    expect(document.querySelector('#ss-instructions').hidden).toBe(false);
    expect(document.querySelector('#ss-game-area').hidden).toBe(true);
    expect(document.querySelector('#ss-end-panel').hidden).toBe(true);
  });

  it('reset clears the feedback text', async () => {
    await plugin.start();
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

  it('reset resets the session timer display', async () => {
    await plugin.start();
    plugin.reset();
    expect(document.querySelector('#ss-session-timer').textContent).toBe('00:00');
  });

  // ── keyboard handler ──────────────────────────────────────────────────────

  it.each(['ArrowUp', '0', '5', ' '])('handleKeyDown ignores the %p key', async (key) => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key, preventDefault: jest.fn() });
    expect(gameMock.recordTrial).not.toHaveBeenCalled();
  });

  it('handleKeyDown key 1 maps to up-up', async () => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '1', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }), // 'up-up' ≠ 'up-down'
    );
  });

  it('handleKeyDown key 2 maps to up-down (correct sequence)', async () => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '2', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('handleKeyDown key 3 maps to down-up', async () => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '3', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('handleKeyDown key 4 maps to down-down', async () => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '4', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  it('handleKeyDown during sweep phase does not record a trial', async () => {
    await plugin.start(); // response not yet enabled
    gameMock.recordTrial.mockClear();
    handleKeyDown({ key: '2', preventDefault: jest.fn() });
    expect(gameMock.recordTrial).not.toHaveBeenCalled();
    jest.clearAllTimers();
  });

  it('calling init() multiple times does not accumulate keydown handlers', async () => {
    // Re-initialise twice more to simulate returning to the game multiple times.
    const container = buildContainer();
    document.body.appendChild(container);
    plugin.init(container);
    plugin.init(container);

    // Advance to response phase.
    await plugin.start();
    jest.runAllTimers();
    gameMock.recordTrial.mockClear();

    // Dispatch a real DOM keydown event — should fire only once even though
    // init() was called multiple times.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(gameMock.recordTrial).toHaveBeenCalledTimes(1);
    jest.clearAllTimers();
  });

  // ── button click wiring ───────────────────────────────────────────────────

  it('start button click starts the game', async () => {
    gameMock.startGame.mockClear();
    document.querySelector('#ss-start-btn').click();
    await flushMicrotasks();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('stop button click ends the game', async () => {
    await plugin.start();
    gameMock.stopGame.mockClear();
    document.querySelector('#ss-stop-btn').click();
    expect(gameMock.stopGame).toHaveBeenCalled();
  });

  it('play again button resets and starts a new session', async () => {
    plugin.stop();
    gameMock.startGame.mockClear();
    document.querySelector('#ss-play-again-btn').click();
    await flushMicrotasks();
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  it('replay tutorial button runs the guided tutorial and then starts the game', async () => {
    document.querySelector('#ss-replay-tutorial-btn').click();
    await flushMicrotasks();
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'sound-sweep',
      container: expect.any(HTMLElement),
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(gameMock.startGame).toHaveBeenCalled();
    expect(document.querySelector('#ss-game-area').hidden).toBe(false);
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

  it('handleSequenceResponse with correct sequence updates stats', async () => {
    await plugin.start();
    jest.runAllTimers();
    gameMock.getScore.mockReturnValueOnce(5);

    handleSequenceResponse('up-down');
    expect(document.querySelector('#ss-score').textContent).toBe('5');
  });

  // ── guided tutorial ───────────────────────────────────────────────────────

  describe('guided tutorial', () => {
    it('does not start the game until the tutorial completes', async () => {
      const { options } = await startPendingTutorial();
      expect(gameMock.startGame).not.toHaveBeenCalled();
      expect(document.querySelector('#ss-game-area').hidden).toBe(true);

      options.onComplete();
      expect(gameMock.startGame).toHaveBeenCalled();
      expect(document.querySelector('#ss-game-area').hidden).toBe(false);
    });

    it('stop() with no session ignores a tutorial that already finished', async () => {
      const { finish } = await startPendingTutorial();
      finish();
      gameMock.isRunning.mockReturnValueOnce(false);
      document.querySelector('#ss-end-panel').hidden = false;
      gameMock.initGame.mockClear();

      plugin.stop();
      expect(gameMock.initGame).not.toHaveBeenCalled();
      expect(document.querySelector('#ss-end-panel').hidden).toBe(false);
    });
  });

  // ── practice trial ────────────────────────────────────────────────────────

  describe('practice trial', () => {
    /** The mocked practice trial: 600 + 600 + 600 ms of sweeps, then the 150 ms buffer. */
    const SWEEPS_END_MS = 1950;
    let pending;

    beforeEach(async () => {
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

    /** The practice trial's answer button (the mocked trial is Down-Up). */
    function answerButton() {
      return document.querySelector('#ss-btn-du');
    }

    it('plays the sweeps at the easiest level without starting a session', () => {
      const { context } = playTrial();

      expect(document.querySelector('#ss-instructions').hidden).toBe(true);
      expect(document.querySelector('#ss-game-area').hidden).toBe(false);
      expect(audioServiceMock.playSweepPair)
        .toHaveBeenCalledWith(['down', 'up'], { sweepDurationMs: 600, isiMs: 600 });
      expect(gameMock.pickSequence).not.toHaveBeenCalled();
      expect(gameMock.startGame).not.toHaveBeenCalled();
      expect(timerMock.startTimer).not.toHaveBeenCalled();
      expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.listen);
      expect(document.querySelector('#ss-status').textContent).toBe('Listen...');
      expect(answerButton().disabled).toBe(true);
    });

    it('a guided trial marks the correct button once the sweeps end', () => {
      const { context } = playTrial();
      jest.advanceTimersByTime(SWEEPS_END_MS - 1);
      expect(context.showMarker).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(answerButton().disabled).toBe(false);
      expect(answerButton().scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(context.showMarker).toHaveBeenCalledWith({ anchor: answerButton(), shape: 'box' });
      expect(context.setInstructions)
        .toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedAnswer('down-up'));
    });

    it('an unguided trial shows no marker', () => {
      const { context } = playTrial(false);
      jest.runAllTimers();

      expect(context.showMarker).not.toHaveBeenCalled();
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
      expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
    });

    it('Replay repeats the practice trial at its own timing', () => {
      playTrial();
      jest.runAllTimers();
      audioServiceMock.playSweepPair.mockClear();

      document.querySelector('#ss-replay-btn').click();
      expect(audioServiceMock.playSweepPair)
        .toHaveBeenCalledWith(['down', 'up'], { sweepDurationMs: 600, isiMs: 600 });
    });

    it('a correct answer gives feedback and ends the trial without scoring', async () => {
      const { context, done } = playTrial();
      jest.runAllTimers();
      answerButton().click();

      await expect(done).resolves.toBeUndefined();
      expect(context.hideMarker).toHaveBeenCalled();
      expect(document.querySelector('#ss-feedback').textContent).toBe('Correct!');
      expect(audioServiceMock.playFeedbackSound).toHaveBeenCalledWith(true);
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
      expect(document.querySelector('#ss-replay-btn').disabled).toBe(true);

      // No next trial starts, and nothing is saved.
      jest.runAllTimers();
      expect(audioServiceMock.playSweepPair).toHaveBeenCalledTimes(1);
      expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
    });

    it('a wrong answer by key names the sequence without scoring', async () => {
      const { done } = playTrial();
      jest.runAllTimers();
      handleKeyDown({ key: '1' });

      await done;
      expect(gameMock.formatSequence).toHaveBeenCalledWith('down-up');
      expect(document.querySelector('#ss-feedback').textContent)
        .toBe('Incorrect - the sequence was Up-Down.');
      expect(audioServiceMock.playFeedbackSound).toHaveBeenCalledWith(false);
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
    });

    it('ending the tutorial mid-trial cancels the trial', () => {
      const { context } = playTrial();

      pending.controller.abort();
      jest.runAllTimers();
      expect(context.showMarker).not.toHaveBeenCalled();
      expect(answerButton().disabled).toBe(true);
      handleKeyDown({ key: '3' });
      expect(document.querySelector('#ss-feedback').textContent).toBe('');
    });

    it('End Game during practice cancels the tutorial and shows the welcome screen', () => {
      playTrial();
      jest.runAllTimers();

      document.querySelector('#ss-stop-btn').click();

      expect(pending.run.cancel).toHaveBeenCalled();
      expect(document.querySelector('#ss-instructions').hidden).toBe(false);
      expect(document.querySelector('#ss-game-area').hidden).toBe(true);
      expect(document.querySelector('#ss-end-panel').hidden).toBe(true);
      expect(gameMock.stopGame).not.toHaveBeenCalled();
      expect(scoreServiceMock.saveScore).not.toHaveBeenCalled();
    });
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

  it('start does not throw when game-area / instructions elements are absent', async () => {
    await expect(plugin.start()).resolves.toBeUndefined();
    jest.clearAllTimers();
  });

  it('stop does not throw when end-panel elements are absent', async () => {
    await plugin.start();
    expect(() => plugin.stop()).not.toThrow();
  });

  it('reset does not throw when all optional elements are absent', () => {
    expect(() => plugin.reset()).not.toThrow();
  });

  it('handleSequenceResponse does not throw when feedback element is absent', async () => {
    await plugin.start();
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

// ── interface.html accessibility ──────────────────────────────────────────────

describe('interface.html live regions', () => {
  const html = readFileSync(new URL('../interface.html', import.meta.url), 'utf8');

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('session timer is not inside a live region', () => {
    document.body.innerHTML = html;

    expect(document.querySelector('#ss-session-timer').closest('[aria-live]')).toBeNull();
    expect(document.querySelector('#ss-score').closest('[aria-live]')).not.toBeNull();
    expect(document.querySelector('#ss-level').closest('[aria-live]')).not.toBeNull();
  });
});
