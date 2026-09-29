# Contributing to Brain Speed Exercises

I welcome contributions large and small, and I'm happy to help new developers get started working on public code. You can go ahead and make contributions whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## We Develop with GitHub

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## We Use [GitHub Flow](https://guides.github.com/introduction/flow/index.html), So All Code Changes Happen Through Pull Requests

If you have a feature idea or discover a bug, please open an issue so we can discuss it before you spend too much time trying to implement a solution. We actively welcome your pull requests:

1. Fork the repository to your own GitHub account
2. Clone the project to your machine
3. Create a branch locally
4. Commit changes to the branch
5. Follow any formatting and testing guidelines specific to this repo
6. Push changes to your fork
7. Open a PR in our repository

I want to give contributors as much credit as reasonably possible, so I may provide you feedback on your pull request instead of just merging and fixing the issues myself. That's meant to be helpful, but if it gets frustrating please let me know and I'll try to find another way to move it forward.

If you have code that addresses an issue, please make a reference to the issue in a comment on your pull request so it is easy to see the connections. If you just want to refactor some code that is messier than it should be, just go ahead and open a pull request when you're ready.

## Report bugs using GitHub's [issues](https://github.com/acrosman/BrainSpeedExercises/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/acrosman/BrainSpeedExercises/issues/new); it's that easy!

## Bug Report

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- Expected behavior
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Pull Request Requirements

All pull requests must:

- include tests for every new or changed function,
- pass `npm run lint` with no errors, and
- pass `npm run test:coverage` with function coverage at 100%.

---

## Setting Up a Development Environment

### Prerequisites

- Node.js ≥ 24 LTS
- npm ≥ 10

### Installation

```bash
git clone https://github.com/acrosman/BrainSpeedExercises.git
cd BrainSpeedExercises
npm install
```

### Running the App

```bash
npm start
```

### Running Tests

```bash
npm test                  # run all tests
npm run test:coverage     # with coverage report (100% function coverage required)
```

### Linting

```bash
npm run lint              # check for style issues
npm run lint:fix          # auto-fix fixable issues
```

---

## Architecture Overview

BrainSpeedExercises is an Electron application split into a **main process** (`main.js`) and a
**renderer process** (`app/`). The main process owns all privileged operations: loading game
manifests, reading and writing progress files, and registering IPC handlers. The renderer process
handles all UI, communicating with the main process exclusively through the typed IPC channel
allowlist exposed by `app/preload.js`.

Games are **plugins**: each game lives entirely in `app/games/<game-name>/` and is discovered at
runtime by a manifest scanner. The renderer requests the game list over IPC, displays a selection
screen, then dynamically loads the chosen game's HTML fragment and JavaScript module into a
container element. Progress is persisted to a per-player JSON file in Electron's `userData`
directory and is never exposed directly to renderer code.

---

## Adding a New Game

Start from the template:

```bash
cp -r app/games/_template app/games/my-game-name
```

The rules every game follows are kept in one place, next to the code:

- [app/games/CLAUDE.md](app/games/CLAUDE.md) describes the plugin contract: the required files,
  how a game is loaded, `GAME_ID`, the shared services (`scoreService`, `timerService`, and the
  rest), the shared screen markup, and how to test a game.
- [app/games/\_template/CLAUDE.md](app/games/_template/CLAUDE.md) lists the steps to turn the
  template into a new game.
- [app/components/CLAUDE.md](app/components/CLAUDE.md) documents the shared components and the
  tutorial framework.

These files are written as instructions for AI coding assistants, but they are the project's
reference for human contributors too. If one of them is wrong or unclear, please open an issue or
fix it in your pull request.

---

## License

By contributing, you agree that your contributions will be licensed under its MIT License. 