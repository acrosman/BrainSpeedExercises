/**
 * gabor.js — Reusable Gabor patch renderer for BrainSpeedExercises.
 *
 * A Gabor patch is the product of a sinusoidal grating and a Gaussian envelope,
 * widely used in psychophysics research on visual motion perception, spatial-frequency
 * tuning, and speed-of-processing training (Merzenich, Mahncke; ACTIVE study).
 *
 * This module is intentionally isolated from any specific game so that it can be
 * reused or extracted without modification.
 *
 * @file Gabor patch rendering component.
 */

/** Number of pixels per full spatial cycle of the grating (spatial period). */
export const DEFAULT_LAMBDA = 40;

/** Gaussian standard deviation in pixels — controls the visible patch diameter. */
export const DEFAULT_SIGMA = 80;

/** Aspect ratio of the Gaussian envelope (1 = circular, <1 = elongated along grating). */
export const DEFAULT_GAMMA = 1.0;

/** Initial phase offset in radians. */
export const DEFAULT_PHI = 0;

/** Contrast multiplier: 1.0 = full sinusoidal swing, 0.0 = uniform mid-gray. */
export const DEFAULT_CONTRAST = 1.0;

/** Rate at which the grating phase advances per millisecond (radians / ms). */
export const PHASE_SPEED_RAD_PER_MS = 0.015;

/** Convenience constant for 2π used in the Gabor formula. */
export const TWO_PI = 2 * Math.PI;

/**
 * Color family definitions for the Gabor patch gradient.
 *
 * Each family defines the darkest (`dark`) and brightest (`bright`) RGB endpoints
 * of the sinusoidal grating. The patch oscillates between these two colors, giving
 * each family a distinct hue while maintaining high contrast.
 *
 * Families: Blue, Purple, Orange, Grey.
 *
 * @type {Array<{ dark: [number, number, number], bright: [number, number, number] }>}
 */
export const COLOR_FAMILIES = [
  { dark: [0,   30,  130], bright: [130, 210, 255] }, // Blue
  { dark: [60,  0,   130], bright: [220, 130, 255] }, // Purple
  { dark: [130, 40,  0],   bright: [255, 200,  70] }, // Orange
  { dark: [20,  20,  20],  bright: [235, 235, 235] }, // Grey
];

/**
 * Return a randomly selected color family from {@link COLOR_FAMILIES}.
 *
 * @returns {{ dark: [number, number, number], bright: [number, number, number] }}
 */
export function pickColorFamily() {
  return COLOR_FAMILIES[Math.floor(Math.random() * COLOR_FAMILIES.length)];
}

/**
 * Direction → Gabor orientation and phase-drift sign mapping.
 *
 * Motion direction is perpendicular to the grating orientation.
 * - theta = 0     → vertical stripes → horizontal (left/right) motion
 * - theta = π/2   → horizontal stripes → vertical (up/down) motion
 *
 * Phase sign convention (for cos(2π·xTheta/λ + φ)):
 * - Increasing φ shifts the grating peak toward negative xTheta → apparent motion in
 *   the negative-xTheta direction (left for theta=0, up for theta=π/2).
 * - So phiDirection = -1 gives rightward/downward motion, +1 gives leftward/upward.
 *
 * @type {Record<string, { theta: number, phiDirection: number }>}
 */
export const DIRECTION_PARAMS = {
  right: { theta: 0,           phiDirection: -1 },
  left:  { theta: 0,           phiDirection:  1 },
  down:  { theta: Math.PI / 2, phiDirection: -1 },
  up:    { theta: Math.PI / 2, phiDirection:  1 },
};

/**
 * Compute raw RGBA pixel values for a Gabor patch.
 *
 * Separating the computation from the canvas API makes this function
 * unit-testable without a real canvas environment.
 *
 * @param {number} width - Canvas width in pixels.
 * @param {number} height - Canvas height in pixels.
 * @param {{
 *   lambda?: number,
 *   theta?: number,
 *   phi?: number,
 *   sigma?: number,
 *   gamma?: number,
 *   contrast?: number,
 *   colorFamily?: { dark: [number,number,number], bright: [number,number,number] } | null,
 * }} [options] - Gabor parameters. Omitted fields use their defaults.
 * @returns {Uint8ClampedArray} Flat RGBA array of length width × height × 4.
 */
