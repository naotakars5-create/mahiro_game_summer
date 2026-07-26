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

const FOOD_TYPES = [
  { key: "apple", name: "りんご", emoji: "🍎" },
  { key: "bread", name: "パン", emoji: "🍞" },
  { key: "carrot", name: "にんじん", emoji: "🥕" },
  { key: "onigiri", name: "おにぎり", emoji: "🍙" },
];

const HOUSE_RECIPE = { red: 4, gray: 3, blue: 1 };
const BUILDING_RECIPE = { gray: 6, blue: 5, yellow: 2 };
const SHOP_RECIPE = { yellow: 4, red: 3, blue: 2 };
const CAR_RECIPE = { red: 5, gray: 4, blue: 3 };

const SAVE_KEY = "legoTown3dSave_v1";

let state = {
  inventory: { red: 0, gray: 0, blue: 0, yellow: 0, green: 0, purple: 0 },
  food: { apple: 0, bread: 0, carrot: 0, onigiri: 0 },
  totalCollected: 0,
  structures: [], // {type:'house'|'building'|'shop', x, z, paletteIndex}
  cars: [], // {x, z, colorIndex}
  toyBlocks: [], // {x, y, z, colorKey}
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
      food: state.food,
      totalCollected: state.totalCollected,
      structures: state.structures,
      cars: state.cars,
      toyBlocks: state.toyBlocks,
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
function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {
    // おとが つかえない かんきょうでも むしできるようにする
  }
}

["pointerdown", "keydown", "touchstart"].forEach((evt) => {
  window.addEventListener(evt, ensureAudio, { once: true });
});

