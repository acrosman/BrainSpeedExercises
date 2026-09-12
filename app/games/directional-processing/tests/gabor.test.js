/**
 * gabor.test.js — Unit tests for the Gabor patch rendering component.
 *
 * @jest-environment node
 */
import { jest, describe, test, expect } from '@jest/globals';

import {
  DEFAULT_LAMBDA,
  DEFAULT_SIGMA,
  PHASE_SPEED_RAD_PER_MS,
  TWO_PI,
  DIRECTION_PARAMS,
  COLOR_FAMILIES,
  computeGaborPixels,
  drawGabor,
  drawMask,
  getDirectionParams,
  pickColorFamily,
} from '../gabor.js';

// ── Constants ─────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  test('DEFAULT_LAMBDA is a positive number', () => {
    expect(DEFAULT_LAMBDA).toBeGreaterThan(0);
  });

  test('DEFAULT_SIGMA is a positive number', () => {
    expect(DEFAULT_SIGMA).toBeGreaterThan(0);
  });

  test('DEFAULT_SIGMA is larger than DEFAULT_LAMBDA (envelope spans multiple cycles)', () => {
    expect(DEFAULT_SIGMA).toBeGreaterThan(DEFAULT_LAMBDA);
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

  test('COLOR_FAMILIES has exactly 6 entries', () => {
    expect(COLOR_FAMILIES).toHaveLength(6);
  });

  test('each COLOR_FAMILIES entry has dark and bright arrays of length 3', () => {
    COLOR_FAMILIES.forEach((family) => {
      expect(family.dark).toHaveLength(3);
      expect(family.bright).toHaveLength(3);
    });
  });

  test('pickColorFamily returns an object from COLOR_FAMILIES', () => {
    const family = pickColorFamily();
    expect(COLOR_FAMILIES).toContain(family);
    expect(family.dark).toHaveLength(3);
    expect(family.bright).toHaveLength(3);
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

  test('all RGB channels are equal when no colorFamily is provided (grayscale output)', () => {
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

  test('with a colorFamily the RGB channels are not all equal', () => {
    // Blue family has very different R, G, B endpoints so channels will differ.
    const blueFamily = COLOR_FAMILIES[0];
    const pixels = computeGaborPixels(16, 16, { colorFamily: blueFamily });
    let allEqual = true;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== pixels[i + 1] || pixels[i] !== pixels[i + 2]) {
        allEqual = false;
        break;
      }
    }
    expect(allEqual).toBe(false);
  });

  test('with a colorFamily all pixel values are bounded by the family endpoints', () => {
    const family = { dark: [10, 20, 30], bright: [200, 180, 160] };
    const pixels = computeGaborPixels(16, 16, { colorFamily: family });
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i]).toBeGreaterThanOrEqual(family.dark[0]);
      expect(pixels[i]).toBeLessThanOrEqual(family.bright[0]);
      expect(pixels[i + 1]).toBeGreaterThanOrEqual(family.dark[1]);
      expect(pixels[i + 1]).toBeLessThanOrEqual(family.bright[1]);
      expect(pixels[i + 2]).toBeGreaterThanOrEqual(family.dark[2]);
      expect(pixels[i + 2]).toBeLessThanOrEqual(family.bright[2]);
    }
  });

  test('at zero contrast with a colorFamily all pixels are at the midpoint color', () => {
    const family = { dark: [0, 40, 80], bright: [200, 160, 120] };
    const pixels = computeGaborPixels(8, 8, { contrast: 0, colorFamily: family });
    const midR = (family.dark[0] + family.bright[0]) / 2; // 100
    const midG = (family.dark[1] + family.bright[1]) / 2; // 100
    const midB = (family.dark[2] + family.bright[2]) / 2; // 100
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i]).toBeCloseTo(midR, 0);
      expect(pixels[i + 1]).toBeCloseTo(midG, 0);
      expect(pixels[i + 2]).toBeCloseTo(midB, 0);
    }
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
  test('fills the entire canvas with mid-gray when no colorFamily is provided', () => {
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

  test('fills the canvas with the midpoint color of the provided colorFamily', () => {
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
    const family = { dark: [0, 40, 100], bright: [200, 160, 120] };

    drawMask(mockCanvas, family);

    // midpoint: R=100, G=100, B=110
    expect(mockCtx.fillStyle).toBe('rgb(100, 100, 110)');
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
