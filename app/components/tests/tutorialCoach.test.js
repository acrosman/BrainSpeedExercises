/**
 * tutorialCoach.test.js — Unit tests for the guided-tutorial coach banner and marker.
 *
 * @file Tests for app/components/tutorialCoach.js
 */

import {
  describe, test, expect, jest, afterEach,
} from '@jest/globals';

const {
  createTutorialCoach,
  setCoachMessage,
  askCoachQuestion,
  positionTutorialMarker,
  showTutorialMarker,
} = await import('../tutorialCoach.js');

/**
 * Build an anchor element whose rendered box is the given rectangle.
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @returns {HTMLElement}
 */
function makeAnchor(rect) {
  const anchor = document.createElement('div');
  anchor.getBoundingClientRect = jest.fn(() => rect);
  document.body.appendChild(anchor);
  return anchor;
}

/**
 * Read a marker's placement back as numbers.
 * @param {HTMLElement} marker
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
function placement(marker) {
  return {
    left: parseFloat(marker.style.left),
    top: parseFloat(marker.style.top),
    width: parseFloat(marker.style.width),
    height: parseFloat(marker.style.height),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createTutorialCoach', () => {
  test('builds a labeled, focusable region with a live message area', () => {
    const coach = createTutorialCoach(jest.fn());
    expect(coach.tagName).toBe('SECTION');
    expect(coach.classList.contains('tutorial-coach')).toBe(true);
    expect(coach.getAttribute('aria-label')).toBe('Tutorial practice');
    expect(coach.tabIndex).toBe(-1);

    const message = coach.querySelector('.tutorial-coach__message');
    expect(message.getAttribute('aria-live')).toBe('polite');
    expect(message.getAttribute('aria-atomic')).toBe('true');
    expect(message.querySelector('.tutorial-coach__label')).not.toBeNull();
    expect(message.querySelector('.tutorial-coach__text')).not.toBeNull();
  });

  test('Skip Practice calls onSkip', () => {
    const onSkip = jest.fn();
    const coach = createTutorialCoach(onSkip);
    const skip = coach.querySelector('.tutorial-coach__skip');
    expect(skip.textContent).toBe('Skip Practice');
    expect(skip.type).toBe('button');
    skip.click();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('setCoachMessage', () => {
  test('sets the label and text', () => {
    const coach = createTutorialCoach(jest.fn());
    setCoachMessage(coach, { label: 'Practice round 1 of 2', text: 'Watch the circle.' });
    expect(coach.querySelector('.tutorial-coach__label').textContent)
      .toBe('Practice round 1 of 2');
    expect(coach.querySelector('.tutorial-coach__text').textContent).toBe('Watch the circle.');
  });

  test('leaves an omitted field unchanged', () => {
    const coach = createTutorialCoach(jest.fn());
    setCoachMessage(coach, { label: 'Label', text: 'First' });
    setCoachMessage(coach, { text: 'Second' });
    expect(coach.querySelector('.tutorial-coach__label').textContent).toBe('Label');
    setCoachMessage(coach, { label: 'New label' });
    expect(coach.querySelector('.tutorial-coach__text').textContent).toBe('Second');
  });

  test('treats HTML in the message as text', () => {
    const coach = createTutorialCoach(jest.fn());
    setCoachMessage(coach, { text: '<b>bold</b>' });
    expect(coach.querySelector('.tutorial-coach__text b')).toBeNull();
  });
});

describe('askCoachQuestion', () => {
  test('shows the question and one button per choice, focusing the first', () => {
    const coach = createTutorialCoach(jest.fn());
    document.body.appendChild(coach);
    void askCoachQuestion(coach, 'Another round?', [
      { label: 'Play Another Round', value: 'again', primary: true },
      { label: 'Start the Game', value: 'start' },
    ]);

    expect(coach.querySelector('.tutorial-coach__text').textContent).toBe('Another round?');
    const buttons = [...coach.querySelectorAll('.tutorial-coach__actions button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Play Another Round', 'Start the Game']);
    expect(buttons[0].classList.contains('tutorial-coach__btn--primary')).toBe(true);
    expect(buttons[1].classList.contains('tutorial-coach__btn--secondary')).toBe(true);
    expect(buttons.every((b) => b.type === 'button')).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });

  test('resolves with the chosen value and removes the buttons', async () => {
    const coach = createTutorialCoach(jest.fn());
    const answer = askCoachQuestion(coach, 'Q?', [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ]);
    coach.querySelectorAll('.tutorial-coach__actions button')[1].click();
    await expect(answer).resolves.toBe('b');
    expect(coach.querySelector('.tutorial-coach__actions').children).toHaveLength(0);
  });

  test('replaces buttons left over from an earlier question', () => {
    const coach = createTutorialCoach(jest.fn());
    void askCoachQuestion(coach, 'First?', [{ label: 'A', value: 'a' }]);
    void askCoachQuestion(coach, 'Second?', [{ label: 'B', value: 'b' }]);
    const buttons = coach.querySelectorAll('.tutorial-coach__actions button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('B');
  });

  test('does not move focus when there are no choices', () => {
    const coach = createTutorialCoach(jest.fn());
    document.body.appendChild(coach);
    const before = document.activeElement;
    void askCoachQuestion(coach, 'Nothing to pick', []);
    expect(document.activeElement).toBe(before);
  });
});

describe('positionTutorialMarker', () => {
  const anchorRect = {
    left: 100, top: 50, width: 400, height: 200,
  };

  test('covers the whole anchor as a box', () => {
    const marker = document.createElement('div');
    const anchor = makeAnchor(anchorRect);
    positionTutorialMarker(marker, anchor, {
      x: 0, y: 0, width: 1, height: 1,
    }, 'box');
    expect(placement(marker)).toEqual({
      left: 100, top: 50, width: 400, height: 200,
    });
  });

  test('keeps a ring circular, using the larger side, centered on the region', () => {
    const marker = document.createElement('div');
    const anchor = makeAnchor(anchorRect);
    positionTutorialMarker(marker, anchor, {
      x: 0, y: 0, width: 1, height: 1,
    }, 'ring');
    // Center (300, 150); diameter 400.
    expect(placement(marker)).toEqual({
      left: 100, top: -50, width: 400, height: 400,
    });
  });

  test('maps a fractional region onto the anchor', () => {
    const marker = document.createElement('div');
    const anchor = makeAnchor(anchorRect);
    positionTutorialMarker(marker, anchor, {
      x: 0.5, y: 0.5, width: 0.25, height: 0.5,
    }, 'box');
    // Region: left 300, top 150, 100 × 100.
    expect(placement(marker)).toEqual({
      left: 300, top: 150, width: 100, height: 100,
    });
  });

  test('never makes a marker smaller than 48px', () => {
    const marker = document.createElement('div');
    const anchor = makeAnchor({
      left: 0, top: 0, width: 20, height: 10,
    });
    positionTutorialMarker(marker, anchor, {
      x: 0, y: 0, width: 1, height: 1,
    }, 'box');
    // Center (10, 5).
    expect(placement(marker)).toEqual({
      left: -14, top: -19, width: 48, height: 48,
    });
  });
});

describe('showTutorialMarker', () => {
  test('adds a decorative ring over the whole anchor by default', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const anchor = makeAnchor({
      left: 0, top: 0, width: 100, height: 100,
    });

    showTutorialMarker(container, { anchor });
    const marker = container.querySelector('.tutorial-marker');
    expect(marker).not.toBeNull();
    expect(marker.classList.contains('tutorial-marker--ring')).toBe(true);
    expect(marker.getAttribute('aria-hidden')).toBe('true');
    expect(placement(marker)).toEqual({
      left: 0, top: 0, width: 100, height: 100,
    });
  });

  test('uses the requested shape and region', () => {
    const container = document.createElement('div');
    const anchor = makeAnchor({
      left: 0, top: 0, width: 200, height: 100,
    });
    showTutorialMarker(container, {
      anchor,
      shape: 'box',
      region: {
        x: 0, y: 0, width: 0.5, height: 1,
      },
    });
    const marker = container.querySelector('.tutorial-marker--box');
    expect(placement(marker)).toEqual({
      left: 0, top: 0, width: 100, height: 100,
    });
  });

  test('follows the anchor on resize and scroll', () => {
    const container = document.createElement('div');
    const anchor = makeAnchor({
      left: 0, top: 0, width: 100, height: 100,
    });
    showTutorialMarker(container, { anchor, shape: 'box' });
    const marker = container.querySelector('.tutorial-marker');

    anchor.getBoundingClientRect.mockReturnValue({
      left: 10, top: 20, width: 100, height: 100,
    });
    window.dispatchEvent(new Event('resize'));
    expect(placement(marker).left).toBe(10);

    anchor.getBoundingClientRect.mockReturnValue({
      left: 10, top: -30, width: 100, height: 100,
    });
    document.dispatchEvent(new Event('scroll'));
    expect(placement(marker).top).toBe(-30);
  });

  test('the returned function removes the marker and stops following the anchor', () => {
    const container = document.createElement('div');
    const anchor = makeAnchor({
      left: 0, top: 0, width: 100, height: 100,
    });
    const hide = showTutorialMarker(container, { anchor });
    hide();
    expect(container.querySelector('.tutorial-marker')).toBeNull();

    anchor.getBoundingClientRect.mockClear();
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('scroll'));
    expect(anchor.getBoundingClientRect).not.toHaveBeenCalled();
  });
});
