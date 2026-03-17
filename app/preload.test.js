/** @jest-environment node */
import { jest } from '@jest/globals';

describe('preload.js', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('calls contextBridge.exposeInMainWorld', async () => {
    const { contextBridge } = await import('electron');
    await import('./preload.js');
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'api',
      expect.objectContaining({
        send: expect.any(Function),
        receive: expect.any(Function),
        invoke: expect.any(Function),
      }),
    );
  });
});
