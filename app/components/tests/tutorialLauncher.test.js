/**
 * tutorialLauncher.test.js — Unit tests for the shared guided-tutorial launch guard.
 *
 * The runners in tutorialService.js are mocked; their own behavior is covered in
 * tutorialService.test.js.
 *
 * @file Tests for app/components/tutorialLauncher.js
 */

import {
  describe, test, expect, jest, beforeEach,
} from '@jest/globals';

jest.unstable_mockModule('../tutorialService.js', () => ({
  runGuidedTutorial: jest.fn(),
  runGuidedTutorialIfNeeded: jest.fn(),
}));

const { createTutorialLauncher } = await import('../tutorialLauncher.js');
const tutorialServiceMock = await import('../tutorialService.js');

const STEPS = [{ title: 'Welcome', content: '<p>Hi</p>' }];

/**
 * Build a run handle that stays active until `finish()` or `cancel()`.
 * @returns {{ cancel: jest.Mock, isActive: jest.Mock, finish: () => void }}
 */
function buildRun() {
  let active = true;
  return {
    cancel: jest.fn(() => { active = false; }),
    isActive: jest.fn(() => active),
    finish: () => { active = false; },
  };
}

/**
 * A promise with its resolve and reject exposed, for holding a launch mid-load.
 * @returns {{ promise: Promise<any>, resolve: Function, reject: Function }}
 */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createTutorialLauncher', () => {
  let loadSteps;
  let playPracticeRound;
  let launcher;
  let container;
  let onComplete;
  let run;

  beforeEach(() => {
    jest.clearAllMocks();
    loadSteps = jest.fn(async () => STEPS);
    playPracticeRound = jest.fn();
    launcher = createTutorialLauncher({
      gameId: 'test-game', loadSteps, playPracticeRound, maxRounds: 3,
    });
    container = document.createElement('div');
    onComplete = jest.fn();
    run = buildRun();
    tutorialServiceMock.runGuidedTutorial.mockImplementation(() => run);
    tutorialServiceMock.runGuidedTutorialIfNeeded.mockImplementation(async () => run);
  });

  test('startIfNeeded loads the steps and runs the tutorial if needed', async () => {
    await launcher.startIfNeeded({ container, onComplete });

    expect(loadSteps).toHaveBeenCalledTimes(1);
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledWith({
      gameId: 'test-game',
      container,
      introSteps: STEPS,
      playPracticeRound,
      maxRounds: 3,
      onComplete: expect.any(Function),
    });
    expect(tutorialServiceMock.runGuidedTutorial).not.toHaveBeenCalled();
    expect(launcher.isActive()).toBe(true);
  });

  test('replay always runs the tutorial', async () => {
    await launcher.replay({ container, onComplete });

    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'test-game', container, introSteps: STEPS,
    }));
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
  });

  test('passes onComplete through to the runner', async () => {
    await launcher.startIfNeeded({ container, onComplete });
    const options = tutorialServiceMock.runGuidedTutorialIfNeeded.mock.calls[0][0];

    options.onComplete();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('is not active when the tutorial was already seen', async () => {
    tutorialServiceMock.runGuidedTutorialIfNeeded.mockImplementation(async (options) => {
      options.onComplete();
      return null;
    });

    await launcher.startIfNeeded({ container, onComplete });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(launcher.isActive()).toBe(false);
  });

  test('does nothing without a container', async () => {
    await launcher.startIfNeeded({ container: null, onComplete });
    await launcher.replay({ container: null, onComplete });

    expect(loadSteps).not.toHaveBeenCalled();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(tutorialServiceMock.runGuidedTutorial).not.toHaveBeenCalled();
  });

  test('ignores a second launch while the first is still loading', async () => {
    const first = launcher.startIfNeeded({ container, onComplete });
    const second = launcher.replay({ container, onComplete });
    await Promise.all([first, second]);

    expect(loadSteps).toHaveBeenCalledTimes(1);
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledTimes(1);
    expect(tutorialServiceMock.runGuidedTutorial).not.toHaveBeenCalled();
  });

  test('start and replay do nothing while a tutorial is in progress', async () => {
    await launcher.startIfNeeded({ container, onComplete });
    jest.clearAllMocks();

    await launcher.startIfNeeded({ container, onComplete });
    await launcher.replay({ container, onComplete });

    expect(loadSteps).not.toHaveBeenCalled();
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(tutorialServiceMock.runGuidedTutorial).not.toHaveBeenCalled();
  });

  test('can launch again once the tutorial run finishes', async () => {
    await launcher.startIfNeeded({ container, onComplete });
    run.finish();
    expect(launcher.isActive()).toBe(false);

    await launcher.replay({ container, onComplete });
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledTimes(1);
  });

  test('can launch again after loading the steps fails', async () => {
    loadSteps.mockRejectedValueOnce(new Error('load failed'));
    await expect(launcher.startIfNeeded({ container, onComplete })).rejects.toThrow('load failed');

    await launcher.startIfNeeded({ container, onComplete });
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).toHaveBeenCalledTimes(1);
  });

  test('cancel ends the run and is safe to repeat', async () => {
    await launcher.startIfNeeded({ container, onComplete });

    launcher.cancel();
    launcher.cancel();
    expect(run.cancel).toHaveBeenCalledTimes(1);
    expect(launcher.isActive()).toBe(false);
  });

  test('cancel is safe before any launch', () => {
    expect(() => launcher.cancel()).not.toThrow();
    expect(launcher.isActive()).toBe(false);
  });

  test('cancel while the steps load abandons the launch', async () => {
    const steps = deferred();
    loadSteps.mockReturnValueOnce(steps.promise);
    const launching = launcher.startIfNeeded({ container, onComplete });

    launcher.cancel();
    steps.resolve(STEPS);
    await launching;

    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('cancel while checking the seen flag drops the run and the session start', async () => {
    const seen = deferred();
    tutorialServiceMock.runGuidedTutorialIfNeeded.mockImplementation(async (options) => {
      await seen.promise;
      options.onComplete();
      return run;
    });
    const launching = launcher.startIfNeeded({ container, onComplete });
    await Promise.resolve();

    launcher.cancel();
    seen.resolve();
    await launching;

    expect(onComplete).not.toHaveBeenCalled();
    expect(run.cancel).toHaveBeenCalledTimes(1);
    expect(launcher.isActive()).toBe(false);
  });

  test('a new launch after cancel is not blocked by the abandoned one', async () => {
    const steps = deferred();
    loadSteps.mockReturnValueOnce(steps.promise);
    const abandoned = launcher.startIfNeeded({ container, onComplete });
    launcher.cancel();

    await launcher.replay({ container, onComplete });
    expect(tutorialServiceMock.runGuidedTutorial).toHaveBeenCalledTimes(1);

    // The abandoned launch finishing late leaves the new run in place.
    steps.resolve(STEPS);
    await abandoned;
    expect(tutorialServiceMock.runGuidedTutorialIfNeeded).not.toHaveBeenCalled();
    expect(launcher.isActive()).toBe(true);
  });
});
