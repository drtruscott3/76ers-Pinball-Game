const canvas = document.getElementById('pinballCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('scoreDisplay');
const ballsDisplay = document.getElementById('ballsDisplay');
const launchPowerDisplay = document.getElementById('launchPower');
const startButton = document.getElementById('startButton');
const resetButton = document.getElementById('resetButton');
const fullscreenButton = document.getElementById('fullscreenButton');
const playerNameInput = document.getElementById('playerName');
const leaderboardList = document.getElementById('leaderboardList');

const GAME_STATE_KEY = 'pinball76ers_leaderboard';
let leaderboard = [];
let game = null;
let animationId = null;
let audioContext = null;
let audioEnabled = false;

const paddleSettings = {
  width: 180,
  height: 18,
  maxSpeed: 8,
  accel: 1.2,
  drag: 0.88,
};

const config = {
  width: canvas.width,
  height: canvas.height,
  gravity: 0.35,
  friction: 0.997,
  bumperPoints: 25,
  slingshotPoints: 15,
  targetPoints: 40,
  rampPoints: 80,
  maxLaunch: 16,
  minLaunch: 8,
  lossLineY: 840,
};

const walls = [
  {x1: 60, y1: 140, x2: 540, y2: 140},
  {x1: 40, y1: 140, x2: 40, y2: 820},
  {x1: 560, y1: 140, x2: 560, y2: 820},
  {x1: 40, y1: 820, x2: 200, y2: 820},
  {x1: 400, y1: 820, x2: 560, y2: 820},
  {x1: 560, y1: 820, x2: 480, y2: 600},
  {x1: 40, y1: 820, x2: 120, y2: 600},
];

const bumpers = [
  {x: 170, y: 260, r: 38, score: config.bumperPoints, label: '76'},
  {x: 300, y: 200, r: 48, score: config.bumperPoints, label: 'ERS'},
  {x: 430, y: 270, r: 34, score: config.bumperPoints, label: '76'},
];

const targets = [
  {x: 115, y: 360, w: 40, h: 80, score: config.targetPoints, active: true},
  {x: 340, y: 390, w: 40, h: 80, score: config.targetPoints, active: true},
  {x: 470, y: 510, w: 36, h: 96, score: config.targetPoints, active: true},
];

const ramps = [
  {x1: 120, y1: 520, x2: 240, y2: 420, score: config.rampPoints},
  {x1: 360, y1: 520, x2: 480, y2: 420, score: config.rampPoints},
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function initAudio() {
  if (audioContext) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  audioContext = new AudioCtx();
}

function playTone({frequency = 440, type = 'sine', duration = 0.1, volume = 0.2, attack = 0.005, decay = 0.1}) {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  const gain = audioContext.createGain();
  const oscillator = audioContext.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  gain.gain.setValueAtTime(0, audioContext.currentTime);
  gain.gain.linearRampToValueAtTime(volume, audioContext.currentTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + attack + duration);
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + attack + duration + decay);
}

function playAudio(eventName) {
  if (!audioEnabled) return;
  switch (eventName) {
    case 'launch':
      playTone({frequency: 220, type: 'triangle', duration: 0.16, volume: 0.22});
      playTone({frequency: 440, type: 'square', duration: 0.08, volume: 0.16, attack: 0.002});
      break;
    case 'paddle':
      playTone({frequency: 600, type: 'triangle', duration: 0.05, volume: 0.16});
      playTone({frequency: 440, type: 'square', duration: 0.08, volume: 0.08, attack: 0.002});
      break;
    case 'flipper':
      playTone({frequency: 520, type: 'triangle', duration: 0.06, volume: 0.14});
      break;
    case 'bumper':
      playTone({frequency: 260, type: 'sine', duration: 0.14, volume: 0.18});
      break;
    case 'target':
      playTone({frequency: 720, type: 'square', duration: 0.1, volume: 0.2});
      break;
    case 'start':
      playTone({frequency: 360, type: 'sine', duration: 0.18, volume: 0.18});
      break;
    case 'lose':
      playTone({frequency: 160, type: 'sine', duration: 0.26, volume: 0.24});
      break;
  }
}

function enableAudio() {
  if (audioEnabled) return;
  initAudio();
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  audioEnabled = true;
}

function loadLeaderboard() {
  const saved = localStorage.getItem(GAME_STATE_KEY);
  if (saved) {
    try {
      leaderboard = JSON.parse(saved);
    } catch (err) {
      leaderboard = [];
    }
  }
  updateLeaderboardDisplay();
}

function saveLeaderboard() {
  localStorage.setItem(GAME_STATE_KEY, JSON.stringify(leaderboard));
}

function updateLeaderboardDisplay() {
  leaderboardList.innerHTML = '';
  leaderboard.slice(0, 10).forEach((entry, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>#${index + 1}</span><span>${entry.name}</span><span>${entry.score}</span>`;
    leaderboardList.appendChild(li);
  });
  if (leaderboard.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No scores yet. Play to become #1!';
    leaderboardList.appendChild(li);
  }
}

function addScoreEntry(name, score) {
  leaderboard.push({name: name || 'Sixer', score, date: Date.now()});
  leaderboard.sort((a, b) => b.score - a.score || a.date - b.date);
  leaderboard = leaderboard.slice(0, 10);
  saveLeaderboard();
  updateLeaderboardDisplay();
}

function resetGame() {
  game = {
    score: 0,
    balls: 3,
    launching: false,
    launchPower: config.minLaunch,
    activeBall: null,
    paddle: {
      x: canvas.width / 2 - paddleSettings.width / 2,
      y: 820,
      w: paddleSettings.width,
      h: paddleSettings.height,
      vx: 0,
      targetVx: 0,
    },
    active: false,
    message: 'Press Space to launch',
  };
  targets.forEach(t => (t.active = true));
  updateStatus();
}

function updateStatus() {
  scoreDisplay.textContent = game.score;
  ballsDisplay.textContent = game.balls;
  launchPowerDisplay.textContent = `${Math.round(((game.launchPower - config.minLaunch) / (config.maxLaunch - config.minLaunch)) * 100)}%`;
}

function startNewGame() {
  resetGame();
  game.active = true;
  spawnBall();
  cancelAnimationFrame(animationId);
  playAudio('start');
  animate();
}

function spawnBall() {
  game.activeBall = {
    x: 545,
    y: 805,
    r: 13,
    vx: 0,
    vy: 0,
    inPlay: false,
    resting: true,
  };
  game.launching = false;
  game.launchPower = config.minLaunch;
  updateStatus();
}

function lineDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function reflectVelocity(ball, nx, ny, speedBoost = 1) {
  const dot = ball.vx * nx + ball.vy * ny;
  ball.vx = (ball.vx - 2 * dot * nx) * speedBoost;
  ball.vy = (ball.vy - 2 * dot * ny) * speedBoost;
}

function collideCircle(ball, cx, cy, r, scorePoints) {
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist < ball.r + r) {
    const overlap = ball.r + r - dist;
    const nx = dx / dist || 0;
    const ny = dy / dist || 0;
    ball.x += nx * overlap;
    ball.y += ny * overlap;
    reflectVelocity(ball, nx, ny, 1.06);
    game.score += scorePoints;
    return true;
  }
  return false;
}

