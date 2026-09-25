/**
 * tutorialService.test.js — Unit tests for the shared tutorial framework.
 *
 * Exercises hasTutorialBeenSeen, markTutorialSeen, createTutorialOverlay,
 * renderTutorialStep, showTutorial, showTutorialIfNeeded, and step content loading.
 *
 * @file Tests for app/components/tutorialService.js
 */

import { jest } from '@jest/globals';

// ── Module-level mock setup ───────────────────────────────────────────────────

jest.unstable_mockModule('../logService.js', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
  },
}));

const {
  hasTutorialBeenSeen,
  markTutorialSeen,
  createTutorialOverlay,
  renderTutorialStep,
  showTutorial,
  showTutorialIfNeeded,
  loadTutorialSteps,
  clearTutorialMarkupCache,
  runGuidedTutorial,
  runGuidedTutorialIfNeeded,
} = await import('../tutorialService.js');
const { logger } = await import('../logService.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** @type {TutorialStep[]} */
const SAMPLE_STEPS = [
  { title: 'Step One', content: '<p>First step content.</p>' },
  { title: 'Step Two', content: '<p>Second step content.</p>' },
  { title: 'Step Three', content: '<p>Third step content.</p>' },
];

/**
 * Build a mock window.api.invoke that simulates progress:load / progress:save.
 * @param {object} [existingProgress]
 * @returns {{ mock: jest.Mock, saved: object }}
 */
function buildApiMock(existingProgress = { playerId: 'default', games: {}, tutorials: {} }) {
  const saved = { ...existingProgress };
  const mock = jest.fn((channel, payload) => {
    if (channel === 'progress:load') return Promise.resolve({ ...saved });
    if (channel === 'progress:save') {
      Object.assign(saved, payload.data);
      return Promise.resolve();
    }
    return Promise.resolve();
  });
  return { mock, saved };
}

/**
 * Create a minimal DOM container element.
 * @returns {HTMLElement}
 */
function makeContainer() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

// Clean up DOM and window.api after each test.
afterEach(() => {
  document.body.innerHTML = '';
  delete globalThis.window.api;
  jest.clearAllMocks();
});

// ── hasTutorialBeenSeen ───────────────────────────────────────────────────────

describe('hasTutorialBeenSeen', () => {
  test('returns false when window.api is unavailable', async () => {
    const result = await hasTutorialBeenSeen('my-game');
    expect(result).toBe(false);
  });

  test('returns false when tutorials key is absent', async () => {
    const { mock } = buildApiMock({ playerId: 'default', games: {} });
    globalThis.window.api = { invoke: mock };

    const result = await hasTutorialBeenSeen('my-game');
    expect(result).toBe(false);
  });

  test('returns false when game entry is absent from tutorials', async () => {
    const { mock } = buildApiMock({
      playerId: 'default', games: {}, tutorials: { 'other-game': true },
    });
    globalThis.window.api = { invoke: mock };

    const result = await hasTutorialBeenSeen('my-game');
    expect(result).toBe(false);
  });

  test('returns true when game entry is present in tutorials', async () => {
    const { mock } = buildApiMock({
      playerId: 'default', games: {}, tutorials: { 'my-game': true },
    });
    globalThis.window.api = { invoke: mock };

    const result = await hasTutorialBeenSeen('my-game');
    expect(result).toBe(true);
  });

  test('returns false when progress:load rejects (safe fallback)', async () => {
    globalThis.window.api = {
      invoke: jest.fn().mockRejectedValue(new Error('IPC error')),
    };

    const result = await hasTutorialBeenSeen('my-game');
    expect(result).toBe(false);
  });
});

// ── markTutorialSeen ──────────────────────────────────────────────────────────

describe('markTutorialSeen', () => {
  test('does nothing when window.api is unavailable', async () => {
    await expect(markTutorialSeen('my-game')).resolves.toBeUndefined();
  });

  test('calls progress:save with tutorials key set to true', async () => {
    const { mock, saved } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    await markTutorialSeen('my-game');

    expect(mock).toHaveBeenCalledWith('progress:save', expect.objectContaining({
      playerId: 'default',
    }));
    expect(saved.tutorials['my-game']).toBe(true);
  });

  test('preserves other tutorial flags when setting a new one', async () => {
    const { mock, saved } = buildApiMock({
      playerId: 'default',
      games: {},
      tutorials: { 'other-game': true },
    });
    globalThis.window.api = { invoke: mock };

    await markTutorialSeen('my-game');

    expect(saved.tutorials['other-game']).toBe(true);
    expect(saved.tutorials['my-game']).toBe(true);
  });

  test('does not throw when progress:save rejects', async () => {
    const loadResult = { playerId: 'default', games: {}, tutorials: {} };
    globalThis.window.api = {
      invoke: jest.fn((channel) => {
        if (channel === 'progress:load') return Promise.resolve(loadResult);
        return Promise.reject(new Error('save error'));
      }),
    };

    await expect(markTutorialSeen('my-game')).resolves.toBeUndefined();
  });
});

// ── createTutorialOverlay ─────────────────────────────────────────────────────

describe('createTutorialOverlay', () => {
  test('throws when steps array is empty', () => {
    expect(() => createTutorialOverlay([])).toThrow();
  });

  test('throws when steps is null or undefined', () => {
    expect(() => createTutorialOverlay(null)).toThrow();
    expect(() => createTutorialOverlay(undefined)).toThrow();
  });

  test('returns an element with class tutorial-overlay', () => {
    const el = createTutorialOverlay(SAMPLE_STEPS);
    expect(el.classList.contains('tutorial-overlay')).toBe(true);
  });

  test('has role="dialog" and aria-modal="true"', () => {
    const el = createTutorialOverlay(SAMPLE_STEPS);
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
  });

  test('contains prev, next, and skip buttons', () => {
    const el = createTutorialOverlay(SAMPLE_STEPS);
    expect(el.querySelector('#tutorial-overlay-prev')).not.toBeNull();
    expect(el.querySelector('#tutorial-overlay-next')).not.toBeNull();
    expect(el.querySelector('#tutorial-overlay-skip')).not.toBeNull();
  });
});

// ── renderTutorialStep ────────────────────────────────────────────────────────

describe('renderTutorialStep', () => {
  test('shows step 1 of N in the indicator', () => {
    const overlay = createTutorialOverlay(SAMPLE_STEPS);
    renderTutorialStep(overlay, SAMPLE_STEPS, 0);
    const indicator = overlay.querySelector('.tutorial-overlay__step-indicator');
    expect(indicator.textContent).toBe('Step 1 of 3');
  });

  test('shows step title in the heading', () => {
    const overlay = createTutorialOverlay(SAMPLE_STEPS);
    renderTutorialStep(overlay, SAMPLE_STEPS, 0);
    const title = overlay.querySelector('.tutorial-overlay__title');
    expect(title.textContent).toBe('Step One');
  });

  test('renders step content as innerHTML', () => {
    const overlay = createTutorialOverlay(SAMPLE_STEPS);
    renderTutorialStep(overlay, SAMPLE_STEPS, 1);
    const content = overlay.querySelector('.tutorial-overlay__content');
    expect(content.innerHTML).toBe('<p>Second step content.</p>');
  });

  test('prev button is hidden on first step', () => {
    const overlay = createTutorialOverlay(SAMPLE_STEPS);
    renderTutorialStep(overlay, SAMPLE_STEPS, 0);
    const prev = overlay.querySelector('#tutorial-overlay-prev');
    expect(prev.hidden).toBe(true);
    expect(prev.disabled).toBe(true);
  });

  test('prev button is visible on non-first steps', () => {
    const overlay = createTutorialOverlay(SAMPLE_STEPS);
    renderTutorialStep(overlay, SAMPLE_STEPS, 1);
    const prev = overlay.querySelector('#tutorial-overlay-prev');
    expect(prev.hidden).toBe(false);
    expect(prev.disabled).toBe(false);
  });

  test('next button text is "Next" on intermediate steps', () => {
    const overlay = createTutorialOverlay(SAMPLE_STEPS);
    renderTutorialStep(overlay, SAMPLE_STEPS, 0);
    const next = overlay.querySelector('#tutorial-overlay-next');
    expect(next.textContent).toBe('Next');
  });

  test('next button text is "Got it!" on last step', () => {
    const overlay = createTutorialOverlay(SAMPLE_STEPS);
    renderTutorialStep(overlay, SAMPLE_STEPS, 2);
    const next = overlay.querySelector('#tutorial-overlay-next');
    expect(next.textContent).toBe('Got it!');
  });

  test('uses a custom finish label on the last step only', () => {
    const overlay = createTutorialOverlay(SAMPLE_STEPS);
    const next = overlay.querySelector('#tutorial-overlay-next');
    renderTutorialStep(overlay, SAMPLE_STEPS, 1, 'Start Practice');
    expect(next.textContent).toBe('Next');
    renderTutorialStep(overlay, SAMPLE_STEPS, 2, 'Start Practice');
    expect(next.textContent).toBe('Start Practice');
  });

  test('next button has no aria-label, so its name matches its visible text', () => {
    const overlay = createTutorialOverlay(SAMPLE_STEPS);
    const next = overlay.querySelector('#tutorial-overlay-next');
    renderTutorialStep(overlay, SAMPLE_STEPS, 0);
    expect(next.hasAttribute('aria-label')).toBe(false);
    renderTutorialStep(overlay, SAMPLE_STEPS, 2);
    expect(next.hasAttribute('aria-label')).toBe(false);
  });
});

// ── showTutorial ──────────────────────────────────────────────────────────────

describe('showTutorial', () => {
  test('appends overlay to the container', () => {
    const container = makeContainer();
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    showTutorial('my-game', SAMPLE_STEPS, container);
    expect(container.querySelector('.tutorial-overlay')).not.toBeNull();
  });

  test('returns the overlay element', () => {
    const container = makeContainer();
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    const overlay = showTutorial('my-game', SAMPLE_STEPS, container);
    expect(overlay.classList.contains('tutorial-overlay')).toBe(true);
  });

  test('advances to step 2 when Next is clicked', () => {
    const container = makeContainer();
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    const overlay = showTutorial('my-game', SAMPLE_STEPS, container);
    overlay.querySelector('#tutorial-overlay-next').click();

    const indicator = overlay.querySelector('.tutorial-overlay__step-indicator');
    expect(indicator.textContent).toBe('Step 2 of 3');
  });

  test('goes back to step 1 when Previous is clicked after advancing', () => {
    const container = makeContainer();
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    const overlay = showTutorial('my-game', SAMPLE_STEPS, container);
    overlay.querySelector('#tutorial-overlay-next').click(); // step 2
    overlay.querySelector('#tutorial-overlay-prev').click(); // back to step 1

    const indicator = overlay.querySelector('.tutorial-overlay__step-indicator');
    expect(indicator.textContent).toBe('Step 1 of 3');
  });

  test('removes overlay when Got it! is clicked on last step', async () => {
    const container = makeContainer();
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    const overlay = showTutorial('my-game', SAMPLE_STEPS, container);
    // Navigate to last step
    overlay.querySelector('#tutorial-overlay-next').click();
    overlay.querySelector('#tutorial-overlay-next').click();

    // Click finish
    overlay.querySelector('#tutorial-overlay-next').click();

    // Allow async markTutorialSeen to run
    await new Promise(process.nextTick);

    expect(container.querySelector('.tutorial-overlay')).toBeNull();
  });

  test('calls onComplete after finishing', async () => {
    const container = makeContainer();
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };
    const onComplete = jest.fn();

    const overlay = showTutorial('my-game', SAMPLE_STEPS, container, onComplete);
    overlay.querySelector('#tutorial-overlay-next').click();
    overlay.querySelector('#tutorial-overlay-next').click();
    overlay.querySelector('#tutorial-overlay-next').click();

    await new Promise(process.nextTick);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('removes overlay when Skip Tutorial is clicked', async () => {
    const container = makeContainer();
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    const overlay = showTutorial('my-game', SAMPLE_STEPS, container);
    overlay.querySelector('#tutorial-overlay-skip').click();

    await new Promise(process.nextTick);

    expect(container.querySelector('.tutorial-overlay')).toBeNull();
  });

  test('calls onComplete when tutorial is skipped', async () => {
    const container = makeContainer();
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };
    const onComplete = jest.fn();

    const overlay = showTutorial('my-game', SAMPLE_STEPS, container, onComplete);
    overlay.querySelector('#tutorial-overlay-skip').click();

    await new Promise(process.nextTick);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('marks tutorial as seen after finishing', async () => {
    const { mock, saved } = buildApiMock();
    globalThis.window.api = { invoke: mock };
    const container = makeContainer();

    const overlay = showTutorial('my-game', SAMPLE_STEPS, container);
    overlay.querySelector('#tutorial-overlay-next').click();
    overlay.querySelector('#tutorial-overlay-next').click();
    overlay.querySelector('#tutorial-overlay-next').click();

    await new Promise(process.nextTick);
    expect(saved.tutorials['my-game']).toBe(true);
  });

  test('marks tutorial as seen after skipping', async () => {
    const { mock, saved } = buildApiMock();
    globalThis.window.api = { invoke: mock };
    const container = makeContainer();

    const overlay = showTutorial('my-game', SAMPLE_STEPS, container);
    overlay.querySelector('#tutorial-overlay-skip').click();

    await new Promise(process.nextTick);
    expect(saved.tutorials['my-game']).toBe(true);
  });
});

// ── showTutorialIfNeeded ──────────────────────────────────────────────────────

describe('showTutorialIfNeeded', () => {
  test('shows overlay when tutorial has not been seen', async () => {
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };
    const container = makeContainer();

    const overlay = await showTutorialIfNeeded('new-game', SAMPLE_STEPS, container);
    expect(overlay).not.toBeNull();
    expect(container.querySelector('.tutorial-overlay')).not.toBeNull();
  });

  test('returns null and calls onComplete when tutorial already seen', async () => {
    const { mock } = buildApiMock({
      playerId: 'default',
      games: {},
      tutorials: { 'seen-game': true },
    });
    globalThis.window.api = { invoke: mock };
    const container = makeContainer();
    const onComplete = jest.fn();

    const overlay = await showTutorialIfNeeded('seen-game', SAMPLE_STEPS, container, onComplete);

    expect(overlay).toBeNull();
    expect(container.querySelector('.tutorial-overlay')).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('calls onComplete with no arguments when skipping already-seen tutorial', async () => {
    const { mock } = buildApiMock({
      playerId: 'default',
      games: {},
      tutorials: { 'seen-game': true },
    });
    globalThis.window.api = { invoke: mock };
    const container = makeContainer();
    const onComplete = jest.fn();

    await showTutorialIfNeeded('seen-game', SAMPLE_STEPS, container, onComplete);
    expect(onComplete).toHaveBeenCalledWith();
  });

  test('does not throw when called without onComplete and tutorial is completed', async () => {
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };
    const container = makeContainer();

    // No onComplete provided — the default () => {} must be invoked without error
    // when the tutorial is finished (skip is clicked).
    const overlay = await showTutorialIfNeeded('no-callback-game', SAMPLE_STEPS, container);
    expect(overlay).not.toBeNull();

    const skipBtn = overlay.querySelector('#tutorial-overlay-skip');
    expect(skipBtn).not.toBeNull();
    skipBtn.click();
    await Promise.resolve();
  });
});

describe('loadTutorialSteps', () => {
  const DEFINITIONS = [
    { title: 'One', contentPath: './one.html' },
    { title: 'Two', contentPath: './two.html' },
  ];

  beforeEach(() => {
    clearTutorialMarkupCache();
    logger.warn.mockClear();
    global.fetch = jest.fn(async (path) => ({
      ok: true,
      status: 200,
      text: async () => `<p>${path}</p>`,
    }));
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('returns one step per definition, in order, with the fetched markup', async () => {
    const steps = await loadTutorialSteps(DEFINITIONS);
    expect(steps).toEqual([
      { title: 'One', content: '<p>./one.html</p>' },
      { title: 'Two', content: '<p>./two.html</p>' },
    ]);
  });

  it('uses fallback text and warns when a response is not ok', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
    const steps = await loadTutorialSteps(DEFINITIONS);
    expect(steps[0].content).toBe('Tutorial content is temporarily unavailable.');
    expect(steps[1].content).toBe('<p>./two.html</p>');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('uses fallback text when fetch rejects', async () => {
    global.fetch.mockRejectedValueOnce(new Error('offline'));
    const steps = await loadTutorialSteps(DEFINITIONS.slice(0, 1));
    expect(steps[0].content).toBe('Tutorial content is temporarily unavailable.');
  });

  it('caches markup between loads until the cache is cleared', async () => {
    await loadTutorialSteps(DEFINITIONS);
    await loadTutorialSteps(DEFINITIONS);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    clearTutorialMarkupCache();
    await loadTutorialSteps(DEFINITIONS);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});

// ── runGuidedTutorial ─────────────────────────────────────────────────────────

/**
 * Let queued promise callbacks (IPC mocks and the runner's awaits) run.
 * @returns {Promise<void>}
 */
async function flush() {
  for (let i = 0; i < 10; i += 1) {
    await new Promise(process.nextTick);
  }
}

/**
 * Click Next until the slide overlay finishes.
 * @param {HTMLElement} container
 */
function finishSlides(container) {
  const next = container.querySelector('#tutorial-overlay-next');
  SAMPLE_STEPS.forEach(() => next.click());
}

/**
 * Build a playPracticeRound mock. Each round stays open until the test calls finishRound().
 * @returns {{ play: jest.Mock, contexts: object[], finishRound: () => void }}
 */
function buildPracticeMock() {
  const contexts = [];
  let finishCurrent = () => {};
  const play = jest.fn((context) => new Promise((resolve) => {
    contexts.push(context);
    finishCurrent = resolve;
  }));
  return { play, contexts, finishRound: () => finishCurrent() };
}

/**
 * Labels of the prompt buttons currently in the coach.
 * @param {HTMLElement} container
 * @returns {string[]}
 */
function coachChoices(container) {
  return [...container.querySelectorAll('.tutorial-coach__actions button')]
    .map((button) => button.textContent);
}

/**
 * Click the coach prompt button with the given label.
 * @param {HTMLElement} container
 * @param {string} label
 */
function chooseInCoach(container, label) {
  [...container.querySelectorAll('.tutorial-coach__actions button')]
    .find((button) => button.textContent === label)
    .click();
}

describe('runGuidedTutorial', () => {
  let container;
  let api;

  beforeEach(() => {
    container = makeContainer();
    api = buildApiMock();
    globalThis.window.api = { invoke: api.mock };
  });

  test('without a practice round it behaves like the slide tutorial', async () => {
    const onComplete = jest.fn();
    const run = runGuidedTutorial({
      gameId: 'g', container, introSteps: SAMPLE_STEPS, onComplete,
    });
    const next = container.querySelector('#tutorial-overlay-next');
    next.click();
    next.click();
    expect(next.textContent).toBe('Got it!');
    next.click();

    await expect(run.finished).resolves.toBe('completed');
    expect(container.querySelector('.tutorial-overlay')).toBeNull();
    expect(container.querySelector('.tutorial-coach')).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(api.saved.tutorials.g).toBe(true);
  });

  test('labels the last slide "Start Practice" when there is a practice round', () => {
    const { play } = buildPracticeMock();
    runGuidedTutorial({
      gameId: 'g', container, introSteps: SAMPLE_STEPS, playPracticeRound: play,
    });
    const next = container.querySelector('#tutorial-overlay-next');
    next.click();
    next.click();
    expect(next.textContent).toBe('Start Practice');
    expect(play).not.toHaveBeenCalled();
  });

  test('closes the slides, shows the coach, and plays a guided first round', () => {
    const { play, contexts } = buildPracticeMock();
    runGuidedTutorial({
      gameId: 'g', container, introSteps: SAMPLE_STEPS, playPracticeRound: play,
    });
    finishSlides(container);

    expect(container.querySelector('.tutorial-overlay')).toBeNull();
    const coach = container.querySelector('.tutorial-coach');
    expect(container.firstElementChild).toBe(coach);
    expect(document.activeElement).toBe(coach);
    expect(coach.querySelector('.tutorial-coach__label').textContent)
      .toBe('Practice round 1 of 2');

    expect(play).toHaveBeenCalledTimes(1);
    expect(contexts[0]).toEqual(expect.objectContaining({
      round: 1, maxRounds: 2, guided: true,
    }));
    expect(contexts[0].signal.aborted).toBe(false);
  });

  test('the round context updates the coach text and shows, replaces, and hides the marker', () => {
    const { play, contexts } = buildPracticeMock();
    runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play,
    });
    const context = contexts[0];
    const anchor = document.createElement('button');
    container.appendChild(anchor);

    context.setInstructions('Click the marked button, or press Enter.');
    expect(container.querySelector('.tutorial-coach__text').textContent)
      .toBe('Click the marked button, or press Enter.');

    context.showMarker({ anchor });
    context.showMarker({ anchor, shape: 'box' });
    const markers = container.querySelectorAll('.tutorial-marker');
    expect(markers).toHaveLength(1);
    expect(markers[0].classList.contains('tutorial-marker--box')).toBe(true);

    context.hideMarker();
    expect(container.querySelector('.tutorial-marker')).toBeNull();
  });

  test('offers another round, then plays an unguided second round', async () => {
    const { play, contexts, finishRound } = buildPracticeMock();
    runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play,
    });
    contexts[0].showMarker({ anchor: container });
    finishRound();
    await flush();

    expect(container.querySelector('.tutorial-marker')).toBeNull();
    expect(container.querySelector('.tutorial-coach__text').textContent)
      .toBe('Round 1 done. Play another practice round, or start the game?');
    expect(coachChoices(container)).toEqual(['Play Another Round', 'Start the Game']);
    expect(document.activeElement.textContent).toBe('Play Another Round');

    chooseInCoach(container, 'Play Another Round');
    await flush();
    expect(play).toHaveBeenCalledTimes(2);
    expect(contexts[1]).toEqual(expect.objectContaining({ round: 2, guided: false }));
    expect(container.querySelector('.tutorial-coach__label').textContent)
      .toBe('Practice round 2 of 2');
    expect(document.activeElement).toBe(container.querySelector('.tutorial-coach'));
  });

  test('after the last round it offers only Start the Game, then completes', async () => {
    const onComplete = jest.fn();
    const { play, contexts, finishRound } = buildPracticeMock();
    const run = runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play, onComplete,
    });
    finishRound();
    await flush();
    chooseInCoach(container, 'Play Another Round');
    await flush();
    finishRound();
    await flush();

    expect(coachChoices(container)).toEqual(['Start the Game']);
    expect(onComplete).not.toHaveBeenCalled();
    chooseInCoach(container, 'Start the Game');

    await expect(run.finished).resolves.toBe('completed');
    expect(container.querySelector('.tutorial-coach')).toBeNull();
    expect(contexts[1].signal.aborted).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(api.saved.tutorials.g).toBe(true);
  });

  test('Start the Game after round 1 skips the second round', async () => {
    const onComplete = jest.fn();
    const { play, finishRound } = buildPracticeMock();
    const run = runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play, onComplete,
    });
    finishRound();
    await flush();
    chooseInCoach(container, 'Start the Game');

    await expect(run.finished).resolves.toBe('completed');
    expect(play).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('honors maxRounds and guidedRounds', async () => {
    const { play, contexts, finishRound } = buildPracticeMock();
    runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play, maxRounds: 3, guidedRounds: 2,
    });
    finishRound();
    await flush();
    chooseInCoach(container, 'Play Another Round');
    await flush();
    finishRound();
    await flush();
    chooseInCoach(container, 'Play Another Round');
    await flush();

    expect(contexts.map((c) => [c.round, c.maxRounds, c.guided])).toEqual([
      [1, 3, true], [2, 3, true], [3, 3, false],
    ]);
  });

  test('Skip Tutorial on the slides skips practice and starts the game', async () => {
    const onComplete = jest.fn();
    const { play } = buildPracticeMock();
    const run = runGuidedTutorial({
      gameId: 'g', container, introSteps: SAMPLE_STEPS, playPracticeRound: play, onComplete,
    });
    container.querySelector('#tutorial-overlay-skip').click();

    await expect(run.finished).resolves.toBe('skipped');
    expect(play).not.toHaveBeenCalled();
    expect(container.querySelector('.tutorial-overlay')).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(api.saved.tutorials.g).toBe(true);
  });

  test('Skip Practice mid-round aborts the round and starts the game', async () => {
    const onComplete = jest.fn();
    const { play, contexts, finishRound } = buildPracticeMock();
    const run = runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play, onComplete,
    });
    contexts[0].showMarker({ anchor: container });
    container.querySelector('.tutorial-coach__skip').click();

    await expect(run.finished).resolves.toBe('skipped');
    expect(contexts[0].signal.aborted).toBe(true);
    expect(container.querySelector('.tutorial-coach')).toBeNull();
    expect(container.querySelector('.tutorial-marker')).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(api.saved.tutorials.g).toBe(true);

    // A round that settles after the skip must not reopen anything.
    finishRound();
    await flush();
    expect(container.querySelector('.tutorial-coach')).toBeNull();
    expect(play).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('Skip Practice while the prompt is showing starts the game', async () => {
    const onComplete = jest.fn();
    const { play, finishRound } = buildPracticeMock();
    const run = runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play, onComplete,
    });
    finishRound();
    await flush();
    container.querySelector('.tutorial-coach__skip').click();

    await expect(run.finished).resolves.toBe('skipped');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('cancel() removes everything without marking seen or calling onComplete', async () => {
    const onComplete = jest.fn();
    const { play, contexts } = buildPracticeMock();
    const run = runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play, onComplete,
    });
    contexts[0].showMarker({ anchor: container });

    run.cancel();
    run.cancel();

    await expect(run.finished).resolves.toBe('cancelled');
    expect(contexts[0].signal.aborted).toBe(true);
    expect(container.querySelector('.tutorial-coach')).toBeNull();
    expect(container.querySelector('.tutorial-marker')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    expect(api.mock).not.toHaveBeenCalledWith('progress:save', expect.anything());
  });

  test('cancel() while the slides are open removes the overlay', async () => {
    const run = runGuidedTutorial({
      gameId: 'g', container, introSteps: SAMPLE_STEPS,
    });
    run.cancel();
    await expect(run.finished).resolves.toBe('cancelled');
    expect(container.querySelector('.tutorial-overlay')).toBeNull();
  });

  test('cancel() while the seen flag is saving stops onComplete', async () => {
    const onComplete = jest.fn();
    let releaseLoad = () => {};
    globalThis.window.api = {
      invoke: jest.fn((channel) => {
        if (channel === 'progress:load') {
          return new Promise((resolve) => { releaseLoad = () => resolve({ tutorials: {} }); });
        }
        return Promise.resolve();
      }),
    };
    const run = runGuidedTutorial({
      gameId: 'g', container, introSteps: SAMPLE_STEPS, onComplete,
    });
    container.querySelector('#tutorial-overlay-skip').click();
    run.cancel();
    releaseLoad();

    await expect(run.finished).resolves.toBe('cancelled');
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('ignores marker and instruction updates after the run ends', async () => {
    const { play, contexts } = buildPracticeMock();
    const run = runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play,
    });
    const coach = container.querySelector('.tutorial-coach');
    run.cancel();
    await run.finished;

    contexts[0].showMarker({ anchor: container });
    contexts[0].setInstructions('Too late');
    expect(container.querySelector('.tutorial-marker')).toBeNull();
    expect(coach.querySelector('.tutorial-coach__text').textContent).toBe('');
  });

  test('with no intro steps it goes straight to practice', () => {
    const { play } = buildPracticeMock();
    runGuidedTutorial({ gameId: 'g', container, playPracticeRound: play });
    expect(container.querySelector('.tutorial-overlay')).toBeNull();
    expect(play).toHaveBeenCalledTimes(1);
  });

  test('with maxRounds 0 it completes without practice', async () => {
    const onComplete = jest.fn();
    const { play } = buildPracticeMock();
    const run = runGuidedTutorial({
      gameId: 'g', container, playPracticeRound: play, maxRounds: 0, onComplete,
    });
    await expect(run.finished).resolves.toBe('completed');
    expect(play).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('works without an onComplete callback', async () => {
    const run = runGuidedTutorial({ gameId: 'g', container });
    await expect(run.finished).resolves.toBe('completed');
  });

  test('a failing practice round is logged and the game starts anyway', async () => {
    const onComplete = jest.fn();
    const error = new Error('boom');
    const run = runGuidedTutorial({
      gameId: 'g',
      container,
      playPracticeRound: jest.fn(() => Promise.reject(error)),
      onComplete,
    });

    await expect(run.finished).resolves.toBe('skipped');
    expect(logger.error).toHaveBeenCalledWith('tutorialService: practice round failed', error);
    expect(container.querySelector('.tutorial-coach')).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('runGuidedTutorialIfNeeded', () => {
  test('calls onComplete and returns null when the tutorial was seen', async () => {
    const { mock } = buildApiMock({ tutorials: { g: true } });
    globalThis.window.api = { invoke: mock };
    const container = makeContainer();
    const onComplete = jest.fn();
    const playPracticeRound = jest.fn();

    const run = await runGuidedTutorialIfNeeded({
      gameId: 'g', container, introSteps: SAMPLE_STEPS, playPracticeRound, onComplete,
    });
    expect(run).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(playPracticeRound).not.toHaveBeenCalled();
    expect(container.children).toHaveLength(0);
  });

  test('tolerates a missing onComplete when the tutorial was seen', async () => {
    const { mock } = buildApiMock({ tutorials: { g: true } });
    globalThis.window.api = { invoke: mock };
    await expect(runGuidedTutorialIfNeeded({ gameId: 'g', container: makeContainer() }))
      .resolves.toBeNull();
  });

  test('runs the tutorial when it has not been seen', async () => {
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };
    const container = makeContainer();

    const run = await runGuidedTutorialIfNeeded({
      gameId: 'g', container, introSteps: SAMPLE_STEPS,
    });
    expect(typeof run.cancel).toBe('function');
    expect(container.querySelector('.tutorial-overlay')).not.toBeNull();
    run.cancel();
  });
});
