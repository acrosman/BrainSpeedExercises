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

/** The trial every mocked generatePracticeTrial returns. */
const PRACTICE_TRIAL = Object.freeze({
  target: 'di',
  choices: ['di', 'gi'],
  voices: ['higher', 'higher', 'higher'],
  answer: 'first',
  transitionMs: 100,
  isiMs: 500,
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
  generatePracticeTrial: jest.fn(() => PRACTICE_TRIAL),
  formatAnswer: jest.fn((answer) => answer.charAt(0).toUpperCase() + answer.slice(1)),
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

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
  loadTutorialSteps: jest.fn(async () => [
    { title: 'Welcome to Fine Tuning', content: '<p>Welcome</p>' },
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
const tutorialServiceMock = await import('../../../components/tutorialService.js');
// The real tutorial module runs, on top of the mocked tutorialService.
const { PRACTICE_TEXT } = await import('../tutorial/tutorial.js');

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
 *
 * @returns {Promise<void>}
 */
async function startAndOpenResponses() {
  await plugin.start();
  jest.advanceTimersByTime(RESPONSE_OPEN_MS);
}

/**
 * Make the next start() open a guided tutorial that stays in progress until the test
 * calls finish(). Like the real runner, cancel() aborts the practice signal and ends the run.
 *
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
 *
 * @param {AbortController} controller - Supplies the context's signal.
 * @param {boolean} [guided=true]
 * @returns {object}
 */
function buildPracticeContext(controller, guided = true) {
  return {
    round: guided ? 1 : 2,
    attempt: 1,
    maxRounds: 2,
    guided,
    signal: controller.signal,
    setInstructions: jest.fn(),
    showMarker: jest.fn(),
    hideMarker: jest.fn(),
  };
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
  test('exposes required lifecycle members', async () => {
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
    test('accepts a null container without throwing', async () => {
      expect(() => plugin.init(null)).not.toThrow();
    });

    test('resets the game and closes responses', async () => {
      expect(gameMock.initGame).toHaveBeenCalled();
      expect($('#ft-btn-first').disabled).toBe(true);
      expect($('#ft-btn-second').disabled).toBe(true);
      expect($('#ft-replay-btn').disabled).toBe(true);
    });

    test('registers the keydown handler only once', async () => {
      plugin.init(document.body.firstElementChild);
      await startAndOpenResponses();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
      expect(gameMock.recordTrial).toHaveBeenCalledTimes(1);
    });
  });

  // ── Voice setting ─────────────────────────────────────────────────────────

  describe('voice setting', () => {
    test('checks the radio for the current setting', async () => {
      expect($('input[value="lower"]').checked).toBe(true);
    });

    test('keeps the setting across re-entry', async () => {
      mockVoice = 'higher';
      document.body.innerHTML = '';
      const container = buildContainer();
      document.body.appendChild(container);
      plugin.init(container);
      expect($('input[value="higher"]').checked).toBe(true);
      expect($('input[value="lower"]').checked).toBe(false);
    });

    test('changing the voice mid-trial keeps the trial\'s voices on Replay', async () => {
      await startAndOpenResponses();
      chooseVoice('higher');
      $('#ft-replay-btn').click();
      expect(syllableMock.playSyllableSequence.mock.calls[1][0].voices)
        .toEqual(['lower', 'lower', 'lower']);
      expect(mockVoice).toBe('higher');
    });

    test('changing the radio sets the voice', async () => {
      chooseVoice('mixed');
      expect(gameMock.setVoiceSetting).toHaveBeenCalledWith('mixed');
      expect(mockVoice).toBe('mixed');
    });

    test('an unchecked radio change does nothing', async () => {
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
    test('shows the game area and moves focus to the status', async () => {
      await plugin.start();
      expect(gameMock.startGame).toHaveBeenCalled();
      expect($('#ft-instructions').hidden).toBe(true);
      expect($('#ft-end-panel').hidden).toBe(true);
      expect($('#ft-game-area').hidden).toBe(false);
      expect(document.activeElement).toBe($('#ft-status'));
    });

    test('the Start button starts a session', async () => {
      $('#ft-start-btn').click();
      await flushMicrotasks();
      expect(gameMock.startGame).toHaveBeenCalled();
    });

    test('starts the session timer and shows its time', async () => {
      await plugin.start();
      expect(timerMock.startTimer).toHaveBeenCalled();
      expect($('#ft-session-timer').textContent).toBe('00:01');
    });

    test('plays the target, then both choices, with the trial settings', async () => {
      await plugin.start();
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

    test('clears old feedback', async () => {
      $('#ft-feedback').textContent = 'Old';
      await plugin.start();
      expect($('#ft-feedback').textContent).toBe('');
    });

    test('opens responses once the audio ends, and focuses First', async () => {
      await plugin.start();
      jest.advanceTimersByTime(RESPONSE_OPEN_MS - 1);
      expect($('#ft-btn-first').disabled).toBe(true);
      jest.advanceTimersByTime(1);
      expect($('#ft-btn-first').disabled).toBe(false);
      expect($('#ft-btn-second').disabled).toBe(false);
      expect($('#ft-replay-btn').disabled).toBe(false);
      expect(document.activeElement).toBe($('#ft-btn-first'));
      expect($('#ft-status').textContent).toBe('Which sound matched the target?');
    });

    test('does not start a trial when the game is not running', async () => {
      gameMock.isRunning.mockReturnValueOnce(false);
      await plugin.start();
      expect(gameMock.pickTrial).not.toHaveBeenCalled();
    });
  });

  describe('responses', () => {
    test('are ignored before the audio ends', async () => {
      await plugin.start();
      handleResponse('second');
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
    });

    test('a correct answer scores, gives feedback, and starts the next trial', async () => {
      await startAndOpenResponses();
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

    test('a wrong answer names the target and where it was', async () => {
      await startAndOpenResponses();
      $('#ft-btn-first').click();
      expect(gameMock.recordTrial).toHaveBeenCalledWith({ success: false });
      expect(audioMock.playFeedbackSound).toHaveBeenCalledWith(false);
      expect($('#ft-feedback').textContent)
        .toBe('Incorrect - the target "ba" was the second sound.');
    });

    test('no next trial is scheduled once the session has stopped', async () => {
      await startAndOpenResponses();
      gameMock.isRunning.mockReturnValue(false);
      handleResponse('second');
      jest.advanceTimersByTime(500);
      expect(gameMock.pickTrial).toHaveBeenCalledTimes(1);
      gameMock.isRunning.mockReturnValue(true);
    });

    test('keys 1 and 2 answer First and Second', async () => {
      await startAndOpenResponses();
      handleKeyDown(new KeyboardEvent('keydown', { key: '2' }));
      expect(gameMock.recordTrial).toHaveBeenCalledWith({ success: true });

      jest.advanceTimersByTime(500 + RESPONSE_OPEN_MS);
      handleKeyDown(new KeyboardEvent('keydown', { key: '1' }));
      expect(gameMock.recordTrial).toHaveBeenLastCalledWith({ success: false });
    });

    test('other keys, and keys before the audio ends, are ignored', async () => {
      await plugin.start();
      handleKeyDown(new KeyboardEvent('keydown', { key: '1' }));
      jest.advanceTimersByTime(RESPONSE_OPEN_MS);
      handleKeyDown(new KeyboardEvent('keydown', { key: '3' }));
      handleKeyDown(new KeyboardEvent('keydown', { key: 'a' }));
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
    });
  });

  describe('replay', () => {
    test('stops the audio and plays the same trial again', async () => {
      await startAndOpenResponses();
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
    test('silences the trial and saves the result with the voice', async () => {
      mockVoice = 'mixed';
      await plugin.start();
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

    test('shows the end panel with the results', async () => {
      await plugin.start();
      plugin.stop();
      expect($('#ft-game-area').hidden).toBe(true);
      expect($('#ft-end-panel').hidden).toBe(false);
      expect($('#ft-final-level').textContent).toBe('3');
      expect($('#ft-final-score').textContent).toBe('4');
      expect($('#ft-final-trials').textContent).toBe('7');
    });

    test('the End Game button stops the session', async () => {
      await plugin.start();
      $('#ft-stop-btn').click();
      expect(gameMock.stopGame).toHaveBeenCalled();
    });

    test('cancels the pending response phase', async () => {
      await plugin.start();
      plugin.stop();
      jest.advanceTimersByTime(RESPONSE_OPEN_MS);
      expect($('#ft-btn-first').disabled).toBe(true);
    });

    test('cancels the pending next trial', async () => {
      await startAndOpenResponses();
      handleResponse('second');
      plugin.stop();
      jest.advanceTimersByTime(500);
      expect(gameMock.pickTrial).toHaveBeenCalledTimes(1);
    });

    test('does not save a session with no completed trials', async () => {
      gameMock.stopGame.mockReturnValueOnce({
        score: 0, level: 0, trialsCompleted: 0, duration: 100,
      });
      await plugin.start();
      plugin.stop();
      expect(scoreMock.saveScore).not.toHaveBeenCalled();
    });

    test('with no session running, returns the idle result without saving', async () => {
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
    test('silences the trial and returns to the welcome panel', async () => {
      await plugin.start();
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

    test('Play Again resets and starts a new session', async () => {
      await plugin.start();
      plugin.stop();
      gameMock.initGame.mockClear();
      $('#ft-play-again-btn').click();
      await flushMicrotasks();
      expect(gameMock.initGame).toHaveBeenCalled();
      expect(gameMock.startGame).toHaveBeenCalledTimes(2);
      expect($('#ft-game-area').hidden).toBe(false);
    });

    test('Return to Menu leaves the game', async () => {
      const listener = jest.fn();
      window.addEventListener('bsx:return-to-main-menu', listener);
      $('#ft-return-btn').click();
      expect(listener).toHaveBeenCalled();
      window.removeEventListener('bsx:return-to-main-menu', listener);
    });
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  describe('announce and updateStats', () => {
    test('updateStats writes the stats bar', async () => {
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

    test('announce does nothing with neither region', async () => {
      $('#ft-status').remove();
      $('#ft-feedback').remove();
      plugin.init(document.body.firstElementChild);
      expect(() => announce('Hello')).not.toThrow();
    });
  });

  // ── guided tutorial ───────────────────────────────────────────────────────

  describe('guided tutorial', () => {
    test('Replay Tutorial runs the guided tutorial and then starts the game', async () => {
      $('#ft-replay-tutorial-btn').click();
      await flushMicrotasks();
      expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
        gameId: 'fine-tuning',
        container: expect.any(HTMLElement),
        playPracticeRound: expect.any(Function),
      }));
      expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
      expect(gameMock.startGame).toHaveBeenCalled();
      expect($('#ft-game-area').hidden).toBe(false);
    });

    test('Start waits for the tutorial to complete', async () => {
      const { options } = await startPendingTutorial();
      expect(gameMock.startGame).not.toHaveBeenCalled();
      expect($('#ft-game-area').hidden).toBe(true);

      options.onComplete();
      expect(gameMock.startGame).toHaveBeenCalled();
      expect($('#ft-game-area').hidden).toBe(false);
    });

    test('stop() with no session ignores a tutorial that already finished', async () => {
      const { finish } = await startPendingTutorial();
      finish();
      gameMock.isRunning.mockReturnValueOnce(false);
      $('#ft-end-panel').hidden = false;
      gameMock.initGame.mockClear();

      plugin.stop();
      expect(gameMock.initGame).not.toHaveBeenCalled();
      expect($('#ft-end-panel').hidden).toBe(false);
    });
  });

  // ── practice trial ────────────────────────────────────────────────────────

  describe('practice trial', () => {
    /** The practice trial's sequence, as it reaches the syllable service. */
    const PRACTICE_SEQUENCE = {
      syllables: ['di', 'di', 'gi'],
      voices: ['higher', 'higher', 'higher'],
      gapsMs: [600, 500],
      transitionMs: 100,
      snrDb: null,
    };
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
     *
     * @param {boolean} [guided=true]
     * @returns {{ context: object, done: Promise<void> }}
     */
    function playPractice(guided = true) {
      const context = buildPracticeContext(pending.controller, guided);
      const done = pending.options.playPracticeRound(context);
      return { context, done };
    }

    test('plays the practice trial without starting a session', async () => {
      const { context } = playPractice();
      expect($('#ft-instructions').hidden).toBe(true);
      expect($('#ft-game-area').hidden).toBe(false);
      expect(syllableMock.playSyllableSequence).toHaveBeenCalledWith(PRACTICE_SEQUENCE);
      expect(gameMock.pickTrial).not.toHaveBeenCalled();
      expect(gameMock.startGame).not.toHaveBeenCalled();
      expect(timerMock.startTimer).not.toHaveBeenCalled();
      expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.listen);
      expect($('#ft-btn-first').disabled).toBe(true);
    });

    test('a guided trial marks the correct button once playback ends', async () => {
      const { context } = playPractice();
      jest.advanceTimersByTime(RESPONSE_OPEN_MS - 1);
      expect(context.showMarker).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      const button = $('#ft-btn-first');
      expect(button.disabled).toBe(false);
      expect(button.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(context.showMarker).toHaveBeenCalledWith({ anchor: button, shape: 'box' });
      expect(context.setInstructions)
        .toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedAnswer(PRACTICE_TRIAL));
    });

    test('an unguided trial shows no marker', async () => {
      const { context } = playPractice(false);
      jest.runAllTimers();
      expect(context.showMarker).not.toHaveBeenCalled();
      expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
    });

    test('Replay repeats the practice trial', async () => {
      playPractice();
      jest.runAllTimers();
      syllableMock.playSyllableSequence.mockClear();
      $('#ft-replay-btn').click();
      expect(syllableMock.playSyllableSequence).toHaveBeenCalledWith(PRACTICE_SEQUENCE);
    });

    test('a correct answer gives feedback and ends the trial without scoring', async () => {
      const { context, done } = playPractice();
      jest.runAllTimers();
      $('#ft-btn-first').click();

      await expect(done).resolves.toBeUndefined();
      expect(context.hideMarker).toHaveBeenCalled();
      expect($('#ft-feedback').textContent).toBe('Correct!');
      expect(audioMock.playFeedbackSound).toHaveBeenCalledWith(true);
      expect(gameMock.recordTrial).not.toHaveBeenCalled();

      // No next trial starts, and nothing is saved.
      jest.runAllTimers();
      expect(syllableMock.playSyllableSequence).toHaveBeenCalledTimes(1);
      expect(scoreMock.saveScore).not.toHaveBeenCalled();
    });

    test('a wrong answer by key names the target without scoring', async () => {
      const { done } = playPractice();
      jest.runAllTimers();
      handleKeyDown({ key: '2' });

      await done;
      expect($('#ft-feedback').textContent)
        .toBe('Incorrect - the target "di" was the first sound.');
      expect(gameMock.recordTrial).not.toHaveBeenCalled();
    });

    test('ending the tutorial mid-trial silences and cancels the trial', async () => {
      const { context } = playPractice();
      const stopAudio = lastStopHandle();

      pending.controller.abort();
      jest.runAllTimers();
      expect(stopAudio).toHaveBeenCalled();
      expect(context.showMarker).not.toHaveBeenCalled();
      expect($('#ft-btn-first').disabled).toBe(true);
    });

    test('End Game during practice cancels the tutorial and shows the welcome screen', async () => {
      playPractice();
      jest.runAllTimers();

      $('#ft-stop-btn').click();

      expect(pending.run.cancel).toHaveBeenCalled();
      expect($('#ft-instructions').hidden).toBe(false);
      expect($('#ft-game-area').hidden).toBe(true);
      expect($('#ft-end-panel').hidden).toBe(true);
      expect(gameMock.stopGame).not.toHaveBeenCalled();
      expect(scoreMock.saveScore).not.toHaveBeenCalled();
    });
  });
});

// ── Null-guard paths (empty container) ───────────────────────────────────────
// These tests exercise the false branches of the `if (element)` guards by initializing the
// plugin with an empty container.

describe('null-guard paths — empty container', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    plugin.init(document.createElement('div'));
  });

  afterEach(() => {
    plugin.reset();
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  test('updateStats, start, stop, and reset do not throw', async () => {
    expect(() => updateStats()).not.toThrow();
    await expect(plugin.start()).resolves.toBeUndefined();
    jest.advanceTimersByTime(RESPONSE_OPEN_MS);
    expect(() => handleResponse('second')).not.toThrow();
    expect(() => plugin.stop()).not.toThrow();
    expect(() => plugin.reset()).not.toThrow();
  });
});

// ── Replay before any trial ───────────────────────────────────────────────────

describe('replay before a trial starts', () => {
  test('does not play anything', () => {
    document.body.innerHTML = '';
    const container = buildContainer();
    document.body.appendChild(container);
    plugin.init(container);
    plugin.reset();
    syllableMock.playSyllableSequence.mockClear();
    $('#ft-replay-btn').click();
    expect(syllableMock.playSyllableSequence).not.toHaveBeenCalled();
    document.body.innerHTML = '';
  });
});

// ── interface.html accessibility ──────────────────────────────────────────────

describe('interface.html', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('the session timer is not inside a live region', () => {
    document.body.innerHTML = INTERFACE_HTML;
    expect($('#ft-session-timer').closest('[aria-live]')).toBeNull();
    expect($('#ft-score').closest('[aria-live]')).not.toBeNull();
    expect($('#ft-level').closest('[aria-live]')).not.toBeNull();
  });

  test('every voice radio has a visible label and a known value', () => {
    document.body.innerHTML = INTERFACE_HTML;
    const inputs = [...document.querySelectorAll('input[name="ft-voice"]')];
    expect(inputs.map((input) => input.value)).toEqual(['lower', 'higher', 'mixed']);
    inputs.forEach((input) => {
      expect(input.closest('label').textContent.trim().length).toBeGreaterThan(0);
    });
    expect(document.querySelector('.ft-voice legend').textContent).toBe('Voice');
  });

  test('the voice setting is on the game screen, not the welcome panel', () => {
    document.body.innerHTML = INTERFACE_HTML;
    expect(document.querySelector('#ft-game-area .ft-voice')).not.toBeNull();
    expect(document.querySelector('#ft-instructions input[name="ft-voice"]')).toBeNull();
  });
});
