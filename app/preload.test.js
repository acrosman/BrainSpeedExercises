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
        send: expect.any(Function),
        receive: expect.any(Function),
        invoke: expect.any(Function),
      }),
    );
  });

  describe('send', () => {
    it('calls ipcRenderer.send for an allowed channel', () => {
      api.send('sample_message', { payload: true });
      expect(mockIpcRenderer.send).toHaveBeenCalledWith('sample_message', { payload: true });
    });

    it('does not call ipcRenderer.send for a blocked channel', () => {
      api.send('blocked_channel', { payload: true });
      expect(mockIpcRenderer.send).not.toHaveBeenCalled();
    });
  });

  describe('receive', () => {
    it('calls ipcRenderer.on for an allowed channel', () => {
      api.receive('sample_response', jest.fn());
      expect(mockIpcRenderer.on).toHaveBeenCalledWith('sample_response', expect.any(Function));
    });

    it('does not call ipcRenderer.on for a blocked channel', () => {
      api.receive('blocked_channel', jest.fn());
      expect(mockIpcRenderer.on).not.toHaveBeenCalled();
    });

    it('strips the IPC event argument before invoking the callback', () => {
      const callback = jest.fn();
      api.receive('sample_response', callback);
      const wrappedHandler = mockIpcRenderer.on.mock.calls[0][1];
      wrappedHandler({ preventDefault: jest.fn() }, 'arg1', 'arg2');
      expect(callback).toHaveBeenCalledWith('arg1', 'arg2');
      expect(callback).not.toHaveBeenCalledWith(
        expect.objectContaining({ preventDefault: expect.any(Function) }), 'arg1', 'arg2');
    });
  });

  describe('invoke', () => {
    it.each(['games:list', 'games:load', 'progress:save', 'progress:load', 'progress:reset'])(
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
