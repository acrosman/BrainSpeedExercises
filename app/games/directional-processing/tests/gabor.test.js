/**
 * gabor.test.js — Unit tests for the Gabor patch rendering component.
 *
 * @jest-environment node
 */
import { jest, describe, test, expect } from '@jest/globals';

import {
  DEFAULT_LAMBDA,
  DEFAULT_SIGMA,
  DEFAULT_GAMMA,
  DEFAULT_PHI,
  DEFAULT_CONTRAST,
  PHASE_SPEED_RAD_PER_MS,
  TWO_PI,
  DIRECTION_PARAMS,
  computeGaborPixels,
  drawGabor,
  drawMask,
  getDirectionParams,
} from '../gabor.js';

// ── Constants ─────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  test('DEFAULT_LAMBDA is a positive number', () => {
    expect(DEFAULT_LAMBDA).toBeGreaterThan(0);
  });

  test('DEFAULT_SIGMA is a positive number', () => {
    expect(DEFAULT_SIGMA).toBeGreaterThan(0);
  });

  test('DEFAULT_GAMMA is 1 (circular)', () => {
    expect(DEFAULT_GAMMA).toBe(1.0);
  });

  test('DEFAULT_PHI is 0', () => {
    expect(DEFAULT_PHI).toBe(0);
  });

  test('DEFAULT_CONTRAST is 1', () => {
    expect(DEFAULT_CONTRAST).toBe(1.0);
  });

  test('PHASE_SPEED_RAD_PER_MS is a positive number', () => {
    expect(PHASE_SPEED_RAD_PER_MS).toBeGreaterThan(0);
  });

  test('TWO_PI equals 2π', () => {
    expect(TWO_PI).toBeCloseTo(2 * Math.PI);
  });

  test('DIRECTION_PARAMS defines all four directions', () => {
    ['up', 'down', 'left', 'right'].forEach((dir) => {
      expect(DIRECTION_PARAMS[dir]).toBeDefined();
      expect(typeof DIRECTION_PARAMS[dir].theta).toBe('number');
      expect(typeof DIRECTION_PARAMS[dir].phiDirection).toBe('number');
    });
  });

  test('left and right share theta=0 (vertical stripes)', () => {
    expect(DIRECTION_PARAMS.left.theta).toBe(0);
    expect(DIRECTION_PARAMS.right.theta).toBe(0);
  });

  test('up and down share theta=π/2 (horizontal stripes)', () => {
    expect(DIRECTION_PARAMS.up.theta).toBeCloseTo(Math.PI / 2);
    expect(DIRECTION_PARAMS.down.theta).toBeCloseTo(Math.PI / 2);
  });

  test('left and right have opposite phiDirection values', () => {
    expect(DIRECTION_PARAMS.left.phiDirection).toBe(-DIRECTION_PARAMS.right.phiDirection);
  });

  test('up and down have opposite phiDirection values', () => {
    expect(DIRECTION_PARAMS.up.phiDirection).toBe(-DIRECTION_PARAMS.down.phiDirection);
  });
});

// ── computeGaborPixels ────────────────────────────────────────────────────────

