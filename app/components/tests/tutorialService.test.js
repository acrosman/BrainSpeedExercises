/**
 * tutorialService.test.js — Unit tests for the shared tutorial framework.
 *
 * Exercises hasTutorialBeenSeen, markTutorialSeen, createTutorialOverlay,
 * renderTutorialStep, showTutorial, and showTutorialIfNeeded.
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
} = await import('../tutorialService.js');

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
    skipBtn.click();
    await Promise.resolve();
  });
});
