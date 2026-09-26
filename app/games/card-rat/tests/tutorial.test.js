import {
  describe,
  test,
  expect,
  jest,
} from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

jest.unstable_mockModule('../../../components/tutorialService.js', () => ({
  // Echo the definitions so the test can inspect the paths getTutorialSteps passes in.
  loadTutorialSteps: jest.fn(async (definitions) => definitions.map(
    ({ title, contentPath }) => ({ title, content: contentPath }),
  )),
}));

const tutorialModule = await import('../tutorial/tutorial.js');

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
    const { PRACTICE_TEXT } = tutorialModule;
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
