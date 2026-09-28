/**
 * tutorial.test.js — Tests for the Object Track tutorial content and controller.
 *
 * The controller is tested here against fake round controls. index.test.js covers it wired
 * to the real game.
 *
 * @file Tests for app/games/object-track/tutorial/tutorial.js
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

describe('object-track tutorial steps', () => {
  test('lists the steps in order', async () => {
    const steps = await getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Object Track',
      'Find the Main Play Area',
      'What to Look For',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in this game\'s tutorial folder', async () => {
    const steps = await getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/object-track\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('every image a step references exists', async () => {
    const steps = await getTutorialSteps();
    const imageSrcs = steps.flatMap(({ content: contentPath }) => {
      const markup = fs.readFileSync(path.join(APP_DIR, contentPath), 'utf8');
      return [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    });
    expect(imageSrcs).toContain('./games/object-track/images/tutorialScreenshot.png');
    imageSrcs.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });
});

describe('object-track practice text', () => {
  test('covers each stage and is frozen', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual(['watch', 'guided', 'answer', 'result']);
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test('uses the easiest level\'s target count', () => {
    expect(PRACTICE_TEXT.watch).toMatch(/^Watch the 3 glowing balls\./);
    expect(PRACTICE_TEXT.answer).toMatch(/Click all 3,/);
  });

  test.each([
    ['guided (first ball)', PRACTICE_TEXT.guided(0, 'Circle 4')],
    ['guided (next ball)', PRACTICE_TEXT.guided(1, 'Circle 7')],
    ['answer', PRACTICE_TEXT.answer],
  ])('%s text offers both the click and the keyboard option', (_name, text) => {
    expect(text).toMatch(/[Cc]lick/);
    expect(text).toMatch(/Tab/);
    expect(text).toMatch(/Enter/);
  });

  test('guided text names the ringed ball and changes once a target is chosen', () => {
    expect(PRACTICE_TEXT.guided(0, 'Circle 4'))
      .toMatch(/^The ringed ball, Circle 4, is one of your targets\./);
    expect(PRACTICE_TEXT.guided(2, 'Circle 7'))
      .toMatch(/^Now click the next ringed ball, Circle 7,/);
  });

  test('result text confirms a correct round and explains a miss', () => {
    expect(PRACTICE_TEXT.result({ correct: true, correctCount: 3, totalTargets: 3 }))
      .toBe('Correct! You tracked all 3 targets.');
    expect(PRACTICE_TEXT.result({ correct: false, correctCount: 1, totalTargets: 3 }))
      .toMatch(/^Not quite\. You found 1 of 3 targets\. Green rings/);
  });
});

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * Build fake round controls whose circles are real, scrollable buttons for the marker to
 * anchor on, named the way index.js names them.
 * @returns {object}
 */
function buildControls() {
  const circles = new Map();
  return {
    showGameArea: jest.fn(),
    getArenaBounds: jest.fn(() => ({ width: 700, height: 420 })),
    playRound: jest.fn(),
    stopRound: jest.fn(),
    getCircle: (id) => {
      if (!circles.has(id)) {
        const el = document.createElement('button');
        el.setAttribute('aria-label', `Circle ${id + 1}`);
        el.scrollIntoView = jest.fn();
        circles.set(id, el);
      }
      return circles.get(id);
    },
    announce: jest.fn(),
  };
}

/**
 * Build a practice-round context like the runner passes in.
 * @param {AbortController} controller
 * @param {{ guided?: boolean }} [options]
 * @returns {object}
 */
