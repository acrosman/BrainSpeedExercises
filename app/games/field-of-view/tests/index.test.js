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

/**
 * A 3x3 layout with the sitting (primary) kitten in the center and the toy in row 1,
 * column 2 (index 1).
 * @param {string} [centerId='primary-kitten']
 * @returns {object}
 */
function buildLayout(centerId = 'primary-kitten') {
  const centerIcon = {
    id: centerId,
    file: centerId === 'primary-kitten' ? 'primaryKitten.png' : 'secondaryKitten.png',
    width: 220,
    height: 220,
  };
  return {
    gridSize: 3,
    centerIndex: 4,
    centerIcon,
    peripheralIndex: 1,
    peripheralIcon: {
      id: 'toy-1',
      file: 'toy1.png',
      width: 160,
      height: 160,
    },
    cells: [
      { index: 0, role: 'empty', icon: null },
      { index: 1, role: 'peripheral-target', icon: { id: 'toy-1', file: 'toy1.png' } },
      { index: 2, role: 'empty', icon: null },
      { index: 3, role: 'empty', icon: null },
      { index: 4, role: 'center', icon: centerIcon },
      { index: 5, role: 'empty', icon: null },
      { index: 6, role: 'empty', icon: null },
      { index: 7, role: 'empty', icon: null },
      { index: 8, role: 'empty', icon: null },
    ],
  };
}

jest.unstable_mockModule('../game.js', () => ({
  GAME_ID: 'field-of-view',
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({
    score: 84.2,
    thresholdMs: 84.2,
    trialsCompleted: 4,
    recentAccuracy: 0.75,
    duration: 4000,
  })),
  isRunning: jest.fn(() => true),
  createTrialLayout: jest.fn(() => buildLayout()),
  createPracticeTrial: jest.fn(() => ({ layout: buildLayout(), soaMs: 500 })),
  recordTrial: jest.fn(() => ({ thresholdMs: 84.2, recentAccuracy: 0.8, successCounter: 0 })),
  getCurrentSoaMs: jest.fn(() => 84.2),
  getRecentAccuracy: jest.fn(() => 0.8),
  getTrialsCompleted: jest.fn(() => 4),
  getThresholdHistory: jest.fn(() => [{ trial: 1, thresholdMs: 200, success: true }]),
}));

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playFeedbackSound: jest.fn(),
}));

