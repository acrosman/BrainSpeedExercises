/**
 * tutorial.test.js — Tests for the Fast Piggie tutorial content and controller.
 *
 * The controller is tested here against fake round controls. index.test.js covers it wired
 * to the real game.
 *
 * @file Tests for app/games/fast-piggie/tutorial/tutorial.js
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

/** Absolute path of `app/`, which step and image paths are relative to. */
const APP_DIR = fileURLToPath(new URL('../../../', import.meta.url));

describe('fast-piggie tutorial steps', () => {
  test('lists the steps in order', async () => {
    const steps = await getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Fast Piggie',
      'Find the Main Play Area',
      'What to Look For',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in this game\'s tutorial folder', async () => {
    const steps = await getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/fast-piggie\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('practice text covers each stage and always offers the keyboard option to answer', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual(['watch', 'guidedAnswer', 'answer']);
    [PRACTICE_TEXT.guidedAnswer, PRACTICE_TEXT.answer].forEach((text) => {
      expect(text).toMatch(/Click/);
      expect(text).toMatch(/arrow keys/);
      expect(text).toMatch(/Enter/);
    });
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test('every image a step references exists', async () => {
    const steps = await getTutorialSteps();
    const imageSrcs = steps.flatMap(({ content: contentPath }) => {
      const markup = fs.readFileSync(path.join(APP_DIR, contentPath), 'utf8');
      return [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    });
    expect(imageSrcs).toContain('./games/fast-piggie/images/tutorialScreenshot.png');
    imageSrcs.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });
});

// ── Controller ────────────────────────────────────────────────────────────────

/** Where the fake controls say the orange piggie was. */
const CORRECT_WEDGE = 4;

/**
 * Build fake round controls. `redrawBoard` records the hint wedge it would shade.
 * @returns {object}
 */
function buildControls() {
  const canvas = document.createElement('canvas');
  const controls = {
    canvas,
    shaded: [],
    showGameArea: jest.fn(),
    playRound: jest.fn(),
    stopRound: jest.fn(),
    getCorrectWedge: () => CORRECT_WEDGE,
    redrawBoard: jest.fn(() => controls.shaded.push(tutorialModule.getPracticeHintWedge())),
    getWedgeMarker: (wedge) => ({ anchor: canvas, region: { wedge } }),
    showAnswer: jest.fn(),
  };
  return controls;
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

describe('fast-piggie tutorial controller', () => {
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
   * Play a practice round and return its context, the round shown, the callback for when the
   * images vanish, and its promise.
   * @param {boolean} [guided=true]
   * @returns {{ context: object, round: object, hideImages: Function, done: Promise<void> }}
   */
  function play(guided = true) {
    const context = buildContext(controller, guided);
    const done = playPracticeRound(context);
    const [round, hideImages] = controls.playRound.mock.calls.at(-1);
    return {
      context, round, hideImages, done,
    };
  }

  test('launches with the game ID and its own practice round', () => {
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'fast-piggie',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorial.isActive()).toBe(true);
  });

  test('plays a round at the easiest setting through the controls', () => {
    const { context, round } = play();
    expect(controls.showGameArea).toHaveBeenCalled();
    expect(round).toEqual(expect.objectContaining({ wedgeCount: 6, imageCount: 3 }));
    expect(tutorialModule.isPracticing()).toBe(true);
    expect(tutorialModule.getPracticeHintWedge()).toBe(-1);
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);
  });

  test('a guided round shades and rings the correct wedge once the images vanish', () => {
    const { context, hideImages } = play();
    expect(context.showMarker).not.toHaveBeenCalled();

    hideImages();
    expect(controls.shaded).toEqual([CORRECT_WEDGE]);
    expect(tutorialModule.getPracticeHintWedge()).toBe(CORRECT_WEDGE);
    expect(context.showMarker).toHaveBeenCalledWith({
      anchor: controls.canvas, region: { wedge: CORRECT_WEDGE },
    });
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedAnswer);
  });

  test('an unguided round only prompts for the answer', () => {
    const { context, hideImages } = play(false);
    hideImages();
    expect(controls.redrawBoard).not.toHaveBeenCalled();
    expect(context.showMarker).not.toHaveBeenCalled();
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
  });

  test('an answer drops the hint, shows the result, and ends the round', async () => {
    const { context, hideImages, done } = play();
    hideImages();
    controls.showAnswer.mockImplementation(() => {
      expect(tutorialModule.getPracticeHintWedge()).toBe(-1);
    });

    tutorialModule.finishPracticeRound(1);
    await expect(done).resolves.toBeUndefined();
    expect(controls.showAnswer).toHaveBeenCalledWith(1);
    expect(context.hideMarker).toHaveBeenCalled();
    expect(tutorialModule.isPracticing()).toBe(false);
  });

  test('ending the tutorial stops the round', () => {
    play();
    controller.abort();
    expect(controls.stopRound).toHaveBeenCalled();
    expect(tutorialModule.isPracticing()).toBe(false);
  });
});
