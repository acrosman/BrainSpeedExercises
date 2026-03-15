let score = 0;
let roundsPlayed = 0;
let running = false;
let startTime = null;

export function initGame() {
  score = 0;
  roundsPlayed = 0;
  running = false;
  startTime = null;
}

export function startGame() {
  if (running) {
    throw new Error('Game is already running.');
  }
  running = true;
  startTime = Date.now();
}

export function stopGame() {
  if (!running) {
    throw new Error('Game is not running.');
  }
  running = false;
  const duration = startTime !== null ? Date.now() - startTime : 0;
  return { score, roundsPlayed, duration };
}

export function generateRound(roundNumber) {
  const tier = Math.floor(roundNumber / 3);
  const wedgeCount = Math.min(6 + tier * 2, 14);
  const displayDurationMs = Math.max(2000 - tier * 200, 500);
  const outlierWedgeIndex = Math.floor(Math.random() * wedgeCount);
  return { wedgeCount, displayDurationMs, outlierWedgeIndex };
}

export function checkAnswer(clickedWedge, outlierWedge) {
  return clickedWedge === outlierWedge;
}

export function calculateWedgeIndex(clickX, clickY, centerX, centerY, radius, wedgeCount) {
  const dx = clickX - centerX;
  const dy = clickY - centerY;
  if (Math.sqrt(dx * dx + dy * dy) > radius) {
    return -1;
  }
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
  return Math.floor(angle / (2 * Math.PI / wedgeCount));
}

export function addScore() {
  score += 1;
  roundsPlayed += 1;
}

export function getScore() {
  return score;
}

export function getRoundsPlayed() {
  return roundsPlayed;
}

export function getCurrentDifficulty() {
  const tier = Math.floor(score / 3);
  const wedgeCount = Math.min(6 + tier * 2, 14);
  const displayDurationMs = Math.max(2000 - tier * 200, 500);
  return { wedgeCount, displayDurationMs };
}

export function isRunning() {
  return running;
}
