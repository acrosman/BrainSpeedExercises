/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// Mock window.api for renderer
beforeAll(() => {
  global.window = Object.create(window);
  global.window.api = {
    invoke: jest.fn().mockResolvedValue([]),
    on: jest.fn(),
  };
});

describe('interface.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="game-container"></main>';
    window.api.invoke.mockClear();
    window.api.on.mockClear();
  });

  it('requests the game list on DOMContentLoaded', async () => {
    await import('./interface.js');
    expect(window.api.invoke).toHaveBeenCalledWith('games:list');
  });

  // Add more tests for rendering, game selection, and plugin lifecycle as needed
});
