/**
 * tutorial.test.js — Tests for the Directional Processing tutorial step definitions.
 *
 * @file Tests for app/games/directional-processing/tutorial/tutorial.js
 */

import { describe, test, expect, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
  // Echo the definitions so the test can inspect the paths getTutorialSteps passes in.
  loadTutorialSteps: jest.fn(async (definitions) => definitions.map(
    ({ title, contentPath }) => ({ title, content: contentPath }),
  )),
}));

const { getTutorialSteps, PRACTICE_TEXT } = await import('../tutorial/tutorial.js');

/** Absolute path of `app/`, which step and image paths are relative to. */
const APP_DIR = fileURLToPath(new URL('../../../', import.meta.url));

describe('directional-processing tutorial steps', () => {
  test('lists the steps in order', async () => {
    const steps = await getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Directional Processing',
      'Find the Main Play Area',
      'What to Look For',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in this game\'s tutorial folder', async () => {
    const steps = await getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/directional-processing\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('practice text covers each stage and always offers the keyboard option to answer', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual(['watch', 'guidedAnswer', 'answer']);
    expect(PRACTICE_TEXT.answer).toMatch(/Click/);
    expect(PRACTICE_TEXT.answer).toMatch(/arrow key/);
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test.each([
    ['up', 'Up'],
    ['down', 'Down'],
    ['left', 'Left'],
    ['right', 'Right'],
  ])('guided text for %s names the direction and its arrow key', (direction, key) => {
    const text = PRACTICE_TEXT.guidedAnswer(direction);
    expect(text).toContain(`moved ${direction}`);
    expect(text).toMatch(/Click/);
    expect(text).toContain(`${key} arrow key`);
  });

  test('every image a step references exists', async () => {
    const steps = await getTutorialSteps();
    const imageSrcs = steps.flatMap(({ content: contentPath }) => {
      const markup = fs.readFileSync(path.join(APP_DIR, contentPath), 'utf8');
      return [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    });
    expect(imageSrcs).toContain('./games/directional-processing/images/tutorialScreenshot.png');
    imageSrcs.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });
});
