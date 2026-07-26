// ==========================================================
// レゴあつめ ＆ まちづくり 3D
// three.js を つかった 本かくの 3D タウンゲーム
// ==========================================================

const COLORS = [
  { key: "red",    name: "あか",   hex: "#e63946", unlockAt: 0 },
  { key: "gray",   name: "はいいろ", hex: "#8d99ae", unlockAt: 0 },
  { key: "blue",   name: "あお",   hex: "#48cae4", unlockAt: 0 },
  { key: "yellow", name: "きいろ", hex: "#f9c74f", unlockAt: 0 },
  { key: "green",  name: "みどり", hex: "#43aa8b", unlockAt: 15 },
  { key: "purple", name: "むらさき", hex: "#9d4edd", unlockAt: 30 },
];

const HOUSE_RECIPE = { red: 4, gray: 3, blue: 1 };
const BUILDING_RECIPE = { gray: 6, blue: 5, yellow: 2 };
const SHOP_RECIPE = { yellow: 4, red: 3, blue: 2 };
const CAR_RECIPE = { red: 5, gray: 4, blue: 3 };

const SAVE_KEY = "legoTown3dSave_v1";

let state = {
  inventory: { red: 0, gray: 0, blue: 0, yellow: 0, green: 0, purple: 0 },
  totalCollected: 0,
  structures: [], // {type:'house'|'building'|'shop', x, z}
  cars: [], // {x, z}
  soundOn: true,
};

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const amt = Math.round(2.55 * percent);
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0x00ff) + amt);
  const b = clamp((num & 0x0000ff) + amt);
  return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function col(hex) {
  return new THREE.Color(hex);
}

function colorHex(key) {
  return COLORS.find((c) => c.key === key).hex;
}

function unlockedColors() {
  return COLORS.filter((c) => state.totalCollected >= c.unlockAt);
}

// ---------- ほぞん／よみこみ ----------
function saveState() {
  try {
    const toSave = {
      inventory: state.inventory,
      totalCollected: state.totalCollected,
      structures: state.structures,
      cars: state.cars,
      soundOn: state.soundOn,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSave));
  } catch (e) {
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

// ---------- おと ----------
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
const titleScreen = document.getElementById("title-screen");
const gameScreen = document.getElementById("game-screen");
const soundBtn = document.getElementById("sound-btn");
const exitHouseBtn = document.getElementById("exit-house-btn");
const exitCarBtn = document.getElementById("exit-car-btn");
const buildButtons = [
  document.getElementById("build-house-btn"),
  document.getElementById("build-building-btn"),
  document.getElementById("build-shop-btn"),
  document.getElementById("build-car-btn"),
];

let mode = "town"; // 'town' | 'inside'

function updateHud() {
  const driving = !!drivingCar;
  buildButtons.forEach((b) => b.classList.toggle("hidden", mode === "inside"));
  exitHouseBtn.classList.toggle("hidden", mode !== "inside");
  exitCarBtn.classList.toggle("hidden", mode !== "town" || !driving);
}

let messageTimer = null;
function showMessage(msg) {
  const el = document.getElementById("game-message");
  el.textContent = msg;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    el.textContent = "";
  }, 2600);
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
}

soundBtn.addEventListener("click", () => {
  state.soundOn = !state.soundOn;
  soundBtn.textContent = state.soundOn ? "🔊" : "🔇";
  saveState();
});

// ==========================================================
// three.js の きほん セットアップ
// ==========================================================
const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const SKY_COLOR = 0x8ed1fc;
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, 34, 85);

const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xfff4dd, 0.85);
sunLight.position.set(30, 45, -20);
scene.add(sunLight);

function resizeRenderer() {
  const w = canvas.clientWidth || 900;
  const h = canvas.clientHeight || Math.round((w * 9) / 16);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resizeRenderer).observe(canvas);
window.addEventListener("resize", resizeRenderer);

// ---------- そら（たいよう・くも） ----------
const skyGroup = new THREE.Group();
scene.add(skyGroup);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(3, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff2a8 })
);
skyGroup.add(sun);

const clouds = [];
for (let i = 0; i < 6; i++) {
  const cloud = new THREE.Group();
  const puffCount = 2 + Math.floor(Math.random() * 2);
  for (let p = 0; p < puffCount; p++) {
    const puff = new THREE.Mesh(
      new THREE.BoxGeometry(3 + Math.random() * 2, 1, 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 })
    );
    puff.position.set(p * 2.4 - puffCount, 0, 0);
    cloud.add(puff);
  }
  cloud.userData.baseX = -30 + Math.random() * 60;
  cloud.userData.baseZ = -30 + Math.random() * 60;
  cloud.userData.baseY = 16 + Math.random() * 8;
  cloud.userData.speed = 0.3 + Math.random() * 0.3;
  cloud.userData.phase = Math.random() * Math.PI * 2;
  skyGroup.add(cloud);
  clouds.push(cloud);
}

// ==========================================================
// フィールド（まち）の きほん サイズ
// ==========================================================
const FIELD_HALF_X = 34;
const FIELD_HALF_Z = 30;
const ROAD_HALF_W = 3.2;

