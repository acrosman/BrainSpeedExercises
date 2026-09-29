/**
 * tutorial.test.js — Tests for the Fine Tuning tutorial content and controller.
 *
 * The controller is tested here against fake trial controls. index.test.js covers it wired
 * to the real game.
 *
 * @file Tests for app/games/fine-tuning/tutorial/tutorial.js
 */

import {
  describe, test, expect, jest, beforeEach, afterEach,
} from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
  // Echo the definitions so the test can inspect the paths getTutorialSteps passes in.
  loadTutorialSteps: jest.fn(async (definitions) => definitions.map(
    ({ title, contentPath }) => ({ title, content: contentPath }),
  )),
  runGuidedTutorial: jest.fn(),
  runGuidedTutorialIfNeeded: jest.fn(),
}));

const tutorialModule = await import('../tutorial/tutorial.js');
const { getTutorialSteps, PRACTICE_TEXT, tutorial } = tutorialModule;
const tutorialServiceMock = await import('../../../components/tutorialService.js');
const game = await import('../game.js');

/** Absolute path of `app/`, which step and image paths are relative to. */
const APP_DIR = fileURLToPath(new URL('../../../', import.meta.url));

describe('fine-tuning tutorial steps', () => {
  test('lists the steps in order', async () => {
    const steps = await getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Fine Tuning',
      'Find the Main Play Area',
      'What to Listen For',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in this game\'s tutorial folder', async () => {
    const steps = await getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/fine-tuning\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('practice text covers each stage and always offers the keyboard option to answer', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual(['listen', 'guidedAnswer', 'answer']);
    expect(PRACTICE_TEXT.answer).toMatch(/Click/);
    expect(PRACTICE_TEXT.answer).toMatch(/press 1 or 2/);
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test.each([
    ['first', 'First', '1'],
    ['second', 'Second', '2'],
  ])('guided text for %s names the target, the answer, and its key', (answer, label, key) => {
    const text = PRACTICE_TEXT.guidedAnswer({ target: 'ga', answer });
    expect(text).toContain('The target was "ga"');
    expect(text).toContain(`the ${answer} sound matched it`);
    expect(text).toContain(label);
    expect(text).toMatch(/Click/);
    expect(text).toContain(`press ${key}.`);
  });

  test('every image a step references exists', async () => {
    const steps = await getTutorialSteps();
    const imageSrcs = steps.flatMap(({ content: contentPath }) => {
      const markup = fs.readFileSync(path.join(APP_DIR, contentPath), 'utf8');
      return [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    });
    expect(imageSrcs).toContain('./games/fine-tuning/images/tutorialScreenshot.png');
    imageSrcs.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });
});

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * Build fake trial controls with real, scrollable answer buttons.
 * @returns {object}
 */
function buildControls() {
  const buttons = Object.fromEntries(game.ANSWERS.map((answer) => {
    const el = document.createElement('button');
    el.scrollIntoView = jest.fn();
    return [answer, el];
  }));
  return {
    buttons,
    showGameArea: jest.fn(),
    playTrial: jest.fn(),
    stopTrial: jest.fn(),
    getAnswerButton: (answer) => buttons[answer],
    showResult: jest.fn(),
  };
}

/**
 * Build a practice-round context like the runner passes in.
 * @param {AbortController} controller
 * @param {boolean} [guided=true]
 * @returns {object}
 */
function buildContext(controller, guided = true) {
  return {
    round: 1,
    attempt: 1,
    maxRounds: 2,
    guided,
    signal: controller.signal,
    setInstructions: jest.fn(),
    showMarker: jest.fn(),
    hideMarker: jest.fn(),
  };
}

describe('fine-tuning tutorial controller', () => {
  let controls;
  let controller;
  let playPracticeRound;

  beforeEach(async () => {
    controls = buildControls();
    controller = new AbortController();
    tutorialServiceMock.runGuidedTutorial.mockImplementation(async (options) => {
      ({ playPracticeRound } = options);
      return { cancel: jest.fn(), isActive: () => true };
    });
    tutorialModule.setPracticeControls(controls);
    await tutorial.replay({ container: document.createElement('div'), onComplete: jest.fn() });
  });

  afterEach(() => {
    controller.abort();
    tutorial.cancel();
    game.setVoiceSetting(game.DEFAULT_VOICE_SETTING);
    jest.clearAllMocks();
  });

  /**
   * Play a practice trial and return its context, the trial played, the callback for the end
   * of playback, and its promise.
   * @param {boolean} [guided=true]
   * @returns {{ context: object, trial: object, endPlayback: Function, done: Promise<void> }}
   */
  function play(guided = true) {
    const context = buildContext(controller, guided);
    const done = playPracticeRound(context);
    const [trial, endPlayback] = controls.playTrial.mock.calls.at(-1);
    return {
      context, trial, endPlayback, done,
    };
  }

  test('launches with the game ID and its own practice trial', () => {
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'fine-tuning',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorial.isActive()).toBe(true);
  });

  test('plays a trial at the easiest level through the controls', () => {
    const { context, trial } = play();
    const { crossVoice, ...easiest } = game.LEVELS[0];
    expect(crossVoice).toBe(false);
    expect(controls.showGameArea).toHaveBeenCalled();
    expect(trial).toEqual(expect.objectContaining(easiest));
    expect(trial.choices).toContain(trial.target);
    expect(tutorialModule.isPracticing()).toBe(true);
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.listen);
  });

  test('a practice trial uses the player\'s voice setting', () => {
    game.setVoiceSetting('higher');
    const { trial } = play();
    expect(trial.voices).toEqual(['higher', 'higher', 'higher']);
  });

  test('a guided trial rings the correct button once playback ends', () => {
    const { context, trial, endPlayback } = play();
    expect(context.showMarker).not.toHaveBeenCalled();

    endPlayback();
    const target = controls.buttons[trial.answer];
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(context.showMarker).toHaveBeenCalledWith({ anchor: target, shape: 'box' });
    expect(context.setInstructions)
      .toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedAnswer(trial));
  });

  test('an unguided trial only prompts for the answer', () => {
    const { context, endPlayback } = play(false);
    endPlayback();
    expect(context.showMarker).not.toHaveBeenCalled();
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
  });

  test('an answer shows the result and ends the trial', async () => {
    const { context, done } = play();
    tutorialModule.finishPracticeTrial(false);

    await expect(done).resolves.toBeUndefined();
    expect(context.hideMarker).toHaveBeenCalled();
    expect(controls.showResult).toHaveBeenCalledWith(false);
    expect(tutorialModule.isPracticing()).toBe(false);
  });

  test('ending the tutorial stops the trial', () => {
    play();
    controller.abort();
    expect(controls.stopTrial).toHaveBeenCalled();
    expect(tutorialModule.isPracticing()).toBe(false);
  });
});