function collideRect(ball, rect) {
  const closestX = clamp(ball.x, rect.x, rect.x + rect.w);
  const closestY = clamp(ball.y, rect.y, rect.y + rect.h);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const dist = Math.hypot(dx, dy);
  if (dist < ball.r + 1) {
    const nx = dx / dist || 0;
    const ny = dy / dist || 0;
    ball.x += nx * (ball.r + 1 - dist);
    ball.y += ny * (ball.r + 1 - dist);
    reflectVelocity(ball, nx, ny, 1.04);
    return true;
  }
  return false;
}

function collideLine(ball, line, scorePoints = 0) {
  const {x1, y1, x2, y2} = line;
  const A = ball.x - x1;
  const B = ball.y - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const len2 = C * C + D * D;
  const t = clamp(dot / len2, 0, 1);
  const closestX = x1 + C * t;
  const closestY = y1 + D * t;
  const dist = Math.hypot(ball.x - closestX, ball.y - closestY);
  if (dist < ball.r + 1) {
    const nx = (ball.x - closestX) / dist || 0;
    const ny = (ball.y - closestY) / dist || 0;
    ball.x += nx * (ball.r + 1 - dist);
    ball.y += ny * (ball.r + 1 - dist);
    reflectVelocity(ball, nx, ny, 1.01);
    game.score += scorePoints;
  }
}