const PLOT_COLS = [-16, 16];
const PLOT_ROWS = [-22, -11, 0, 11, 22];
const PLOTS = [];
PLOT_COLS.forEach((x) => {
  PLOT_ROWS.forEach((z) => {
    PLOTS.push({ x, z, doorSign: x < 0 ? 1 : -1 });
  });
});

const CAR_SPOTS = [
  { x: 0, z: -24 },
  { x: 0, z: -8 },
  { x: 0, z: 8 },
  { x: 0, z: 24 },
];

const townGroup = new THREE.Group();
scene.add(townGroup);

// ---------- じめん ----------
const farGround = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshLambertMaterial({ color: 0x6fb85f })
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -0.02;
townGroup.add(farGround);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(FIELD_HALF_X * 2, FIELD_HALF_Z * 2, 20, 18),
  new THREE.MeshLambertMaterial({ color: 0x7bc96f })
);
ground.rotation.x = -Math.PI / 2;
townGroup.add(ground);

// うすい グリッドせん（しばふの もよう）
const gridHelper = new THREE.GridHelper(FIELD_HALF_X * 2, 20, 0xffffff, 0xffffff);
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.12;
gridHelper.position.y = 0.01;
townGroup.add(gridHelper);

// ---------- みち ----------
const roadMat = new THREE.MeshLambertMaterial({ color: 0xd9c9a0 });
const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF_W * 2, FIELD_HALF_Z * 2), roadMat);
mainRoad.rotation.x = -Math.PI / 2;
mainRoad.position.y = 0.015;
townGroup.add(mainRoad);

for (let i = -1; i <= 1; i += 2) {
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xfff4d6 })
  );
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.02, 0);
  // ダッシュせんを くりかえし はいち
  for (let z = -FIELD_HALF_Z + 1; z < FIELD_HALF_Z; z += 3) {
    const dash = line.clone();
    dash.position.z = z;
    townGroup.add(dash);
  }
  break;
}

// ---------- き ----------
function isInRoadZone(x) {
  return Math.abs(x) < ROAD_HALF_W + 2;
}
function isInPlotZone(x) {
  return PLOT_COLS.some((px) => Math.abs(x - px) < 5);
}

function createTree(x, z) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.3, 1.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a5a2b })
  );
  trunk.position.y = 0.7;
  group.add(trunk);
  const canopyColors = [0x4caf50, 0x66bb6a, 0x388e3c];
  for (let i = 0; i < 2; i++) {
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.6 - i * 0.4, 1.1 - i * 0.2, 1.6 - i * 0.4),
      new THREE.MeshLambertMaterial({ color: canopyColors[i % canopyColors.length] })
    );
    canopy.position.y = 1.6 + i * 0.8;
    group.add(canopy);
  }
  group.position.set(x, 0, z);
  townGroup.add(group);
}

for (let i = 0; i < 16; i++) {
  let x, z;
  let tries = 0;
  do {
    x = (Math.random() * 2 - 1) * (FIELD_HALF_X - 3);
    z = (Math.random() * 2 - 1) * (FIELD_HALF_Z - 3);
    tries++;
  } while ((isInRoadZone(x) || isInPlotZone(x)) && tries < 20);
  if (tries < 20) createTree(x, z);
}

// ==========================================================
// キャラクター（マインクラフトふう じんけい）
// ==========================================================
function createHumanoid(opts) {
  const skin = opts.skin || "#f4c98f";
  const shirt = opts.shirt || "#5cc4f2";
  const pants = opts.pants || "#3a4a63";
  const scale = opts.scale || 1;

  const group = new THREE.Group();

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshLambertMaterial({ color: col(skin) })
  );
  head.position.y = 1.75;
  group.add(head);

  // め
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2b2b2b });
  [-0.12, 0.12].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
    eye.position.set(ex, 1.78, 0.26);
    group.add(eye);
  });

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.75, 0.3),
    new THREE.MeshLambertMaterial({ color: col(shirt) })
  );
  torso.position.y = 1.125;
  group.add(torso);

  function makeLimb(color, w, h, d) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col(color) }));
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    return pivot;
  }

  const leftArm = makeLimb(shirt, 0.2, 0.75, 0.2);
  leftArm.position.set(-0.35, 1.45, 0);
  group.add(leftArm);
  const rightArm = makeLimb(shirt, 0.2, 0.75, 0.2);
  rightArm.position.set(0.35, 1.45, 0);
  group.add(rightArm);

  const leftLeg = makeLimb(pants, 0.22, 0.75, 0.22);
  leftLeg.position.set(-0.14, 0.75, 0);
  group.add(leftLeg);
  const rightLeg = makeLimb(pants, 0.22, 0.75, 0.22);
  rightLeg.position.set(0.14, 0.75, 0);
  group.add(rightLeg);

  group.scale.setScalar(scale);

  return {
    group,
    animate(phase, moving) {
      const swing = moving ? Math.sin(phase) * 0.9 : 0;
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing;
      rightArm.rotation.x = swing;
    },
  };
}

// ---------- プレイヤー ----------
const playerRig = createHumanoid({ skin: "#f4c98f", shirt: "#5cc4f2", pants: "#3a4a63", scale: 1 });
townGroup.add(playerRig.group);