function buildContext(controller, { guided = true } = {}) {
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

describe('object-track tutorial controller', () => {
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
    tutorialModule.setPracticeControls(controls);
    await tutorial.replay({ container: document.createElement('div'), onComplete: jest.fn() });
  });

  afterEach(() => {
    controller.abort();
    tutorial.cancel();
    jest.clearAllMocks();
  });

  /**
   * Play a practice round and return its context, the circles shown, the targets among
   * them, and its promise.
   * @param {{ guided?: boolean }} [options]
   * @returns {{ context: object, circles: object[], targets: object[], done: Promise<object> }}
   */
  function play(options) {
    const context = buildContext(controller, options);
    const done = playPracticeRound(context);
    const [circles] = controls.playRound.mock.calls.at(-1);
    const targets = circles.filter((circle) => circle.isTarget);
    return {
      context, circles, targets, done,
    };
  }

  test('launches with the game ID and its own practice round', () => {
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'object-track',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorial.isActive()).toBe(true);
  });

  test('plays the easiest level\'s round, sized to the arena, through the controls', () => {
    const { context, circles, targets } = play();
    expect(controls.showGameArea).toHaveBeenCalled();
    expect(controls.getArenaBounds).toHaveBeenCalled();
    expect(circles).toHaveLength(8);
    expect(targets).toHaveLength(3);
    circles.forEach((circle) => {
      expect(circle.x).toBeLessThanOrEqual(700 - circle.radius);
      expect(circle.y).toBeLessThanOrEqual(420 - circle.radius);
    });
    expect(controls.playRound.mock.calls[0][1]).toBe(5000);
    expect(tutorialModule.isPracticing()).toBe(true);
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);
  });

  test('a guided round rings each target in turn', () => {
    const { context, targets } = play();
    tutorialModule.promptPracticeResponse();
    const first = controls.getCircle(targets[0].id);
    expect(first.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: first });
    expect(context.setInstructions).toHaveBeenLastCalledWith(
      PRACTICE_TEXT.guided(0, `Circle ${targets[0].id + 1}`),
    );

    // The player chooses a target other than the ringed one; the ring stays on the first.
    tutorialModule.guidePracticeResponse(new Set([targets[2].id]));
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: first });
    expect(context.setInstructions).toHaveBeenLastCalledWith(
      PRACTICE_TEXT.guided(1, `Circle ${targets[0].id + 1}`),
    );

    tutorialModule.guidePracticeResponse(new Set([targets[0].id, targets[2].id]));
    expect(context.showMarker).toHaveBeenLastCalledWith({
      anchor: controls.getCircle(targets[1].id),
    });
  });

  test('a wrong choice does not count as a found target', () => {
    const { context, circles, targets } = play();
    const distractor = circles.find((circle) => !circle.isTarget);
    tutorialModule.guidePracticeResponse(new Set([distractor.id]));
    expect(context.setInstructions).toHaveBeenLastCalledWith(
      PRACTICE_TEXT.guided(0, `Circle ${targets[0].id + 1}`),
    );
  });

  test('a guided round with every target chosen leaves the marker alone', () => {
    const { context, targets } = play();
    tutorialModule.guidePracticeResponse(new Set(targets.map((circle) => circle.id)));
    expect(context.showMarker).not.toHaveBeenCalled();
  });

  test('an unguided round only prompts for the answer', () => {
    const { context } = play({ guided: false });
    tutorialModule.promptPracticeResponse();
    tutorialModule.guidePracticeResponse(new Set());
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
    expect(context.showMarker).not.toHaveBeenCalled();
  });

  test('a correct round is announced and resolves as correct', async () => {
    const { context, done } = play();
    const evaluation = { correct: true, correctCount: 3, totalTargets: 3 };
    tutorialModule.finishPracticeRound(evaluation);
    await expect(done).resolves.toEqual({
      correct: true, feedback: PRACTICE_TEXT.result(evaluation),
    });
    expect(context.hideMarker).toHaveBeenCalled();
    expect(controls.announce).toHaveBeenCalledWith(PRACTICE_TEXT.result(evaluation));
    expect(tutorialModule.isPracticing()).toBe(false);
  });

  test('a miss is left to the coach banner', async () => {
    const { done } = play();
    const evaluation = { correct: false, correctCount: 2, totalTargets: 3 };
    tutorialModule.finishPracticeRound(evaluation);
    await expect(done).resolves.toEqual({
      correct: false, feedback: PRACTICE_TEXT.result(evaluation),
    });
    expect(controls.announce).not.toHaveBeenCalled();
  });

  test('ending the tutorial stops the round', () => {
    play();
    controller.abort();
    expect(controls.stopRound).toHaveBeenCalled();
    expect(tutorialModule.isPracticing()).toBe(false);
  });

  test('the practice hooks do nothing when no round is in progress', () => {
    expect(() => {
      tutorialModule.promptPracticeResponse();
      tutorialModule.guidePracticeResponse(new Set());
    }).not.toThrow();
  });
});
