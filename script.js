// ==========================================================
// レゴあつめ ＆ まちづくりゲーム
// 小学2年生でもあそべるように、かんたんな そうさにしています
// ==========================================================

// ---------- いろの じょうほう ----------
// key: いろの ID / name: がめんに でる なまえ / hex: いろ / unlockAt: なんこ あつめたら つかえるか
const COLORS = [
  { key: "red",    name: "あか",   hex: "#e63946", unlockAt: 0 },
  { key: "gray",   name: "はいいろ", hex: "#8d99ae", unlockAt: 0 },
  { key: "blue",   name: "あお",   hex: "#48cae4", unlockAt: 0 },
  { key: "yellow", name: "きいろ", hex: "#f9c74f", unlockAt: 0 },
  { key: "green",  name: "みどり", hex: "#43aa8b", unlockAt: 15 },
  { key: "purple", name: "むらさき", hex: "#9d4edd", unlockAt: 30 },
];

// いえを たてる のに ひつような ブロック（プリセット）
const HOUSE_RECIPE = { red: 4, gray: 3, blue: 1 };

const SAVE_KEY = "legoTownSave_v1";

// ---------- ぜんたいの じょうたい ----------
let state = {
  inventory: { red: 0, gray: 0, blue: 0, yellow: 0, green: 0, purple: 0 },
  totalCollected: 0,
  grid: makeEmptyGrid(14, 10), // build画面のマス目（null か いろkey）
  houses: [], // まちに たてた いえ {x, y, wallHex, roofHex, doorHex}
  soundOn: true,
};

function makeEmptyGrid(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

// ---------- いろを あかるく／くらくする（立体感を だすため） ----------
function shadeColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const amt = Math.round(2.55 * percent);
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0x00ff) + amt);
  const b = clamp((num & 0x0000ff) + amt);
  return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

// ---------- ほぞん／よみこみ ----------
function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // ほぞんできなくても ゲームは つづけられるようにする
    console.warn("ほぞんに しっぱいしました", e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const loaded = JSON.parse(raw);
      state = Object.assign(state, loaded);
    }
  } catch (e) {
    console.warn("よみこみに しっぱいしました", e);
  }
}

// ---------- おと（かんたんな ビープおん） ----------
let audioCtx = null;
function playTone(freq, duration) {
  if (!state.soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // おとが ならせない かんきょうでも むしできるようにする
  }
}