const player = {
  x: 0,
  z: 4,
  facing: 0,
  speed: 5.5,
};

let walkPhase = 0;
const keys = { up: false, down: false, left: false, right: false };

function applyMovement(entityPos, speed, delta, onFacing) {
  let dx = 0;
  let dz = 0;
  if (keys.up) dz -= 1;
  if (keys.down) dz += 1;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  const moving = dx !== 0 || dz !== 0;
  if (moving) {
    const len = Math.hypot(dx, dz);
    dx /= len;
    dz /= len;
    entityPos.x += dx * speed * delta;
    entityPos.z += dz * speed * delta;
    onFacing(Math.atan2(dx, dz));
  }
  return moving;
}

// ==========================================================
// たてもの（いえ・ビル・おみせ）
// ==========================================================
function makeWindowTexture(rows, cols, wallHex, litHex) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx2d = c.getContext("2d");
  ctx2d.fillStyle = wallHex;
  ctx2d.fillRect(0, 0, 128, 128);
  ctx2d.fillStyle = litHex;
  const cellW = 128 / cols;
  const cellH = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const pad = cellW * 0.22;
      ctx2d.fillRect(cIdx * cellW + pad, r * cellH + pad, cellW - pad * 2, cellH - pad * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function makeSignTexture(text, bg, fg) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx2d = c.getContext("2d");
  ctx2d.fillStyle = bg;
  ctx2d.fillRect(0, 0, 256, 96);
  ctx2d.fillStyle = fg;
  ctx2d.font = "bold 48px sans-serif";
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  ctx2d.fillText(text, 128, 52);
  return new THREE.CanvasTexture(c);
}

function addDoorAndWindows(group, halfW, bodyH, doorHex, faceSign) {
  const doorMat = new THREE.MeshLambertMaterial({ color: col(doorHex) });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), doorMat);
  door.position.set(0, 0.75, faceSign * (1.51));
  if (faceSign < 0) door.rotation.y = Math.PI;
  group.add(door);

  const knobMat = new THREE.MeshBasicMaterial({ color: 0xfff2c2 });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), knobMat);
  knob.position.set(0.28, 0.75, faceSign * 1.56);
  group.add(knob);

  const winMat = new THREE.MeshLambertMaterial({ color: 0xeaf6ff });
  [-1, 1].forEach((side) => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), winMat);
    win.position.set(side * halfW * 0.55, bodyH * 0.7, faceSign * 1.51);
    if (faceSign < 0) win.rotation.y = Math.PI;
    group.add(win);
  });

  return new THREE.Vector3(0, 0, faceSign * 1.6);
}

const HOUSE_PALETTES = [
  { wall: "#e63946", roof: "#8d99ae", door: "#48cae4" },
  { wall: "#f9c74f", roof: "#5b3a29", door: "#e63946" },
  { wall: "#48cae4", roof: "#3a3a3a", door: "#f9c74f" },
  { wall: "#9d4edd", roof: "#5b3a29", door: "#f9c74f" },
  { wall: "#43aa8b", roof: "#8d99ae", door: "#e63946" },
  { wall: "#f28482", roof: "#5b3a29", door: "#48cae4" },
];
const BUILDING_PALETTES = [
  { wall: "#8d99ae", win: "#48cae4" },
  { wall: "#adb5bd", win: "#f9c74f" },
  { wall: "#6c757d", win: "#e63946" },
  { wall: "#9d8189", win: "#48cae4" },
];
const SHOP_PALETTES = [
  { wall: "#f9c74f", awning: "#e63946", text: "おみせ" },
  { wall: "#ffb4a2", awning: "#48cae4", text: "パンや" },
  { wall: "#cdb4db", awning: "#f9c74f", text: "おかしや" },
  { wall: "#a3d9a5", awning: "#e63946", text: "やおや" },
];

function createHouseMesh(palette) {
  const p = palette || HOUSE_PALETTES[0];
  const wallHex = p.wall;
  const roofHex = p.roof;
  const doorHex = p.door;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3, 2.2, 3),
    new THREE.MeshLambertMaterial({ color: col(wallHex) })
  );
  body.position.y = 1.1;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.35, 1.6, 4),
    new THREE.MeshLambertMaterial({ color: col(roofHex) })
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.2 + 0.8;
  group.add(roof);

  const doorLocal = addDoorAndWindows(group, 1.5, 2.2, doorHex, 1);

  return { group, doorLocal, wallHex, label: "いえ" };
}

function createBuildingMesh(palette) {
  const p = palette || BUILDING_PALETTES[0];
  const wallHex = p.wall;
  const winHex = p.win;
  const doorHex = p.win;
  const group = new THREE.Group();

  const w = 3.4;
  const h = 6.5;
  const d = 3;
  const plainMat = new THREE.MeshLambertMaterial({ color: col(wallHex) });
  const winTex = makeWindowTexture(5, 3, wallHex, winHex);
  const winMat = new THREE.MeshLambertMaterial({ map: winTex });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [plainMat, plainMat, plainMat, plainMat, winMat, plainMat]);
  body.position.y = h / 2;
  group.add(body);

  const roofCap = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2),
    new THREE.MeshLambertMaterial({ color: col(shadeColor(wallHex, -20)) })
  );
  roofCap.position.y = h + 0.15;
  group.add(roofCap);

  const doorLocal = addDoorAndWindows(group, w / 2, h, doorHex, 1);

  return { group, doorLocal, wallHex, label: "ビル" };
}

