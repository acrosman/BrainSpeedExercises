// Preload script.
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object.
// Big hat tip: https://stackoverflow.com/a/59814127/24215.
contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => {
    // List channels to allow.
    const validChannels = [
      'sample_message',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    // List channels to allow.
    const validChannels = [
      'sample_response',
    ];
    if (validChannels.includes(channel)) {
      // Remove the event to avoid information leaks.
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  invoke: (channel, data) => {
    const validChannels = [
      'games:list',
      'games:load',
      'progress:save',
      'progress:load',
    ];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
  },
});
