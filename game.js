const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const healthValue = document.getElementById("healthValue");
const ammoValue = document.getElementById("ammoValue");
const enemyValue = document.getElementById("enemyValue");
const killsValue = document.getElementById("killsValue");

const overlay = document.getElementById("overlay");
const endOverlay = document.getElementById("endOverlay");
const endStatusLabel = document.getElementById("endStatusLabel");
const endTitle = document.getElementById("endTitle");
const endMessage = document.getElementById("endMessage");

const startButton = document.getElementById("startButton");
const overlayStartButton = document.getElementById("overlayStartButton");
const restartButton = document.getElementById("restartButton");
const muteButton = document.getElementById("muteButton");
const shareButton = document.getElementById("shareButton");
const mobilePad = document.getElementById("mobilePad");
const mobilePadKnob = document.getElementById("mobilePadKnob");

const keys = new Set();
const touchState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  turnLeft: false,
  turnRight: false,
  fire: false,
  move: 0,
  turn: 0,
};

const padState = {
  active: false,
  pointerId: null,
  startTime: 0,
  startX: 0,
  startY: 0,
  moved: false,
};

const MAP = [
  "111111111111",
  "100000000001",
  "101011011101",
  "100010000001",
  "101110111101",
  "100000100001",
  "111010101101",
  "100010001001",
  "101111101101",
  "100000000001",
  "111111111111",
];

const STATE = {
  running: false,
  ended: false,
  pointerActive: false,
  lastTime: 0,
  flashTimer: 0,
  win: false,
};

const player = {
  x: 1.8,
  y: 1.8,
  angle: 0,
  health: 100,
  ammo: 18,
  kills: 0,
  cooldown: 0,
  reloadCooldown: 0,
};

let enemies = [];
const TOTAL_ENEMIES = 5;

const config = {
  fov: Math.PI / 3,
  moveSpeed: 2.7,
  turnSpeed: 2.3,
  enemySpeed: 1.05,
  maxViewDistance: 20,
};

const audio = {
  context: null,
  master: null,
  muted: false,
};