function collideFlipper(ball, flipper) {
  const angle = flipper.angle * flipper.side;
  const pivotX = flipper.x;
  const pivotY = flipper.y;
  const tipX = pivotX + Math.cos(angle) * flipperSettings.length;
  const tipY = pivotY + Math.sin(angle) * flipperSettings.length;
  const rect = {
    x: Math.min(pivotX, tipX) - flipperSettings.width / 2,
    y: Math.min(pivotY, tipY) - flipperSettings.width / 2,
    w: Math.abs(tipX - pivotX) + flipperSettings.width,
    h: Math.abs(tipY - pivotY) + flipperSettings.width,
  };
  if (collideRect(ball, rect)) {
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const force = 1.1;
    ball.vx += nx * force * 1.4 * flipper.side;
    ball.vy += ny * force * 1.4;
    game.score += 2;
  }
}

function checkBallBounds() {
  const ball = game.activeBall;
  if (!ball) return;
  if (ball.x - ball.r < 40) {
    ball.x = 40 + ball.r;
    ball.vx *= -1;
    ball.vx *= 0.98;
    ball.vy *= 0.98;
  }
  if (ball.x + ball.r > 560) {
    ball.x = 560 - ball.r;
    ball.vx *= -1;
    ball.vx *= 0.98;
    ball.vy *= 0.98;
  }
  if (ball.y - ball.r < 140) {
    ball.y = 140 + ball.r;
    ball.vy *= -1;
    ball.vx *= 0.98;
    ball.vy *= 0.98;
  }
  if (ball.y - ball.r > 860) {
    loseBall();
  }
}

function loseBall() {
  game.balls -= 1;
  if (game.balls <= 0) {
    game.active = false;
    game.activeBall = null;
    addScoreEntry(playerNameInput.value.trim() || 'Sixer', game.score);
    startButton.textContent = 'Play Again';
    playAudio('lose');
    return;
  }
  spawnBall();
}

function updateLaunchPhysics() {
  if (!game.activeBall || game.activeBall.inPlay) return;
  if (game.launching) {
    game.launchPower = clamp(game.launchPower + 0.16, config.minLaunch, config.maxLaunch);
  }
  updateStatus();
}

function updateBallPhysics() {
  const ball = game.activeBall;
  if (!ball) return;
  if (!ball.inPlay) return;
  ball.x += ball.vx;
  ball.y += ball.vy;

  bumpers.forEach(bumper => {
    if (collideCircle(ball, bumper.x, bumper.y, bumper.r, bumper.score)) {
      playBumperLights(bumper);
      playAudio('bumper');
    }
  });

  ramps.forEach(ramp => {
    const line = {...ramp};
    if (collideRect(ball, {
      x: Math.min(line.x1, line.x2) - 8,
      y: Math.min(line.y1, line.y2) - 8,
      w: Math.abs(line.x2 - line.x1) + 16,
      h: Math.abs(line.y2 - line.y1) + 16,
    })) {
      game.score += ramp.score;
      ball.vx += (line.x2 > line.x1 ? 1.5 : -1.5);
      ball.vy -= 2.6;
    }
  });

  targets.forEach(target => {
    if (target.active && collideRect(ball, target)) {
      target.active = false;
      game.score += target.score;
      ball.vy *= -1.03;
      ball.vx *= 0.98;
      playAudio('target');
    }
  });

  walls.forEach(wall => collideLine(ball, wall));

  const paddle = game.paddle;
  if (paddle && ball.vy > 0 && collideRect(ball, {x: paddle.x, y: paddle.y, w: paddle.w, h: paddle.h})) {
    const hitPoint = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    const speed = Math.max(7, Math.hypot(ball.vx, ball.vy));
    const bounceAngle = hitPoint * (Math.PI / 3);
    ball.vx = speed * Math.sin(bounceAngle) + paddle.vx * 0.12;
    ball.vy = -Math.abs(speed * Math.cos(bounceAngle));
    ball.vx *= 0.95;
    ball.vy *= 0.95;
    game.score += 1;
    playAudio('paddle');
  }

  if (ball.y + ball.r >= config.lossLineY) {
    loseBall();
    return;
  }

  checkBallBounds();
}