describe('computeGaborPixels', () => {
  test('returns a Uint8ClampedArray of length width × height × 4', () => {
    const pixels = computeGaborPixels(10, 8);
    expect(pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(pixels.length).toBe(10 * 8 * 4);
  });

  test('all alpha channel values are 255', () => {
    const pixels = computeGaborPixels(8, 8);
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(255);
    }
  });

  test('all RGB channels are equal (grayscale output)', () => {
    const pixels = computeGaborPixels(8, 8);
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(pixels[i + 1]);
      expect(pixels[i]).toBe(pixels[i + 2]);
    }
  });

  test('at zero contrast all pixels are uniform mid-gray (127 or 128)', () => {
    const pixels = computeGaborPixels(8, 8, { contrast: 0 });
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i]).toBeGreaterThanOrEqual(127);
      expect(pixels[i]).toBeLessThanOrEqual(128);
    }
  });

  test('different orientations (theta) produce different pixel patterns', () => {
    const p0 = Array.from(computeGaborPixels(16, 16, { theta: 0 }));
    const p1 = Array.from(computeGaborPixels(16, 16, { theta: Math.PI / 2 }));
    expect(p0).not.toEqual(p1);
  });

  test('different phase values produce different pixel patterns', () => {
    const p0 = Array.from(computeGaborPixels(16, 16, { phi: 0 }));
    const p1 = Array.from(computeGaborPixels(16, 16, { phi: Math.PI }));
    expect(p0).not.toEqual(p1);
  });

  test('uses provided lambda over the default', () => {
    const pDefault = Array.from(computeGaborPixels(16, 16));
    const pCustom  = Array.from(computeGaborPixels(16, 16, { lambda: DEFAULT_LAMBDA * 2 }));
    expect(pDefault).not.toEqual(pCustom);
  });

  test('uses provided sigma over the default', () => {
    const pDefault = Array.from(computeGaborPixels(16, 16));
    const pCustom  = Array.from(computeGaborPixels(16, 16, { sigma: DEFAULT_SIGMA / 2 }));
    expect(pDefault).not.toEqual(pCustom);
  });
});

// ── drawGabor ─────────────────────────────────────────────────────────────────

describe('drawGabor', () => {
  test('calls ctx.putImageData exactly once when a context is available', () => {
    const mockPutImageData = jest.fn();
    const mockCtx = {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: mockPutImageData,
    };
    const mockCanvas = {
      width: 10,
      height: 10,
      getContext: () => mockCtx,
    };

    drawGabor(mockCanvas, {});
    expect(mockPutImageData).toHaveBeenCalledTimes(1);
  });

  test('does nothing (no throw) when getContext returns null', () => {
    const mockCanvas = {
      width: 10,
      height: 10,
      getContext: () => null,
    };
    expect(() => drawGabor(mockCanvas, {})).not.toThrow();
  });

  test('forwards options to computeGaborPixels (different options = different call)', () => {
    const calls = [];
    const mockCtx = {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (imgData) => calls.push(Array.from(imgData.data)),
    };
    const makeCanvas = () => ({ width: 8, height: 8, getContext: () => mockCtx });

    drawGabor(makeCanvas(), { phi: 0 });
    drawGabor(makeCanvas(), { phi: Math.PI });

    expect(calls[0]).not.toEqual(calls[1]);
  });
});

// ── drawMask ──────────────────────────────────────────────────────────────────

describe('drawMask', () => {
  test('fills the entire canvas with mid-gray', () => {
    const mockFillRect = jest.fn();
    const mockCtx = {
      fillStyle: '',
      fillRect: mockFillRect,
    };
    const mockCanvas = {
      width: 20,
      height: 15,
      getContext: () => mockCtx,
    };

    drawMask(mockCanvas);

    expect(mockCtx.fillStyle).toBe('rgb(128, 128, 128)');
    expect(mockFillRect).toHaveBeenCalledWith(0, 0, 20, 15);
  });

  test('does nothing (no throw) when getContext returns null', () => {
    const mockCanvas = {
      width: 10,
      height: 10,
      getContext: () => null,
    };
    expect(() => drawMask(mockCanvas)).not.toThrow();
  });
});

// ── getDirectionParams ────────────────────────────────────────────────────────

describe('getDirectionParams', () => {
  test('returns DIRECTION_PARAMS.right for "right"', () => {
    expect(getDirectionParams('right')).toEqual(DIRECTION_PARAMS.right);
  });

  test('returns DIRECTION_PARAMS.left for "left"', () => {
    expect(getDirectionParams('left')).toEqual(DIRECTION_PARAMS.left);
  });

  test('returns DIRECTION_PARAMS.up for "up"', () => {
    expect(getDirectionParams('up')).toEqual(DIRECTION_PARAMS.up);
  });

  test('returns DIRECTION_PARAMS.down for "down"', () => {
    expect(getDirectionParams('down')).toEqual(DIRECTION_PARAMS.down);
  });

  test('falls back to DIRECTION_PARAMS.right for an unknown direction', () => {
    expect(getDirectionParams('diagonal')).toEqual(DIRECTION_PARAMS.right);
  });
});