function setupAudio() {
  if (audio.context) {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  audio.context = new AudioContextClass();
  audio.master = audio.context.createGain();
  audio.master.gain.value = 0.2;
  audio.master.connect(audio.context.destination);
}

function setMuted(nextMuted) {
  audio.muted = nextMuted;
  muteButton.textContent = `Mute: ${audio.muted ? "On" : "Off"}`;
  if (audio.master) {
    audio.master.gain.value = audio.muted ? 0 : 0.2;
  }
}

function playTone({ frequency, duration, type = "square", volume = 0.12, slideTo }) {
  if (!audio.context || !audio.master || audio.muted) {
    return;
  }

  const now = audio.context.currentTime;
  const oscillator = audio.context.createOscillator();
  const gainNode = audio.context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gainNode);
  gainNode.connect(audio.master);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function soundShoot() {
  playTone({ frequency: 180, slideTo: 90, duration: 0.11, type: "sawtooth", volume: 0.13 });
}

function soundHit() {
  playTone({ frequency: 340, slideTo: 180, duration: 0.08, type: "triangle", volume: 0.09 });
}

function soundDamage() {
  playTone({ frequency: 120, slideTo: 70, duration: 0.18, type: "square", volume: 0.1 });
}

function soundWin() {
  playTone({ frequency: 320, slideTo: 640, duration: 0.28, type: "triangle", volume: 0.09 });
  setTimeout(() => playTone({ frequency: 460, slideTo: 920, duration: 0.24, type: "triangle", volume: 0.08 }), 120);
}

function soundLose() {
  playTone({ frequency: 160, slideTo: 50, duration: 0.45, type: "sawtooth", volume: 0.1 });
}

function cloneEnemies() {
  return [
    { id: 1, x: 4.6, y: 1.8, health: 35, attackCooldown: 0, size: 0.36 },
    { id: 2, x: 7.6, y: 1.8, health: 35, attackCooldown: 0, size: 0.36 },
    { id: 3, x: 6.6, y: 3.6, health: 35, attackCooldown: 0, size: 0.36 },
    { id: 4, x: 2.4, y: 5.6, health: 40, attackCooldown: 0, size: 0.38 },
    { id: 5, x: 9.2, y: 9.2, health: 45, attackCooldown: 0, size: 0.42 },
  ];
}

function resetGame() {
  player.x = 1.8;
  player.y = 1.8;
  player.angle = 0;
  player.health = 100;
  player.ammo = 18;
  player.kills = 0;
  player.cooldown = 0;
  player.reloadCooldown = 0;
  enemies = cloneEnemies();
  STATE.ended = false;
  STATE.win = false;
  STATE.flashTimer = 0;
  updateHud();
  hideEndOverlay();
}

function updateHud() {
  healthValue.textContent = Math.max(0, Math.ceil(player.health));
  ammoValue.textContent = player.ammo;
  enemyValue.textContent = enemies.length;
  killsValue.textContent = `${player.kills}/${TOTAL_ENEMIES}`;
}

function isWall(x, y) {
  const mapX = Math.floor(x);
  const mapY = Math.floor(y);
  if (mapY < 0 || mapY >= MAP.length || mapX < 0 || mapX >= MAP[0].length) {
    return true;
  }
  return MAP[mapY][mapX] === "1";
}

function tryMove(deltaX, deltaY) {
  const nextX = player.x + deltaX;
  const nextY = player.y + deltaY;

  if (!isWall(nextX, player.y)) {
    player.x = nextX;
  }
  if (!isWall(player.x, nextY)) {
    player.y = nextY;
  }
}

function hasLineOfSight(fromX, fromY, toX, toY) {
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const distance = Math.hypot(deltaX, deltaY);
  const samples = Math.max(4, Math.ceil(distance * 12));

  for (let i = 1; i < samples; i += 1) {
    const ratio = i / samples;
    const sampleX = fromX + deltaX * ratio;
    const sampleY = fromY + deltaY * ratio;
    if (isWall(sampleX, sampleY)) {
      return false;
    }
  }
  return true;
}

function castRay(rayAngle) {
  const sin = Math.sin(rayAngle);
  const cos = Math.cos(rayAngle);
  let distance = 0;
  let hitX = player.x;
  let hitY = player.y;

  while (distance < config.maxViewDistance) {
    distance += 0.02;
    hitX = player.x + cos * distance;
    hitY = player.y + sin * distance;
    if (isWall(hitX, hitY)) {
      break;
    }
  }

  const cellX = Math.floor(hitX);
  const cellY = Math.floor(hitY);
  const offsetX = hitX - cellX;
  const offsetY = hitY - cellY;
  const nearVertical = Math.min(offsetX, 1 - offsetX) < Math.min(offsetY, 1 - offsetY);

  return {
    distance,
    hitX,
    hitY,
    shade: nearVertical ? 0.84 : 1,
  };
}

function normalizeAngle(angle) {
  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }
  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }
  return angle;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updatePadVector(clientX, clientY) {
  if (!mobilePad || !mobilePadKnob) {
    return;
  }

  const rect = mobilePad.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  let axisX = (clientX - centerX) / (rect.width / 2);
  let axisY = (clientY - centerY) / (rect.height / 2);

  const distance = Math.hypot(axisX, axisY);
  if (distance > 1) {
    axisX /= distance;
    axisY /= distance;
  }

  touchState.turn = clamp(axisX, -1, 1);
  touchState.move = clamp(-axisY, -1, 1);

  const knobTravelX = rect.width * 0.24;
  const knobTravelY = rect.height * 0.24;
  mobilePadKnob.style.transform = `translate(${axisX * knobTravelX}px, ${axisY * knobTravelY}px)`;
}

function resetPad() {
  touchState.move = 0;
  touchState.turn = 0;
  if (mobilePadKnob) {
    mobilePadKnob.style.transform = "translate(0px, 0px)";
  }
}

function setupMobilePadControls() {
  if (!mobilePad) {
    return;
  }

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    padState.active = true;
    padState.pointerId = event.pointerId;
    padState.startTime = performance.now();
    padState.startX = event.clientX;
    padState.startY = event.clientY;
    padState.moved = false;

    mobilePad.classList.add("active");
    mobilePad.setPointerCapture?.(event.pointerId);
    updatePadVector(event.clientX, event.clientY);
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    if (!padState.active || event.pointerId !== padState.pointerId) {
      return;
    }

    const dragDistance = Math.hypot(event.clientX - padState.startX, event.clientY - padState.startY);
    if (dragDistance > 8) {
      padState.moved = true;
    }

    updatePadVector(event.clientX, event.clientY);
    event.preventDefault();
  };

  const onPointerUp = (event) => {
    if (!padState.active || event.pointerId !== padState.pointerId) {
      return;
    }

    const pressDuration = performance.now() - padState.startTime;
    const shouldFire = !padState.moved && pressDuration < 220;

    padState.active = false;
    padState.pointerId = null;
    mobilePad.classList.remove("active");
    resetPad();

    if (shouldFire) {
      fireWeapon();
    }
    event.preventDefault();
  };

  mobilePad.addEventListener("pointerdown", onPointerDown);
  mobilePad.addEventListener("pointermove", onPointerMove);
  mobilePad.addEventListener("pointerup", onPointerUp);
  mobilePad.addEventListener("pointercancel", onPointerUp);
  mobilePad.addEventListener("contextmenu", (event) => event.preventDefault());
}

