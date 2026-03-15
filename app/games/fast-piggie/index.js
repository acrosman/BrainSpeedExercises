// Stub — implementation added in a later prompt
export default {
  name: 'Fast Piggie',
  init() { },
  start() { },
  stop() {
    return {};
  },
  reset() { },
};

export function loadImages(commonSrc, outlierSrc) {
  function load(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }
  return Promise.all([load(commonSrc), load(outlierSrc)]);
}

export function drawBoard(ctx, width, height, wedgeCount, images, outlierIndex, showImages) {
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 10;
  const angleStep = (2 * Math.PI) / wedgeCount;

  for (let i = 0; i < wedgeCount; i += 1) {
    const startAngle = -Math.PI / 2 + i * angleStep;
    const endAngle = startAngle + angleStep;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#343a40';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (showImages) {
      const img = i === outlierIndex ? images[1] : images[0];
      const midAngle = startAngle + angleStep / 2;
      const imgCx = cx + Math.cos(midAngle) * radius * 0.6;
      const imgCy = cy + Math.sin(midAngle) * radius * 0.6;
      const imgSize = radius * 0.35;
      ctx.drawImage(img, imgCx - imgSize / 2, imgCy - imgSize / 2, imgSize, imgSize);
    }
  }
}

export function clearImages(ctx, width, height, wedgeCount) {
  drawBoard(ctx, width, height, wedgeCount, [null, null], -1, false);
}

export function highlightWedge(ctx, width, height, wedgeIndex, wedgeCount, color) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 10;
  const angleStep = (2 * Math.PI) / wedgeCount;

  const startAngle = -Math.PI / 2 + wedgeIndex * angleStep;
  const endAngle = startAngle + angleStep;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

let _audioCtx = null;

export function createAudioContext() {
  if (!_audioCtx) {

    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

function playTone(audioCtx, frequency, startTime, duration) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startTime);

  // Gentle envelope: ramp up then down to avoid clicks
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function playSuccessSound(audioCtx) {
  const now = audioCtx.currentTime;
  playTone(audioCtx, 440, now, 0.15);
  playTone(audioCtx, 660, now + 0.16, 0.15);
}

export function playFailureSound(audioCtx) {
  const now = audioCtx.currentTime;
  playTone(audioCtx, 330, now, 0.15);
  playTone(audioCtx, 220, now + 0.16, 0.15);
}
