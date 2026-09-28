/**
 * tutorial.test.js — Tests for the Orbit Sprite Memory tutorial content and controller.
 *
 * The controller is tested here against fake round controls. index.test.js covers it wired
 * to the real game.
 *
 * @file Tests for app/games/orbit-sprite-memory/tutorial/tutorial.js
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

describe('orbit-sprite-memory tutorial steps', () => {
  test('lists the steps in order', async () => {
    const steps = await getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Orbit Sprite Memory',
      'Find the Main Play Area',
      'What to Look For',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in this game\'s tutorial folder', async () => {
    const steps = await getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/orbit-sprite-memory\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('every image a step references exists', async () => {
    const steps = await getTutorialSteps();
    const imageSrcs = steps.flatMap(({ content: contentPath }) => {
      const markup = fs.readFileSync(path.join(APP_DIR, contentPath), 'utf8');
      return [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    });
    expect(imageSrcs).toEqual([
      './games/orbit-sprite-memory/images/tutorialScreenshot.png',
      './games/orbit-sprite-memory/images/sprites.png',
    ]);
    imageSrcs.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });
});

describe('orbit-sprite-memory practice text', () => {
  test('covers each stage and is frozen', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual(['watch', 'guided', 'answer', 'result']);
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test('uses the number of times the target appears', () => {
    expect(PRACTICE_TEXT.watch).toMatch(/remember the 3 spots where it appears\.$/);
    expect(PRACTICE_TEXT.answer).toMatch(/Click all 3 spots,/);
  });

  test.each([
    ['guided (first spot)', PRACTICE_TEXT.guided(0, 'Position 2')],
    ['guided (next spot)', PRACTICE_TEXT.guided(1, 'Position 5')],
    ['answer', PRACTICE_TEXT.answer],
  ])('%s text offers both the click and the keyboard option', (_name, text) => {
    expect(text).toMatch(/[Cc]lick/);
    expect(text).toMatch(/Tab/);
    expect(text).toMatch(/Enter/);
  });

  test('guided text names the ringed spot and changes once a target spot is chosen', () => {
    expect(PRACTICE_TEXT.guided(0, 'Position 2'))
      .toMatch(/^The target appeared at the ringed spot, Position 2\./);
    expect(PRACTICE_TEXT.guided(2, 'Position 5'))
      .toMatch(/^Now click the next ringed spot, Position 5,/);
  });

  test('result text confirms a correct round and explains a miss', () => {
    expect(PRACTICE_TEXT.result(true))
      .toBe('Correct! You found all 3 spots where the target appeared.');
    expect(PRACTICE_TEXT.result(false)).toMatch(/^Not quite\. Each rabbit is back in its spot\./);
  });
});

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * Build fake round controls whose position buttons are real, scrollable buttons for the
 * marker to anchor on, named the way index.js names them.
 * @returns {object}
 */
function buildControls() {
  const spots = new Map();
  const board = document.createElement('div');
  board.scrollIntoView = jest.fn();
  return {
    showGameArea: jest.fn(),
    getBoard: () => board,
    playRound: jest.fn(),
    stopRound: jest.fn(),
    getPositionButton: (position) => {
      if (!spots.has(position)) {
        const el = document.createElement('button');
        el.setAttribute('aria-label', `Position ${position + 1}`);
        el.scrollIntoView = jest.fn();
        spots.set(position, el);
      }
      return spots.get(position);
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

describe('orbit-sprite-memory tutorial controller', () => {
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
   * Play a practice round and return its context, the round shown, and its promise.
   * @param {{ guided?: boolean }} [options]
   * @returns {{ context: object, round: object, done: Promise<object> }}
   */
  function play(options) {
    const context = buildContext(controller, options);
    const done = playPracticeRound(context);
    const [round] = controls.playRound.mock.calls.at(-1);
    return { context, round, done };
  }

  /**
   * The name index.js gives a position's button.
   * @param {number} position
   * @returns {string}
   */
  const nameOf = (position) => `Position ${position + 1}`;

  test('launches with the game ID and its own practice round', () => {
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'orbit-sprite-memory',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorial.isActive()).toBe(true);
  });

  test('plays the easiest level\'s round through the controls, with the board in view', () => {
    const { context, round } = play();
    expect(controls.showGameArea).toHaveBeenCalled();
    expect(controls.getBoard().scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(round.steps).toHaveLength(5);
    expect(round.primaryPositions).toHaveLength(3);
    expect(round.displayMs).toBe(1100);
    expect(tutorialModule.isPracticing()).toBe(true);
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);
  });

  test('a guided round rings each target spot in turn', () => {
    const { context, round } = play();
    const [first, second, third] = round.primaryPositions;
    tutorialModule.promptPracticeResponse();
    const firstSpot = controls.getPositionButton(first);
    expect(firstSpot.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: firstSpot });
    expect(context.setInstructions)
      .toHaveBeenLastCalledWith(PRACTICE_TEXT.guided(0, nameOf(first)));

    // The player chooses a target spot other than the ringed one; the ring stays put.
    tutorialModule.guidePracticeResponse(new Set([third]));
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: firstSpot });
    expect(context.setInstructions)
      .toHaveBeenLastCalledWith(PRACTICE_TEXT.guided(1, nameOf(first)));

    tutorialModule.guidePracticeResponse(new Set([first, third]));
    expect(context.showMarker).toHaveBeenLastCalledWith({
      anchor: controls.getPositionButton(second),
    });
  });

  test('a spot the target never used does not count as found', () => {
    const { context, round } = play();
    const wrong = round.shownPositions.find((p) => !round.primaryPositions.includes(p));
    tutorialModule.guidePracticeResponse(new Set([wrong]));
    expect(context.setInstructions).toHaveBeenLastCalledWith(
      PRACTICE_TEXT.guided(0, nameOf(round.primaryPositions[0])),
    );
  });

  test('a guided round with every target spot chosen leaves the marker alone', () => {
    const { context, round } = play();
    tutorialModule.guidePracticeResponse(new Set(round.primaryPositions));
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
    tutorialModule.finishPracticeRound(true);
    await expect(done).resolves.toEqual({ correct: true, feedback: PRACTICE_TEXT.result(true) });
    expect(context.hideMarker).toHaveBeenCalled();
    expect(controls.announce).toHaveBeenCalledWith(PRACTICE_TEXT.result(true));
    expect(tutorialModule.isPracticing()).toBe(false);
  });

  test('a miss is left to the coach banner', async () => {
    const { done } = play();
    tutorialModule.finishPracticeRound(false);
    await expect(done).resolves.toEqual({
      correct: false, feedback: PRACTICE_TEXT.result(false),
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
