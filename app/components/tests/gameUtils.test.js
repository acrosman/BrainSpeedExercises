/**
 * gameUtils.test.js — Unit tests for app/components/gameUtils.js
 */

import { afterEach, describe, it, expect, jest } from '@jest/globals';
import { focusHeading, returnToMainMenu } from '../gameUtils.js';

describe('returnToMainMenu()', () => {
  it('dispatches bsx:return-to-main-menu on window', () => {
    const handler = jest.fn();
    window.addEventListener('bsx:return-to-main-menu', handler, { once: true });
    returnToMainMenu();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatches a CustomEvent', () => {
    let received = null;
    window.addEventListener('bsx:return-to-main-menu', (e) => { received = e; }, { once: true });
    returnToMainMenu();
    expect(received).toBeInstanceOf(CustomEvent);
  });

  it('does not throw when window is undefined', () => {
    const original = global.window;
    delete global.window;
    expect(() => returnToMainMenu()).not.toThrow();
    global.window = original;
  });
});

describe('focusHeading()', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the first heading inside the root and makes it focusable', () => {
    document.body.innerHTML =
      '<div id="panel"><p>Intro</p><h2>Session Ended</h2><h3>Details</h3></div>';
    const heading = document.querySelector('h2');
    expect(focusHeading(document.getElementById('panel'))).toBe(true);
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('keeps a tabindex the heading already has', () => {
    document.body.innerHTML = '<div id="panel"><h2 tabindex="0">Title</h2></div>';
    focusHeading(document.getElementById('panel'));
    expect(document.querySelector('h2').getAttribute('tabindex')).toBe('0');
  });

  it('returns false and leaves focus alone when the root has no heading', () => {
    document.body.innerHTML = '<button id="btn">Go</button><div id="panel"><p>Text</p></div>';
    const btn = document.getElementById('btn');
    btn.focus();
    expect(focusHeading(document.getElementById('panel'))).toBe(false);
    expect(document.activeElement).toBe(btn);
  });

  it('returns false when the root is missing', () => {
    expect(focusHeading(null)).toBe(false);
    expect(focusHeading(undefined)).toBe(false);
  });
});
