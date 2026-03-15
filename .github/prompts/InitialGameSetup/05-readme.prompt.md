You are writing the README.md for an Electron desktop app called
BrainSpeedExercises. Replace the current README (which is from the upstream
starter template) with one that accurately describes this project.

## README must include the following sections

1. **Project title and one-sentence description.**

2. **Features** — bullet list:
   - Central game-selection screen
   - Plugin-based game architecture (each game is self-contained)
   - Automatic progress saving (per player, JSON persistence)
   - WCAG 2.2 Level AA accessibility
   - 100% function test coverage enforced by Jest
   - ESLint (Airbnb-base) linting enforced on all code

3. **Prerequisites** — Node.js ≥ 20 LTS, npm ≥ 10.

4. **Installation**
   ```bash
   git clone <repo-url>
   cd BrainSpeedExercises
   npm install
   ```

5. **Running the app**
   ```bash
   npm start
   ```

6. **Running tests**
   ```bash
   npm test                 # run all tests
   npm run test:coverage    # with coverage report (must be 100% functions)
   ```

7. **Linting**
   ```bash
   npm run lint             # check
   npm run lint:fix         # auto-fix
   ```

8. **Architecture overview** — 3–5 sentences describing the main process,
   renderer process, game plugin system, and progress persistence. Reference
   `.github/copilot-instructions.md` for full detail.

9. **Adding a new game** — numbered steps:
   1. Copy `app/games/_template/` to `app/games/<your-game-name>/`.
   2. Edit `manifest.json` — set a unique `id`, `name`, `description`,
      and `thumbnail`.
   3. Implement game logic in `game.js` and the plugin lifecycle in
      `index.js`.
   4. Write HTML markup in `interface.html` and styles in `style.css`.
   5. Add full Jest tests in `tests/`.
   6. Run `npm test` and `npm run lint` — both must pass before committing.

10. **Accessibility** — one paragraph explaining the WCAG 2.2 AA commitment
    and the key checks (keyboard navigation, color contrast, ARIA live
    regions, semantic HTML).

11. **Security** — one paragraph describing the Electron security hardening
    in place (contextIsolation, no nodeIntegration, CSP, IPC allowlist).

12. **Contributing** — link to `contributing.md`; note that all PRs must
    include tests and pass lint + coverage thresholds.

13. **License** — MIT.

## Style
- Use standard Markdown with ATX headings (`##`).
- Code blocks must specify the language (` ```bash `, ` ```json `, etc.).
- Keep it concise — a developer should be able to read it in under 5 minutes.
- Do not include any content from the original upstream starter template.
