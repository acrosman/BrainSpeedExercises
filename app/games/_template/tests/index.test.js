import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';

jest.unstable_mockModule('../../../components/timerService.js', () => ({
  startTimer: jest.fn((cb) => { if (typeof cb === 'function') cb(1000); }),
  stopTimer: jest.fn(() => 5000),
  resetTimer: jest.fn(),
  formatDuration: jest.fn(() => '00:01'),
}));

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playFeedbackSound: jest.fn(),
}));

jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(() => Promise.resolve({})),
}));

jest.unstable_mockModule('../../../components/trendChartService.js', () => ({
  renderTrendChart: jest.fn(),
}));

jest.unstable_mockModule('../game.js', () => ({
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({ score: 4, level: 2, trialsCompleted: 7, duration: 5000 })),
  recordTrial: jest.fn(),
  getCurrentLevel: jest.fn(() => 2),
  getCurrentLevelConfig: jest.fn(() => ({ displayTimeMs: 300 })),
  getScore: jest.fn(() => 4),
  getTrialsCompleted: jest.fn(() => 0),
  isRunning: jest.fn(() => true),
  getSpeedHistory: jest.fn(() => [300]),
}));

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const { announce, handleResponse } = pluginModule;
const game = await import('../game.js');
const { saveScore } = await import('../../../components/scoreService.js');
const { playFeedbackSound } = await import('../../../components/audioService.js');
const { renderTrendChart } = await import('../../../components/trendChartService.js');
const timerService = await import('../../../components/timerService.js');

const html = readFileSync(new URL('../interface.html', import.meta.url), 'utf8');

/**
 * Build a container from the template's real interface.html.
 *
 * @returns {HTMLElement}
 */
function buildContainer() {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

/** @type {HTMLElement} */
let container;

/**
 * Find an element in the container by ID.
 *
 * @param {string} id
 * @returns {HTMLElement}
 */
const $ = (id) => container.querySelector(`#${id}`);

beforeEach(() => {
  jest.clearAllMocks();
  game.isRunning.mockReturnValue(true);
  container = buildContainer();
  plugin.init(container);
});

describe('plugin contract', () => {
  test('exposes name, init, start, stop, and reset', () => {
    expect(typeof plugin.name).toBe('string');
    ['init', 'start', 'stop', 'reset'].forEach((fn) => {
      expect(typeof plugin[fn]).toBe('function');
    });
  });
});

describe('init', () => {
  test('resets game state and fills the stats bar', () => {
    expect(game.initGame).toHaveBeenCalled();
    expect($('game-template-score').textContent).toBe('4');
    expect($('game-template-level').textContent).toBe('3');
  });

  test('accepts null without throwing', () => {
    expect(() => plugin.init(null)).not.toThrow();
  });

  test('session timer is not inside a live region', () => {
    expect($('game-template-timer').closest('[aria-live]')).toBeNull();
    expect($('game-template-score').closest('[aria-live]')).not.toBeNull();
  });

  test('Return to Menu dispatches bsx:return-to-main-menu on window', () => {
    const listener = jest.fn();
    window.addEventListener('bsx:return-to-main-menu', listener);
    $('game-template-return').click();
    window.removeEventListener('bsx:return-to-main-menu', listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('Play Again resets and starts a new session', () => {
    $('game-template-play-again').click();
    expect(timerService.resetTimer).toHaveBeenCalled();
    expect(game.startGame).toHaveBeenCalled();
  });
});

describe('start', () => {
  test('starts the game and timer and shows the play area', () => {
    $('game-template-start').click();
    expect(game.startGame).toHaveBeenCalled();
    expect($('game-template-timer').textContent).toBe('00:01');
    expect($('game-template-instructions').hidden).toBe(true);
    expect($('game-template-play-area').hidden).toBe(false);
    expect($('game-template-end-panel').hidden).toBe(true);
    expect(renderTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({ lineEl: $('game-template-trend-line') }),
      [300],
      300,
    );
  });
});

describe('handleResponse', () => {
  test('records the trial, plays a sound, and announces the result', () => {
    handleResponse(true);
    expect(game.recordTrial).toHaveBeenCalledWith({ success: true });
    expect(playFeedbackSound).toHaveBeenCalledWith(true);
    expect($('game-template-feedback').textContent).toBe('Correct!');

    handleResponse(false);
    expect($('game-template-feedback').textContent).toBe('Incorrect.');
  });

  test('does nothing when the game is not running', () => {
    game.isRunning.mockReturnValue(false);
    handleResponse(true);
    expect(game.recordTrial).not.toHaveBeenCalled();
  });
});

describe('stop', () => {
  test('saves the session and shows the end panel', () => {
    plugin.start();
    const result = plugin.stop();
    expect(result).toMatchObject({ score: 4, level: 2, trialsCompleted: 7 });
    expect(saveScore).toHaveBeenCalledWith('game-id-slug', {
      score: 4,
      level: 2,
      sessionDurationMs: 5000,
    });
    expect($('game-template-play-area').hidden).toBe(true);
    expect($('game-template-end-panel').hidden).toBe(false);
    expect($('game-template-final-score').textContent).toBe('4');
    expect($('game-template-final-level').textContent).toBe('3');
  });

  test('returns an idle result and skips saving when no session is running', () => {
    game.isRunning.mockReturnValue(false);
    const result = plugin.stop();
    expect(game.stopGame).not.toHaveBeenCalled();
    expect(result).toEqual({ score: 4, level: 2, trialsCompleted: 0, duration: 0 });
    expect(saveScore).not.toHaveBeenCalled();
  });
});

describe('reset', () => {
  test('returns to the instructions panel and clears the timer', () => {
    plugin.start();
    announce('Correct!');
    plugin.reset();
    expect(game.initGame).toHaveBeenCalled();
    expect(timerService.resetTimer).toHaveBeenCalled();
    expect($('game-template-timer').textContent).toBe('00:00');
    expect($('game-template-feedback').textContent).toBe('');
    expect($('game-template-instructions').hidden).toBe(false);
    expect($('game-template-play-area').hidden).toBe(true);
    expect($('game-template-end-panel').hidden).toBe(true);
  });

  test('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => plugin.reset()).not.toThrow();
  });
});
