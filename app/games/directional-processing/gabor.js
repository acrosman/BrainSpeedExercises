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
 * }} [options] - Gabor parameters. Omitted fields use their defaults.
 * @returns {Uint8ClampedArray} Flat RGBA array of length width × height × 4.
 */
export function computeGaborPixels(width, height, options = {}) {
  const lambda   = options.lambda   ?? DEFAULT_LAMBDA;
  const theta    = options.theta    ?? 0;
  const phi      = options.phi      ?? DEFAULT_PHI;
  const sigma    = options.sigma    ?? DEFAULT_SIGMA;
  const gamma    = options.gamma    ?? DEFAULT_GAMMA;
  const contrast = options.contrast ?? DEFAULT_CONTRAST;

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

      // Scale to 0–255 with contrast applied. At contrast=0 the result is 127.5
      // (uniform mid-gray); at contrast=1 it spans the full luminance range.
      const value = 127.5 * (1 + contrast * envelope * grating);

      const index = (y * width + x) * 4;
      pixels[index]     = value; // R
      pixels[index + 1] = value; // G
      pixels[index + 2] = value; // B
      pixels[index + 3] = 255;   // A (fully opaque)
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
 * Fill a canvas with a uniform mid-gray mask.
 *
 * The mask interrupts the motion percept without introducing new pattern energy.
 * The gray value (128) matches the DC level of the Gabor patches so there is
 * no perceptual "pop-out" from the transition.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element.
 */
export function drawMask(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = 'rgb(128, 128, 128)';
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