function playTone(freq, duration) {
  if (!state.soundOn) return;
  try {
    ensureAudio();
    if (!audioCtx) return;
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
const attackBtn = document.getElementById("attack-btn");
const feedBtn = document.getElementById("feed-btn");
const exitHouseBtn = document.getElementById("exit-house-btn");
const exitCarBtn = document.getElementById("exit-car-btn");
const confirmPlaceBtn = document.getElementById("confirm-place-btn");
const cancelPlaceBtn = document.getElementById("cancel-place-btn");
const doneToyBtn = document.getElementById("done-toy-btn");
const toyPaletteEl = document.getElementById("toy-palette");
const buildButtons = [
  document.getElementById("build-house-btn"),
  document.getElementById("build-building-btn"),
  document.getElementById("build-shop-btn"),
  document.getElementById("build-car-btn"),
  document.getElementById("build-toy-btn"),
  document.getElementById("move-btn"),
];

let mode = "town"; // 'town' | 'inside'

function updateHud() {
  const driving = !!drivingCar;
  const placing = !!placementKind;
  buildButtons.forEach((b) => b.classList.toggle("hidden", mode === "inside" || placing || driving));
  attackBtn.classList.toggle("hidden", mode !== "town" || driving || placing);
  feedBtn.classList.toggle("hidden", mode !== "town" || driving || placing);
  soundBtn.classList.toggle("hidden", placing);
  exitHouseBtn.classList.toggle("hidden", mode !== "inside");
  exitCarBtn.classList.toggle("hidden", mode !== "town" || !driving || placing);
  confirmPlaceBtn.classList.toggle("hidden", !placing);
  doneToyBtn.classList.toggle("hidden", placementKind !== "block");
  cancelPlaceBtn.classList.toggle("hidden", !placing || placementKind === "block");
  toyPaletteEl.classList.toggle("hidden", placementKind !== "block");
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

function renderFoodInventory() {
  const html = FOOD_TYPES.filter((f) => state.food[f.key] > 0)
    .map(
      (f) => `
      <div class="inv-badge">
        <span>${f.emoji} × ${state.food[f.key]}</span>
      </div>`
    )
    .join("");
  document.getElementById("food-inventory").innerHTML = html;
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

const trees = []; // {x, z, group, shakeTimer}

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
  trees.push({ x, z, group, shakeTimer: 0 });
}

for (let i = 0; i < 16; i++) {
  let x, z;
  let tries = 0;
  do {
    x = (Math.random() * 2 - 1) * (FIELD_HALF_X - 3);
    z = (Math.random() * 2 - 1) * (FIELD_HALF_Z - 3);
    tries++;
  } while (isInRoadZone(x) && tries < 20);
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
    animate(phase, moving, punch) {
      const swing = moving ? Math.sin(phase) * 0.9 : 0;
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing;
      rightArm.rotation.x = punch ? -1.6 * punch : swing;
    },
  };
}

// ---------- プレイヤー ----------
// たてものの なかに 入っても きえないように townGroup ではなく scene に ちょくせつ おく
const playerRig = createHumanoid({ skin: "#f4c98f", shirt: "#5cc4f2", pants: "#3a4a63", scale: 1 });
scene.add(playerRig.group);

const player = {
  x: 0,
  z: 4,
  facing: 0,
  speed: 5.5,
};

let walkPhase = 0;
let attackTimer = 0;
const ATTACK_DURATION = 0.35;
const keys = { up: false, down: false, left: false, right: false, run: false };
const RUN_MULTIPLIER = 1.8;

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

function placeStructureMesh(type, x, z, paletteIndex, interiorTheme) {
  const palettes = STRUCTURE_PALETTES[type];
  const idx = paletteIndex != null ? paletteIndex : pickPaletteIndex(type);
  const theme = interiorTheme != null ? interiorTheme : Math.floor(Math.random() * INTERIOR_THEMES.length);
  const built = STRUCTURE_FACTORIES[type](palettes[idx]);
  built.group.position.set(x, 0, z);
  townGroup.add(built.group);
  const doorWorld = built.doorLocal.clone().add(new THREE.Vector3(x, 0, z));
  placedStructures.push({
    type,
    x,
    z,
    doorWorld,
    wallHex: built.wallHex,
    label: built.label,
    paletteIndex: idx,
    interiorTheme: theme,
    group: built.group,
  });
  return idx;
}

const STRUCTURE_LABELS = { house: "🏠 いえ", building: "🏢 ビル", shop: "🏪 おみせ" };

document.getElementById("build-house-btn").addEventListener("click", () => requestBuild("house"));
document.getElementById("build-building-btn").addEventListener("click", () => requestBuild("building"));
document.getElementById("build-shop-btn").addEventListener("click", () => requestBuild("shop"));

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

function pickCarColor() {
  const used = placedCars.map((c) => c.colorIndex);
  const all = CAR_COLORS.map((_, i) => i);
  const unused = all.filter((i) => !used.includes(i));
  const pool = unused.length ? unused : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawnCar(x, z, colorIndex) {
  const idx = colorIndex != null ? colorIndex : pickCarColor();
  const mesh = createCarMesh(CAR_COLORS[idx]);
  mesh.position.set(x, 0, z);
  townGroup.add(mesh);
  placedCars.push({ x, z, mesh, facing: 0, colorIndex: idx });
  return idx;
}

document.getElementById("build-car-btn").addEventListener("click", () => requestBuild("car"));

// ==========================================================
// おもちゃ（じゆうに おける ブロック）
// ==========================================================
const TOY_SIZE = 0.7;
const MAX_TOY_BLOCKS = 220;
const toyBlocks = []; // {x, y, z, colorKey, mesh}

function createToyBlockMesh(hex) {
  const group = new THREE.Group();
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(TOY_SIZE, TOY_SIZE, TOY_SIZE),
    new THREE.MeshLambertMaterial({ color: col(hex) })
  );
  group.add(cube);
  const stud = new THREE.Mesh(
    new THREE.CylinderGeometry(TOY_SIZE * 0.22, TOY_SIZE * 0.22, TOY_SIZE * 0.2, 10),
    new THREE.MeshLambertMaterial({ color: col(shadeColor(hex, -10)) })
  );
  stud.position.y = TOY_SIZE / 2 + TOY_SIZE * 0.1;
  group.add(stud);
  return group;
}

function toyStackY(gx, gz) {
  const count = toyBlocks.filter((b) => Math.abs(b.x - gx) < 0.01 && Math.abs(b.z - gz) < 0.01).length;
  return TOY_SIZE / 2 + count * TOY_SIZE;
}

function placeToyBlockAt(x, z, colorKey) {
  const gx = Math.round(x / TOY_SIZE) * TOY_SIZE;
  const gz = Math.round(z / TOY_SIZE) * TOY_SIZE;
  const y = toyStackY(gx, gz);
  const mesh = createToyBlockMesh(colorHex(colorKey));
  mesh.position.set(gx, y, gz);
  townGroup.add(mesh);
  const entry = { x: gx, y, z: gz, colorKey };
  toyBlocks.push(entry);
  return entry;
}

// ==========================================================
// たてる ばしょを じぶんで えらぶ（プレースメント モード）
// ==========================================================
const RECIPES = { house: HOUSE_RECIPE, building: BUILDING_RECIPE, shop: SHOP_RECIPE, car: CAR_RECIPE };
const OBJECT_RADIUS = { house: 2.1, building: 2.4, shop: 2.4, car: 1.9 };
const GHOST_DISTANCE = { house: 4.5, building: 5, shop: 4.5, car: 4, block: 2.4 };

let placementKind = null; // null | 'house' | 'building' | 'shop' | 'car' | 'block'
let placementGhost = null;
let placementGhostPaletteIndex = null;
let placementGhostInteriorTheme = null;
let placementColorKey = "red";
let placementGhostX = 0;
let placementGhostZ = 0;
let placementValid = false;
let isMovingExisting = false;
let movingOriginal = null; // {kind:'structure'|'car', type, x, z, paletteIndex|colorIndex}

const placementReticle = new THREE.Mesh(
  new THREE.CircleGeometry(1, 32),
  new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.5 })
);
placementReticle.rotation.x = -Math.PI / 2;
placementReticle.position.y = 0.02;
placementReticle.visible = false;
townGroup.add(placementReticle);