function updatePaddle() {
  const paddle = game.paddle;
  if (!paddle) return;
  if (paddle.vx < paddle.targetVx) {
    paddle.vx = Math.min(paddle.vx + paddleSettings.accel, paddle.targetVx);
  }
  if (paddle.vx > paddle.targetVx) {
    paddle.vx = Math.max(paddle.vx - paddleSettings.accel, paddle.targetVx);
  }
  if (paddle.targetVx === 0) {
    paddle.vx *= paddleSettings.drag;
    if (Math.abs(paddle.vx) < 0.15) paddle.vx = 0;
  }
  paddle.x += paddle.vx;
  paddle.x = clamp(paddle.x, 40, 560 - paddle.w);
}

function drawMachineAmbient() {
  ctx.clearRect(0, 0, config.width, config.height);
  ctx.save();
  ctx.fillStyle = '#0f2e66';
  ctx.fillRect(0, 0, config.width, config.height);
  ctx.restore();

  ctx.strokeStyle = '#70a7ff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  walls.forEach((wall, index) => {
    if (index === 0) {
      ctx.moveTo(wall.x1, wall.y1);
    }
    ctx.lineTo(wall.x2, wall.y2);
  });
  ctx.stroke();

  ctx.fillStyle = '#082049';
  ctx.fillRect(40, 140, 520, 680);
  ctx.strokeStyle = '#ffffff22';
  ctx.lineWidth = 1;
  ctx.setLineDash([7, 12]);
  ctx.strokeRect(50, 150, 500, 650);
  ctx.setLineDash([]);

  ctx.strokeStyle = '#2a84ff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(40, config.lossLineY);
  ctx.lineTo(560, config.lossLineY);
  ctx.stroke();
}

function drawBumpers() {
  bumpers.forEach(bumper => {
    const gradient = ctx.createRadialGradient(bumper.x - 10, bumper.y - 10, 5, bumper.x, bumper.y, bumper.r);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.5, '#ed174f');
    gradient.addColorStop(1, '#0b3d91');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bumper.label, bumper.x, bumper.y);
  });
}

function drawTargets() {
  targets.forEach((target, index) => {
    ctx.fillStyle = target.active ? (index % 2 === 0 ? '#ed174f' : '#ffffff') : '#666';
    ctx.strokeStyle = '#70a7ff';
    ctx.lineWidth = 4;
    ctx.fillRect(target.x, target.y, target.w, target.h);
    ctx.strokeRect(target.x, target.y, target.w, target.h);
    ctx.fillStyle = '#041e42';
    ctx.font = 'bold 14px Inter';
    ctx.fillText(target.score, target.x + target.w / 2, target.y + target.h / 2);
  });
}

function drawPaddle() {
  if (!game || !game.paddle) return;
  const paddle = game.paddle;
  ctx.save();
  ctx.fillStyle = '#1a8cff';
  ctx.shadowColor = '#4fa8ff';
  ctx.shadowBlur = 18;
  ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
  ctx.restore();
}

function drawRamps() {
  ramps.forEach((ramp) => {
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(ramp.x1, ramp.y1);
    ctx.lineTo(ramp.x2, ramp.y2);
    ctx.stroke();
    ctx.strokeStyle = '#ed174f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ramp.x1 + 5, ramp.y1 + 5);
    ctx.lineTo(ramp.x2 + 5, ramp.y2 + 5);
    ctx.stroke();
  });
}

