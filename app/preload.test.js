/** @jest-environment node */
import { jest } from '@jest/globals';

const mockIpcRenderer = {
  send: jest.fn(),
  on: jest.fn(),
  invoke: jest.fn().mockResolvedValue('mocked-result'),
};

const mockContextBridge = {
  exposeInMainWorld: jest.fn(),
};

await jest.unstable_mockModule('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}));

await import('./preload.js');

// Capture the API object registered via contextBridge once at load time.
const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];

describe('preload.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIpcRenderer.invoke.mockResolvedValue('mocked-result');
  });

  it('exposes "api" with send, receive, and invoke via contextBridge', () => {
    expect(api).toEqual(
      expect.objectContaining({
        invoke: expect.any(Function),
      }),
    );
  });

  describe('invoke', () => {
    it.each([
      'games:list', 'games:load', 'progress:save', 'progress:load', 'progress:reset', 'log:send',
    ])(
      'calls ipcRenderer.invoke for allowed channel "%s"',
      async (channel) => {
        await api.invoke(channel, { data: 1 });
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(channel, { data: 1 });
      },
    );

    it('rejects with a descriptive error for a blocked channel', async () => {
      await expect(api.invoke('blocked_channel', {})).rejects.toThrow(
        'Blocked IPC channel: blocked_channel',
      );
    });
  });
});