function makeGhostTransparent(group) {
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    const applyOpacity = (m) => {
      m.transparent = true;
      m.opacity = 0.55;
      m.depthWrite = false;
    };
    if (Array.isArray(obj.material)) obj.material.forEach(applyOpacity);
    else applyOpacity(obj.material);
  });
  return group;
}

function clearGhost() {
  if (placementGhost) {
    townGroup.remove(placementGhost);
    placementGhost = null;
  }
}

function requestBuild(kind) {
  if (mode !== "town") return;
  if (drivingCar) {
    showMessage("くるまを おりてから やってね");
    return;
  }
  if (placementKind) return;
  const recipe = RECIPES[kind];
  for (const key in recipe) {
    if (state.inventory[key] < recipe[key]) {
      const c = COLORS.find((x) => x.key === key);
      showMessage(`「${c.name}」の ブロックが あと ${recipe[key] - state.inventory[key]}こ たりないよ`);
      return;
    }
  }
  startPlacement(kind);
}

function startPlacement(kind, forcedIndex, forcedTheme) {
  placementKind = kind;
  clearGhost();
  if (kind === "car") {
    const idx = forcedIndex != null ? forcedIndex : pickCarColor();
    placementGhostPaletteIndex = idx;
    placementGhost = createCarMesh(CAR_COLORS[idx]);
  } else {
    const idx = forcedIndex != null ? forcedIndex : pickPaletteIndex(kind);
    placementGhostPaletteIndex = idx;
    placementGhostInteriorTheme = forcedTheme != null ? forcedTheme : Math.floor(Math.random() * INTERIOR_THEMES.length);
    placementGhost = STRUCTURE_FACTORIES[kind](STRUCTURE_PALETTES[kind][idx]).group;
  }
  makeGhostTransparent(placementGhost);
  townGroup.add(placementGhost);
  placementReticle.scale.setScalar(OBJECT_RADIUS[kind] || 2);
  placementReticle.visible = true;
  if (isMovingExisting) {
    confirmPlaceBtn.textContent = "✅ ここに うごかす";
    showMessage("あるいて あたらしい ばしょを きめて「ここに うごかす」を おそう");
  } else {
    confirmPlaceBtn.textContent = "✅ ここに たてる";
    showMessage("あるいて ばしょを きめて「ここに たてる」を おそう");
  }
  updateHud();
}

function startToyPlacement() {
  const unlocked = unlockedColors();
  const withStock = unlocked.filter((c) => state.inventory[c.key] > 0);
  placementColorKey = (withStock[0] || unlocked[0]).key;
  placementKind = "block";
  clearGhost();
  placementGhost = createToyBlockMesh(colorHex(placementColorKey));
  makeGhostTransparent(placementGhost);
  townGroup.add(placementGhost);
  placementReticle.scale.setScalar(TOY_SIZE * 0.6);
  placementReticle.visible = true;
  confirmPlaceBtn.textContent = "✅ ここに おく";
  renderToyPalette();
  showMessage("いろを えらんで、すきな ばしょに ブロックを おこう！");
  updateHud();
}
document.getElementById("build-toy-btn").addEventListener("click", () => {
  if (mode !== "town" || drivingCar || placementKind) return;
  startToyPlacement();
});

function renderToyPalette() {
  toyPaletteEl.innerHTML = "";
  unlockedColors().forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "toy-swatch" + (c.key === placementColorKey ? " selected" : "");
    btn.style.background = c.hex;
    btn.title = `${c.name} × ${state.inventory[c.key]}`;
    btn.addEventListener("click", () => {
      placementColorKey = c.key;
      clearGhost();
      placementGhost = createToyBlockMesh(colorHex(placementColorKey));
      makeGhostTransparent(placementGhost);
      townGroup.add(placementGhost);
      renderToyPalette();
    });
    toyPaletteEl.appendChild(btn);
  });
}

