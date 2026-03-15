import { createGameCard } from './components/gameCard.js';

document.addEventListener('DOMContentLoaded', async () => {
  const gameSelector = document.getElementById('game-selector');
  const gameContainer = document.getElementById('game-container');

  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  document.body.appendChild(announcer);

  const manifests = await window.api.invoke('games:list');
  manifests.forEach((manifest) => {
    gameSelector.appendChild(createGameCard(manifest));
  });

  gameSelector.addEventListener('game:select', async (event) => {
    const { gameId } = event.detail;
    const result = await window.api.invoke('games:load', gameId);

    gameSelector.remove();
    gameContainer.innerHTML = result.html;

    announcer.textContent = `${result.name} loaded. Get ready to play!`;
  });
});
