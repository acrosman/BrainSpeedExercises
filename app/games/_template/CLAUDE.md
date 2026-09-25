# _template

A minimal starting point for new games. The registry skips it because the name starts with `_`,
and it is excluded from coverage.

## Creating a game from it

1. Copy the directory to `app/games/<new-id>/` and set `manifest.json` (`id` must equal the
   directory name). Add `images/thumbnail.png`.
2. Rename the `game-template-*` element IDs in `interface.html` and `index.js` to a short
   prefix for the game (for example `ss-`), and rename the root `.game-template` class.
3. Set `GAME_ID` in `index.js` to the manifest `id`.
4. Replace `LEVELS` and the placeholder play area with the real game. Call
   `handleResponse(success)` from the game's input handlers after each trial.
5. Add a `CLAUDE.md` for the new game that covers only what is specific to it.