function isValidPlacement(kind, x, z) {
  if (kind === "block") {
    return Math.abs(x) < FIELD_HALF_X - 1 && Math.abs(z) < FIELD_HALF_Z - 1;
  }
  if (Math.abs(x) > FIELD_HALF_X - 3 || Math.abs(z) > FIELD_HALF_Z - 3) return false;
  if (kind !== "car" && Math.abs(x) < ROAD_HALF_W + 1.5) return false;
  for (const s of placedStructures) {
    const minDist = OBJECT_RADIUS[s.type] + OBJECT_RADIUS[kind] + 0.6;
    if (Math.hypot(x - s.x, z - s.z) < minDist) return false;
  }
  for (const c of placedCars) {
    const minDist = OBJECT_RADIUS.car + OBJECT_RADIUS[kind] + 0.6;
    if (Math.hypot(x - c.x, z - c.z) < minDist) return false;
  }
  for (const t of trees) {
    if (Math.hypot(x - t.x, z - t.z) < OBJECT_RADIUS[kind] + 1.6) return false;
  }
  return true;
}

function updatePlacementFrame() {
  const dist = GHOST_DISTANCE[placementKind];
  let x = player.x + Math.sin(player.facing) * dist;
  let z = player.z + Math.cos(player.facing) * dist;
  if (placementKind === "block") {
    x = Math.round(x / TOY_SIZE) * TOY_SIZE;
    z = Math.round(z / TOY_SIZE) * TOY_SIZE;
  }
  placementGhostX = x;
  placementGhostZ = z;
  placementValid = isValidPlacement(placementKind, x, z);

  const y = placementKind === "block" ? toyStackY(x, z) - TOY_SIZE / 2 : 0;
  placementGhost.position.set(x, y, z);
  placementReticle.position.set(x, 0.02, z);
  placementReticle.material.color.set(placementValid ? 0x2ecc71 : 0xe74c3c);
}

function confirmPlacement() {
  if (!placementKind) return;
  const kind = placementKind;
  const x = placementGhostX;
  const z = placementGhostZ;
  if (!placementValid) {
    showMessage("ここには おけないよ。ばしょを かえてね");
    playTone(220, 0.12);
    return;
  }
  if (kind === "block") {
    if (state.inventory[placementColorKey] <= 0) {
      showMessage("その いろの ブロックが ないよ");
      return;
    }
    if (toyBlocks.length >= MAX_TOY_BLOCKS) {
      showMessage("もう おもちゃが いっぱいだよ！");
      return;
    }
    const entry = placeToyBlockAt(x, z, placementColorKey);
    state.inventory[placementColorKey]--;
    state.toyBlocks.push(entry);
    playTone(520, 0.08);
    renderInventory();
    renderToyPalette();
    saveState();
    return;
  }

  const wasMoving = isMovingExisting;
  if (!wasMoving) {
    const recipe = RECIPES[kind];
    for (const key in recipe) state.inventory[key] -= recipe[key];
  }
  if (kind === "car") {
    spawnCar(x, z, placementGhostPaletteIndex);
    state.cars.push({ x, z, colorIndex: placementGhostPaletteIndex });
    showMessage(wasMoving ? "🚗 くるまを うごかしたよ" : "🚗 くるまが できた！ちかづくと のれるよ");
  } else {
    placeStructureMesh(kind, x, z, placementGhostPaletteIndex, placementGhostInteriorTheme);
    state.structures.push({
      type: kind,
      x,
      z,
      paletteIndex: placementGhostPaletteIndex,
      interiorTheme: placementGhostInteriorTheme,
    });
    showMessage(wasMoving ? `${STRUCTURE_LABELS[kind]} を うごかしたよ` : `${STRUCTURE_LABELS[kind]} が まちに たった！ドアから 入れるよ`);
  }
  playTone(wasMoving ? 650 : 900, wasMoving ? 0.15 : 0.2);
  renderInventory();
  saveState();
  isMovingExisting = false;
  movingOriginal = null;
  exitPlacement();
}

function exitPlacement() {
  placementKind = null;
  clearGhost();
  placementReticle.visible = false;
  updateHud();
}

function cancelPlacement() {
  if (isMovingExisting && movingOriginal) {
    const o = movingOriginal;
    if (o.kind === "car") {
      spawnCar(o.x, o.z, o.colorIndex);
      state.cars.push({ x: o.x, z: o.z, colorIndex: o.colorIndex });
    } else {
      placeStructureMesh(o.type, o.x, o.z, o.paletteIndex, o.interiorTheme);
      state.structures.push({ type: o.type, x: o.x, z: o.z, paletteIndex: o.paletteIndex, interiorTheme: o.interiorTheme });
    }
    saveState();
  }
  isMovingExisting = false;
  movingOriginal = null;
  exitPlacement();
}