function renderScene() {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const ceiling = ctx.createLinearGradient(0, 0, 0, height * 0.5);
  ceiling.addColorStop(0, "#26131a");
  ceiling.addColorStop(1, "#08090d");
  ctx.fillStyle = ceiling;
  ctx.fillRect(0, 0, width, height / 2);

  const floor = ctx.createLinearGradient(0, height * 0.5, 0, height);
  floor.addColorStop(0, "#111317");
  floor.addColorStop(1, "#3d2416");
  ctx.fillStyle = floor;
  ctx.fillRect(0, height / 2, width, height / 2);

  const wallDepths = new Array(width);
  for (let x = 0; x < width; x += 1) {
    const cameraX = (x / width) * 2 - 1;
    const rayAngle = player.angle + cameraX * (config.fov / 2);
    const ray = castRay(rayAngle);
    const correctedDistance = ray.distance * Math.cos(rayAngle - player.angle);
    wallDepths[x] = correctedDistance;

    const wallHeight = Math.min(height, (height / Math.max(correctedDistance, 0.0001)) * 0.92);
    const wallTop = (height - wallHeight) / 2;
    const brightness = Math.max(0.14, 1 - correctedDistance / config.maxViewDistance) * ray.shade;
    const red = Math.floor(160 * brightness + 20);
    const green = Math.floor(60 * brightness + 10);
    const blue = Math.floor(28 * brightness + 8);

    ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    ctx.fillRect(x, wallTop, 1, wallHeight);
  }

  const visibleEnemies = enemies
    .map((enemy) => {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.hypot(dx, dy);
      const angle = normalizeAngle(Math.atan2(dy, dx) - player.angle);
      return { enemy, dx, dy, distance, angle };
    })
    .filter((entry) => Math.abs(entry.angle) < config.fov * 0.7 && entry.distance > 0.25)
    .sort((left, right) => right.distance - left.distance);

  visibleEnemies.forEach(({ enemy, distance, angle }) => {
    const screenX = (0.5 + angle / config.fov) * width;
    const size = Math.min(height * 0.9, (height / Math.max(distance, 0.0001)) * 0.7);
    const spriteWidth = size * 0.58;
    const left = screenX - spriteWidth / 2;
    const top = height / 2 - size * 0.54;

    const occluded = wallDepths[Math.max(0, Math.min(width - 1, Math.floor(screenX)))] < distance;
    if (occluded) {
      return;
    }

    const body = ctx.createLinearGradient(0, top, 0, top + size);
    body.addColorStop(0, "#ffcb84");
    body.addColorStop(0.45, "#df5a19");
    body.addColorStop(1, "#5f1202");
    ctx.fillStyle = body;
    ctx.fillRect(left, top, spriteWidth, size * 0.8);

    ctx.fillStyle = "#220400";
    ctx.fillRect(left + spriteWidth * 0.18, top + size * 0.18, spriteWidth * 0.18, size * 0.12);
    ctx.fillRect(left + spriteWidth * 0.64, top + size * 0.18, spriteWidth * 0.18, size * 0.12);
    ctx.fillRect(left + spriteWidth * 0.33, top + size * 0.55, spriteWidth * 0.34, size * 0.08);

    const healthRatio = Math.max(0, enemy.health) / 45;
    ctx.fillStyle = "rgba(12, 10, 8, 0.8)";
    ctx.fillRect(left, top - 14, spriteWidth, 6);
    ctx.fillStyle = "#ff6a1a";
    ctx.fillRect(left, top - 14, spriteWidth * healthRatio, 6);
  });

  renderWeapon(width, height);
  renderMiniStatus(width, height);

  if (STATE.flashTimer > 0) {
    ctx.fillStyle = `rgba(255, 70, 40, ${Math.min(0.32, STATE.flashTimer)})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function renderWeapon(width, height) {
  const sway = Math.sin(performance.now() * 0.008) * 4;
  ctx.fillStyle = "#24120d";
  ctx.fillRect(width * 0.42, height * 0.78 + sway, width * 0.16, height * 0.16);
  ctx.fillStyle = "#4d2a19";
  ctx.fillRect(width * 0.47, height * 0.68 + sway, width * 0.06, height * 0.2);
  ctx.fillStyle = "#a34d1a";
  ctx.fillRect(width * 0.49, height * 0.64 + sway, width * 0.02, height * 0.08);
}

function renderMiniStatus(width, height) {
  ctx.fillStyle = "rgba(10, 11, 15, 0.66)";
  ctx.fillRect(18, height - 88, 210, 62);
  ctx.strokeStyle = "rgba(255, 194, 102, 0.35)";
  ctx.strokeRect(18, height - 88, 210, 62);
  ctx.fillStyle = "#f3ede7";
  ctx.font = '16px "Rajdhani", sans-serif';
  ctx.fillText(`HEALTH ${Math.max(0, Math.ceil(player.health))}`, 30, height - 58);
  ctx.fillText(`AMMO ${player.ammo}`, 130, height - 58);
  ctx.fillText(`KILLS ${player.kills}/${TOTAL_ENEMIES}`, 30, height - 34);
}

function updatePlayer(deltaTime) {
  const moveStep = config.moveSpeed * deltaTime;
  const turnStep = config.turnSpeed * deltaTime;
  const digitalForward = (keys.has("KeyW") || keys.has("ArrowUp") || touchState.forward ? 1 : 0)
    - (keys.has("KeyS") || keys.has("ArrowDown") || touchState.backward ? 1 : 0);
  const forward = clamp(digitalForward + touchState.move, -1, 1);
  const strafe = (keys.has("KeyD") || touchState.right ? 1 : 0) - (keys.has("KeyA") || touchState.left ? 1 : 0);
  const digitalTurning = (keys.has("ArrowRight") || touchState.turnRight ? 1 : 0)
    - (keys.has("ArrowLeft") || touchState.turnLeft ? 1 : 0);
  const turning = clamp(digitalTurning + touchState.turn, -1, 1);

  player.angle += turning * turnStep;

  const forwardX = Math.cos(player.angle) * forward * moveStep;
  const forwardY = Math.sin(player.angle) * forward * moveStep;
  const sideX = Math.cos(player.angle + Math.PI / 2) * strafe * moveStep;
  const sideY = Math.sin(player.angle + Math.PI / 2) * strafe * moveStep;
  tryMove(forwardX + sideX, forwardY + sideY);

  if (player.cooldown > 0) {
    player.cooldown -= deltaTime;
  }
  if (player.reloadCooldown > 0) {
    player.reloadCooldown -= deltaTime;
  }
  if (STATE.flashTimer > 0) {
    STATE.flashTimer -= deltaTime * 1.8;
  }
}

function updateEnemies(deltaTime) {
  enemies.forEach((enemy) => {
    if (enemy.attackCooldown > 0) {
      enemy.attackCooldown -= deltaTime;
    }

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0.8 && hasLineOfSight(enemy.x, enemy.y, player.x, player.y)) {
      const step = config.enemySpeed * deltaTime;
      const moveX = (dx / distance) * step;
      const moveY = (dy / distance) * step;

      if (!isWall(enemy.x + moveX, enemy.y)) {
        enemy.x += moveX;
      }
      if (!isWall(enemy.x, enemy.y + moveY)) {
        enemy.y += moveY;
      }
    }

    if (distance < 1.05 && enemy.attackCooldown <= 0) {
      enemy.attackCooldown = 0.9;
      player.health -= 12;
      STATE.flashTimer = 0.34;
      soundDamage();
      updateHud();
      if (player.health <= 0) {
        endGame(false);
      }
    }
  });
}

function fireWeapon() {
  if (!STATE.running || STATE.ended || player.cooldown > 0) {
    return;
  }

  if (player.ammo <= 0) {
    if (player.reloadCooldown <= 0) {
      player.reloadCooldown = 0.4;
      player.ammo = 18;
      playTone({ frequency: 90, slideTo: 200, duration: 0.15, type: "square", volume: 0.08 });
      updateHud();
    }
    return;
  }

  player.cooldown = 0.22;
  player.ammo -= 1;
  soundShoot();
  updateHud();

  let bestTarget = null;
  let bestDistance = Infinity;

  enemies.forEach((enemy) => {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.abs(normalizeAngle(Math.atan2(dy, dx) - player.angle));

    if (angle < 0.17 && distance < bestDistance && hasLineOfSight(player.x, player.y, enemy.x, enemy.y)) {
      bestDistance = distance;
      bestTarget = enemy;
    }
  });

  if (!bestTarget) {
    return;
  }

  bestTarget.health -= 24;
  soundHit();
  if (bestTarget.health <= 0) {
    enemies = enemies.filter((enemy) => enemy.id !== bestTarget.id);
    player.kills += 1;
    playTone({ frequency: 180, slideTo: 420, duration: 0.18, type: "triangle", volume: 0.07 });
    updateHud();
    if (enemies.length === 0) {
      endGame(true);
    }
  }
}

function endGame(win) {
  if (STATE.ended) {
    return;
  }

  STATE.ended = true;
  STATE.running = false;
  STATE.win = win;
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }

  if (win) {
    endStatusLabel.textContent = "Mission complete";
    endTitle.textContent = "Arena Cleared";
    endTitle.className = "win";
    endMessage.textContent = "You survived the run and wiped every hostile in the sector.";
    soundWin();
  } else {
    endStatusLabel.textContent = "Mission failed";
    endTitle.textContent = "You Were Overrun";
    endTitle.className = "lose";
    endMessage.textContent = "The corridor closed in before you could finish the sweep.";
    soundLose();
  }

  endOverlay.classList.remove("hidden");
  endOverlay.classList.add("visible");
}

function hideEndOverlay() {
  endOverlay.classList.add("hidden");
  endOverlay.classList.remove("visible");
}

function startGame() {
  setupAudio();
  if (audio.context && audio.context.state === "suspended") {
    audio.context.resume();
  }
  overlay.classList.add("hidden");
  overlay.classList.remove("visible");
  hideEndOverlay();
  STATE.running = true;
  STATE.ended = false;
  canvas.requestPointerLock?.();
}

function shareResult() {
  const resultText = STATE.win
    ? "I cleared the arena in Sector Rush, a browser-based Doom-like shooter."
    : "I got overrun in Sector Rush, a browser-based Doom-like shooter. Try beating my run.";
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(`${resultText} Play it in your browser.`)}`;
  window.open(shareUrl, "_blank", "noopener,noreferrer");
}

function handlePointerLockChange() {
  STATE.pointerActive = document.pointerLockElement === canvas;
}

function gameLoop(timestamp) {
  const deltaTime = Math.min(0.033, (timestamp - STATE.lastTime) / 1000 || 0.016);
  STATE.lastTime = timestamp;

  if (STATE.running && !STATE.ended) {
    updatePlayer(deltaTime);
    updateEnemies(deltaTime);
    if (touchState.fire) {
      fireWeapon();
    }
  }

  renderScene();
  requestAnimationFrame(gameLoop);
}

document.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    fireWeapon();
  }
  if (event.code === "KeyR") {
    player.ammo = 18;
    playTone({ frequency: 90, slideTo: 220, duration: 0.13, type: "square", volume: 0.08 });
    updateHud();
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

document.addEventListener("pointerlockchange", handlePointerLockChange);

document.addEventListener("mousemove", (event) => {
  if (!STATE.pointerActive || !STATE.running || STATE.ended) {
    return;
  }
  player.angle += event.movementX * 0.0032;
});

canvas.addEventListener("click", () => {
  if (!STATE.running && !STATE.ended) {
    startGame();
    return;
  }

  if (!STATE.pointerActive && !STATE.ended) {
    canvas.requestPointerLock?.();
  }
  fireWeapon();
});

startButton.addEventListener("click", () => {
  resetGame();
  startGame();
});

overlayStartButton.addEventListener("click", () => {
  resetGame();
  startGame();
});

restartButton.addEventListener("click", () => {
  resetGame();
  startGame();
});

muteButton.addEventListener("click", () => {
  setupAudio();
  setMuted(!audio.muted);
});

shareButton.addEventListener("click", shareResult);

setupMobilePadControls();

resetGame();
setMuted(false);
requestAnimationFrame(gameLoop);