// ==========================================================
// がめんの きりかえ
// ==========================================================
const screens = {
  title: document.getElementById("title-screen"),
  collect: document.getElementById("collect-screen"),
  build: document.getElementById("build-screen"),
  inside: document.getElementById("inside-screen"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  if (name === "collect") {
    renderInventory();
    resumeCollectLoop();
  }
  if (name === "build") {
    renderInventory();
    renderBuildGrid();
    renderPalette();
  }
}

document.getElementById("start-btn").addEventListener("click", () => {
  showScreen("collect");
});
document.getElementById("to-build-btn").addEventListener("click", () => {
  showScreen("build");
});
document.getElementById("to-collect-btn").addEventListener("click", () => {
  showScreen("collect");
});

// ---------- サウンド トグル ----------
const soundBtn = document.getElementById("sound-btn");
soundBtn.addEventListener("click", () => {
  state.soundOn = !state.soundOn;
  soundBtn.textContent = state.soundOn ? "🔊" : "🔇";
  saveState();
});

// ---------- あつめる がめんの メッセージ ----------
let collectMessageTimer = null;
function showCollectMessage(msg) {
  const el = document.getElementById("collect-message");
  el.textContent = msg;
  clearTimeout(collectMessageTimer);
  collectMessageTimer = setTimeout(() => {
    el.textContent = "";
  }, 2500);
}

// ==========================================================
// インベントリ（もっている ブロック）の ひょうじ
// ==========================================================
function unlockedColors() {
  return COLORS.filter((c) => state.totalCollected >= c.unlockAt);
}

function renderInventory() {
  const html = unlockedColors()
    .map(
      (c) => `
      <div class="inv-badge">
        <span class="swatch" style="background:${c.hex}"></span>
        <span>${c.name} × ${state.inventory[c.key]}</span>
      </div>`
    )
    .join("");
  document.getElementById("inventory").innerHTML = html;
  document.getElementById("inventory-build").innerHTML = html;
}

// ==========================================================
// あつめる がめん（キャンバス ゲーム）
// ==========================================================
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const CANVAS_W = canvas.width;
const CANVAS_H = canvas.height;

const player = {
  x: CANVAS_W / 2,
  y: CANVAS_H / 2,
  size: 28,
  speed: 3.2,
};
let walkPhase = 0;
let facing = "down";

const keys = { up: false, down: false, left: false, right: false };

const fieldBlocks = []; // {x, y, size, colorKey}
const MAX_FIELD_BLOCKS = 12;

// ---------- まちの みちと きの いち（かざり） ----------
const ROADS = [
  { x: 288, y: 0, w: 64, h: CANVAS_H }, // たてのメインどおり
  { x: 40, y: 78, w: 560, h: 34 }, // うえの よこどおり
  { x: 40, y: 328, w: 560, h: 34 }, // したの よこどおり
];
const TREES = [
  { x: 170, y: 195 },
  { x: 470, y: 195 },
  { x: 170, y: 290 },
  { x: 470, y: 290 },
];

// ---------- いえを たてられる ばしょ（まちの くかく） ----------
const HOUSE_PLOTS = [
  { x: 90, y: 95 },
  { x: 230, y: 85 },
  { x: 410, y: 85 },
  { x: 550, y: 95 },
  { x: 90, y: 345 },
  { x: 230, y: 355 },
  { x: 410, y: 355 },
  { x: 550, y: 345 },
];
const HOUSE_W = 62;
const HOUSE_BODY_H = 42;
const HOUSE_ROOF_H = 26;
let currentHouse = null;

function spawnBlock() {
  if (fieldBlocks.length >= MAX_FIELD_BLOCKS) return;
  const palette = unlockedColors();
  // 赤(かべ)は 多めに でるように じゅうみを つける
  const weighted = [];
  palette.forEach((c) => {
    const weight = c.key === "red" ? 3 : c.key === "yellow" ? 2 : 1;
    for (let i = 0; i < weight; i++) weighted.push(c.key);
  });
  const colorKey = weighted[Math.floor(Math.random() * weighted.length)];
  const size = 22;

  let x, y;
  for (let tries = 0; tries < 10; tries++) {
    x = Math.random() * (CANVAS_W - size * 2) + size;
    y = Math.random() * (CANVAS_H - size * 2) + size;
    const tooCloseToHouse = state.houses.some((h) => Math.hypot(x - h.x, y - (h.y - HOUSE_BODY_H / 2)) < 55);
    const tooCloseToTree = TREES.some((t) => Math.hypot(x - t.x, y - t.y) < 34);
    if (!tooCloseToHouse && !tooCloseToTree) break;
  }

  fieldBlocks.push({ x, y, size, colorKey });
}

// さいしょに ブロックを まいておく
for (let i = 0; i < 8; i++) spawnBlock();
setInterval(() => {
  if (!screens.collect.classList.contains("hidden")) spawnBlock();
}, 1800);

function colorHex(key) {
  return COLORS.find((c) => c.key === key).hex;
}

function updatePlayer() {
  let dx = 0;
  let dy = 0;
  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  if (dx !== 0 && dy !== 0) {
    // ななめ移動が はやくなりすぎないように
    dx *= 0.7071;
    dy *= 0.7071;
  }
  const isMoving = dx !== 0 || dy !== 0;
  if (isMoving) {
    walkPhase += 0.25;
    if (Math.abs(dx) > Math.abs(dy)) {
      facing = dx < 0 ? "left" : "right";
    } else if (dy !== 0) {
      facing = dy < 0 ? "up" : "down";
    }
  } else {
    walkPhase = 0;
  }
  player.x += dx * player.speed;
  player.y += dy * player.speed;
  const half = player.size / 2;
  player.x = Math.max(half, Math.min(CANVAS_W - half, player.x));
  player.y = Math.max(half, Math.min(CANVAS_H - half, player.y));
}

function checkCollisions() {
  for (let i = fieldBlocks.length - 1; i >= 0; i--) {
    const b = fieldBlocks[i];
    const distX = player.x - b.x;
    const distY = player.y - b.y;
    const dist = Math.sqrt(distX * distX + distY * distY);
    if (dist < player.size / 2 + b.size / 2) {
      // かくとく！
      state.inventory[b.colorKey]++;
      state.totalCollected++;
      fieldBlocks.splice(i, 1);
      playTone(700, 0.12);
      renderInventory();
      saveState();
    }
  }
}

function drawTownBackground() {
  // しばふ
  ctx.fillStyle = "#7bc96f";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  for (let x = 0; x < CANVAS_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_H);
    ctx.stroke();
  }

  // みち
  ROADS.forEach((r) => {
    ctx.fillStyle = "#d9c9a0";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "#c2ae7e";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  });
  // まんなかどおりの てんせん
  ctx.strokeStyle = "#fff4d6";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2, 0);
  ctx.lineTo(CANVAS_W / 2, CANVAS_H);
  ctx.stroke();
  ctx.setLineDash([]);

  // き
  TREES.forEach((t) => drawTree(t.x, t.y));
}