function drawFlipper(flipper, color) {
  const angle = flipper.angle * flipper.side;
  const pivotX = flipper.x;
  const pivotY = flipper.y;
  const tipX = pivotX + Math.cos(angle) * flipperSettings.length;
  const tipY = pivotY + Math.sin(angle) * flipperSettings.length;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = flipperSettings.width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.restore();
}

function drawBall() {
  if (!game.activeBall) return;
  const ball = game.activeBall;
  ctx.save();
  const ballGradient = ctx.createRadialGradient(ball.x - 6, ball.y - 6, 3, ball.x, ball.y, ball.r);
  ballGradient.addColorStop(0, '#ffffff');
  ballGradient.addColorStop(0.4, '#70a7ff');
  ballGradient.addColorStop(1, '#0b3d91');
  ctx.fillStyle = ballGradient;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f6f8ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.save();
  ctx.font = '700 28px Inter';
  ctx.fillStyle = '#ffffffcc';
  ctx.textAlign = 'left';
  ctx.fillText('PHI 76ERS', 52, 110);
  ctx.fillStyle = '#ed174f';
  ctx.fillText('PINBALL', 300, 110);
  ctx.restore();
}

function playBumperLights(bumper) {
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(bumper.x, bumper.y, bumper.r + 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function animate() {
  if (!game) return;
  updateLaunchPhysics();
  updatePaddle();
  updateBallPhysics();
  drawMachineAmbient();
  drawHUD();
  drawRamps();
  drawTargets();
  drawBumpers();
  drawPaddle();
  drawBall();
  updateStatus();

  if (game.active) {
    animationId = requestAnimationFrame(animate);
  }
}

window.addEventListener('keydown', (event) => {
  enableAudio();
  if (!game) return;
  if (event.key === 'ArrowLeft') {
    game.paddle.targetVx = -paddleSettings.maxSpeed;
  }
  if (event.key === 'ArrowRight') {
    game.paddle.targetVx = paddleSettings.maxSpeed;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    if (!game.active) return;
    if (!game.activeBall || game.activeBall.inPlay) return;
    game.launching = true;
  }
});

window.addEventListener('keyup', (event) => {
  if (!game) return;
  if (event.key === 'ArrowLeft') {
    game.paddle.targetVx = 0;
  }
  if (event.key === 'ArrowRight') {
    game.paddle.targetVx = 0;
  }
  if (event.code === 'Space') {
    if (!game.active || !game.activeBall || game.activeBall.inPlay) return;
    if (game.launching) {
      const direction = Math.random() > 0.5 ? 1 : -1;
      game.activeBall.vy = -game.launchPower;
      game.activeBall.vx = direction * game.launchPower * 0.35;
      game.activeBall.inPlay = true;
      game.launching = false;
      playAudio('launch');
      updateStatus();
    }
  }
});

fullscreenButton.addEventListener('click', async () => {
  enableAudio();
  const element = document.documentElement;
  if (!document.fullscreenElement) {
    await element.requestFullscreen?.();
    fullscreenButton.textContent = 'Exit Fullscreen';
  } else {
    await document.exitFullscreen?.();
    fullscreenButton.textContent = 'Enter Fullscreen';
  }
});

startButton.addEventListener('click', () => {
  if (!game || !game.active) {
    startNewGame();
  }
});

resetButton.addEventListener('click', () => {
  cancelAnimationFrame(animationId);
  resetGame();
  game.active = true;
  spawnBall();
  startButton.textContent = 'Start New Game';
  playAudio('start');
  animate();
});

loadLeaderboard();
resetGame();

canvas.addEventListener('mousedown', () => {
  enableAudio();
  if (!game.active) startNewGame();
});

window.addEventListener('resize', () => {
  const scale = Math.min(window.innerWidth / 700, 1);
  canvas.style.transform = `scale(${scale})`;
});
