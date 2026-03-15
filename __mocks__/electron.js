import { jest } from '@jest/globals';

export const app = {
  getPath: jest.fn().mockReturnValue('/tmp/test-userdata'),
};

export const ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
};

export class BrowserWindow {
  constructor() {
    this.loadURL = jest.fn();
    this.on = jest.fn();
    this.webContents = {
      send: jest.fn(),
    };
  }
}