function createShopMesh(palette) {
  const p = palette || SHOP_PALETTES[0];
  const wallHex = p.wall;
  const awningHex = p.awning;
  const doorHex = "#48cae4";
  const group = new THREE.Group();

  const w = 3.6;
  const h = 2.3;
  const d = 3;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: col(wallHex) })
  );
  body.position.y = h / 2;
  group.add(body);

  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.4, 0.35, 1.1),
    new THREE.MeshLambertMaterial({ color: col(awningHex) })
  );
  awning.position.set(0, h - 0.1, d / 2 + 0.4);
  group.add(awning);

  const signTex = makeSignTexture(p.text, "#ffffff", awningHex);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.6),
    new THREE.MeshLambertMaterial({ map: signTex })
  );
  sign.position.set(0, h + 0.5, d / 2 + 0.05);
  group.add(sign);

  const doorLocal = addDoorAndWindows(group, w / 2, h, doorHex, 1);

  return { group, doorLocal, wallHex, label: "おみせ" };
}

const STRUCTURE_FACTORIES = {
  house: createHouseMesh,
  building: createBuildingMesh,
  shop: createShopMesh,
};
const STRUCTURE_PALETTES = {
  house: HOUSE_PALETTES,
  building: BUILDING_PALETTES,
  shop: SHOP_PALETTES,
};
const STRUCTURE_RECIPES = {
  house: HOUSE_RECIPE,
  building: BUILDING_RECIPE,
  shop: SHOP_RECIPE,
};

const placedStructures = []; // {type, x, z, doorWorld, wallHex, paletteIndex}

function pickPaletteIndex(type) {
  const palettes = STRUCTURE_PALETTES[type];
  const used = placedStructures.filter((s) => s.type === type).map((s) => s.paletteIndex);
  const all = palettes.map((_, i) => i);
  const unused = all.filter((i) => !used.includes(i));
  const pool = unused.length ? unused : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

function placeStructureMesh(type, x, z, paletteIndex) {
  const palettes = STRUCTURE_PALETTES[type];
  const idx = paletteIndex != null ? paletteIndex : pickPaletteIndex(type);
  const built = STRUCTURE_FACTORIES[type](palettes[idx]);
  built.group.position.set(x, 0, z);
  townGroup.add(built.group);
  const doorWorld = built.doorLocal.clone().add(new THREE.Vector3(x, 0, z));
  placedStructures.push({ type, x, z, doorWorld, wallHex: built.wallHex, label: built.label, paletteIndex: idx });
  return idx;
}

function findEmptyPlot() {
  return PLOTS.find((plot) => !placedStructures.some((s) => s.x === plot.x && s.z === plot.z));
}

function attemptBuild(type, buttonLabel) {
  const recipe = STRUCTURE_RECIPES[type];
  for (const key in recipe) {
    if (state.inventory[key] < recipe[key]) {
      const c = COLORS.find((x) => x.key === key);
      showMessage(`「${c.name}」の ブロックが あと ${recipe[key] - state.inventory[key]}こ たりないよ`);
      return;
    }
  }
  const plot = findEmptyPlot();
  if (!plot) {
    showMessage("まちに もう あきちが ないよ！");
    return;
  }
  const paletteIndex = placeStructureMesh(type, plot.x, plot.z);
  state.structures.push({ type, x: plot.x, z: plot.z, paletteIndex });
  for (const key in recipe) state.inventory[key] -= recipe[key];
  playTone(900, 0.2);
  showMessage(`${buttonLabel} が まちに たった！ドアから 入れるよ`);
  renderInventory();
  saveState();
}

document.getElementById("build-house-btn").addEventListener("click", () => attemptBuild("house", "🏠 いえ"));
document.getElementById("build-building-btn").addEventListener("click", () => attemptBuild("building", "🏢 ビル"));
document.getElementById("build-shop-btn").addEventListener("click", () => attemptBuild("shop", "🏪 おみせ"));

// ==========================================================
// くるま
// ==========================================================
function createCarMesh(bodyHex) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 3.1),
    new THREE.MeshLambertMaterial({ color: col(bodyHex) })
  );
  body.position.y = 0.55;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.5, 1.5),
    new THREE.MeshLambertMaterial({ color: col("#48cae4") })
  );
  cabin.position.set(0, 1.1, -0.25);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 14);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  [
    [-0.85, -1.0],
    [0.85, -1.0],
    [-0.85, 1.0],
    [0.85, 1.0],
  ].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.35, z);
    group.add(wheel);
  });

  return group;
}

const CAR_COLORS = ["#e63946", "#48cae4", "#f9c74f", "#43aa8b"];
const placedCars = []; // {x, z, mesh, facing}

function findEmptyCarSpot() {
  return CAR_SPOTS.find((spot) => !placedCars.some((c) => c.x === spot.x && c.z === spot.z));
}

