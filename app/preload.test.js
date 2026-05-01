/** @jest-environment node */
import { jest } from '@jest/globals';

const mockIpcRenderer = {
  send: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  invoke: jest.fn().mockResolvedValue('mocked-result'),
};

const mockContextBridge = {
  exposeInMainWorld: jest.fn(),
};

global.require = jest.fn((moduleName) => {
  if (moduleName === 'electron') {
    return {
      contextBridge: mockContextBridge,
      ipcRenderer: mockIpcRenderer,
    };
  }
  throw new Error(`Unexpected module requested: ${moduleName}`);
});

await import('./preload.js');

// Capture the API object registered via contextBridge once at load time.
const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];

describe('preload.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIpcRenderer.invoke.mockResolvedValue('mocked-result');
  });

  afterAll(() => {
    delete global.require;
  });

  it('exposes "api" with invoke and receive via contextBridge', () => {
    expect(api).toEqual(
      expect.objectContaining({
        invoke: expect.any(Function),
        receive: expect.any(Function),
      }),
    );
  });

  describe('invoke', () => {
    it.each([
      'games:list', 'games:load', 'progress:save', 'progress:load', 'progress:reset', 'log:send',
      'app:quit-ready',
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

  describe('receive', () => {
    it('registers an ipcRenderer.once listener for the app:before-quit channel', () => {
      const callback = jest.fn();
      api.receive('app:before-quit', callback);
      expect(mockIpcRenderer.once).toHaveBeenCalledWith('app:before-quit', expect.any(Function));
    });

    it('invokes the callback with forwarded arguments when the event fires', () => {
      const callback = jest.fn();
      api.receive('app:before-quit', callback);

      // Simulate the main process sending the event.
      const [, registeredHandler] = mockIpcRenderer.once.mock.calls.find(
        ([channel]) => channel === 'app:before-quit',
      );
      registeredHandler({}, 'extra-arg');
      expect(callback).toHaveBeenCalledWith('extra-arg');
    });

    it('does not register a listener for a blocked channel', () => {
      api.receive('blocked_channel', jest.fn());
      const blockedCall = mockIpcRenderer.once.mock.calls.find(
        ([channel]) => channel === 'blocked_channel',
      );
      expect(blockedCall).toBeUndefined();
    });
  });
});
