# BrainSpeedExercises — Copilot Instructions

This is an Electron-based JavaScript project. The project instructions are kept in `CLAUDE.md`
files, which are the single source of truth. Read them before you make changes, and follow them
exactly as if they were written here:

- `CLAUDE.md` (repository root): commands, architecture, IPC channels, coding standards,
  testing and coverage rules, accessibility, and security.
- `app/CLAUDE.md`: the renderer shell, styles, preload bridge, and progress storage.
- `app/components/CLAUDE.md`: every shared component (score, timer, log, audio, difficulty,
  trend chart, game card, history view) and the tutorial framework.
- `app/games/CLAUDE.md`: the game plugin contract, lifecycle, shared screen markup, and how to
  test games.
- `app/games/<game-id>/CLAUDE.md` and `app/games/<game-id>/tutorial/CLAUDE.md`: details for one
  game and its tutorial. Read them for any game you touch.

Do not copy the rules into this file. Update the relevant `CLAUDE.md` instead, so every tool uses
the same instructions.