function pickCarColor() {
  const used = placedCars.map((c) => c.colorIndex);
  const all = CAR_COLORS.map((_, i) => i);
  const unused = all.filter((i) => !used.includes(i));
  const pool = unused.length ? unused : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

function attemptBuildCar() {
  for (const key in CAR_RECIPE) {
    if (state.inventory[key] < CAR_RECIPE[key]) {
      const c = COLORS.find((x) => x.key === key);
      showMessage(`「${c.name}」の ブロックが あと ${CAR_RECIPE[key] - state.inventory[key]}こ たりないよ`);
      return;
    }
  }
  const spot = findEmptyCarSpot();
  if (!spot) {
    showMessage("もう くるまを おく ばしょが ないよ！");
    return;
  }
  const colorIndex = spawnCar(spot.x, spot.z);
  state.cars.push({ x: spot.x, z: spot.z, colorIndex });
  for (const key in CAR_RECIPE) state.inventory[key] -= CAR_RECIPE[key];
  playTone(500, 0.15);
  playTone(750, 0.15);
  showMessage("🚗 くるまが できた！ちかづくと のれるよ");
  renderInventory();
  saveState();
}

function spawnCar(x, z, colorIndex) {
  const idx = colorIndex != null ? colorIndex : pickCarColor();
  const mesh = createCarMesh(CAR_COLORS[idx]);
  mesh.position.set(x, 0, z);
  townGroup.add(mesh);
  placedCars.push({ x, z, mesh, facing: 0, colorIndex: idx });
  return idx;
}

document.getElementById("build-car-btn").addEventListener("click", attemptBuildCar);

let drivingCar = null;

function boardCar(car) {
  drivingCar = car;
  playerRig.group.visible = false;
  playTone(400, 0.1);
  updateHud();
}

function exitCarFn() {
  if (!drivingCar) return;
  const car = drivingCar;
  player.x = car.x - Math.sin(car.facing) * 2.8;
  player.z = car.z - Math.cos(car.facing) * 2.8;
  player.x = Math.max(-FIELD_HALF_X + 1, Math.min(FIELD_HALF_X - 1, player.x));
  player.z = Math.max(-FIELD_HALF_Z + 1, Math.min(FIELD_HALF_Z - 1, player.z));
  playerRig.group.visible = true;
  drivingCar = null;
  updateHud();
}
exitCarBtn.addEventListener("click", exitCarFn);

// ==========================================================
// たてもの／くるまの じょうたい を さいこうちく（よみこみ時）
// ==========================================================
function rebuildFromState() {
  state.structures.forEach((s) => placeStructureMesh(s.type, s.x, s.z, s.paletteIndex));
  state.cars.forEach((c) => spawnCar(c.x, c.z, c.colorIndex));
}

// ==========================================================
// ブロック（あつめる アイテム）
// ==========================================================
const fieldBlocks = []; // {mesh, colorKey, baseY}
const MAX_FIELD_BLOCKS = 16;

function isNearAnyStructureOrCar(x, z, radius) {
  if (PLOTS.some((p) => Math.hypot(x - p.x, z - p.z) < radius)) return true;
  if (CAR_SPOTS.some((p) => Math.hypot(x - p.x, z - p.z) < radius)) return true;
  return false;
}

function spawnBlock() {
  if (fieldBlocks.length >= MAX_FIELD_BLOCKS) return;
  const palette = unlockedColors();
  const weighted = [];
  palette.forEach((c) => {
    const weight = c.key === "red" ? 3 : c.key === "yellow" ? 2 : 1;
    for (let i = 0; i < weight; i++) weighted.push(c.key);
  });
  const colorKey = weighted[Math.floor(Math.random() * weighted.length)];

  let x, z;
  let tries = 0;
  do {
    x = (Math.random() * 2 - 1) * (FIELD_HALF_X - 2);
    z = (Math.random() * 2 - 1) * (FIELD_HALF_Z - 2);
    tries++;
  } while (isNearAnyStructureOrCar(x, z, 4.5) && tries < 20);

  const hex = colorHex(colorKey);
  const group = new THREE.Group();
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshLambertMaterial({ color: col(hex) })
  );
  group.add(cube);
  const stud = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.14, 10),
    new THREE.MeshLambertMaterial({ color: col(shadeColor(hex, -10)) })
  );
  stud.position.y = 0.37;
  group.add(stud);
  group.position.set(x, 0.5, z);
  townGroup.add(group);

  fieldBlocks.push({ group, colorKey, baseY: 0.5, spin: Math.random() * Math.PI * 2 });
}

for (let i = 0; i < 10; i++) spawnBlock();
setInterval(() => {
  if (mode === "town") spawnBlock();
}, 1600);

function checkBlockCollisions(pos) {
  for (let i = fieldBlocks.length - 1; i >= 0; i--) {
    const b = fieldBlocks[i];
    const dist = Math.hypot(pos.x - b.group.position.x, pos.z - b.group.position.z);
    if (dist < 1.1) {
      state.inventory[b.colorKey]++;
      state.totalCollected++;
      townGroup.remove(b.group);
      fieldBlocks.splice(i, 1);
      playTone(700, 0.12);
      renderInventory();
      saveState();
    }
  }
}