export function computeGaborPixels(width, height, options = {}) {
  const lambda      = options.lambda      ?? DEFAULT_LAMBDA;
  const theta       = options.theta       ?? 0;
  const phi         = options.phi         ?? DEFAULT_PHI;
  const sigma       = options.sigma       ?? DEFAULT_SIGMA;
  const gamma       = options.gamma       ?? DEFAULT_GAMMA;
  const contrast    = options.contrast    ?? DEFAULT_CONTRAST;
  const colorFamily = options.colorFamily ?? null;

  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Center the coordinates so the patch is positioned in the middle.
      const x0 = x - width / 2;
      const y0 = y - height / 2;

      // Rotate coordinates by theta to set grating orientation.
      const xTheta = x0 * Math.cos(theta) + y0 * Math.sin(theta);
      const yTheta = -x0 * Math.sin(theta) + y0 * Math.cos(theta);

      // Gabor formula: Gaussian envelope × sinusoidal grating.
      const envelope = Math.exp(
        -(xTheta ** 2 + gamma ** 2 * yTheta ** 2) / (2 * sigma ** 2),
      );
      const grating = Math.cos(TWO_PI * (xTheta / lambda) + phi);

      // t maps from 0 (dark pole) to 1 (bright pole) with contrast applied.
      // At contrast=0 all pixels sit at t=0.5 (the midpoint color).
      const t = 0.5 * (1 + contrast * envelope * grating);

      let r, g, b;
      if (colorFamily !== null) {
        // Interpolate between the family's dark and bright endpoint colors.
        r = colorFamily.dark[0] + t * (colorFamily.bright[0] - colorFamily.dark[0]);
        g = colorFamily.dark[1] + t * (colorFamily.bright[1] - colorFamily.dark[1]);
        b = colorFamily.dark[2] + t * (colorFamily.bright[2] - colorFamily.dark[2]);
      } else {
        // Default greyscale path: all channels equal.
        const value = 255 * t;
        r = value;
        g = value;
        b = value;
      }

      const index = (y * width + x) * 4;
      pixels[index]     = r; // R
      pixels[index + 1] = g; // G
      pixels[index + 2] = b; // B
      pixels[index + 3] = 255; // A (fully opaque)
    }
  }

  return pixels;
}

/**
 * Render a Gabor patch to an HTML canvas element.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element.
 * @param {{
 *   lambda?: number,
 *   theta?: number,
 *   phi?: number,
 *   sigma?: number,
 *   gamma?: number,
 *   contrast?: number,
 *   colorFamily?: { dark: [number,number,number], bright: [number,number,number] } | null,
 * }} [options] - Gabor parameters.
 */
export function drawGabor(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  const pixels = computeGaborPixels(width, height, options);
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Fill a canvas with the midpoint color of a color family (or mid-gray when
 * no family is supplied).
 *
 * The mask interrupts the motion percept without introducing new pattern energy.
 * Its color matches the DC level of the Gabor patches so there is no perceptual
 * "pop-out" from the transition.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element.
 * @param {{ dark: [number,number,number], bright: [number,number,number] } | null} [colorFamily]
 *   Optional color family whose midpoint is used as the mask color.
 *   Defaults to mid-gray (128, 128, 128) when omitted or null.
 */
export function drawMask(canvas, colorFamily = null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let fillColor;
  if (colorFamily !== null) {
    const r = Math.round((colorFamily.dark[0] + colorFamily.bright[0]) / 2);
    const g = Math.round((colorFamily.dark[1] + colorFamily.bright[1]) / 2);
    const b = Math.round((colorFamily.dark[2] + colorFamily.bright[2]) / 2);
    fillColor = `rgb(${r}, ${g}, ${b})`;
  } else {
    fillColor = 'rgb(128, 128, 128)';
  }

  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Retrieve the Gabor orientation and phase-drift parameters for a direction label.
 *
 * Falls back to 'right' parameters for any unrecognized direction value.
 *
 * @param {string} direction - One of 'up', 'down', 'left', 'right'.
 * @returns {{ theta: number, phiDirection: number }}
 */
export function getDirectionParams(direction) {
  return DIRECTION_PARAMS[direction] ?? DIRECTION_PARAMS.right;
}
