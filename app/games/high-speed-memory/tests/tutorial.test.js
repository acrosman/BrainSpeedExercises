/**
 * tutorial.test.js — Tests for the High Speed Memory tutorial content and controller.
 *
 * The controller is tested here against fake round controls. index.test.js covers it wired
 * to the real game.
 *
 * @file Tests for app/games/high-speed-memory/tutorial/tutorial.js
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

const tutorial = await import('../tutorial/tutorial.js');
const { getTutorialSteps, PRACTICE_TEXT } = tutorial;
const tutorialServiceMock = await import('../../../components/tutorialService.js');
const { PRIMARY_IMAGE } = await import('../game.js');

/** Absolute path of `app/`, which step and image paths are relative to. */
const APP_DIR = fileURLToPath(new URL('../../../', import.meta.url));

describe('high-speed-memory tutorial steps', () => {
  test('lists the steps in order', async () => {
    const steps = await getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to High Speed Memory',
      'Find the Main Play Area',
      'What to Look For',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in this game\'s tutorial folder', async () => {
    const steps = await getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/high-speed-memory\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('every image a step references exists', async () => {
    const steps = await getTutorialSteps();
    const imageSrcs = steps.flatMap(({ content: contentPath }) => {
      const markup = fs.readFileSync(path.join(APP_DIR, contentPath), 'utf8');
      return [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    });
    expect(imageSrcs).toContain('./games/high-speed-memory/images/tutorialScreenshot.png');
    expect(imageSrcs).toContain('./games/high-speed-memory/images/Primary.jpg');
    imageSrcs.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });
});

describe('high-speed-memory practice text', () => {
  test('covers each stage and is frozen', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual(['watch', 'guided', 'answer', 'result']);
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test.each([
    ['guided (first card)', PRACTICE_TEXT.guided(0)],
    ['guided (next card)', PRACTICE_TEXT.guided(1)],
    ['answer', PRACTICE_TEXT.answer],
  ])('%s text offers both the click and the keyboard option', (_name, text) => {
    expect(text).toMatch(/[Cc]lick/);
    expect(text).toMatch(/Tab/);
    expect(text).toMatch(/Enter/);
  });

  test('guided text changes once the first greyhound is found', () => {
    expect(PRACTICE_TEXT.guided(0)).toMatch(/^A greyhound was under the ringed card\./);
    expect(PRACTICE_TEXT.guided(2)).toMatch(/^Now click the next ringed card/);
  });

  test('result text confirms a correct round and explains a miss', () => {
    expect(PRACTICE_TEXT.result(true)).toBe('Correct! You found all 3 greyhounds.');
    expect(PRACTICE_TEXT.result(false)).toMatch(/^Not quite\./);
  });
});

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * Build fake round controls whose cards are real, scrollable buttons for the marker to
 * anchor on.
 * @returns {object}
 */
function buildControls() {
  const cards = new Map();
  return {
    showGameArea: jest.fn(),
    playRound: jest.fn(),
    stopRound: jest.fn(),
    getCard: (id) => {
      if (!cards.has(id)) {
        const el = document.createElement('button');
        el.scrollIntoView = jest.fn();
        cards.set(id, el);
      }
      return cards.get(id);
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

describe('high-speed-memory tutorial controller', () => {
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
   * Play a practice round and return its context, the grid shown, the greyhound cards in
   * it, and its promise.
   * @param {{ guided?: boolean }} [options]
   * @returns {{ context: object, grid: object[], primaries: object[], done: Promise<object> }}
   */
  function play(options) {
    const context = buildContext(controller, options);
    const done = playPracticeRound(context);
    const [grid] = controls.playRound.mock.calls.at(-1);
    const primaries = grid.filter((card) => card.image === PRIMARY_IMAGE);
    return {
      context, grid, primaries, done,
    };
  }

  test('launches with the game ID and its own practice round', () => {
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'high-speed-memory',
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

  test('plays a 3x3 grid at the starting display time through the controls', () => {
    const { context, grid } = play();
    expect(controls.showGameArea).toHaveBeenCalled();
    expect(grid).toHaveLength(9);
    expect(controls.playRound.mock.calls[0][1]).toBe(1500);
    expect(tutorial.isPracticing()).toBe(true);
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);
  });

  test('a guided round rings each greyhound card in turn', () => {
    const { context, primaries } = play();
    tutorial.promptPracticeResponse();
    const first = controls.getCard(primaries[0].id);
    expect(first.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: first, shape: 'box' });
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.guided(0));

    // The player finds a greyhound other than the ringed one; the ring stays on the first.
    primaries[2].matched = true;
    tutorial.guidePracticeResponse();
    expect(context.showMarker).toHaveBeenLastCalledWith({ anchor: first, shape: 'box' });
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.guided(1));

    primaries[0].matched = true;
    tutorial.guidePracticeResponse();
    expect(context.showMarker).toHaveBeenLastCalledWith({
      anchor: controls.getCard(primaries[1].id), shape: 'box',
    });
  });

  test('a guided round with every greyhound found leaves the marker alone', () => {
    const { context, primaries } = play();
    primaries.forEach((card) => { card.matched = true; });
    tutorial.guidePracticeResponse();
    expect(context.showMarker).not.toHaveBeenCalled();
  });

  test('an unguided round only prompts for the answer', () => {
    const { context } = play({ guided: false });
    tutorial.promptPracticeResponse();
    tutorial.guidePracticeResponse();
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.answer);
    expect(context.showMarker).not.toHaveBeenCalled();
  });

  test('a correct round is announced and resolves as correct', async () => {
    const { context, done } = play();
    tutorial.finishPracticeRound(true);
    await expect(done).resolves.toEqual({ correct: true, feedback: PRACTICE_TEXT.result(true) });
    expect(context.hideMarker).toHaveBeenCalled();
    expect(controls.announce).toHaveBeenCalledWith(PRACTICE_TEXT.result(true));
    expect(tutorial.isPracticing()).toBe(false);
  });

  test('a miss is left to the coach banner', async () => {
    const { done } = play();
    tutorial.finishPracticeRound(false);
    await expect(done).resolves.toEqual({
      correct: false, feedback: PRACTICE_TEXT.result(false),
    });
    expect(controls.announce).not.toHaveBeenCalled();
  });

  test('ending the tutorial stops the round', () => {
    play();
    controller.abort();
    expect(controls.stopRound).toHaveBeenCalled();
    expect(tutorial.isPracticing()).toBe(false);
  });

  test('the practice hooks do nothing when no round is in progress', () => {
    expect(() => {
      tutorial.promptPracticeResponse();
      tutorial.guidePracticeResponse();
    }).not.toThrow();
  });
});

describe('high-speed-memory tutorial launching', () => {
  test('does nothing without a container', async () => {
    await tutorial.startTutorialIfNeeded({ container: null, controls: {}, onComplete: jest.fn() });
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
  });
});
