You are performing an accessibility review of every HTML file and JavaScript
file that manipulates the DOM in the BrainSpeedExercises Electron app.
The target standard is WCAG 2.2 Level AA.

For each file listed, produce:
1. A checklist of WCAG 2.2 AA criteria relevant to that file.
2. A list of any violations found with line numbers.
3. Code patches to fix each violation.

## Files to review
- app/index.html
- app/style.css
- app/components/gameCard.js
- app/interface.js
- app/games/*/interface.html   (each game)
- app/games/*/style.css        (each game)
- app/games/*/index.js         (DOM-manipulation portions)

## Key criteria to check in every file
- 1.1.1 Non-text content: every `<img>` has a meaningful `alt`.
- 1.3.1 Info and relationships: headings, lists, and tables use semantic markup.
- 1.4.1 Use of color: information is not conveyed by color alone.
- 1.4.3 Contrast: normal text ≥ 4.5:1, large text ≥ 3:1.
- 2.1.1 Keyboard: all interactive controls reachable via Tab / arrow keys.
- 2.4.3 Focus order: focus moves in a logical sequence.
- 2.4.7 Focus visible: keyboard focus indicator is visible.
- 2.5.3 Label in name: visible label is contained in the accessible name.
- 4.1.2 Name, role, value: all custom widgets expose correct ARIA attributes.
- 4.1.3 Status messages: score updates and results use `aria-live`.

## Output format
For each violation, output a unified diff patch that can be applied with
`git apply`. Do not rewrite files wholesale — make the minimum changes needed.