confirmPlaceBtn.addEventListener("click", confirmPlacement);
cancelPlaceBtn.addEventListener("click", cancelPlacement);
doneToyBtn.addEventListener("click", exitPlacement);

// ---------- たてもの／くるまを うごかす ----------
const MOVE_PICKUP_RADIUS = 5;

function requestMove() {
  if (mode !== "town" || drivingCar || placementKind) return;

  let bestDist = Infinity;
  let bestStructIndex = -1;
  placedStructures.forEach((s, i) => {
    const d = Math.hypot(player.x - s.x, player.z - s.z);
    if (d < bestDist) {
      bestDist = d;
      bestStructIndex = i;
    }
  });
  let bestCarDist = Infinity;
  let bestCarIndex = -1;
  placedCars.forEach((c, i) => {
    const d = Math.hypot(player.x - c.x, player.z - c.z);
    if (d < bestCarDist) {
      bestCarDist = d;
      bestCarIndex = i;
    }
  });

  if (bestDist > MOVE_PICKUP_RADIUS && bestCarDist > MOVE_PICKUP_RADIUS) {
    showMessage("ちかくに うごかせる たてものや くるまが ないよ");
    return;
  }

  if (bestDist <= bestCarDist) {
    const s = placedStructures[bestStructIndex];
    townGroup.remove(s.group);
    placedStructures.splice(bestStructIndex, 1);
    const savedIndex = state.structures.findIndex((st) => st.type === s.type && st.x === s.x && st.z === s.z);
    if (savedIndex >= 0) state.structures.splice(savedIndex, 1);
    movingOriginal = {
      kind: "structure",
      type: s.type,
      x: s.x,
      z: s.z,
      paletteIndex: s.paletteIndex,
      interiorTheme: s.interiorTheme,
    };
    isMovingExisting = true;
    startPlacement(s.type, s.paletteIndex, s.interiorTheme);
  } else {
    const c = placedCars[bestCarIndex];
    townGroup.remove(c.mesh);
    placedCars.splice(bestCarIndex, 1);
    const savedIndex = state.cars.findIndex((cc) => cc.x === c.x && cc.z === c.z);
    if (savedIndex >= 0) state.cars.splice(savedIndex, 1);
    movingOriginal = { kind: "car", x: c.x, z: c.z, colorIndex: c.colorIndex };
    isMovingExisting = true;
    startPlacement("car", c.colorIndex);
  }
  saveState();
}
document.getElementById("move-btn").addEventListener("click", requestMove);

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
  state.structures.forEach((s) => placeStructureMesh(s.type, s.x, s.z, s.paletteIndex, s.interiorTheme));
  state.cars.forEach((c) => spawnCar(c.x, c.z, c.colorIndex));
  state.toyBlocks.forEach((b) => {
    const mesh = createToyBlockMesh(colorHex(b.colorKey));
    mesh.position.set(b.x, b.y, b.z);
    townGroup.add(mesh);
    toyBlocks.push(b);
  });
}

// ==========================================================
// ブロック（あつめる アイテム）
// ==========================================================
const fieldBlocks = []; // {mesh, colorKey, baseY}
const MAX_FIELD_BLOCKS = 16;

function isNearAnyStructureOrCar(x, z, radius) {
  if (placedStructures.some((p) => Math.hypot(x - p.x, z - p.z) < radius)) return true;
  if (placedCars.some((p) => Math.hypot(x - p.x, z - p.z) < radius)) return true;
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
// たべもの（あつめる アイテム）
// ==========================================================
const foodItems = []; // {group, key, baseY, spin}
const MAX_FIELD_FOOD = 10;

function createFoodMesh(key) {
  const group = new THREE.Group();
  if (key === "apple") {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 12),
      new THREE.MeshLambertMaterial({ color: col("#e63946") })
    );
    group.add(body);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6),
      new THREE.MeshLambertMaterial({ color: col("#5b3a29") })
    );
    stem.position.y = 0.28;
    group.add(stem);
  } else if (key === "bread") {
    const loaf = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.32),
      new THREE.MeshLambertMaterial({ color: col("#e0a458") })
    );
    group.add(loaf);
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: col("#f2c185") })
    );
    top.scale.set(1.05, 0.7, 0.7);
    top.position.y = 0.14;
    group.add(top);
  } else if (key === "carrot") {
    const root = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.55, 8),
      new THREE.MeshLambertMaterial({ color: col("#f4a259") })
    );
    root.rotation.x = Math.PI;
    root.position.y = 0.275;
    group.add(root);
    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.3, 6),
      new THREE.MeshLambertMaterial({ color: col("#4caf50") })
    );
    leaves.position.y = 0.65;
    group.add(leaves);
  } else {
    const rice = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.34, 3),
      new THREE.MeshLambertMaterial({ color: col("#fffdf5") })
    );
    group.add(rice);
    const nori = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.36, 0.06),
      new THREE.MeshLambertMaterial({ color: col("#2b2b2b") })
    );
    nori.position.z = 0.14;
    group.add(nori);
  }
  return group;
}

