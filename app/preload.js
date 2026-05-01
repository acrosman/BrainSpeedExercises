/**
 * preload.js — Electron preload script for BrainSpeedExercises.
 *
 * Exposes a secure, allowlisted API to the renderer process via contextBridge.
 * Only explicitly allowed IPC channels are exposed for send, receive, and invoke.
 *
 * @file Preload context bridge for renderer-main IPC.
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose protected methods that allow the renderer process to use
 * the ipcRenderer without exposing the entire object.
 * @see https://stackoverflow.com/a/59814127/24215
 */
contextBridge.exposeInMainWorld('api', {
  /**
   * Invoke an IPC call to the main process on an allowed channel.
   * @param {string} channel - The IPC channel.
   * @param {*} data - Data to send.
   * @returns {Promise<*>} - Promise resolving to the response.
   */
  invoke: (channel, data) => {
    const validChannels = [
      'games:list',
      'games:load',
      'games:listImages',
      'progress:save',
      'progress:load',
      'progress:reset',
      'log:send',
      'app:quit-ready',
    ];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
  },

  /**
   * Register a one-time listener for a message pushed from the main process.
   * The listener is automatically removed after it fires once.
   * Silently ignores requests for channels not on the allowlist.
   * @param {string} channel - The IPC channel to listen on.
   * @param {Function} callback - Callback invoked when the message arrives.
   */
  receive: (channel, callback) => {
    const validChannels = ['app:before-quit'];
    if (validChannels.includes(channel)) {
      ipcRenderer.once(channel, (_event, ...args) => callback(...args));
    }
  },
});
