/**
 * tutorial.test.js — Tests for the Otter Stop tutorial content and controller.
 *
 * The controller is tested here against fake trial loop controls: each test plays the run it
 * hands to playTrials() by calling next() and record() directly. index.test.js covers it
 * wired to the real trial loop.
 *
 * @file Tests for app/games/otter-stop/tutorial/tutorial.js
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

/**
 * Read a tutorial slide fragment.
 * @param {string} file - File name in the tutorial folder.
 * @returns {string}
 */
function readStep(file) {
  return fs.readFileSync(path.join(APP_DIR, 'games/otter-stop/tutorial', file), 'utf8');
}

describe('Otter Stop tutorial content', () => {
  test('lists the steps in order', async () => {
    const steps = await tutorialModule.getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Otter Stop',
      'Find the Main Play Area',
      'Otters and the Fish',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in the tutorial folder', async () => {
    const steps = await tutorialModule.getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/otter-stop\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('every image a slide shows exists', () => {
    const files = fs.readdirSync(path.join(APP_DIR, 'games/otter-stop/tutorial'))
      .filter((file) => file.endsWith('.html'));
    const sources = files.flatMap((file) => [...readStep(file).matchAll(/src="\.\/([^"]+)"/g)]
      .map(([, src]) => src));
    expect(sources.length).toBeGreaterThan(0);
    sources.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });

  test('the screenshot step shows the screenshot with its highlight boxes', () => {
    const markup = readStep('tutorial-screenshot-step.html');
    expect(markup).toContain('./games/otter-stop/images/tutorialScreenshot.png');
    ['stats', 'stimulus', 'controls', 'trend'].forEach((region) => {
      expect(markup).toContain(`os-tutorial-highlight--${region}`);
    });
  });

  test('practice text that asks for a press offers both Space and a click', () => {
    [PRACTICE_TEXT.guidedGo, PRACTICE_TEXT.watch].forEach((text) => {
      expect(text).toMatch(/Space/);
      expect(text).toMatch(/click/);
    });
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test('mistake text names each kind of mistake made', () => {
    expect(PRACTICE_TEXT.mistakes(1, 0)).toMatch(/^You missed an otter\./);
    expect(PRACTICE_TEXT.mistakes(2, 0)).toMatch(/^You missed 2 otters\./);
    expect(PRACTICE_TEXT.mistakes(0, 1)).toMatch(/^You pressed while the fish was showing\./);
    const both = PRACTICE_TEXT.mistakes(1, 1);
    expect(both).toContain('You missed an otter.');
    expect(both).toContain('You pressed while the fish was showing.');
  });
});

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * Build fake trial loop controls that keep the run they are asked to play.
 * @returns {object}
 */
function buildControls() {
  const stimulusArea = document.createElement('div');
  stimulusArea.scrollIntoView = jest.fn();
  const controls = {
    stimulusArea,
    run: null,
    showGameArea: jest.fn(),
    playTrials: jest.fn((run) => { controls.run = run; }),
    stopTrials: jest.fn(),
    getStimulusArea: () => stimulusArea,
  };
  return controls;
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

describe('Otter Stop tutorial controller', () => {
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
   * Start a practice round and return its context, script, run, and promise.
   * @param {{ round?: number, guided?: boolean }} [options]
   * @returns {{ context: object, stimuli: object[], run: object, done: Promise<object> }}
   */
  function play(options) {
    const context = buildContext(controller, options);
    const done = playPracticeRound(context);
    return {
      context, stimuli: game.createPracticeSequence(context.round), run: controls.run, done,
    };
  }

  /**
   * Play every trial of a run, pressing for each stimulus that `shouldPress` picks.
   * @param {object} run
   * @param {(stimulus: object) => boolean} shouldPress
   * @returns {object[]} The stimuli the run gave, with their display times.
   */
  function playAll(run, shouldPress) {
    const shown = [];
    for (let stimulus = run.next(); stimulus; stimulus = run.next()) {
      shown.push(stimulus);
      run.record(stimulus, shouldPress(stimulus));
    }
    return shown;
  }

  /** Press for every otter and hold for the fish. */
  const pressForOtters = (stimulus) => !stimulus.isNoGo;

  test('launches with the game ID and its own practice round', () => {
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'otter-stop',
      playPracticeRound: expect.any(Function),
    }));
    expect(tutorial.isActive()).toBe(true);
  });

  test('shows the game area, brings the picture area on screen, and plays the round', () => {
    const { run } = play();
    expect(controls.showGameArea).toHaveBeenCalled();
    expect(controls.stimulusArea.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(controls.playTrials).toHaveBeenCalledWith(run);
  });

  test('a guided round rings each otter and waits for it, then shows the fish as usual', () => {
    const { context, stimuli, run } = play();

    const first = run.next();
    expect(first).toEqual({ ...stimuli[0], displayMs: null });
    expect(context.showMarker).toHaveBeenCalledWith({
      anchor: controls.stimulusArea,
      shape: 'box',
    });
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedGo);
    run.record(first, true);

    const shown = [first, ...playAll(run, pressForOtters)];
    expect(shown.map(({ imageKey, isNoGo }) => ({ imageKey, isNoGo }))).toEqual(stimuli);
    expect(shown.at(-1)).toEqual({ ...stimuli.at(-1), displayMs: game.getIntervalMs(0) });
    expect(context.hideMarker).toHaveBeenCalled();
    expect(context.setInstructions).toHaveBeenLastCalledWith(PRACTICE_TEXT.guidedNoGo);
  });

  test('an unguided round plays at the easiest interval, with no marker', () => {
    const { context, run } = play({ round: 2, guided: false });
    expect(context.setInstructions).toHaveBeenCalledWith(PRACTICE_TEXT.watch);

    const shown = playAll(run, pressForOtters);
    shown.forEach(({ displayMs }) => expect(displayMs).toBe(game.getIntervalMs(0)));
    expect(context.showMarker).not.toHaveBeenCalled();
    expect(context.setInstructions).toHaveBeenCalledTimes(1);
  });

  test('scores each trial like the game, without touching game state', () => {
    const { run } = play();
    const otter = run.next();
    expect(run.record(otter, true)).toBe('correct');
    expect(run.record(otter, false)).toBe('wrong');
    expect(game.getTrialsCompleted()).toBe(0);
    expect(game.getScore()).toBe(0);
  });

  test('a clean round resolves as correct once the fish is recorded', async () => {
    const { run, done } = play({ guided: false });
    playAll(run, pressForOtters);
    await expect(done).resolves.toEqual({ correct: true });
  });

  test('a round with mistakes resolves with what went wrong', async () => {
    const { run, done } = play({ guided: false });
    let otters = 0;
    // Miss the first otter, press for the rest, and press for the fish.
    playAll(run, (stimulus) => stimulus.isNoGo || (otters += 1) > 1);
    await expect(done).resolves.toEqual({
      correct: false,
      feedback: PRACTICE_TEXT.mistakes(1, 1),
    });
  });

  test('ending the tutorial stops the run', () => {
    play();
    controller.abort();
    expect(controls.stopTrials).toHaveBeenCalled();
  });
});