function spawnFood() {
  if (foodItems.length >= MAX_FIELD_FOOD) return;
  const foodType = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];

  let x, z;
  let tries = 0;
  do {
    x = (Math.random() * 2 - 1) * (FIELD_HALF_X - 2);
    z = (Math.random() * 2 - 1) * (FIELD_HALF_Z - 2);
    tries++;
  } while (isNearAnyStructureOrCar(x, z, 4.5) && tries < 20);

  const group = createFoodMesh(foodType.key);
  group.position.set(x, 0.4, z);
  townGroup.add(group);
  foodItems.push({ group, key: foodType.key, baseY: 0.4, spin: Math.random() * Math.PI * 2 });
}

for (let i = 0; i < 6; i++) spawnFood();
setInterval(() => {
  if (mode === "town") spawnFood();
}, 2600);

function checkFoodCollisions(pos) {
  for (let i = foodItems.length - 1; i >= 0; i--) {
    const f = foodItems[i];
    const dist = Math.hypot(pos.x - f.group.position.x, pos.z - f.group.position.z);
    if (dist < 1.1) {
      state.food[f.key]++;
      townGroup.remove(f.group);
      foodItems.splice(i, 1);
      playTone(850, 0.1);
      renderFoodInventory();
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

const INTERIOR_THEMES = [
  { floor: "#a4753f", rug: "#e06666", bed: "#5a92c9", table: "#a4753f", pot: "#a4753f" },
  { floor: "#8a5a2b", rug: "#f4a259", bed: "#6a994e", table: "#8a5a2b", pot: "#8a5a2b" },
  { floor: "#c9975b", rug: "#9d4edd", bed: "#e63946", table: "#c9975b", pot: "#c9975b" },
  { floor: "#6b4226", rug: "#48cae4", bed: "#f9c74f", table: "#6b4226", pot: "#6b4226" },
  { floor: "#b5834f", rug: "#43aa8b", bed: "#f28482", table: "#b5834f", pot: "#b5834f" },
];

const insideWallMat = new THREE.MeshLambertMaterial({ color: 0xf6e3c6 });
const insideFloorMat = new THREE.MeshLambertMaterial({ color: 0xa4753f });
const insideRugMat = new THREE.MeshLambertMaterial({ color: 0xe06666 });
const insideBedMat = new THREE.MeshLambertMaterial({ color: 0x5a92c9 });
const insideTableMat = new THREE.MeshLambertMaterial({ color: 0xa4753f });
const insidePotMat = new THREE.MeshLambertMaterial({ color: 0xa4753f });

function applyInteriorTheme(themeIndex) {
  const t = INTERIOR_THEMES[themeIndex] || INTERIOR_THEMES[0];
  insideFloorMat.color.set(t.floor);
  insideRugMat.color.set(t.rug);
  insideBedMat.color.set(t.bed);
  insideTableMat.color.set(t.table);
  insidePotMat.color.set(t.pot);
}

{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), insideFloorMat);
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

  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 3.2), insideBedMat);
  bed.position.set(-3, 0.3, -1.6);
  insideGroup.add(bed);
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.25, 0.8),
    new THREE.MeshLambertMaterial({ color: 0xfffdf5 })
  );
  pillow.position.set(-3, 0.72, -2.9);
  insideGroup.add(pillow);

  const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.4), insideTableMat);
  table.position.set(2.6, 0.35, 1.6);
  insideGroup.add(table);

  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.05, 24), insideRugMat);
  rug.position.set(0, 0.03, 1.2);
  insideGroup.add(rug);

  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.4, 10), insidePotMat);
  pot.position.set(3.6, 0.2, -2.8);
  insideGroup.add(pot);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10), leafMat);
  leaf.position.set(3.6, 0.75, -2.8);
  insideGroup.add(leaf);
}

// ---------- たてものの なかの ひと（てんいん・かぞく） ----------
const INTERIOR_NPC_COLORS = {
  shop: { shirt: "#ffffff", pants: "#e63946" },
  building: { shirt: "#5b3a29", pants: "#2d2d2d" },
  house: { shirt: "#43aa8b", pants: "#5b3a29" },
};
const INTERIOR_NPC_LABEL = { shop: "てんいんさん", building: "けいびいん", house: "かぞく" };
let interiorNpc = null;

