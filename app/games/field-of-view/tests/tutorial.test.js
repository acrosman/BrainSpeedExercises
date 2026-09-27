/**
 * tutorial.test.js — Tests for the Field of View tutorial step definitions.
 *
 * @file Tests for app/games/field-of-view/tutorial/tutorial.js
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

describe('field-of-view tutorial steps', () => {
  test('lists the steps in order', async () => {
    const steps = await getTutorialSteps();
    expect(steps.map((step) => step.title)).toEqual([
      'Welcome to Field of View',
      'Find the Main Play Area',
      'What to Look For',
      'How to Respond',
      'Levels and Scoring',
    ]);
  });

  test('every step points at an HTML fragment in this game\'s tutorial folder', async () => {
    const steps = await getTutorialSteps();
    steps.forEach(({ content: contentPath }) => {
      expect(contentPath).toMatch(/^\.\/games\/field-of-view\/tutorial\/[\w-]+\.html$/);
      expect(fs.existsSync(path.join(APP_DIR, contentPath))).toBe(true);
    });
  });

  test('every image a step references exists', async () => {
    const steps = await getTutorialSteps();
    const imageSrcs = steps.flatMap(({ content: contentPath }) => {
      const markup = fs.readFileSync(path.join(APP_DIR, contentPath), 'utf8');
      return [...markup.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    });
    expect(imageSrcs).toContain('./games/field-of-view/images/tutorialScreenshot.png');
    imageSrcs.forEach((src) => {
      expect(fs.existsSync(path.join(APP_DIR, src))).toBe(true);
    });
  });
});

describe('field-of-view practice text', () => {
  test('covers each stage and is frozen', () => {
    expect(Object.keys(PRACTICE_TEXT)).toEqual([
      'watch', 'guidedKitten', 'guidedLocation', 'answer', 'result',
    ]);
    expect(Object.isFrozen(PRACTICE_TEXT)).toBe(true);
  });

  test.each([
    ['guidedKitten', PRACTICE_TEXT.guidedKitten('sitting kitten')],
    ['guidedLocation', PRACTICE_TEXT.guidedLocation(1, 2)],
    ['answer', PRACTICE_TEXT.answer],
  ])('%s text offers both the click and the keyboard option', (_name, text) => {
    expect(text).toMatch(/Click/);
    expect(text).toMatch(/Tab/);
    expect(text).toMatch(/Enter/);
  });

  test('guided text names the answer', () => {
    expect(PRACTICE_TEXT.guidedKitten('leaping kitten')).toContain('The leaping kitten');
    expect(PRACTICE_TEXT.guidedLocation(3, 1)).toContain('row 3, column 1');
  });

  test('result text confirms a correct answer', () => {
    expect(PRACTICE_TEXT.result({
      success: true, kitten: 'sitting kitten', row: 1, col: 2,
    })).toBe('Correct! You got both the kitten and the toy.');
  });

  test('result text names both correct answers after a miss', () => {
    expect(PRACTICE_TEXT.result({
      success: false, kitten: 'leaping kitten', row: 3, col: 3,
    })).toBe('Not quite. The leaping kitten was in the center, and the toy was in row 3, '
      + 'column 3.');
  });
});
