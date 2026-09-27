/**
 * tutorialLauncher.js — Launch a game's guided tutorial from its Start and Replay Tutorial
 * buttons.
 *
 * Every game with a guided tutorial needs the same guard around the runner in
 * tutorialService.js: load the slides, ignore a launch while another is loading or running,
 * and let `stop()` and `reset()` end the run. This module is that guard, written once.
 *
 * A game creates one launcher in its `tutorial/tutorial.js`, next to its practice-round code:
 * ```js
 * export const tutorial = createTutorialLauncher({
 *   gameId: GAME_ID,
 *   loadSteps: getTutorialSteps,
 *   playPracticeRound,
 * });
 * ```
 * and `index.js` drives it:
 * ```js
 * tutorial.startIfNeeded({ container, onComplete: beginGameSession }); // start()
 * tutorial.replay({ container, onComplete: beginGameSession });        // Replay Tutorial
 * if (tutorial.isActive()) reset();                                    // stop() with no session
 * tutorial.cancel();                                                   // reset()
 * ```
 *
 * @file Shared guided-tutorial launch guard.
 */

import { runGuidedTutorial, runGuidedTutorialIfNeeded } from './tutorialService.js';

/**
 * What a game's tutorial needs, fixed for the life of the launcher.
 *
 * @typedef {object} TutorialLauncherOptions
 * @property {string} gameId - Game ID (must match manifest.json `id`).
 * @property {() => Promise<import('./tutorialService.js').TutorialStep[]>} loadSteps - Loads
 *   the slides, usually the game's `getTutorialSteps`.
 * @property {import('./tutorialService.js').GuidedTutorialOptions['playPracticeRound']}
 *   [playPracticeRound] - Plays one practice round. Omit it for a slides-only tutorial.
 * @property {number} [maxRounds]    - Passed to the runner; see `GuidedTutorialOptions`.
 * @property {number} [guidedRounds] - Passed to the runner; see `GuidedTutorialOptions`.
 */

/**
 * What changes from one launch to the next.
 *
 * @typedef {object} TutorialLaunchOptions
 * @property {HTMLElement|null} container - Game container. Nothing launches without one.
 * @property {Function} onComplete - Starts the real session once the tutorial is finished or
 *   skipped, or at once when `startIfNeeded` finds it already seen.
 */

/**
 * @typedef {object} TutorialLauncher
 * @property {(options: TutorialLaunchOptions) => Promise<void>} startIfNeeded - Run the
 *   tutorial if the player has not seen it, then call `onComplete`. For the Start button.
 * @property {(options: TutorialLaunchOptions) => Promise<void>} replay - Always run the
 *   tutorial, then call `onComplete`. For the Replay Tutorial button.
 * @property {() => boolean} isActive - Whether a tutorial run is in progress.
 * @property {() => void} cancel - End the run, or abandon a launch that is still loading, without
 *   calling `onComplete`. Safe to call at any time.
 */

/**
 * Create the launcher for one game's guided tutorial.
 *
 * A launch does nothing when there is no container, another launch is still loading, or a
 * run is in progress. `cancel()` also abandons a launch that is still loading, so a tutorial
 * or session never starts after the game has been stopped or reset.
 *
 * @param {TutorialLauncherOptions} options
 * @returns {TutorialLauncher}
 */
export function createTutorialLauncher({ gameId, loadSteps, ...runOptions }) {
  /** Whether a launch is loading its slides or checking the seen flag. */
  let pending = false;
  /** Bumped by `cancel()` so a launch still loading knows it was abandoned. */
  let launchId = 0;
  /** @type {import('./tutorialService.js').GuidedTutorialRun|null} */
  let run = null;

  /** @returns {boolean} */
  function isActive() {
    return !!run && run.isActive();
  }

  /**
   * Load the slides and hand them to a runner, unless the launch is blocked or abandoned.
   *
   * @param {typeof runGuidedTutorial | typeof runGuidedTutorialIfNeeded} runTutorial
   * @param {TutorialLaunchOptions} options
   * @returns {Promise<void>}
   */
  async function launch(runTutorial, { container, onComplete }) {
    if (!container || pending || isActive()) return;

    pending = true;
    launchId += 1;
    const thisLaunch = launchId;
    const isCurrent = () => thisLaunch === launchId;
    try {
      const introSteps = await loadSteps();
      if (!isCurrent()) return;
      // Null (after calling onComplete) when the tutorial was already seen.
      const newRun = await runTutorial({
        ...runOptions,
        gameId,
        container,
        introSteps,
        onComplete: () => { if (isCurrent()) onComplete(); },
      });
      if (isCurrent()) {
        run = newRun;
      } else if (newRun) {
        newRun.cancel();
      }
    } finally {
      if (isCurrent()) pending = false;
    }
  }

  return {
    startIfNeeded: (options) => launch(runGuidedTutorialIfNeeded, options),
    replay: (options) => launch(runGuidedTutorial, options),
    isActive,
    cancel() {
      launchId += 1;
      pending = false;
      if (run) run.cancel();
      run = null;
    },
  };
}
