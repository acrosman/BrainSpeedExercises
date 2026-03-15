Integrate progress saving into the Fast Piggie plugin and verify the
complete implementation meets all quality standards.

## Context

The app saves player progress as JSON via IPC. The main process exposes
`progress:load` and `progress:save` channels (already allowlisted in
`app/preload.js`). The renderer calls them via `window.api.invoke(...)`.

Progress data shape:

```json
{
  "playerId": "string",
  "lastUpdated": "ISO-8601 timestamp",
  "games": {
    "<game-id>": {
      "highScore": 0,
      "sessionsPlayed": 0,
      "lastPlayed": "ISO-8601 timestamp"
    }
  }
}
```

---

## Changes to `app/games/fast-piggie/index.js`

### Update `stop()` in the default export

After `game.stopGame()` returns a result, save progress before returning:

```js
stop() {
  if (_roundTimer) {
    clearTimeout(_roundTimer);
    _roundTimer = null;
  }
  _clickEnabled = false;
  const result = game.stopGame();

  // Persist progress (guard for test environment where window.api is absent)
  if (typeof window !== 'undefined' && window.api) {
    window.api.invoke('progress:load', 'default')
      .then((existing) => {
        const gameEntry = (existing.games && existing.games['fast-piggie']) || {
          highScore: 0,
          sessionsPlayed: 0,
          lastPlayed: null,
        };
        const updated = {
          ...existing,
          games: {
            ...existing.games,
            'fast-piggie': {
              highScore: Math.max(gameEntry.highScore, result.score),
              sessionsPlayed: gameEntry.sessionsPlayed + 1,
              lastPlayed: new Date().toISOString(),
            },
          },
        };
        return window.api.invoke('progress:save', 'default', updated);
      })
      .catch(() => {
        // Progress save failure is non-fatal — game continues normally
      });
  }

  _feedbackEl.textContent =
    `Game over! Final score: ${result.score} in ${result.roundsPlayed} rounds.`;
  _continueBtn.hidden = true;
  _stopBtn.hidden = true;
  return result;
},
```

---

## Update `tests/index.test.js` — add progress tests

Add two new test cases to the existing integration suite:

### Progress save on stop — happy path

```js
it('calls window.api.invoke("progress:load") then ("progress:save") on stop', async () => {
  const mockProgress = { playerId: "default", games: {} };
  const mockApi = {
    invoke: jest
      .fn()
      .mockResolvedValueOnce(mockProgress) // progress:load
      .mockResolvedValueOnce(undefined), // progress:save
  };
  globalThis.window = { ...globalThis.window, api: mockApi };

  plugin.init(buildContainer());
  plugin.start();
  plugin.stop();

  // Allow the promise chain to flush
  await Promise.resolve();
  await Promise.resolve();

  expect(mockApi.invoke).toHaveBeenCalledWith("progress:load", "default");
  expect(mockApi.invoke).toHaveBeenCalledWith(
    "progress:save",
    "default",
    expect.objectContaining({
      games: expect.objectContaining({
        "fast-piggie": expect.objectContaining({
          sessionsPlayed: 1,
          lastPlayed: expect.any(String),
        }),
      }),
    }),
  );

  delete globalThis.window.api;
});
```

### Progress save failure is non-fatal

```js
it("does not throw if progress:load rejects", async () => {
  const mockApi = {
    invoke: jest.fn().mockRejectedValue(new Error("IPC error")),
  };
  globalThis.window = { ...globalThis.window, api: mockApi };

  plugin.init(buildContainer());
  plugin.start();
  expect(() => plugin.stop()).not.toThrow();

  await Promise.resolve();
  await Promise.resolve();

  delete globalThis.window.api;
});
```

### highScore is updated correctly

```js
it("preserves existing highScore when new score is lower", async () => {
  const mockProgress = {
    playerId: "default",
    games: {
      "fast-piggie": { highScore: 10, sessionsPlayed: 3, lastPlayed: null },
    },
  };
  const mockApi = {
    invoke: jest
      .fn()
      .mockResolvedValueOnce(mockProgress)
      .mockResolvedValueOnce(undefined),
  };
  globalThis.window = { ...globalThis.window, api: mockApi };
  // game.stopGame mock returns score: 3, which is < existing highScore 10
  plugin.init(buildContainer());
  plugin.start();
  plugin.stop();

  await Promise.resolve();
  await Promise.resolve();

  const saveCall = mockApi.invoke.mock.calls.find(
    (c) => c[0] === "progress:save",
  );
  expect(saveCall[2].games["fast-piggie"].highScore).toBe(10);

  delete globalThis.window.api;
});
```

---

## Final quality checks

After all changes are in place, run:

```bash
npm run lint
```

Expected: **0 errors, 0 warnings**.

```bash
npm test -- --coverage
```

Expected:

- All tests pass.
- `functions` coverage for all files under `app/` (excluding `_template`) is
  **100%**.
- `branches`, `lines`, `statements` coverage is ≥ **80%**.

If any coverage threshold fails, add the missing test cases before
considering this prompt complete.

---

## Constraints

- `window.api` access must always be guarded with
  `typeof window !== 'undefined' && window.api`.
- Progress save failure must not surface to the player — catch and swallow
  the error silently.
- Do not modify `app/preload.js` or `main.js` in this prompt.
- Do not add new IPC channels.
