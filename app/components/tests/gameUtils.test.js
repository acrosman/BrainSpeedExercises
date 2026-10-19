/**
 * gameUtils.test.js — Unit tests for app/components/gameUtils.js
 */

import { afterEach, describe, it, expect, jest } from '@jest/globals';
import { focusHeading, keepFocusInside, returnToMainMenu } from '../gameUtils.js';

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

describe('keepFocusInside()', () => {
  /** Build a container with one button in it and an outside button, and return them. */
  function setup() {
    document.body.innerHTML =
      '<button id="outside">Outside</button>'
      + '<div id="box" tabindex="-1"><button id="old">Old</button></div>'
      + '<button id="next">Next</button>';
    return {
      box: document.getElementById('box'),
      outside: document.getElementById('outside'),
      next: document.getElementById('next'),
    };
  }

  /** Replace the box's children, as a round rebuild does. */
  function rebuild() {
    document.getElementById('box').innerHTML = '<button id="new">New</button>';
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('runs the rebuild', () => {
    const { box } = setup();
    const spy = jest.fn(rebuild);
    keepFocusInside(box, spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(box.querySelector('#new')).not.toBeNull();
  });

  it('moves focus to the container when the focused control is removed', () => {
    const { box } = setup();
    document.getElementById('old').focus();
    keepFocusInside(box, rebuild);
    expect(document.activeElement).toBe(box);
  });

  it('moves focus to the given target instead of the container', () => {
    const { box, next } = setup();
    document.getElementById('old').focus();
    keepFocusInside(box, rebuild, next);
    expect(document.activeElement).toBe(next);
  });

  it('leaves focus alone when it was outside the container', () => {
    const { box, outside } = setup();
    outside.focus();
    keepFocusInside(box, rebuild);
    expect(document.activeElement).toBe(outside);
  });

  it('leaves focus alone when the focused control survives the rebuild', () => {
    const { box } = setup();
    const old = document.getElementById('old');
    old.focus();
    keepFocusInside(box, () => box.appendChild(document.createElement('span')));
    expect(document.activeElement).toBe(old);
  });

  it('still runs the rebuild when the container is missing', () => {
    const spy = jest.fn();
    expect(() => keepFocusInside(null, spy)).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
