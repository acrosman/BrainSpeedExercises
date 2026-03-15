let score = 0;
let roundsPlayed = 0;
let running = false;
let startTime = null;
let level = 0;
let consecutiveCorrect = 0;

export function initGame() {
  score = 0;
  roundsPlayed = 0;
  running = false;
  startTime = null;
  level = 0;
  consecutiveCorrect = 0;
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

export function generateRound(currentLevel) {
  const wedgeCount = Math.min(6 + currentLevel, 14);
  const displayDurationMs = Math.max(1200 - currentLevel * 300, 300);
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
  consecutiveCorrect += 1;
  if (consecutiveCorrect >= 3) {
    level += 1;
    consecutiveCorrect = 0;
  }
}

export function addMiss() {
  roundsPlayed += 1;
  consecutiveCorrect = 0;
}

export function getScore() {
  return score;
}

export function getRoundsPlayed() {
  return roundsPlayed;
}

export function getLevel() {
  return level;
}

export function getConsecutiveCorrect() {
  return consecutiveCorrect;
}

export function getCurrentDifficulty() {
  const wedgeCount = Math.min(6 + level, 14);
  const displayDurationMs = Math.max(1200 - level * 300, 300);
  return { wedgeCount, displayDurationMs };
}

export function isRunning() {
  return running;
}
