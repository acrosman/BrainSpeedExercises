/**
 * audio.js - Audio feedback for the Field of View game.
 *
 * Re-exports the shared audio helpers from the central audio service so that
 * the game plugin and its tests can import from a stable local path while
 * benefiting from the application-wide AudioContext singleton.
 *
 * @file Field of View audio feedback helpers.
 */
export { getAudioContext, playFeedbackSound } from '../../components/audioService.js';
