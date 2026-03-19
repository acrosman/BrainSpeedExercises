/** @jest-environment node */
import { jest } from '@jest/globals';

const mockContextBridge = { exposeInMainWorld: jest.fn() };
const mockIpcRenderer = { send: jest.fn(), on: jest.fn(), invoke: jest.fn() };

await jest.unstable_mockModule('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}));

describe('preload.js', () => {
  beforeEach(() => {
    mockContextBridge.exposeInMainWorld.mockClear();
  });

  it('calls contextBridge.exposeInMainWorld', async () => {
    await import('./preload.js');
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'api',
      expect.objectContaining({
        send: expect.any(Function),
        receive: expect.any(Function),
        invoke: expect.any(Function),
      }),
    );
  });
});
