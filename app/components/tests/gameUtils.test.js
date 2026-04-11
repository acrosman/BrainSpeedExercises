/**
 * gameUtils.test.js — Unit tests for app/components/gameUtils.js
 */

import { describe, it, expect, jest } from '@jest/globals';
import { returnToMainMenu } from '../gameUtils.js';

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