// ==========================================================
// たてものの ドアと くるまへの アクセス はんてい
// ==========================================================
function checkDoors(pos) {
  for (const s of placedStructures) {
    const dist = Math.hypot(pos.x - s.doorWorld.x, pos.z - s.doorWorld.z);
    if (dist < 1.6) {
      enterBuilding(s);
      return;
    }
  }
}

function checkCarBoarding(pos) {
  for (const c of placedCars) {
    const dist = Math.hypot(pos.x - c.x, pos.z - c.z);
    if (dist < 2.1) {
      boardCar(c);
      return;
    }
  }
}

// ==========================================================
// たてものの なか（3D インテリア）
// ==========================================================
const insideGroup = new THREE.Group();
insideGroup.visible = false;
scene.add(insideGroup);

const insideWallMat = new THREE.MeshLambertMaterial({ color: 0xf6e3c6 });
{
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 7),
    new THREE.MeshLambertMaterial({ color: 0xa4753f })
  );
  floor.rotation.x = -Math.PI / 2;
  insideGroup.add(floor);

  const planks = new THREE.GridHelper(9, 12, 0x8a5a2b, 0x8a5a2b);
  planks.position.y = 0.01;
  insideGroup.add(planks);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 0.2), insideWallMat);
  backWall.position.set(0, 2.25, -3.6);
  insideGroup.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.5, 7), insideWallMat);
  leftWall.position.set(-4.4, 2.25, 0);
  insideGroup.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.5, 7), insideWallMat);
  rightWall.position.set(4.4, 2.25, 0);
  insideGroup.add(rightWall);

  const window1 = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.4),
    new THREE.MeshLambertMaterial({ color: 0xbfe8ff })
  );
  window1.position.set(2.2, 2.7, -3.49);
  insideGroup.add(window1);

  const picture = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.7),
    new THREE.MeshLambertMaterial({ color: 0xffe08a })
  );
  picture.position.set(-2.3, 2.6, -3.49);
  insideGroup.add(picture);

  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.6, 3.2),
    new THREE.MeshLambertMaterial({ color: 0x5a92c9 })
  );
  bed.position.set(-3, 0.3, -1.6);
  insideGroup.add(bed);
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.25, 0.8),
    new THREE.MeshLambertMaterial({ color: 0xfffdf5 })
  );
  pillow.position.set(-3, 0.72, -2.9);
  insideGroup.add(pillow);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.7, 1.4),
    new THREE.MeshLambertMaterial({ color: 0xa4753f })
  );
  table.position.set(2.6, 0.35, 1.6);
  insideGroup.add(table);

  const rug = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 0.05, 24),
    new THREE.MeshLambertMaterial({ color: 0xe06666 })
  );
  rug.position.set(0, 0.03, 1.2);
  insideGroup.add(rug);

  const potMat = new THREE.MeshLambertMaterial({ color: 0xa4753f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.4, 10), potMat);
  pot.position.set(3.6, 0.2, -2.8);
  insideGroup.add(pot);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10), leafMat);
  leaf.position.set(3.6, 0.75, -2.8);
  insideGroup.add(leaf);
}

let currentBuilding = null;
let outsidePlayerPos = { x: 0, z: 4 };

function enterBuilding(structure) {
  currentBuilding = structure;
  outsidePlayerPos = { x: player.x, z: player.z };
  insideWallMat.color = col(shadeColor(structure.wallHex, 55));
  townGroup.visible = false;
  insideGroup.visible = true;
  mode = "inside";
  player.x = 0;
  player.z = 2.6;
  playTone(600, 0.15);
  showMessage(`${structure.label} の なかに はいったよ`);
  updateHud();
}

function exitBuilding() {
  if (currentBuilding) {
    const angle = Math.atan2(currentBuilding.doorWorld.x - currentBuilding.x, currentBuilding.doorWorld.z - currentBuilding.z);
    player.x = currentBuilding.doorWorld.x + Math.sin(angle) * 1.6;
    player.z = currentBuilding.doorWorld.z + Math.cos(angle) * 1.6;
  }
  currentBuilding = null;
  townGroup.visible = true;
  insideGroup.visible = false;
  mode = "town";
  updateHud();
}
exitHouseBtn.addEventListener("click", exitBuilding);

