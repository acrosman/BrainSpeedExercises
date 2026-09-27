/**
 * tutorial.test.js — Tests for the Card Rat tutorial content and controller.
 *
 * The controller is tested here against fake card controls. index.test.js covers it wired
 * to the real game.
 *
 * @file Tests for app/games/card-rat/tutorial/tutorial.js
 */

import {
  describe,
  test,
  expect,
  jest,
  beforeEach,
  afterEach,
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
const { PRACTICE_TEXT, tutorial } = tutorialModule;
const tutorialServiceMock = await import('../../../components/tutorialService.js');
const game = await import('../game.js');

/** Absolute path of `app/`, which step and image paths are relative to. */
const APP_DIR = fileURLToPath(new URL('../../../', import.meta.url));

describe('Card Rat tutorial content', () => {
  test('lists the steps in order', async () => {
    const steps = await tutorialModule.getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Card Rat',
      'Find the Main Play Area',
      'How to Score',
      'When to Slap',
      'Game Controls',
    ]);
  });

  test('every step points at an HTML fragment in the tutorial folder', async () => {
    const steps = await tutorialModule.getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/card-rat\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('the screenshot step shows the screenshot with its highlight boxes', () => {
    const markup = fs.readFileSync(
      path.join(APP_DIR, 'games/card-rat/tutorial/tutorial-screenshot-step.html'),
      'utf8',
    );
    expect(markup).toContain('./games/card-rat/images/tutorialScreenshot.png');
    expect(markup).toContain('card-rat__tutorial-highlight--stats');
    expect(markup).toContain('card-rat__tutorial-highlight--controls');
    expect(fs.existsSync(path.join(APP_DIR, 'games/card-rat/images/tutorialScreenshot.png')))
      .toBe(true);
  });

  test('practice text covers each stage and always offers the keyboard option to slap', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual(['watch', 'guidedSlap']);
    expect(Object.keys(PRACTICE_TEXT.guidedSlap)).toEqual(['pair', 'sandwich', 'joker']);
    [PRACTICE_TEXT.watch, ...Object.values(PRACTICE_TEXT.guidedSlap)].forEach((text) => {
      expect(text).toMatch(/click/);
      expect(text).toMatch(/Space/);
    });
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
    expect(Object.isFrozen(PRACTICE_TEXT.guidedSlap)).toBe(true);
  });
});

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * Build fake card controls that record the cards dealt.
 * @returns {object}
 */
function buildControls() {
  const slapZone = document.createElement('button');
  return {
    slapZone,
    startRound: jest.fn(),
    dealCard: jest.fn(),
    stopRound: jest.fn(),
    getSlapZone: () => slapZone,
    showSlapResult: jest.fn(),
  };
}

/**
 * Build a practice-round context like the runner passes in.
 * @param {AbortController} controller
 * @param {{ round?: number, guided?: boolean }} [options]
 * @returns {object}
 */
function buildContext(controller, { round = 1, guided = true } = {}) {
  return {
    round,
    attempt: 1,
    maxRounds: 2,
    guided,
    signal: controller.signal,
    setInstructions: jest.fn(),
    showMarker: jest.fn(),
    hideMarker: jest.fn(),
  };
}

describe('Card Rat tutorial controller', () => {
  /** Practice pace: the easiest display duration. */
  const PACE_MS = game.calculateDisplayDuration(0);
  let controls;
  let controller;
  let playPracticeRound;

  beforeEach(async () => {
    jest.useFakeTimers();
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
    jest.useRealTimers();
  });

  /**
   * Play a practice round and return its context, script, and promise.
   * @param {{ round?: number, guided?: boolean }} [options]
   * @returns {{ context: object, cards: object[], done: Promise<void> }}
   */
  function play(options) {
    const context = buildContext(controller, options);
    const done = playPracticeRound(context);
    return { context, cards: game.getPracticeSequence(context.round), done };
  }

  /** @param {object[]} cards - Deal every card after the first. */
  function dealToLastCard(cards) {
    jest.advanceTimersByTime(PACE_MS * (cards.length - 1));
  }

  test('launches with the game ID and its own practice round', () => {
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'card-rat',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorial.isActive()).toBe(true);
  });

  test('deals the round\'s script at the easiest pace', () => {
    const { context, cards } = play({ round: 2 });
    expect(controls.startRound).toHaveBeenCalled();
    expect(tutorialModule.isPracticing()).toBe(true);
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);
    expect(controls.dealCard).toHaveBeenLastCalledWith(cards[0], false);

    jest.advanceTimersByTime(PACE_MS - 1);
    expect(controls.dealCard).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(controls.dealCard).toHaveBeenLastCalledWith(cards[1], false);
  });

  test('a guided round rings the slap zone and says why on the last card', () => {
    const { context, cards } = play({ round: 2 });
    dealToLastCard(cards);

    expect(controls.dealCard).toHaveBeenLastCalledWith(cards.at(-1), true);
    expect(context.showMarker).toHaveBeenCalledWith({ anchor: controls.slapZone, shape: 'box' });
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedSlap.sandwich);

    // The card to slap waits for the player.
    jest.advanceTimersByTime(PACE_MS * 10);
    expect(controls.dealCard).toHaveBeenCalledTimes(cards.length);
  });

  test('an unguided round shows no marker', () => {
    const { context, cards } = play({ guided: false });
    dealToLastCard(cards);
    expect(context.showMarker).not.toHaveBeenCalled();
    expect(context.setInstructions).toHaveBeenCalledTimes(1);
  });

  test('an early slap is too soon and the cards keep coming', () => {
    const { context } = play();
    tutorialModule.handlePracticeSlap();

    expect(controls.showSlapResult).toHaveBeenCalledWith('false-alarm');
    expect(context.hideMarker).not.toHaveBeenCalled();
    expect(tutorialModule.isPracticing()).toBe(true);
    jest.advanceTimersByTime(PACE_MS);
    expect(controls.dealCard).toHaveBeenCalledTimes(2);
  });

  test('slapping the last card ends the round', async () => {
    const { context, cards, done } = play();
    dealToLastCard(cards);
    tutorialModule.handlePracticeSlap();

    await expect(done).resolves.toBeUndefined();
    expect(controls.showSlapResult).toHaveBeenCalledWith('hit');
    expect(context.hideMarker).toHaveBeenCalled();
    expect(tutorialModule.isPracticing()).toBe(false);
  });

  test('ending the tutorial stops the cards and the round', () => {
    play();
    controller.abort();

    expect(controls.stopRound).toHaveBeenCalled();
    expect(tutorialModule.isPracticing()).toBe(false);
    jest.advanceTimersByTime(PACE_MS * 10);
    expect(controls.dealCard).toHaveBeenCalledTimes(1);
  });
});
