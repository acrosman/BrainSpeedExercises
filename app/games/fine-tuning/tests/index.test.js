/**
 * index.test.js — Integration tests for the Fine Tuning plugin controller.
 */
import { readFileSync } from 'node:fs';
import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';

jest.unstable_mockModule('../../../components/timerService.js', () => ({
  startTimer: jest.fn((cb) => { if (typeof cb === 'function') cb(1000); }),
  stopTimer: jest.fn(() => 5000),
  resetTimer: jest.fn(),
  getElapsedMs: jest.fn(() => 0),
  isTimerRunning: jest.fn(() => false),
  formatDuration: jest.fn(() => '00:01'),
  getTodayDateString: jest.fn(() => '2024-01-15'),
}));

/** The trial every mocked pickTrial returns. */
const TRIAL = Object.freeze({
  target: 'ba',
  choices: ['da', 'ba'],
  voices: ['lower', 'lower', 'lower'],
  answer: 'second',
  transitionMs: 90,
  isiMs: 450,
  snrDb: null,
});

/** The voice setting held by the mocked game module. */
let mockVoice = 'lower';

jest.unstable_mockModule('../game.js', () => ({
  GAME_ID: 'fine-tuning',
  ANSWERS: ['first', 'second'],
  TARGET_GAP_MS: 600,
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({
    score: 4,
    level: 2,
    trialsCompleted: 7,
    duration: 4000,
  })),
  pickTrial: jest.fn(() => TRIAL),
  recordTrial: jest.fn(() => ({ level: 1, consecutiveCorrect: 1, consecutiveWrong: 0 })),
  getCurrentLevel: jest.fn(() => 1),
  getCurrentLevelConfig: jest.fn(() => ({ transitionMs: 90, isiMs: 450, snrDb: null })),
  getScore: jest.fn(() => 4),
  getTrialsCompleted: jest.fn(() => 7),
  getConsecutiveCorrect: jest.fn(() => 2),
  getConsecutiveWrong: jest.fn(() => 0),
  isRunning: jest.fn(() => true),
  getSpeedHistory: jest.fn(() => []),
  getVoiceSetting: jest.fn(() => mockVoice),
  setVoiceSetting: jest.fn((setting) => {
    if (!['lower', 'higher', 'mixed'].includes(setting)) return false;
    mockVoice = setting;
    return true;
  }),
}));

/** Total audio length the mocked service reports. */
const SEQUENCE_MS = 2000;

jest.unstable_mockModule('../../../components/syllableService.js', () => ({
  getSyllableSequenceDurationMs: jest.fn(() => SEQUENCE_MS),
  playSyllableSequence: jest.fn(() => jest.fn()),
}));

jest.unstable_mockModule('../../../components/audioService.js', () => ({
  playFeedbackSound: jest.fn(),
}));

jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(),
  loadGameScore: jest.fn(async () => ({})),
}));

const pluginModule = await import('../index.js');
const plugin = pluginModule.default;
const {
  announce,
  updateStats,
  handleResponse,
  handleKeyDown,
  loadSavedVoice,
} = pluginModule;

const gameMock = await import('../game.js');
const syllableMock = await import('../../../components/syllableService.js');
const audioMock = await import('../../../components/audioService.js');
const scoreMock = await import('../../../components/scoreService.js');
const timerMock = await import('../../../components/timerService.js');

const INTERFACE_HTML = readFileSync(new URL('../interface.html', import.meta.url), 'utf8');

/** Time from the start of a trial until the answer buttons open. */
const RESPONSE_OPEN_MS = SEQUENCE_MS + 150;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a container holding the real interface.html.
 *
 * @returns {HTMLElement}
 */
function buildContainer() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = INTERFACE_HTML;
  return wrapper;
}

/**
 * Shorthand for document.querySelector.
 *
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
function $(selector) {
  return document.querySelector(selector);
}

/** Let pending promise callbacks run. */
async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/**
 * Start a session and wait until the answer buttons open.
 */
function startAndOpenResponses() {
  plugin.start();
  jest.advanceTimersByTime(RESPONSE_OPEN_MS);
}

/**
 * The stop handle returned by the most recent playSyllableSequence call.
 *
 * @returns {jest.Mock}
 */
function lastStopHandle() {
  const { results } = syllableMock.playSyllableSequence.mock;
  return results[results.length - 1].value;
}

/**
 * Check the voice radio with `value` and fire its change event.
 *
 * @param {string} value
 */
function chooseVoice(value) {
  const input = $(`input[name="ft-voice"][value="${value}"]`);
  input.checked = true;
  input.dispatchEvent(new Event('change'));
}

