/**
 * tutorial.test.js — Tests for the Directional Processing tutorial content and controller.
 *
 * The controller is tested here against fake trial controls. index.test.js covers it wired
 * to the real game.
 *
 * @file Tests for app/games/directional-processing/tutorial/tutorial.js
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

describe('directional-processing tutorial steps', () => {
  test('lists the steps in order', async () => {
    const steps = await getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Directional Processing',
      'Find the Main Play Area',
      'What to Look For',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in this game\'s tutorial folder', async () => {
    const steps = await getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/directional-processing\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('practice text covers each stage and always offers the keyboard option to answer', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual(['watch', 'guidedAnswer', 'answer']);
    expect(PRACTICE_TEXT.answer).toMatch(/Click/);
    expect(PRACTICE_TEXT.answer).toMatch(/arrow key/);
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test.each([
    ['up', 'Up'],
    ['down', 'Down'],
    ['left', 'Left'],
    ['right', 'Right'],
  ])('guided text for %s names the direction and its arrow key', (direction, key) => {
    const text = PRACTICE_TEXT.guidedAnswer(direction);
    expect(text).toContain(`moved ${direction}`);
    expect(text).toMatch(/Click/);
    expect(text).toContain(`${key} arrow key`);
  });

  test('every image a step references exists', async () => {
    const steps = await getTutorialSteps();
    const imageSrcs = steps.flatMap(({ content: contentPath }) => {
      const markup = fs.readFileSync(path.join(APP_DIR, contentPath), 'utf8');
      return [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    });
    expect(imageSrcs).toContain('./games/directional-processing/images/tutorialScreenshot.png');
    imageSrcs.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });
});

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * Build fake trial controls with real, scrollable direction buttons.
 * @returns {object}
 */
function buildControls() {
  const buttons = Object.fromEntries(game.DIRECTIONS.map((direction) => {
    const el = document.createElement('button');
    el.scrollIntoView = jest.fn();
    return [direction, el];
  }));
  return {
    buttons,
    showGameArea: jest.fn(),
    playTrial: jest.fn(),
    stopTrial: jest.fn(),
    getDirectionButton: (direction) => buttons[direction],
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

describe('directional-processing tutorial controller', () => {
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
    jest.clearAllMocks();
  });

  /**
   * Play a practice trial and return its context, the trial shown, the callback for the end
   * of the stimulus, and its promise.
   * @param {boolean} [guided=true]
   * @returns {{ context: object, trial: object, endStimulus: Function, done: Promise<void> }}
   */
  function play(guided = true) {
    const context = buildContext(controller, guided);
    const done = playPracticeRound(context);
    const [trial, endStimulus] = controls.playTrial.mock.calls.at(-1);
    return {
      context, trial, endStimulus, done,
    };
  }

  test('launches with the game ID and its own practice trial', () => {
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'directional-processing',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorial.isActive()).toBe(true);
  });

  test('plays a trial at the easiest level through the controls', () => {
    const { context, trial } = play();
    expect(controls.showGameArea).toHaveBeenCalled();
    expect(trial).toEqual(expect.objectContaining(game.LEVELS[0]));
    expect(game.DIRECTIONS).toContain(trial.direction);
    expect(tutorialModule.isPracticing()).toBe(true);
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);
  });

  test('a guided trial rings the correct button once the stimulus ends', () => {
    const { context, trial, endStimulus } = play();
    expect(context.showMarker).not.toHaveBeenCalled();

    endStimulus();
    const target = controls.buttons[trial.direction];
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(context.showMarker).toHaveBeenCalledWith({ anchor: target, shape: 'box' });
    expect(context.setInstructions)
      .toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedAnswer(trial.direction));
  });

  test('an unguided trial only prompts for the answer', () => {
    const { context, endStimulus } = play(false);
    endStimulus();
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
