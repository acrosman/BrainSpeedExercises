import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../components/logService.js', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

const { logger } = await import('../../../components/logService.js');
const tutorialModule = await import('../tutorial/tutorial.js');
const { getTutorialSteps, clearTutorialMarkupCache } = tutorialModule;

/**
 * Create a fetch Response-like object for tutorial markup tests.
 *
 * @param {boolean} ok
 * @param {string} text
 * @param {number} [status=200]
 * @returns {{ok: boolean, status: number, text: () => Promise<string>}}
 */
function makeResponse(ok, text, status = 200) {
  return {
    ok,
    status,
    text: async () => text,
  };
}

describe('directional-processing tutorial steps', () => {
  beforeEach(() => {
    clearTutorialMarkupCache();
    logger.warn.mockClear();
    global.fetch = jest.fn(async (path) => {
      if (path.includes('tutorial-step-welcome.html')) {
        return makeResponse(true, '<p>Welcome tutorial content</p>');
      }
      if (path.includes('tutorial-step-what-to-look-for.html')) {
        return makeResponse(true, '<p>Direction matters content</p>');
      }
      if (path.includes('tutorial-step-how-to-respond.html')) {
        return makeResponse(true, '<p>Response content</p>');
      }
      return makeResponse(false, '', 404);
    });
  });

  test('loads tutorial steps from separate HTML files', async () => {
    const steps = await getTutorialSteps();
    expect(steps).toHaveLength(3);
    expect(steps[0]).toEqual(expect.objectContaining({
      title: 'Welcome to Directional Processing',
      content: '<p>Welcome tutorial content</p>',
    }));
    expect(steps[1].content).toContain('Direction matters');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('uses fallback content when a step fails to load', async () => {
    global.fetch = jest.fn(async (path) => {
      if (path.includes('tutorial-step-what-to-look-for.html')) {
        return makeResponse(false, '', 500);
      }
      return makeResponse(true, '<p>ok</p>');
    });

    const steps = await getTutorialSteps();
    expect(steps[1]).toEqual(expect.objectContaining({
      title: 'What to Look For',
      content: 'Tutorial content is temporarily unavailable.',
    }));
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('caches loaded tutorial markup between calls', async () => {
    await getTutorialSteps();
    await getTutorialSteps();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('clearTutorialMarkupCache clears cached tutorial markup', async () => {
    await getTutorialSteps();
    clearTutorialMarkupCache();
    await getTutorialSteps();
    expect(global.fetch).toHaveBeenCalledTimes(6);
  });
});