// ==========================================================
// NPC（ひと・どうぶつ）
// ==========================================================
function createQuadruped(dims, colors) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(dims.bw, dims.bh, dims.bd),
    new THREE.MeshLambertMaterial({ color: col(colors.body) })
  );
  body.position.y = dims.legH + dims.bh / 2;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(dims.headSize, dims.headSize, dims.headSize),
    new THREE.MeshLambertMaterial({ color: col(colors.head || colors.body) })
  );
  head.position.set(0, dims.legH + dims.bh * 0.7, dims.bd / 2 + dims.headSize * 0.3);
  group.add(head);

  const legPivots = [];
  const legPositions = [
    [-dims.bw / 2 + dims.legW / 2, dims.bd / 2 - dims.legW / 2],
    [dims.bw / 2 - dims.legW / 2, dims.bd / 2 - dims.legW / 2],
    [-dims.bw / 2 + dims.legW / 2, -dims.bd / 2 + dims.legW / 2],
    [dims.bw / 2 - dims.legW / 2, -dims.bd / 2 + dims.legW / 2],
  ];
  legPositions.forEach(([lx, lz]) => {
    const pivot = new THREE.Group();
    pivot.position.set(lx, dims.legH, lz);
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(dims.legW, dims.legH, dims.legW),
      new THREE.MeshLambertMaterial({ color: col(colors.leg || colors.body) })
    );
    leg.position.y = -dims.legH / 2;
    pivot.add(leg);
    group.add(pivot);
    legPivots.push(pivot);
  });

  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(dims.legW * 0.7, dims.legW * 0.7, dims.bd * 0.4),
    new THREE.MeshLambertMaterial({ color: col(colors.body) })
  );
  tail.position.set(0, dims.legH + dims.bh * 0.6, -dims.bd / 2 - dims.bd * 0.15);
  group.add(tail);

  return {
    group,
    animate(phase, moving) {
      const swing = moving ? Math.sin(phase) * 0.6 : 0;
      legPivots[0].rotation.x = swing;
      legPivots[3].rotation.x = swing;
      legPivots[1].rotation.x = -swing;
      legPivots[2].rotation.x = -swing;
    },
  };
}

function createCow() {
  return createQuadruped(
    { bw: 1.1, bh: 0.85, bd: 1.7, legW: 0.22, legH: 0.55, headSize: 0.55 },
    { body: "#f7f5ef", head: "#3a3a3a", leg: "#3a3a3a" }
  );
}
function createDog() {
  return createQuadruped(
    { bw: 0.55, bh: 0.45, bd: 0.95, legW: 0.16, legH: 0.35, headSize: 0.35 },
    { body: "#a0662f" }
  );
}
function createCat() {
  return createQuadruped(
    { bw: 0.4, bh: 0.35, bd: 0.7, legW: 0.12, legH: 0.28, headSize: 0.28 },
    { body: "#8a8a8a" }
  );
}

function createBird() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 10),
    new THREE.MeshLambertMaterial({ color: col("#e63946") })
  );
  group.add(body);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.16, 6),
    new THREE.MeshLambertMaterial({ color: col("#f9c74f") })
  );
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0, 0.25);
  group.add(beak);
  const wingMat = new THREE.MeshLambertMaterial({ color: col("#c1121f") });
  const wingPivots = [];
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, 0.05, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.22), wingMat);
    wing.position.x = side * 0.17;
    pivot.add(wing);
    group.add(pivot);
    wingPivots.push(pivot);
  });
  return {
    group,
    isFlyer: true,
    animate(phase) {
      const flap = Math.sin(phase * 4) * 0.6;
      wingPivots[0].rotation.z = flap;
      wingPivots[1].rotation.z = -flap;
    },
  };
}

const NPC_WANDER_HALF_X = FIELD_HALF_X - 6;
const NPC_WANDER_HALF_Z = FIELD_HALF_Z - 6;

const npcs = [];

function spawnNpc(rig, options) {
  townGroup.add(rig.group);
  const npc = {
    rig,
    x: (Math.random() * 2 - 1) * NPC_WANDER_HALF_X,
    z: (Math.random() * 2 - 1) * NPC_WANDER_HALF_Z,
    facing: 0,
    speed: options.speed,
    target: null,
    phase: Math.random() * Math.PI * 2,
    isFlyer: !!options.isFlyer,
    flyHeight: options.flyHeight || 0,
  };
  npc.rig.group.position.set(npc.x, npc.isFlyer ? npc.flyHeight : 0, npc.z);
  npcs.push(npc);
}

const humanShirts = ["#ff9f43", "#43aa8b", "#9d4edd"];
for (let i = 0; i < 3; i++) {
  const rig = createHumanoid({
    skin: "#f4c98f",
    shirt: humanShirts[i % humanShirts.length],
    pants: "#5b3a29",
    scale: 0.95,
  });
  spawnNpc(rig, { speed: 1.6 });
}
for (let i = 0; i < 2; i++) spawnNpc(createCow(), { speed: 1.1 });
for (let i = 0; i < 2; i++) spawnNpc(createDog(), { speed: 2.2 });
for (let i = 0; i < 2; i++) spawnNpc(createCat(), { speed: 1.9 });
for (let i = 0; i < 2; i++) spawnNpc(createBird(), { speed: 2.6, isFlyer: true, flyHeight: 2.2 + Math.random() });