function setupInteriorNpc(type) {
  if (interiorNpc) {
    insideGroup.remove(interiorNpc.rig.group);
    interiorNpc = null;
  }
  const cfg = INTERIOR_NPC_COLORS[type] || INTERIOR_NPC_COLORS.house;
  const rig = createHumanoid({ skin: "#f4c98f", shirt: cfg.shirt, pants: cfg.pants, scale: 0.95 });
  rig.group.position.set(1.6, 0, -0.6);
  rig.group.rotation.y = 0;
  insideGroup.add(rig.group);
  interiorNpc = { rig, phase: 0 };
}

let currentBuilding = null;
let outsidePlayerPos = { x: 0, z: 4 };

function enterBuilding(structure) {
  currentBuilding = structure;
  outsidePlayerPos = { x: player.x, z: player.z };
  insideWallMat.color = col(shadeColor(structure.wallHex, 55));
  applyInteriorTheme(structure.interiorTheme || 0);
  setupInteriorNpc(structure.type);
  townGroup.visible = false;
  insideGroup.visible = true;
  mode = "inside";
  player.x = 0;
  player.z = 2.6;
  playTone(600, 0.15);
  showMessage(`${structure.label} の なかに はいったよ（${INTERIOR_NPC_LABEL[structure.type] || "だれか"}が いるよ）`);
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
    isAnimal: !!options.isAnimal,
    flyHeight: options.flyHeight || 0,
    hopTimer: 0,
    happyTimer: 0,
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
for (let i = 0; i < 2; i++) spawnNpc(createCow(), { speed: 1.1, isAnimal: true });
for (let i = 0; i < 2; i++) spawnNpc(createDog(), { speed: 2.2, isAnimal: true });
for (let i = 0; i < 2; i++) spawnNpc(createCat(), { speed: 1.9, isAnimal: true });
for (let i = 0; i < 2; i++)
  spawnNpc(createBird(), { speed: 2.6, isFlyer: true, flyHeight: 2.2 + Math.random(), isAnimal: true });

function updateNpc(npc, delta, time) {
  if (npc.happyTimer > 0) {
    npc.happyTimer -= delta;
    npc.phase += delta * 16;
    const hopOffset = Math.max(0, Math.sin(npc.phase * 3)) * 0.4;
    npc.rig.group.position.set(npc.x, npc.isFlyer ? npc.flyHeight + hopOffset : hopOffset, npc.z);
    npc.rig.group.rotation.y = npc.facing;
    npc.rig.animate(npc.phase, true);
    return;
  }
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
  const speed = npc.hopTimer > 0 ? npc.speed * 2.4 : npc.speed;
  if (moving) {
    const nx = dx / dist;
    const nz = dz / dist;
    npc.x += nx * speed * delta;
    npc.z += nz * speed * delta;
    npc.facing = Math.atan2(nx, nz);
  }
  npc.phase += delta * (npc.hopTimer > 0 ? 14 : 6);
  npc.rig.group.position.x = npc.x;
  npc.rig.group.position.z = npc.z;
  npc.rig.group.rotation.y = npc.facing;
  let hopOffset = 0;
  if (npc.hopTimer > 0) {
    npc.hopTimer -= delta;
    hopOffset = Math.max(0, Math.sin((0.4 - npc.hopTimer) * 8)) * 0.5;
  }
  if (npc.isFlyer) {
    npc.rig.group.position.y = npc.flyHeight + Math.sin(time * 2 + npc.phase) * 0.3 + hopOffset;
    npc.rig.animate(npc.phase, moving);
  } else {
    npc.rig.group.position.y = hopOffset;
    npc.rig.animate(npc.phase, moving);
  }
}

// ---------- こうげき（パンチ） ----------
function performAttack() {
  if (mode !== "town" || drivingCar || placementKind) return;
  attackTimer = ATTACK_DURATION;
  playTone(220, 0.1);
  npcs.forEach((npc) => {
    const d = Math.hypot(npc.x - player.x, npc.z - player.z);
    if (d < 3.2 && d > 0.01) {
      npc.hopTimer = 0.4;
      const awayX = (npc.x - player.x) / d;
      const awayZ = (npc.z - player.z) / d;
      npc.target = {
        x: Math.max(-NPC_WANDER_HALF_X, Math.min(NPC_WANDER_HALF_X, npc.x + awayX * 8 + (Math.random() * 4 - 2))),
        z: Math.max(-NPC_WANDER_HALF_Z, Math.min(NPC_WANDER_HALF_Z, npc.z + awayZ * 8 + (Math.random() * 4 - 2))),
      };
    }
  });
  trees.forEach((t) => {
    const d = Math.hypot(t.x - player.x, t.z - player.z);
    if (d < 2.6) t.shakeTimer = 0.6;
  });
}
attackBtn.addEventListener("click", performAttack);

// ---------- どうぶつに えさをあげる ----------
function performFeed() {
  if (mode !== "town" || drivingCar || placementKind) return;
  const available = FOOD_TYPES.find((f) => state.food[f.key] > 0);
  if (!available) {
    showMessage("たべものが ないよ。まちで あつめてこよう！");
    return;
  }
  let nearest = null;
  let nearestDist = Infinity;
  npcs.forEach((npc) => {
    if (!npc.isAnimal) return;
    const d = Math.hypot(npc.x - player.x, npc.z - player.z);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = npc;
    }
  });
  if (!nearest || nearestDist > 3.2) {
    showMessage("ちかくに どうぶつが いないよ");
    return;
  }
  state.food[available.key]--;
  nearest.happyTimer = 0.8;
  nearest.facing = Math.atan2(player.x - nearest.x, player.z - nearest.z);
  playTone(760, 0.1);
  playTone(950, 0.12);
  showMessage(`${available.emoji} を あげたよ！よろこんでるね`);
  renderFoodInventory();
  saveState();
}
feedBtn.addEventListener("click", performFeed);

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
    case "Shift":
      keys.run = isDown;
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
bindHold("btn-run", "run");

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

  let punchAmount = 0;
  if (attackTimer > 0) {
    attackTimer = Math.max(0, attackTimer - delta);
    const t = Math.min(1, 1 - attackTimer / ATTACK_DURATION);
    punchAmount = Math.sin(t * Math.PI);
  }

  if (mode === "inside") {
    const moving = applyMovement(player, 3.5, delta, (a) => (player.facing = a));
    player.x = Math.max(-3.9, Math.min(3.9, player.x));
    if (player.z > 3.1) {
      // ドアの ある がわまで あるくと、そのまま そとに でる
      exitBuilding();
    } else {
      player.z = Math.max(-3, player.z);
      playerRig.group.position.set(player.x, 0, player.z);
      playerRig.group.rotation.y = player.facing;
      if (moving) walkPhase += delta * 8;
      playerRig.animate(walkPhase, moving);
      if (interiorNpc) {
        interiorNpc.phase += delta * 1.4;
        interiorNpc.rig.animate(interiorNpc.phase, true);
      }
      updateInsideCamera(player, delta);
    }
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
      checkFoodCollisions(carState);
      updateCamera(carState, delta);
    } else {
      const runSpeed = player.speed * (keys.run ? RUN_MULTIPLIER : 1);
      const moving = applyMovement(player, runSpeed, delta, (a) => (player.facing = a));
      player.x = Math.max(-FIELD_HALF_X + 1, Math.min(FIELD_HALF_X - 1, player.x));
      player.z = Math.max(-FIELD_HALF_Z + 1, Math.min(FIELD_HALF_Z - 1, player.z));
      playerRig.group.position.set(player.x, 0, player.z);
      playerRig.group.rotation.y = player.facing;
      if (moving) walkPhase += delta * (keys.run ? 13 : 8);
      playerRig.animate(walkPhase, moving, punchAmount);
      checkBlockCollisions(player);
      checkFoodCollisions(player);
      if (placementKind) {
        updatePlacementFrame();
      } else {
        checkDoors(player);
        checkCarBoarding(player);
      }
      updateCamera(player, delta);
    }

    npcs.forEach((npc) => updateNpc(npc, delta, time));

    trees.forEach((t) => {
      if (t.shakeTimer > 0) {
        t.shakeTimer = Math.max(0, t.shakeTimer - delta);
        t.group.rotation.z = Math.sin(time * 40) * t.shakeTimer * 0.4;
      } else if (t.group.rotation.z !== 0) {
        t.group.rotation.z = 0;
      }
    });

    fieldBlocks.forEach((b) => {
      b.spin += delta * 1.4;
      b.group.rotation.y = b.spin;
      b.group.position.y = b.baseY + Math.sin(time * 2 + b.spin) * 0.08;
    });

    foodItems.forEach((f) => {
      f.spin += delta * 1.1;
      f.group.rotation.y = f.spin;
      f.group.position.y = f.baseY + Math.sin(time * 2 + f.spin) * 0.08;
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
  ensureAudio();
  titleScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  resizeRenderer();
  started = true;
  updateHud();
  playTone(700, 0.15);
});

loadState();
rebuildFromState();
soundBtn.textContent = state.soundOn ? "🔊" : "🔇";
renderInventory();
renderFoodInventory();
updateHud();