function drawTree(x, y) {
  ctx.beginPath();
  ctx.ellipse(x, y + 26, 16, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fill();

  ctx.fillStyle = "#8a5a2b";
  roundRect(ctx, x - 4, y + 2, 8, 20, 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(x - 5, y - 12, 2, x, y - 8, 20);
  grad.addColorStop(0, "#7fd67f");
  grad.addColorStop(1, "#3f9142");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y - 8, 18, 0, Math.PI * 2);
  ctx.fill();
}

function drawHouse(h) {
  const halfW = HOUSE_W / 2;

  // かげ
  ctx.beginPath();
  ctx.ellipse(h.x, h.y + 4, halfW * 0.9, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fill();

  // かべ
  const wallGrad = ctx.createLinearGradient(h.x - halfW, h.y - HOUSE_BODY_H, h.x + halfW, h.y);
  wallGrad.addColorStop(0, shadeColor(h.wallHex, 22));
  wallGrad.addColorStop(1, shadeColor(h.wallHex, -18));
  ctx.fillStyle = wallGrad;
  roundRect(ctx, h.x - halfW, h.y - HOUSE_BODY_H, HOUSE_W, HOUSE_BODY_H, 4);
  ctx.fill();
  ctx.strokeStyle = shadeColor(h.wallHex, -35);
  ctx.lineWidth = 2;
  ctx.stroke();

  // やね
  const roofGrad = ctx.createLinearGradient(h.x, h.y - HOUSE_BODY_H - HOUSE_ROOF_H, h.x, h.y - HOUSE_BODY_H);
  roofGrad.addColorStop(0, shadeColor(h.roofHex, 25));
  roofGrad.addColorStop(1, shadeColor(h.roofHex, -15));
  ctx.fillStyle = roofGrad;
  ctx.beginPath();
  ctx.moveTo(h.x - halfW - 6, h.y - HOUSE_BODY_H);
  ctx.lineTo(h.x + halfW + 6, h.y - HOUSE_BODY_H);
  ctx.lineTo(h.x, h.y - HOUSE_BODY_H - HOUSE_ROOF_H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shadeColor(h.roofHex, -35);
  ctx.stroke();

  // まど
  ctx.fillStyle = "#eaf6ff";
  [-1, 1].forEach((side) => {
    const wx = h.x + side * (halfW * 0.55) - 6;
    roundRect(ctx, wx, h.y - HOUSE_BODY_H + 8, 12, 12, 2);
    ctx.fill();
  });
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  [-1, 1].forEach((side) => {
    const wx = h.x + side * (halfW * 0.55) - 6;
    ctx.strokeRect(wx, h.y - HOUSE_BODY_H + 8, 12, 12);
  });

  // ドア
  const doorGrad = ctx.createLinearGradient(h.x - 8, h.y - 20, h.x + 8, h.y);
  doorGrad.addColorStop(0, shadeColor(h.doorHex, 20));
  doorGrad.addColorStop(1, shadeColor(h.doorHex, -20));
  ctx.fillStyle = doorGrad;
  roundRect(ctx, h.x - 8, h.y - 20, 16, 20, 3);
  ctx.fill();
  ctx.fillStyle = "#fff2c2";
  ctx.beginPath();
  ctx.arc(h.x + 4, h.y - 9, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawPerson(x, y, size) {
  const bob = Math.sin(walkPhase) * 2.4;
  const legSwing = Math.sin(walkPhase) * 5;

  // じめんの かげ
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.62, size * 0.42, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();

  const headR = size * 0.28;
  const bodyTop = y - size * 0.18 + bob * 0.3;
  const bodyH = size * 0.5;
  const bodyW = size * 0.5;
  const headY = bodyTop - headR * 0.9;

  // あし
  ctx.strokeStyle = "#3a4a63";
  ctx.lineCap = "round";
  ctx.lineWidth = size * 0.16;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.12, bodyTop + bodyH);
  ctx.lineTo(x - size * 0.12 + legSwing * 0.4, bodyTop + bodyH + size * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.12, bodyTop + bodyH);
  ctx.lineTo(x + size * 0.12 - legSwing * 0.4, bodyTop + bodyH + size * 0.28);
  ctx.stroke();

  // うで
  ctx.strokeStyle = "#ffd9a8";
  ctx.lineWidth = size * 0.14;
  ctx.beginPath();
  ctx.moveTo(x - bodyW / 2, bodyTop + size * 0.08);
  ctx.lineTo(x - bodyW / 2 - legSwing * 0.3, bodyTop + size * 0.32);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + bodyW / 2, bodyTop + size * 0.08);
  ctx.lineTo(x + bodyW / 2 + legSwing * 0.3, bodyTop + size * 0.32);
  ctx.stroke();

  // からだ（シャツ）
  const shirtGrad = ctx.createLinearGradient(x - bodyW / 2, bodyTop, x + bodyW / 2, bodyTop + bodyH);
  shirtGrad.addColorStop(0, "#5cc4f2");
  shirtGrad.addColorStop(1, "#2f8fce");
  ctx.fillStyle = shirtGrad;
  roundRect(ctx, x - bodyW / 2, bodyTop, bodyW, bodyH, size * 0.16);
  ctx.fill();
  ctx.strokeStyle = "#1f6a9c";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // あたま
  const headGrad = ctx.createRadialGradient(x - headR * 0.3, headY - headR * 0.3, 1, x, headY, headR);
  headGrad.addColorStop(0, "#ffe9c9");
  headGrad.addColorStop(1, "#f4c98f");
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(x, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d9a45f";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // かみのけ
  ctx.fillStyle = "#5b3a29";
  ctx.beginPath();
  ctx.arc(x, headY - headR * 0.15, headR * 1.02, Math.PI, 0);
  ctx.fill();

  const faceShift = facing === "left" ? -2 : facing === "right" ? 2 : 0;
  // め
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x - 4 + faceShift, headY, 1.8, 0, Math.PI * 2);
  ctx.arc(x + 4 + faceShift, headY, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // くち
  ctx.beginPath();
  ctx.arc(x + faceShift, headY + 4, 3, 0, Math.PI);
  ctx.stroke();
}

function drawField() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  drawTownBackground();

  state.houses.forEach((h) => drawHouse(h));

  // ブロック（レゴふう：たちたい かんじの しかく＋うえに ポッチ）
  fieldBlocks.forEach((b) => {
    // じめんに おちる かげ
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + b.size / 2 + 2, b.size * 0.45, b.size * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fill();

    const base = colorHex(b.colorKey);
    const grad = ctx.createLinearGradient(b.x - b.size / 2, b.y - b.size / 2, b.x + b.size / 2, b.y + b.size / 2);
    grad.addColorStop(0, shadeColor(base, 32));
    grad.addColorStop(0.5, base);
    grad.addColorStop(1, shadeColor(base, -26));
    ctx.fillStyle = grad;
    roundRect(ctx, b.x - b.size / 2, b.y - b.size / 2, b.size, b.size, 5);
    ctx.fill();
    ctx.strokeStyle = shadeColor(base, -40);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ポッチ（つやを つけて まるく みせる）
    const studGrad = ctx.createRadialGradient(b.x - 1.5, b.y - b.size / 2 + 1.5, 0.5, b.x, b.y - b.size / 2 + 3, 5);
    studGrad.addColorStop(0, "rgba(255,255,255,0.95)");
    studGrad.addColorStop(1, shadeColor(base, -12));
    ctx.fillStyle = studGrad;
    ctx.beginPath();
    ctx.arc(b.x, b.y - b.size / 2 + 3, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // プレイヤー（人がた）
  drawPerson(player.x, player.y, player.size * 1.7);
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

let loopRunning = false;
function gameLoop() {
  if (screens.collect.classList.contains("hidden")) {
    loopRunning = false;
    return;
  }
  updatePlayer();
  checkCollisions();
  checkHouseDoors();
  drawField();
  requestAnimationFrame(gameLoop);
}

// ---------- いえの ドアに ふれたら なかに はいる ----------
function checkHouseDoors() {
  for (const h of state.houses) {
    const doorX = h.x;
    const doorY = h.y - 8;
    const dist = Math.hypot(player.x - doorX, player.y - doorY);
    if (dist < player.size / 2 + 12) {
      enterHouse(h);
      return;
    }
  }
}

function enterHouse(house) {
  currentHouse = house;
  const room = document.querySelector("#inside-screen .room");
  room.style.setProperty("--wall-color", shadeColor(house.wallHex, 55));
  playTone(600, 0.15);
  showScreen("inside");
}

function exitHouse() {
  if (currentHouse) {
    player.x = Math.max(player.size / 2, Math.min(CANVAS_W - player.size / 2, currentHouse.x));
    player.y = Math.min(CANVAS_H - player.size / 2, currentHouse.y + 40);
  }
  currentHouse = null;
  showScreen("collect");
}

document.getElementById("exit-house-btn").addEventListener("click", exitHouse);

function resumeCollectLoop() {
  if (!loopRunning) {
    loopRunning = true;
    requestAnimationFrame(gameLoop);
  }
}

// ---------- キーボード そうさ ----------
window.addEventListener("keydown", (e) => {
  setKey(e.key, true);
});
window.addEventListener("keyup", (e) => {
  setKey(e.key, false);
});

function setKey(key, isDown) {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      keys.up = isDown;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      keys.down = isDown;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      keys.left = isDown;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      keys.right = isDown;
      break;
  }
}

// ---------- タッチ／マウスの じゅうじボタン ----------
function bindHold(id, key) {
  const el = document.getElementById(id);
  const start = (e) => {
    e.preventDefault();
    keys[key] = true;
  };
  const end = (e) => {
    e.preventDefault();
    keys[key] = false;
  };
  el.addEventListener("touchstart", start, { passive: false });
  el.addEventListener("touchend", end);
  el.addEventListener("mousedown", start);
  el.addEventListener("mouseup", end);
  el.addEventListener("mouseleave", end);
}
bindHold("btn-up", "up");
bindHold("btn-down", "down");
bindHold("btn-left", "left");
bindHold("btn-right", "right");

// ==========================================================
// つくる がめん（グリッドに ブロックを おく）
// ==========================================================
const GRID_COLS = 14;
const GRID_ROWS = 10;
let selectedColor = "red";
let eraserMode = false;

function renderPalette() {
  const palette = document.getElementById("color-palette");
  palette.innerHTML = "";
  unlockedColors().forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "color-swatch-btn" + (selectedColor === c.key && !eraserMode ? " selected" : "");
    btn.style.background = `linear-gradient(155deg, ${shadeColor(c.hex, 32)}, ${c.hex} 50%, ${shadeColor(c.hex, -22)})`;
    btn.style.setProperty("--brick-dark", shadeColor(c.hex, -32));
    btn.title = c.name;
    btn.addEventListener("click", () => {
      selectedColor = c.key;
      eraserMode = false;
      renderPalette();
    });
    palette.appendChild(btn);
  });
}

document.getElementById("eraser-btn").addEventListener("click", () => {
  eraserMode = true;
  renderPalette();
});

function renderBuildGrid() {
  const gridEl = document.getElementById("build-grid");
  gridEl.innerHTML = "";
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const colorKey = state.grid[r][c];
      if (colorKey) {
        const hex = colorHex(colorKey);
        cell.classList.add("filled");
        cell.style.setProperty("--brick-color", hex);
        cell.style.setProperty("--brick-light", shadeColor(hex, 35));
        cell.style.setProperty("--brick-dark", shadeColor(hex, -30));
      }
      cell.addEventListener("click", () => onCellClick(r, c));
      gridEl.appendChild(cell);
    }
  }
}

function onCellClick(r, c) {
  const current = state.grid[r][c];
  if (eraserMode) {
    if (current) {
      state.inventory[current]++;
      state.grid[r][c] = null;
      playTone(300, 0.1);
    }
  } else {
    if (current) {
      showBuildMessage("そこには もう ブロックが あるよ");
      return;
    }
    if (state.inventory[selectedColor] <= 0) {
      showBuildMessage("その いろの ブロックが たりないよ！あつめてこよう");
      return;
    }
    state.inventory[selectedColor]--;
    state.grid[r][c] = selectedColor;
    playTone(500, 0.08);
  }
  renderInventory();
  renderBuildGrid();
  saveState();
}

let buildMessageTimer = null;
function showBuildMessage(msg) {
  const el = document.getElementById("build-message");
  el.textContent = msg;
  clearTimeout(buildMessageTimer);
  buildMessageTimer = setTimeout(() => {
    el.textContent = "";
  }, 2500);
}

// ---------- まちに いえを たてる ----------
document.getElementById("build-house-btn").addEventListener("click", () => {
  buildHouseOnField();
});

function findEmptyPlot() {
  return HOUSE_PLOTS.find((plot) => !state.houses.some((h) => h.x === plot.x && h.y === plot.y));
}

function buildHouseOnField() {
  for (const key in HOUSE_RECIPE) {
    if (state.inventory[key] < HOUSE_RECIPE[key]) {
      const c = COLORS.find((x) => x.key === key);
      showCollectMessage(`「${c.name}」の ブロックが あと ${HOUSE_RECIPE[key] - state.inventory[key]}こ たりないよ`);
      return;
    }
  }

  const plot = findEmptyPlot();
  if (!plot) {
    showCollectMessage("まちに もう あきちが ないよ！");
    return;
  }

  state.houses.push({
    x: plot.x,
    y: plot.y,
    wallHex: colorHex("red"),
    roofHex: colorHex("gray"),
    doorHex: colorHex("blue"),
  });
  for (const key in HOUSE_RECIPE) {
    state.inventory[key] -= HOUSE_RECIPE[key];
  }
  playTone(900, 0.2);
  showCollectMessage("🏠 まちに いえが たった！ドアから 入れるよ");
  renderInventory();
  saveState();
}

// ---------- ぜんぶ けす ----------
document.getElementById("clear-btn").addEventListener("click", () => {
  const ok = window.confirm("まちを ぜんぶ けしますか？（ブロックは かえってきます）");
  if (!ok) return;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const colorKey = state.grid[r][c];
      if (colorKey) {
        state.inventory[colorKey]++;
        state.grid[r][c] = null;
      }
    }
  }
  renderInventory();
  renderBuildGrid();
  saveState();
});

// ==========================================================
// しょきか
// ==========================================================
loadState();
soundBtn.textContent = state.soundOn ? "🔊" : "🔇";
renderInventory();
