/**
 * tutorial.test.js — Tests for the Field of View tutorial content and controller.
 *
 * The controller is tested here against fake trial controls. index.test.js covers it wired
 * to the real game.
 *
 * @file Tests for app/games/field-of-view/tutorial/tutorial.js
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

jest.unstable_mockModule('../progress.js', () => ({ GAME_ID: 'field-of-view' }));

const tutorial = await import('../tutorial/tutorial.js');
const { getTutorialSteps, PRACTICE_TEXT } = tutorial;
const tutorialServiceMock = await import('../../../components/tutorialService.js');

/** Absolute path of `app/`, which step and image paths are relative to. */
const APP_DIR = fileURLToPath(new URL('../../../', import.meta.url));

describe('field-of-view tutorial steps', () => {
  test('lists the steps in order', async () => {
    const steps = await getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Field of View',
      'Find the Main Play Area',
      'What to Look For',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in this game\'s tutorial folder', async () => {
    const steps = await getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/field-of-view\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('every image a step references exists', async () => {
    const steps = await getTutorialSteps();
    const imageSrcs = steps.flatMap(({ content: contentPath }) => {
      const markup = fs.readFileSync(path.join(APP_DIR, contentPath), 'utf8');
      return [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    });
    expect(imageSrcs).toContain('./games/field-of-view/images/tutorialScreenshot.png');
    imageSrcs.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });
});

describe('field-of-view practice text', () => {
  test('covers each stage and is frozen', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual([
      'watch', 'guidedKitten', 'guidedLocation', 'answer', 'result',
    ]);
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test.each([
    ['guidedKitten', PRACTICE_TEXT.guidedKitten('sitting kitten')],
    ['guidedLocation', PRACTICE_TEXT.guidedLocation(1, 2)],
    ['answer', PRACTICE_TEXT.answer],
  ])('%s text offers both the click and the keyboard option', (_name, text) => {
    expect(text).toMatch(/Click/);
    expect(text).toMatch(/Tab/);
    expect(text).toMatch(/Enter/);
  });

  test('guided text names the answer', () => {
    expect(PRACTICE_TEXT.guidedKitten('leaping kitten')).toContain('The leaping kitten');
    expect(PRACTICE_TEXT.guidedLocation(3, 1)).toContain('row 3, column 1');
  });

  test('result text confirms a correct answer', () => {
    expect(PRACTICE_TEXT.result({
      success: true, kitten: 'sitting kitten', row: 1, col: 2,
    })).toBe('Correct! You got both the kitten and the toy.');
  });

  test('result text names both correct answers after a miss', () => {
    expect(PRACTICE_TEXT.result({
      success: false, kitten: 'leaping kitten', row: 3, col: 3,
    })).toBe('Not quite. The leaping kitten was in the center, and the toy was in row 3, '
      + 'column 3.');
  });
});

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * Build fake trial controls with real, scrollable buttons for the marker to anchor on.
 * @returns {object}
 */
function buildControls() {
  const button = () => {
    const el = document.createElement('button');
    el.scrollIntoView = jest.fn();
    return el;
  };
  const kittens = { 'primary-kitten': button(), 'secondary-kitten': button() };
  const cells = Array.from({ length: 9 }, button);
  let kittenChosen = false;
  return {
    kittens,
    cells,
    chooseKitten: () => { kittenChosen = true; },
    showGameArea: jest.fn(),
    playTrial: jest.fn(),
    stopTrial: jest.fn(),
    isKittenChosen: () => kittenChosen,
    getKittenButton: (id) => kittens[id],
    getLocationCell: (index) => cells[index],
    announce: jest.fn(),
  };
}

/**
 * Build a practice-round context like the runner passes in.
 * @param {AbortController} controller
 * @param {{ guided?: boolean, attempt?: number }} [options]
 * @returns {object}
 */
function buildContext(controller, { guided = true, attempt = 1 } = {}) {
  return {
    round: 1,
    attempt,
    maxRounds: 2,
    guided,
    signal: controller.signal,
    setInstructions: jest.fn(),
    showMarker: jest.fn(),
    hideMarker: jest.fn(),
  };
}

describe('field-of-view tutorial controller', () => {
  let controls;
  let controller;
  let playPracticeRound;
  let run;

  beforeEach(async () => {
    controls = buildControls();
    controller = new AbortController();
    run = { cancel: jest.fn(), isActive: jest.fn(() => true) };
    tutorialServiceMock.runGuidedTutorial.mockImplementation(async (options) => {
      ({ playPracticeRound } = options);
      return run;
    });
    await tutorial.replayTutorial({
      container: document.createElement('div'), controls, onComplete: jest.fn(),
    });
  });

  afterEach(() => {
    controller.abort();
    tutorial.cancelTutorial();
    jest.clearAllMocks();
  });

  /**
   * Play a practice trial and return its context, the layout shown, and its promise.
   * @param {{ guided?: boolean, attempt?: number }} [options]
   * @returns {{ context: object, layout: object, done: Promise<object> }}
   */
  function play(options) {
    const context = buildContext(controller, options);
    const done = playPracticeRound(context);
    const [layout] = controls.playTrial.mock.calls.at(-1);
    return { context, layout, done };
  }

  test('launches with the game ID and its own practice round', () => {
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'field-of-view',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorial.isTutorialActive()).toBe(true);
  });

  test('cancelTutorial cancels the run and is safe to repeat', () => {
    tutorial.cancelTutorial();
    tutorial.cancelTutorial();
    expect(run.cancel).toHaveBeenCalledTimes(1);
    expect(tutorial.isTutorialActive()).toBe(false);
  });

  test('plays a 3x3 trial at the starting SOA through the controls', () => {
    const { context } = play();
    expect(controls.showGameArea).toHaveBeenCalled();
    const [layout, soaMs] = controls.playTrial.mock.calls[0];
    expect(layout.gridSize).toBe(3);
    expect(soaMs).toBe(500);
    expect(tutorial.isPracticing()).toBe(true);
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);
  });

  test('a guided trial rings the kitten, then the toy square', () => {
    const { context, layout } = play();
    tutorial.promptPracticeResponse();
    const kitten = controls.kittens[layout.centerIcon.id];
    expect(kitten.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: kitten, shape: 'box' });

    // A square picked before the kitten leaves the marker where it is.
    tutorial.guidePracticeResponse();
    expect(context.showMarker).toHaveBeenCalledTimes(1);

    controls.chooseKitten();
    tutorial.guidePracticeResponse();
    expect(context.showMarker).toHaveBeenLastCalledWith({
      anchor: controls.cells[layout.peripheralIndex], shape: 'box',
    });
  });

  test('an unguided trial only prompts for the answer', () => {
    const { context } = play({ guided: false });
    tutorial.promptPracticeResponse();
    tutorial.guidePracticeResponse();
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
    expect(context.showMarker).not.toHaveBeenCalled();
  });

  test('a correct answer is announced and resolves as correct', async () => {
    const { context, done } = play();
    tutorial.finishPracticeTrial(true);
    await expect(done).resolves.toEqual(expect.objectContaining({ correct: true }));
    expect(context.hideMarker).toHaveBeenCalled();
    expect(controls.announce)
      .toHaveBeenCalledWith('Correct! You got both the kitten and the toy.');
    expect(tutorial.isPracticing()).toBe(false);
  });

  test('a miss is left to the coach, and a retry replays the same layout', async () => {
    const { layout, done } = play();
    tutorial.finishPracticeTrial(false);
    const result = await done;
    expect(result.correct).toBe(false);
    expect(result.feedback).toMatch(/^Not quite\./);
    expect(controls.announce).not.toHaveBeenCalled();

    expect(play({ attempt: 2 }).layout).toBe(layout);
    expect(play({ attempt: 1 }).layout).not.toBe(layout);
  });

  test('ending the tutorial stops the trial and forgets the layout', () => {
    const { layout } = play();
    controller.abort();
    expect(controls.stopTrial).toHaveBeenCalled();
    expect(tutorial.isPracticing()).toBe(false);

    controller = new AbortController();
    expect(play({ attempt: 2 }).layout).not.toBe(layout);
  });

  test('the practice hooks do nothing when no trial is in progress', () => {
    expect(() => {
      tutorial.promptPracticeResponse();
      tutorial.guidePracticeResponse();
    }).not.toThrow();
  });
});

describe('field-of-view tutorial launching', () => {
  test('does nothing without a container', async () => {
    await tutorial.startTutorialIfNeeded({ container: null, controls: {}, onComplete: jest.fn() });
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
  });
});