jest.unstable_mockModule('../progress.js', () => ({
  saveProgress: jest.fn(),
}));

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
  loadTutorialSteps: jest.fn(async () => [
    { title: 'Welcome to Field of View', content: '<p>Welcome</p>' },
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

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const timerMock = await import('../../../components/timerService.js');
const gameMock = await import('../game.js');
const progressMock = await import('../progress.js');
const tutorialServiceMock = await import('../../../components/tutorialService.js');
// The real tutorial module runs, on top of the mocked tutorialService.
const { PRACTICE_TEXT } = await import('../tutorial/tutorial.js');

/** Practice feedback for the default layout (sitting kitten, toy in row 1, column 2). */
const CORRECT_RESULT = PRACTICE_TEXT.result({
  success: true, kitten: 'sitting kitten', row: 1, col: 2,
});
const MISS_RESULT = PRACTICE_TEXT.result({
  success: false, kitten: 'sitting kitten', row: 1, col: 2,
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

function buildContainer() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="fov-instructions"></div>
    <div id="fov-game-area" hidden></div>
    <div id="fov-end-panel" hidden></div>
    <div id="fov-stage" class="fov-stage">
      <div id="fov-board"></div>
      <div id="fov-mask" hidden></div>
    </div>
    <div id="fov-response" hidden>
      <div id="fov-location-selector" class="fov-location-selector" hidden></div>
    </div>
    <div id="fov-feedback"></div>
    <strong id="fov-soa"></strong>
    <strong id="fov-threshold"></strong>
    <strong id="fov-accuracy"></strong>
    <strong id="fov-trials"></strong>
    <svg id="fov-trend-chart" viewBox="0 0 300 120">
      <polyline id="fov-trend-line" points=""></polyline>
    </svg>
    <p id="fov-trend-empty"></p>
    <strong id="fov-trend-latest"></strong>
    <strong id="fov-final-threshold"></strong>
    <strong id="fov-final-accuracy"></strong>
    <strong id="fov-final-best-threshold"></strong>
    <button id="fov-start-btn" type="button">Start</button>
    <button id="fov-replay-tutorial-btn" type="button">Replay Tutorial</button>
    <button id="fov-stop-btn" type="button">Stop</button>
    <button id="fov-play-again-btn" type="button">Play Again</button>
    <button id="fov-return-btn" type="button">Return</button>
    <button id="fov-center-primary" type="button">Sitting kitten</button>
    <button id="fov-center-secondary" type="button">Leaping kitten</button>
  `;
  return wrapper;
}

describe('plugin contract', () => {
  test('exposes required lifecycle members', () => {
    expect(typeof plugin.name).toBe('string');
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
    expect(typeof plugin.reset).toBe('function');
  });
});

describe('field-of-view index', () => {
  let originalRaf;
  let originalCancelRaf;
  let nowSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    gameMock.isRunning.mockReturnValue(true);

    document.body.innerHTML = '';
    const container = buildContainer();
    document.body.appendChild(container);

    let t = 0;
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 200;
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

  test('init accepts null container', () => {
    expect(() => plugin.init(null)).not.toThrow();
  });

  test('start enters game area and eventually shows response phase', async () => {
    await plugin.start();

    const instructions = document.querySelector('#fov-instructions');
    const gameArea = document.querySelector('#fov-game-area');

    expect(instructions.hidden).toBe(true);
    expect(gameArea.hidden).toBe(false);

    jest.runAllTimers();

    const response = document.querySelector('#fov-response');
    expect(response.hidden).toBe(false);
    expect(document.querySelector('#fov-mask').hidden).toBe(false);
    expect(
      document.querySelector('#fov-stage').classList.contains('fov-stage--response'),
    ).toBe(true);
  });

  test('response submission records trial after selecting center and peripheral', async () => {
    await plugin.start();
    jest.runAllTimers();

    const centerPrimary = document.querySelector('#fov-center-primary');
    const peripheralCell = document.querySelector('#fov-location-selector [data-index="1"]');

    centerPrimary.click();
    peripheralCell.click();

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );

    const trendLine = document.querySelector('#fov-trend-line');
    expect(trendLine.getAttribute('points')).not.toBe('');
  });

  test('stimulus phase renders kitten and toy images', async () => {
    await plugin.start();

    const images = document.querySelectorAll('#fov-board img');
    expect(images.length).toBe(2);

    const sources = Array.from(images).map((el) => el.getAttribute('src'));
    expect(sources.some((src) => src.includes('primaryKitten.png'))).toBe(true);
    expect(sources.some((src) => src.includes('toy1.png'))).toBe(true);
  });

  test('stop returns running result and updates end panel', async () => {
    await plugin.start();
    const result = plugin.stop();

    expect(result.thresholdMs).toBe(84.2);
    expect(document.querySelector('#fov-end-panel').hidden).toBe(false);
    expect(document.querySelector('#fov-final-threshold').textContent).toBe('84.2');
    expect(document.querySelector('#fov-final-best-threshold').textContent).toBe('200');
    expect(progressMock.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ thresholdMs: 84.2, trialsCompleted: 4 }),
      0, // sessionDurationMs from mocked timerService.stopTimer() which returns 0
    );
  });

  test('stop returns idle result when game is not running, and leaves the screen alone', () => {
    gameMock.isRunning.mockReturnValueOnce(false);

    const result = plugin.stop();

    expect(document.querySelector('#fov-end-panel').hidden).toBe(true);
    expect(timerMock.stopTimer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      score: 84.2,
      thresholdMs: 84.2,
      trialsCompleted: 4,
      recentAccuracy: 0.8,
    });
  });

  test('stop does not save progress when trialsCompleted is zero', () => {
    gameMock.isRunning.mockReturnValueOnce(false);
    gameMock.getTrialsCompleted.mockReturnValueOnce(0);
    progressMock.saveProgress.mockClear();

    plugin.stop();

    expect(progressMock.saveProgress).not.toHaveBeenCalled();
  });

  test('reset returns to instruction state', async () => {
    await plugin.start();
    plugin.reset();

    expect(document.querySelector('#fov-instructions').hidden).toBe(false);
    expect(document.querySelector('#fov-game-area').hidden).toBe(true);
    expect(document.querySelector('#fov-end-panel').hidden).toBe(true);
  });

  test('return button dispatches main menu event', () => {
    plugin.stop();

    let fired = false;
    window.addEventListener('bsx:return-to-main-menu', () => {
      fired = true;
    }, { once: true });

    document.querySelector('#fov-return-btn').click();

    expect(fired).toBe(true);
  });

  test('play again button resets and starts again from end panel', async () => {
    plugin.stop();
    document.querySelector('#fov-play-again-btn').click();
    await flushMicrotasks();

    expect(document.querySelector('#fov-game-area').hidden).toBe(false);
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  test('start and stop buttons invoke lifecycle handlers via click', async () => {
    gameMock.startGame.mockClear();
    gameMock.stopGame.mockClear();

    document.querySelector('#fov-start-btn').click();
    await flushMicrotasks();
    document.querySelector('#fov-stop-btn').click();

    expect(gameMock.startGame).toHaveBeenCalled();
    expect(gameMock.stopGame).toHaveBeenCalled();
  });

  test('center secondary click updates center selection and can submit', async () => {
    await plugin.start();
    jest.runAllTimers();

    document.querySelector('#fov-center-secondary').click();
    document.querySelector('#fov-location-selector [data-index="1"]').click();

    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  test('center choice is ignored before response phase is enabled', () => {
    gameMock.recordTrial.mockClear();

    // Before start(), response input is disabled and chooseCenter should return early.
    document.querySelector('#fov-center-secondary').click();

    expect(gameMock.recordTrial).not.toHaveBeenCalled();
  });

  test('feedback flash timeout clears stage flash class', async () => {
    gameMock.recordTrial.mockReturnValueOnce({ thresholdMs: 84.2, recentAccuracy: 0.8 });
    await plugin.start();
    jest.runAllTimers();

    document.querySelector('#fov-center-primary').click();
    document.querySelector('#fov-location-selector [data-index="1"]').click();

    const stage = document.querySelector('#fov-stage');
    expect(stage.classList.contains('fov-stage--flash-correct')).toBe(true);

    jest.runOnlyPendingTimers();
    expect(stage.classList.contains('fov-stage--flash-correct')).toBe(false);
  });

  test('next-trial timer callback starts another trial when still running', async () => {
    gameMock.isRunning.mockReturnValue(true);
    gameMock.createTrialLayout.mockClear();

    await plugin.start();
    jest.runAllTimers();

    document.querySelector('#fov-center-primary').click();
    document.querySelector('#fov-location-selector [data-index="1"]').click();

    jest.runOnlyPendingTimers();
    expect(gameMock.createTrialLayout).toHaveBeenCalledTimes(2);
  });

  test('stimulus and mask phases take raf else-path before completing', async () => {
    let t = 0;
    nowSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 50;
      return t;
    });
    gameMock.getCurrentSoaMs.mockReturnValueOnce(300);

    await plugin.start();
    jest.runAllTimers();

    expect(document.querySelector('#fov-mask').hidden).toBe(false);
    expect(document.querySelector('#fov-response').hidden).toBe(false);
  });

  test('stimulus raf loop iterates when elapsed is below soa', async () => {
    // Use a slow-incrementing clock so elapsed < targetSoa on the first raf tick,
    // forcing the stimulus raf loop to iterate at least once (line 368).
    let t = 0;
    nowSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 10;
      return t;
    });
    // targetSoa defaults to 84.2; with t+=10 the first tick gives elapsed<84.2
    // so the loop continuation branch is taken before the phase completes.

    await plugin.start();
    jest.runAllTimers();

    expect(document.querySelector('#fov-mask').hidden).toBe(false);
    expect(document.querySelector('#fov-response').hidden).toBe(false);
  });

  test('stop during mask phase cancels pending mask raf (lines 175-176)', async () => {
    // Complete only the stimulus phase so a mask RAF is scheduled but not yet run.
    await plugin.start();
    jest.runOnlyPendingTimers(); // fires stimulus RAF → schedules mask RAF
    // _maskRafId is now set; stopping here exercises the mask-raf cancellation path.
    plugin.stop();

    expect(document.querySelector('#fov-end-panel').hidden).toBe(false);
  });

  test('nowMs falls back to Date.now when performance.now is not a function', async () => {
    nowSpy.mockRestore();
    const origNow = performance.now;
    // Make performance.now not a function so nowMs uses Date.now() instead.
    let dateT = 0;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      dateT += 200;
      return dateT;
    });
    // @ts-ignore
    performance.now = null;

    await plugin.start(); // runStimulusPhase → nowMs() → Date.now()

    expect(dateSpy).toHaveBeenCalled();

    performance.now = origNow;
    dateSpy.mockRestore();
    // Re-create a spy so afterEach's nowSpy.mockRestore() does not throw.
    nowSpy = jest.spyOn(performance, 'now').mockReturnValue(10200);
    // Clean up pending timers without running them to avoid infinite loops.
    jest.clearAllTimers();
  });

  test('start exits before trial creation when game is not running', async () => {
    gameMock.isRunning.mockReturnValue(false);
    gameMock.createTrialLayout.mockClear();

    await plugin.start();

    expect(gameMock.createTrialLayout).not.toHaveBeenCalled();
  });

  // ── guided tutorial ───────────────────────────────────────────────────────

  describe('guided tutorial', () => {
    test('start runs the guided tutorial if needed with the Field of View steps', async () => {
      await plugin.start();
      expect(tutorialServiceMock.loadTutorialSteps).toHaveBeenCalledTimes(1);
      expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: 'field-of-view',
          container: expect.any(HTMLElement),
          introSteps: [{ title: 'Welcome to Field of View', content: '<p>Welcome</p>' }],
          playPracticeRound: expect.any(Function),
          onComplete: expect.any(Function),
        }),
      );
      expect(gameMock.startGame).toHaveBeenCalledTimes(1);
    });

    test('replay tutorial button runs the guided tutorial and then starts the game', async () => {
      document.querySelector('#fov-replay-tutorial-btn').click();
      await flushMicrotasks();
      expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
        gameId: 'field-of-view',
        playPracticeRound: expect.any(Function),
      }));
      expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
      expect(gameMock.startGame).toHaveBeenCalled();
      expect(document.querySelector('#fov-game-area').hidden).toBe(false);
    });

    test('does not start the game until the tutorial completes', async () => {
      const { options } = await startPendingTutorial();
      expect(gameMock.startGame).not.toHaveBeenCalled();
      expect(document.querySelector('#fov-game-area').hidden).toBe(true);

      options.onComplete();
      expect(gameMock.startGame).toHaveBeenCalled();
      expect(timerMock.startTimer).toHaveBeenCalled();
      expect(document.querySelector('#fov-game-area').hidden).toBe(false);
      expect(gameMock.createTrialLayout).toHaveBeenCalled();
    });

    test('stop() with no session ignores a tutorial that already finished', async () => {
      const { finish } = await startPendingTutorial();
      finish();
      gameMock.isRunning.mockReturnValueOnce(false);
      document.querySelector('#fov-end-panel').hidden = false;
      gameMock.initGame.mockClear();

      plugin.stop();
      expect(gameMock.initGame).not.toHaveBeenCalled();
      expect(document.querySelector('#fov-end-panel').hidden).toBe(false);
    });
  });

  // ── practice trial ────────────────────────────────────────────────────────

  describe('practice trial', () => {
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
     * Start a practice trial, like the tutorial runner does.
     * @param {boolean} [guided=true]
     * @param {number} [attempt=1] - Which try at the round; above 1 replays a miss.
     * @returns {{ context: object, done: Promise<object> }}
     */
    function playTrial(guided = true, attempt = 1) {
      const context = {
        round: guided ? 1 : 2,
        attempt,
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

    /** @param {number} index */
    function locationCell(index) {
      return document.querySelector(`#fov-location-selector [data-index="${index}"]`);
    }

    const primaryBtn = () => document.querySelector('#fov-center-primary');
    const secondaryBtn = () => document.querySelector('#fov-center-secondary');
    const feedback = () => document.querySelector('#fov-feedback').textContent;

    test('shows the board at the starting difficulty without starting a session', () => {
      const { context } = playTrial();

      expect(document.querySelector('#fov-instructions').hidden).toBe(true);
      expect(document.querySelector('#fov-game-area').hidden).toBe(false);
      expect(document.querySelector('#fov-response').hidden).toBe(false);
      expect(document.querySelectorAll('#fov-board img')).toHaveLength(2);
      expect(gameMock.createPracticeTrial).toHaveBeenCalledTimes(1);
      expect(gameMock.createTrialLayout).not.toHaveBeenCalled();
      expect(gameMock.startGame).not.toHaveBeenCalled();
      expect(timerMock.startTimer).not.toHaveBeenCalled();
      expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);
    });

    test('a guided trial marks the center kitten once the field appears', () => {
      const { context } = playTrial();
      expect(context.showMarker).not.toHaveBeenCalled();

      jest.runAllTimers();
      expect(document.querySelector('#fov-mask').hidden).toBe(false);
      expect(primaryBtn().scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(context.showMarker).toHaveBeenCalledWith({ anchor: primaryBtn(), shape: 'box' });
      expect(context.setInstructions)
        .toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedKitten('sitting kitten'));
    });

    test('a guided trial marks the leaping kitten when it was in the center', () => {
      gameMock.createPracticeTrial.mockReturnValueOnce({
        layout: buildLayout('secondary-kitten'), soaMs: 500,
      });
      const { context } = playTrial();
      jest.runAllTimers();

      expect(context.showMarker).toHaveBeenCalledWith({ anchor: secondaryBtn(), shape: 'box' });
      expect(context.setInstructions)
        .toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedKitten('leaping kitten'));
    });

    test('choosing a kitten moves the marker to the toy square', () => {
      const { context } = playTrial();
      jest.runAllTimers();

      secondaryBtn().click();
      expect(context.showMarker).toHaveBeenLastCalledWith({
        anchor: locationCell(1), shape: 'box',
      });
      expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedLocation(1, 2));

      // Changing the kitten keeps the marker, and the announcement, where they are.
      const calls = context.setInstructions.mock.calls.length;
      primaryBtn().click();
      expect(context.showMarker).toHaveBeenCalledTimes(2);
      expect(context.setInstructions).toHaveBeenCalledTimes(calls);
    });

    test('choosing a square first keeps the marker on the kitten', () => {
      const { context } = playTrial();
      jest.runAllTimers();

      locationCell(3).click();
      expect(context.showMarker).toHaveBeenCalledTimes(1);
      expect(context.setInstructions)
        .toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedKitten('sitting kitten'));
    });

    test('an unguided trial shows no marker', () => {
      const { context } = playTrial(false);
      jest.runAllTimers();
      primaryBtn().click();

      expect(context.showMarker).not.toHaveBeenCalled();
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
      expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
    });

    test('a correct answer gives feedback and ends the trial without scoring', async () => {
      const { context, done } = playTrial();
      jest.runAllTimers();
      primaryBtn().click();
      locationCell(1).click();

      await expect(done).resolves.toEqual({
        correct: true, feedback: CORRECT_RESULT,
      });
      expect(context.hideMarker).toHaveBeenCalled();
      expect(feedback()).toBe(CORRECT_RESULT);
      expect(document.querySelector('#fov-stage').classList)
        .toContain('fov-stage--flash-correct');
      expect(gameMock.recordTrial).not.toHaveBeenCalled();

      // The flash clears, no next trial starts, and nothing is saved.
      jest.runAllTimers();
      expect(document.querySelector('#fov-stage').classList)
        .not.toContain('fov-stage--flash-correct');
      expect(gameMock.createPracticeTrial).toHaveBeenCalledTimes(1);
      expect(gameMock.createTrialLayout).not.toHaveBeenCalled();
      expect(progressMock.saveProgress).not.toHaveBeenCalled();
    });

    test('a wrong answer reports a miss naming the correct answers, without scoring', async () => {
      const { done } = playTrial();
      jest.runAllTimers();
      primaryBtn().click();
      locationCell(0).click();

      // The coach banner shows the miss, so the feedback region stays quiet.
      await expect(done).resolves.toEqual({
        correct: false, feedback: MISS_RESULT,
      });
      expect(feedback()).toBe('');
      expect(document.querySelector('#fov-stage').classList)
        .toContain('fov-stage--flash-wrong');
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
    });

    test('a retry replays the same layout, and the next round gets a new one', async () => {
      const { done } = playTrial();
      jest.runAllTimers();
      primaryBtn().click();
      locationCell(0).click();
      await done;

      const retry = playTrial(true, 2);
      expect(gameMock.createPracticeTrial).toHaveBeenCalledTimes(1);
      expect(document.querySelector('#fov-board [data-index="1"] img').getAttribute('src'))
        .toContain('toy1.png');
      jest.runAllTimers();
      primaryBtn().click();
      locationCell(1).click();
      await expect(retry.done).resolves.toEqual(expect.objectContaining({ correct: true }));

      playTrial(false, 1);
      expect(gameMock.createPracticeTrial).toHaveBeenCalledTimes(2);
    });

    test('a retry after the tutorial restarts builds a fresh layout', () => {
      playTrial();
      pending.controller.abort();
      gameMock.createPracticeTrial.mockClear();

      playTrial(true, 2);
      expect(gameMock.createPracticeTrial).toHaveBeenCalledTimes(1);
    });

    test('the next round clears the previous result', async () => {
      const { done } = playTrial();
      jest.runAllTimers();
      primaryBtn().click();
      locationCell(1).click();
      await done;

      playTrial(false);
      expect(feedback()).toBe('');
    });

    test('ending the tutorial mid-trial cancels the trial', () => {
      const { context } = playTrial();
      jest.runOnlyPendingTimers();

      pending.controller.abort();
      jest.runAllTimers();
      expect(context.showMarker).not.toHaveBeenCalled();
      primaryBtn().click();
      expect(feedback()).toBe('');
    });

    test('ending the tutorial during the result flash removes the flash', async () => {
      const { done } = playTrial();
      jest.runAllTimers();
      primaryBtn().click();
      locationCell(1).click();
      await done;

      pending.controller.abort();
      expect(document.querySelector('#fov-stage').classList)
        .not.toContain('fov-stage--flash-correct');
    });

    test('End Game during practice cancels the tutorial and shows the welcome screen', () => {
      playTrial();
      jest.runAllTimers();

      document.querySelector('#fov-stop-btn').click();

      expect(pending.run.cancel).toHaveBeenCalled();
      expect(document.querySelector('#fov-instructions').hidden).toBe(false);
      expect(document.querySelector('#fov-game-area').hidden).toBe(true);
      expect(document.querySelector('#fov-end-panel').hidden).toBe(true);
      expect(gameMock.stopGame).not.toHaveBeenCalled();
      expect(progressMock.saveProgress).not.toHaveBeenCalled();
    });

    test('the real game starts clean after practice', async () => {
      const { done } = playTrial();
      jest.runAllTimers();
      primaryBtn().click();
      locationCell(1).click();
      await done;
      pending.controller.abort();

      gameMock.isRunning.mockReturnValue(true);
      pending.options.onComplete();
      expect(feedback()).toBe('');
      expect(gameMock.startGame).toHaveBeenCalledTimes(1);
      expect(gameMock.createTrialLayout).toHaveBeenCalledTimes(1);
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

    expect(document.querySelector('#fov-session-timer').closest('[aria-live]')).toBeNull();
    expect(document.querySelector('#fov-soa').closest('[aria-live]')).not.toBeNull();
    expect(document.querySelector('#fov-accuracy').closest('[aria-live]')).not.toBeNull();
  });
});