function updateNpc(npc, delta, time) {
  if (!npc.target || Math.hypot(npc.target.x - npc.x, npc.target.z - npc.z) < 0.6) {
    npc.target = {
      x: (Math.random() * 2 - 1) * NPC_WANDER_HALF_X,
      z: (Math.random() * 2 - 1) * NPC_WANDER_HALF_Z,
    };
  }
  const dx = npc.target.x - npc.x;
  const dz = npc.target.z - npc.z;
  const dist = Math.hypot(dx, dz);
  const moving = dist > 0.1;
  if (moving) {
    const nx = dx / dist;
    const nz = dz / dist;
    npc.x += nx * npc.speed * delta;
    npc.z += nz * npc.speed * delta;
    npc.facing = Math.atan2(nx, nz);
  }
  npc.phase += delta * 6;
  npc.rig.group.position.x = npc.x;
  npc.rig.group.position.z = npc.z;
  npc.rig.group.rotation.y = npc.facing;
  if (npc.isFlyer) {
    npc.rig.group.position.y = npc.flyHeight + Math.sin(time * 2 + npc.phase) * 0.3;
    npc.rig.animate(npc.phase, moving);
  } else {
    npc.rig.animate(npc.phase, moving);
  }
}

// ==========================================================
// カメラ
// ==========================================================
const CAM_OFFSET = new THREE.Vector3(0, 13, 15);
const cameraTarget = new THREE.Vector3();
const desiredCamPos = new THREE.Vector3();

function updateCamera(pos, delta) {
  const py = pos.y || 0;
  desiredCamPos.set(pos.x + CAM_OFFSET.x, py + CAM_OFFSET.y, pos.z + CAM_OFFSET.z);
  const lerpAmt = 1 - Math.pow(0.001, delta);
  camera.position.lerp(desiredCamPos, lerpAmt);
  cameraTarget.set(pos.x, py + 1.2, pos.z);
  camera.lookAt(cameraTarget);
}

const INSIDE_CAM_OFFSET = new THREE.Vector3(0, 5.5, 6.5);
function updateInsideCamera(pos, delta) {
  const py = pos.y || 0;
  desiredCamPos.set(pos.x + INSIDE_CAM_OFFSET.x, py + INSIDE_CAM_OFFSET.y, pos.z + INSIDE_CAM_OFFSET.z);
  const lerpAmt = 1 - Math.pow(0.001, delta);
  camera.position.lerp(desiredCamPos, lerpAmt);
  cameraTarget.set(pos.x, py + 1, pos.z);
  camera.lookAt(cameraTarget);
}

// ==========================================================
// にゅうりょく
// ==========================================================
window.addEventListener("keydown", (e) => setKey(e.key, true));
window.addEventListener("keyup", (e) => setKey(e.key, false));

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
// メインループ
// ==========================================================
const clock = new THREE.Clock();
let started = false;

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;

  if (!started) return;

  if (mode === "inside") {
    const moving = applyMovement(player, 3.5, delta, (a) => (player.facing = a));
    player.x = Math.max(-3.9, Math.min(3.9, player.x));
    player.z = Math.max(-3, Math.min(3.3, player.z));
    playerRig.group.position.set(player.x, 0, player.z);
    playerRig.group.rotation.y = player.facing;
    if (moving) walkPhase += delta * 8;
    playerRig.animate(walkPhase, moving);
    updateInsideCamera(player, delta);
  } else {
    if (drivingCar) {
      const carState = drivingCar;
      const carPos = { x: carState.x, z: carState.z };
      const moving = applyMovement(carPos, 9, delta, (a) => (carState.facing = a));
      carPos.x = Math.max(-FIELD_HALF_X + 2, Math.min(FIELD_HALF_X - 2, carPos.x));
      carPos.z = Math.max(-FIELD_HALF_Z + 2, Math.min(FIELD_HALF_Z - 2, carPos.z));
      carState.x = carPos.x;
      carState.z = carPos.z;
      carState.mesh.position.set(carState.x, 0, carState.z);
      if (moving) carState.mesh.rotation.y = carState.facing;
      checkBlockCollisions(carState);
      updateCamera(carState, delta);
    } else {
      const moving = applyMovement(player, player.speed, delta, (a) => (player.facing = a));
      player.x = Math.max(-FIELD_HALF_X + 1, Math.min(FIELD_HALF_X - 1, player.x));
      player.z = Math.max(-FIELD_HALF_Z + 1, Math.min(FIELD_HALF_Z - 1, player.z));
      playerRig.group.position.set(player.x, 0, player.z);
      playerRig.group.rotation.y = player.facing;
      if (moving) walkPhase += delta * 8;
      playerRig.animate(walkPhase, moving);
      checkBlockCollisions(player);
      checkDoors(player);
      checkCarBoarding(player);
      updateCamera(player, delta);
    }

    npcs.forEach((npc) => updateNpc(npc, delta, time));

    fieldBlocks.forEach((b) => {
      b.spin += delta * 1.4;
      b.group.rotation.y = b.spin;
      b.group.position.y = b.baseY + Math.sin(time * 2 + b.spin) * 0.08;
    });

    clouds.forEach((cloud) => {
      const u = cloud.userData;
      cloud.position.set(
        player.x + u.baseX + Math.sin(time * u.speed + u.phase) * 6,
        u.baseY,
        player.z + u.baseZ
      );
    });
    sun.position.set(player.x + 24, 34, player.z - 26);
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// ==========================================================
// スタート
// ==========================================================
document.getElementById("start-btn").addEventListener("click", () => {
  titleScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  resizeRenderer();
  started = true;
  updateHud();
});

loadState();
rebuildFromState();
soundBtn.textContent = state.soundOn ? "🔊" : "🔇";
renderInventory();
updateHud();
