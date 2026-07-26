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

const keys = { up: false, down: false, left: false, right: false };

const fieldBlocks = []; // {x, y, size, colorKey}
const MAX_FIELD_BLOCKS = 12;

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
  fieldBlocks.push({
    x: Math.random() * (CANVAS_W - size * 2) + size,
    y: Math.random() * (CANVAS_H - size * 2) + size,
    size,
    colorKey,
  });
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

function drawField() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // しばふの もよう
  ctx.fillStyle = "#7bc96f";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  for (let x = 0; x < CANVAS_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_H);
    ctx.stroke();
  }

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

  // プレイヤーの かげ
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + player.size / 2 + 3, player.size * 0.5, player.size * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();

  // プレイヤー（かおつき、つやを つけて まるみを だす）
  roundRect(ctx, player.x - player.size / 2, player.y - player.size / 2, player.size, player.size, 8);
  const playerGrad = ctx.createLinearGradient(
    player.x - player.size / 2,
    player.y - player.size / 2,
    player.x + player.size / 2,
    player.y + player.size / 2
  );
  playerGrad.addColorStop(0, "#ffe9b8");
  playerGrad.addColorStop(0.5, "#ffd166");
  playerGrad.addColorStop(1, "#dd9c1f");
  ctx.fillStyle = playerGrad;
  ctx.fill();
  ctx.strokeStyle = "#c98a1e";
  ctx.lineWidth = 2;
  ctx.stroke();
  // め
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(player.x - 5, player.y - 3, 2, 0, Math.PI * 2);
  ctx.arc(player.x + 5, player.y - 3, 2, 0, Math.PI * 2);
  ctx.fill();
  // くち
  ctx.beginPath();
  ctx.arc(player.x, player.y + 3, 4, 0, Math.PI);
  ctx.stroke();
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
  drawField();
  requestAnimationFrame(gameLoop);
}

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

// ---------- いえを たてる（プリセット） ----------
document.getElementById("house-btn").addEventListener("click", () => {
  buildHouse();
});

function buildHouse() {
  // ひつような ブロックが たりているか チェック
  for (const key in HOUSE_RECIPE) {
    if (state.inventory[key] < HOUSE_RECIPE[key]) {
      const c = COLORS.find((x) => x.key === key);
      showBuildMessage(`「${c.name}」の ブロックが あと ${HOUSE_RECIPE[key] - state.inventory[key]}こ たりないよ`);
      return;
    }
  }

  // グリッドの あいている 3x3の ばしょを さがす
  const spot = findEmptySpot(3, 3);
  if (!spot) {
    showBuildMessage("まちに あきスペースが ないよ。ブロックを けしてから ためしてね");
    return;
  }

  const pattern = [
    ["gray", "gray", "gray"],
    ["red", "blue", "red"],
    ["red", "red", "red"],
  ];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      state.grid[spot.row + r][spot.col + c] = pattern[r][c];
    }
  }
  for (const key in HOUSE_RECIPE) {
    state.inventory[key] -= HOUSE_RECIPE[key];
  }
  playTone(900, 0.2);
  showBuildMessage("🏠 いえが たった！すごいね！");
  renderInventory();
  renderBuildGrid();
  saveState();
}

function findEmptySpot(w, h) {
  for (let r = 0; r <= GRID_ROWS - h; r++) {
    for (let c = 0; c <= GRID_COLS - w; c++) {
      let ok = true;
      for (let rr = 0; rr < h && ok; rr++) {
        for (let cc = 0; cc < w && ok; cc++) {
          if (state.grid[r + rr][c + cc]) ok = false;
        }
      }
      if (ok) return { row: r, col: c };
    }
  }
  return null;
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
