import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';

jest.unstable_mockModule('../game.js', () => ({
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
  createTrialLayout: jest.fn(() => ({
    gridSize: 3,
    centerIndex: 4,
    centerIcon: {
      id: 'primary-kitten',
      file: 'primaryKitten.png',
      width: 220,
      height: 220,
    },
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
      { index: 4, role: 'center', icon: { id: 'primary-kitten', file: 'primaryKitten.png' } },
      { index: 5, role: 'empty', icon: null },
      { index: 6, role: 'empty', icon: null },
      { index: 7, role: 'empty', icon: null },
      { index: 8, role: 'empty', icon: null },
    ],
  })),
  recordTrial: jest.fn(() => ({ thresholdMs: 84.2, recentAccuracy: 0.8, successCounter: 0 })),
  getCurrentSoaMs: jest.fn(() => 84.2),
  getRecentAccuracy: jest.fn(() => 0.8),
  getTrialsCompleted: jest.fn(() => 4),
  getThresholdHistory: jest.fn(() => [{ trial: 1, thresholdMs: 200, success: true }]),
}));

jest.unstable_mockModule('../audio.js', () => ({
  playFeedbackSound: jest.fn(),
}));

jest.unstable_mockModule('../progress.js', () => ({
  saveProgress: jest.fn(),
}));

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const gameMock = await import('../game.js');
const progressMock = await import('../progress.js');

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
    <div id="fov-response" hidden></div>
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
    <button id="fov-stop-btn" type="button">Stop</button>
    <button id="fov-play-again-btn" type="button">Play Again</button>
    <button id="fov-return-btn" type="button">Return</button>
    <button id="fov-center-primary" type="button">Primary Kitten</button>
    <button id="fov-center-secondary" type="button">Secondary Kitten</button>
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

  test('start enters game area and eventually shows response phase', () => {
    plugin.start();

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

  test('response submission records trial after selecting center and peripheral', () => {
    plugin.start();
    jest.runAllTimers();

    const centerPrimary = document.querySelector('#fov-center-primary');
    const peripheralCell = document.querySelector('[data-index="1"]');

    centerPrimary.click();
    peripheralCell.click();

    expect(gameMock.recordTrial).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );

    const trendLine = document.querySelector('#fov-trend-line');
    expect(trendLine.getAttribute('points')).not.toBe('');
  });

  test('stimulus phase renders kitten and toy images', () => {
    plugin.start();

    const images = document.querySelectorAll('#fov-board img');
    expect(images.length).toBe(2);

    const sources = Array.from(images).map((el) => el.getAttribute('src'));
    expect(sources.some((src) => src.includes('primaryKitten.png'))).toBe(true);
    expect(sources.some((src) => src.includes('toy1.png'))).toBe(true);
  });

  test('stop returns running result and updates end panel', () => {
    plugin.start();
    const result = plugin.stop();

    expect(result.thresholdMs).toBe(84.2);
    expect(document.querySelector('#fov-end-panel').hidden).toBe(false);
    expect(document.querySelector('#fov-final-threshold').textContent).toBe('84.2');
    expect(document.querySelector('#fov-final-best-threshold').textContent).toBe('200');
    expect(progressMock.saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ thresholdMs: 84.2, trialsCompleted: 4 }),
    );
  });

  test('stop returns idle result when game is not running', () => {
    gameMock.isRunning.mockReturnValueOnce(false);

    const result = plugin.stop();

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

  test('reset returns to instruction state', () => {
    plugin.start();
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

  test('play again button resets and starts again from end panel', () => {
    plugin.stop();
    document.querySelector('#fov-play-again-btn').click();

    expect(document.querySelector('#fov-game-area').hidden).toBe(false);
    expect(gameMock.startGame).toHaveBeenCalled();
  });

  test('start and stop buttons invoke lifecycle handlers via click', () => {
    gameMock.startGame.mockClear();
    gameMock.stopGame.mockClear();

    document.querySelector('#fov-start-btn').click();
    document.querySelector('#fov-stop-btn').click();

    expect(gameMock.startGame).toHaveBeenCalled();
    expect(gameMock.stopGame).toHaveBeenCalled();
  });

  test('center secondary click updates center selection and can submit', () => {
    plugin.start();
    jest.runAllTimers();

    document.querySelector('#fov-center-secondary').click();
    document.querySelector('[data-index="1"]').click();

    expect(gameMock.recordTrial).toHaveBeenCalled();
  });

  test('center choice is ignored before response phase is enabled', () => {
    gameMock.recordTrial.mockClear();

    // Before start(), response input is disabled and chooseCenter should return early.
    document.querySelector('#fov-center-secondary').click();

    expect(gameMock.recordTrial).not.toHaveBeenCalled();
  });

  test('feedback flash timeout clears stage flash class', () => {
    gameMock.recordTrial.mockReturnValueOnce({ thresholdMs: 84.2, recentAccuracy: 0.8 });
    plugin.start();
    jest.runAllTimers();

    document.querySelector('#fov-center-primary').click();
    document.querySelector('[data-index="1"]').click();

    const stage = document.querySelector('#fov-stage');
    expect(stage.classList.contains('fov-stage--flash-correct')).toBe(true);

    jest.runOnlyPendingTimers();
    expect(stage.classList.contains('fov-stage--flash-correct')).toBe(false);
  });

  test('next-trial timer callback starts another trial when still running', () => {
    gameMock.isRunning.mockReturnValue(true);
    gameMock.createTrialLayout.mockClear();

    plugin.start();
    jest.runAllTimers();

    document.querySelector('#fov-center-primary').click();
    document.querySelector('[data-index="1"]').click();

    jest.runOnlyPendingTimers();
    expect(gameMock.createTrialLayout).toHaveBeenCalledTimes(2);
  });

  test('stimulus and mask phases take raf else-path before completing', () => {
    let t = 0;
    nowSpy.mockRestore();
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
      t += 50;
      return t;
    });
    gameMock.getCurrentSoaMs.mockReturnValueOnce(300);

    plugin.start();
    jest.runAllTimers();

    expect(document.querySelector('#fov-mask').hidden).toBe(false);
    expect(document.querySelector('#fov-response').hidden).toBe(false);
  });

  test('stimulus raf loop iterates when elapsed is below soa (covers loop continuation)', () => {
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

    plugin.start();
    jest.runAllTimers();

    expect(document.querySelector('#fov-mask').hidden).toBe(false);
    expect(document.querySelector('#fov-response').hidden).toBe(false);
  });

  test('stop during mask phase cancels pending mask raf (lines 175-176)', () => {
    // Complete only the stimulus phase so a mask RAF is scheduled but not yet run.
    plugin.start();
    jest.runOnlyPendingTimers(); // fires stimulus RAF → schedules mask RAF
    // _maskRafId is now set; stopping here exercises the mask-raf cancellation path.
    plugin.stop();

    expect(document.querySelector('#fov-end-panel').hidden).toBe(false);
  });

  test('nowMs falls back to Date.now when performance.now is not a function (line 119)', () => {
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

    plugin.start(); // runStimulusPhase → nowMs() → Date.now()

    expect(dateSpy).toHaveBeenCalled();

    performance.now = origNow;
    dateSpy.mockRestore();
    // Re-create a spy so afterEach's nowSpy.mockRestore() does not throw.
    nowSpy = jest.spyOn(performance, 'now').mockReturnValue(10200);
    // Clean up pending timers without running them to avoid infinite loops.
    jest.clearAllTimers();
  });

  test('start exits before trial creation when game is not running', () => {
    gameMock.isRunning.mockReturnValue(false);
    gameMock.createTrialLayout.mockClear();

    plugin.start();

    expect(gameMock.createTrialLayout).not.toHaveBeenCalled();
  });
});