// ── Plugin contract ───────────────────────────────────────────────────────────

describe('plugin contract', () => {
  test('exposes required lifecycle members', () => {
    expect(plugin.name).toBe('Fine Tuning');
    ['init', 'start', 'stop', 'reset'].forEach((fn) => {
      expect(typeof plugin[fn]).toBe('function');
    });
  });
});

describe('fine-tuning plugin', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockVoice = 'lower';
    document.body.innerHTML = '';
    const container = buildContainer();
    document.body.appendChild(container);
    plugin.init(container);
  });

  afterEach(() => {
    plugin.reset();
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  // ── init ──────────────────────────────────────────────────────────────────

  describe('init', () => {
    test('accepts a null container without throwing', () => {
      expect(() => plugin.init(null)).not.toThrow();
    });

    test('resets the game and closes responses', () => {
      expect(gameMock.initGame).toHaveBeenCalled();
      expect($('#ft-btn-first').disabled).toBe(true);
      expect($('#ft-btn-second').disabled).toBe(true);
      expect($('#ft-replay-btn').disabled).toBe(true);
    });

    test('registers the keydown handler only once', () => {
      plugin.init(document.body.firstElementChild);
      startAndOpenResponses();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
      expect(gameMock.recordTrial).toHaveBeenCalledTimes(1);
    });
  });

  // ── Voice setting ─────────────────────────────────────────────────────────

  describe('voice setting', () => {
    test('checks the radio for the current setting', () => {
      expect($('input[value="lower"]').checked).toBe(true);
    });

    test('keeps the setting across re-entry', () => {
      mockVoice = 'higher';
      document.body.innerHTML = '';
      const container = buildContainer();
      document.body.appendChild(container);
      plugin.init(container);
      expect($('input[value="higher"]').checked).toBe(true);
      expect($('input[value="lower"]').checked).toBe(false);
    });

    test('changing the radio sets the voice', () => {
      chooseVoice('mixed');
      expect(gameMock.setVoiceSetting).toHaveBeenCalledWith('mixed');
      expect(mockVoice).toBe('mixed');
    });

    test('an unchecked radio change does nothing', () => {
      const input = $('input[value="higher"]');
      input.dispatchEvent(new Event('change'));
      expect(gameMock.setVoiceSetting).not.toHaveBeenCalledWith('higher');
      expect(mockVoice).toBe('lower');
    });

    test('init restores the saved voice', async () => {
      expect(scoreMock.loadGameScore).toHaveBeenCalledWith('fine-tuning');
      scoreMock.loadGameScore.mockResolvedValueOnce({ voice: 'mixed' });
      await loadSavedVoice();
      expect(mockVoice).toBe('mixed');
      expect($('input[value="mixed"]').checked).toBe(true);
    });

    test('ignores an invalid saved voice', async () => {
      scoreMock.loadGameScore.mockResolvedValueOnce({ voice: 'child' });
      await loadSavedVoice();
      expect(mockVoice).toBe('lower');
      expect($('input[value="lower"]').checked).toBe(true);
    });

    test('ignores a missing record', async () => {
      await flushMicrotasks();
      gameMock.setVoiceSetting.mockClear();
      scoreMock.loadGameScore.mockResolvedValueOnce(null);
      await expect(loadSavedVoice()).resolves.toBeUndefined();
      expect(gameMock.setVoiceSetting).not.toHaveBeenCalled();
    });
  });

  // ── start and the trial cycle ─────────────────────────────────────────────

  describe('start', () => {
    test('shows the game area and moves focus to the status', () => {
      plugin.start();
      expect(gameMock.startGame).toHaveBeenCalled();
      expect($('#ft-instructions').hidden).toBe(true);
      expect($('#ft-end-panel').hidden).toBe(true);
      expect($('#ft-game-area').hidden).toBe(false);
      expect(document.activeElement).toBe($('#ft-status'));
    });

    test('the Start button starts a session', () => {
      $('#ft-start-btn').click();
      expect(gameMock.startGame).toHaveBeenCalled();
    });

    test('starts the session timer and shows its time', () => {
      plugin.start();
      expect(timerMock.startTimer).toHaveBeenCalled();
      expect($('#ft-session-timer').textContent).toBe('00:01');
    });

    test('plays the target, then both choices, with the trial settings', () => {
      plugin.start();
      const sequence = {
        syllables: ['ba', 'da', 'ba'],
        voices: ['lower', 'lower', 'lower'],
        gapsMs: [600, 450],
        transitionMs: 90,
        snrDb: null,
      };
      expect(syllableMock.playSyllableSequence).toHaveBeenCalledWith(sequence);
      expect(syllableMock.getSyllableSequenceDurationMs).toHaveBeenCalledWith(sequence);
      expect($('#ft-status').textContent).toBe('Listen: the target, then two sounds...');
    });

    test('clears old feedback', () => {
      $('#ft-feedback').textContent = 'Old';
      plugin.start();
      expect($('#ft-feedback').textContent).toBe('');
    });

    test('opens responses once the audio ends, and focuses First', () => {
      plugin.start();
      jest.advanceTimersByTime(RESPONSE_OPEN_MS - 1);
      expect($('#ft-btn-first').disabled).toBe(true);
      jest.advanceTimersByTime(1);
      expect($('#ft-btn-first').disabled).toBe(false);
      expect($('#ft-btn-second').disabled).toBe(false);
      expect($('#ft-replay-btn').disabled).toBe(false);
      expect(document.activeElement).toBe($('#ft-btn-first'));
      expect($('#ft-status').textContent).toBe('Which sound matched the target?');
    });

    test('does not start a trial when the game is not running', () => {
      gameMock.isRunning.mockReturnValueOnce(false);
      plugin.start();
      expect(gameMock.pickTrial).not.toHaveBeenCalled();
    });
  });

  describe('responses', () => {
    test('are ignored before the audio ends', () => {
      plugin.start();
      handleResponse('second');
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
    });

    test('a correct answer scores, gives feedback, and starts the next trial', () => {
      startAndOpenResponses();
      $('#ft-btn-second').click();
      expect(gameMock.recordTrial).toHaveBeenCalledWith({ success: true });
      expect(audioMock.playFeedbackSound).toHaveBeenCalledWith(true);
      expect($('#ft-feedback').textContent).toBe('Correct!');
      expect($('#ft-btn-first').disabled).toBe(true);
      expect($('#ft-score').textContent).toBe('4');
      expect($('#ft-level').textContent).toBe('2');
      expect($('#ft-streak').textContent).toBe('2');

      jest.advanceTimersByTime(500);
      expect(gameMock.pickTrial).toHaveBeenCalledTimes(2);
    });

    test('a wrong answer names the target and where it was', () => {
      startAndOpenResponses();
      $('#ft-btn-first').click();
      expect(gameMock.recordTrial).toHaveBeenCalledWith({ success: false });
      expect(audioMock.playFeedbackSound).toHaveBeenCalledWith(false);
      expect($('#ft-feedback').textContent)
        .toBe('Incorrect - the target "ba" was the second sound.');
    });

    test('no next trial is scheduled once the session has stopped', () => {
      startAndOpenResponses();
      gameMock.isRunning.mockReturnValue(false);
      handleResponse('second');
      jest.advanceTimersByTime(500);
      expect(gameMock.pickTrial).toHaveBeenCalledTimes(1);
      gameMock.isRunning.mockReturnValue(true);
    });

    test('keys 1 and 2 answer First and Second', () => {
      startAndOpenResponses();
      handleKeyDown(new KeyboardEvent('keydown', { key: '2' }));
      expect(gameMock.recordTrial).toHaveBeenCalledWith({ success: true });

      jest.advanceTimersByTime(500 + RESPONSE_OPEN_MS);
      handleKeyDown(new KeyboardEvent('keydown', { key: '1' }));
      expect(gameMock.recordTrial).toHaveBeenLastCalledWith({ success: false });
    });

    test('other keys, and keys before the audio ends, are ignored', () => {
      plugin.start();
      handleKeyDown(new KeyboardEvent('keydown', { key: '1' }));
      jest.advanceTimersByTime(RESPONSE_OPEN_MS);
      handleKeyDown(new KeyboardEvent('keydown', { key: '3' }));
      handleKeyDown(new KeyboardEvent('keydown', { key: 'a' }));
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
    });
  });

  describe('replay', () => {
    test('stops the audio and plays the same trial again', () => {
      startAndOpenResponses();
      const firstStop = lastStopHandle();
      $('#ft-replay-btn').click();
      expect(firstStop).toHaveBeenCalled();
      expect(syllableMock.playSyllableSequence).toHaveBeenCalledTimes(2);
      expect(syllableMock.playSyllableSequence.mock.calls[1][0])
        .toEqual(syllableMock.playSyllableSequence.mock.calls[0][0]);
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
    });
  });

  // ── stop ──────────────────────────────────────────────────────────────────

  describe('stop', () => {
    test('silences the trial and saves the result with the voice', () => {
      mockVoice = 'mixed';
      plugin.start();
      const stopAudio = lastStopHandle();
      const result = plugin.stop();

      expect(stopAudio).toHaveBeenCalled();
      expect(result).toEqual({ score: 4, level: 2, trialsCompleted: 7, duration: 4000 });
      expect(scoreMock.saveScore).toHaveBeenCalledWith(
        'fine-tuning',
        { score: 4, level: 2, sessionDurationMs: 5000 },
        { voice: 'mixed' },
      );
    });

    test('shows the end panel with the results', () => {
      plugin.start();
      plugin.stop();
      expect($('#ft-game-area').hidden).toBe(true);
      expect($('#ft-end-panel').hidden).toBe(false);
      expect($('#ft-final-level').textContent).toBe('3');
      expect($('#ft-final-score').textContent).toBe('4');
      expect($('#ft-final-trials').textContent).toBe('7');
    });

    test('the End Game button stops the session', () => {
      plugin.start();
      $('#ft-stop-btn').click();
      expect(gameMock.stopGame).toHaveBeenCalled();
    });

    test('cancels the pending response phase', () => {
      plugin.start();
      plugin.stop();
      jest.advanceTimersByTime(RESPONSE_OPEN_MS);
      expect($('#ft-btn-first').disabled).toBe(true);
    });

    test('cancels the pending next trial', () => {
      startAndOpenResponses();
      handleResponse('second');
      plugin.stop();
      jest.advanceTimersByTime(500);
      expect(gameMock.pickTrial).toHaveBeenCalledTimes(1);
    });

    test('does not save a session with no completed trials', () => {
      gameMock.stopGame.mockReturnValueOnce({
        score: 0, level: 0, trialsCompleted: 0, duration: 100,
      });
      plugin.start();
      plugin.stop();
      expect(scoreMock.saveScore).not.toHaveBeenCalled();
    });

    test('with no session running, returns the idle result without saving', () => {
      gameMock.isRunning.mockReturnValueOnce(false);
      const result = plugin.stop();
      expect(result).toEqual({ score: 4, level: 1, trialsCompleted: 7, duration: 0 });
      expect(gameMock.stopGame).not.toHaveBeenCalled();
      expect(scoreMock.saveScore).not.toHaveBeenCalled();
      expect($('#ft-end-panel').hidden).toBe(true);
    });
  });

  // ── reset and the end panel buttons ───────────────────────────────────────

  describe('reset', () => {
    test('silences the trial and returns to the welcome panel', () => {
      plugin.start();
      const stopAudio = lastStopHandle();
      $('#ft-feedback').textContent = 'x';
      plugin.reset();
      expect(stopAudio).toHaveBeenCalled();
      expect(timerMock.resetTimer).toHaveBeenCalled();
      expect($('#ft-instructions').hidden).toBe(false);
      expect($('#ft-game-area').hidden).toBe(true);
      expect($('#ft-end-panel').hidden).toBe(true);
      expect($('#ft-feedback').textContent).toBe('');
      expect($('#ft-status').textContent).toBe('');
      expect($('#ft-session-timer').textContent).toBe('00:00');
    });

    test('Play Again resets and starts a new session', () => {
      plugin.start();
      plugin.stop();
      gameMock.initGame.mockClear();
      $('#ft-play-again-btn').click();
      expect(gameMock.initGame).toHaveBeenCalled();
      expect(gameMock.startGame).toHaveBeenCalledTimes(2);
      expect($('#ft-game-area').hidden).toBe(false);
    });

    test('Return to Menu leaves the game', () => {
      const listener = jest.fn();
      window.addEventListener('bsx:return-to-main-menu', listener);
      $('#ft-return-btn').click();
      expect(listener).toHaveBeenCalled();
      window.removeEventListener('bsx:return-to-main-menu', listener);
    });
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  describe('announce and updateStats', () => {
    test('updateStats writes the stats bar', () => {
      updateStats();
      expect($('#ft-level').textContent).toBe('2');
      expect($('#ft-trials').textContent).toBe('7');
    });

    test('announce falls back to the feedback region without a status element', async () => {
      $('#ft-status').remove();
      plugin.init(document.body.firstElementChild);
      await flushMicrotasks();
      announce('Hello');
      expect($('#ft-feedback').textContent).toBe('Hello');
    });

    test('announce does nothing with neither region', () => {
      $('#ft-status').remove();
      $('#ft-feedback').remove();
      plugin.init(document.body.firstElementChild);
      expect(() => announce('Hello')).not.toThrow();
    });
  });
});
