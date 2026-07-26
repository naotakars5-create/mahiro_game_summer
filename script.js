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
  { key: "fish", name: "さかな", emoji: "🐟" },
  { key: "kakigori", name: "かき氷", emoji: "🍧" },
];

const HOUSE_RECIPE = { red: 4, gray: 3, blue: 1 };
const BUILDING_RECIPE = { gray: 6, blue: 5, yellow: 2 };
const SHOP_RECIPE = { yellow: 4, red: 3, blue: 2 };
const CINEMA_RECIPE = { gray: 5, red: 4, yellow: 4, blue: 2 };
const PARK_RECIPE = { green: 5, yellow: 3, blue: 2 };
const SCHOOL_RECIPE = { gray: 6, red: 4, blue: 4, yellow: 3 };
const YATAI_RECIPE = { red: 3, yellow: 2 };
const RESTAURANT_RECIPE = { red: 3, yellow: 3, gray: 2 };
const POND_RECIPE = { blue: 4, gray: 2 };
const CAR_RECIPE = { red: 5, gray: 4, blue: 3 };
const TRAIN_RECIPE = { gray: 8, blue: 4, yellow: 3, red: 2 };
const BICYCLE_RECIPE = { gray: 3, red: 2, blue: 1 };
const VEHICLE_KINDS = ["car", "train", "bicycle"];

const SAVE_KEY_PREFIX = "legoTown3dSave_v1_slot";
const LAST_SLOT_KEY = "legoTown3dLastSlot";

function saveKeyFor(slot) {
  return `${SAVE_KEY_PREFIX}${slot}`;
}

let currentSlot = Number(localStorage.getItem(LAST_SLOT_KEY)) || 1;

// ふるい（スロットが なかった ころの）セーブを 1ばんの まちへ ひきつぐ
(function migrateLegacySave() {
  try {
    const legacy = localStorage.getItem("legoTown3dSave_v1");
    if (legacy && !localStorage.getItem(saveKeyFor(1))) {
      localStorage.setItem(saveKeyFor(1), legacy);
    }
  } catch (e) {
    // いじょうが あっても むしできるようにする
  }
})();

let state = {
  inventory: { red: 0, gray: 0, blue: 0, yellow: 0, green: 0, purple: 0 },
  food: { apple: 0, bread: 0, carrot: 0, onigiri: 0, fish: 0, kakigori: 0 },
  totalCollected: 0,
  structures: [], // {type:'house'|'building'|'shop', x, z, paletteIndex}
  cars: [], // {x, z, colorIndex}
  toyBlocks: [], // {x, y, z, colorKey}
  achievements: {}, // {id: true}
  lastRankName: null,
  soundOn: true,
  xp: 0,
  level: 1,
  story: { started: false, stage: 0, progress: 0, done: false },
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
      achievements: state.achievements,
      lastRankName: state.lastRankName,
      soundOn: state.soundOn,
      xp: state.xp,
      level: state.level,
      story: state.story,
    };
    localStorage.setItem(saveKeyFor(currentSlot), JSON.stringify(toSave));
  } catch (e) {
    console.warn("ほぞんに しっぱいしました", e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(saveKeyFor(currentSlot));
    if (raw) {
      const loaded = JSON.parse(raw);
      state = Object.assign(state, loaded);
    }
    FOOD_TYPES.forEach((f) => {
      if (typeof state.food[f.key] !== "number") state.food[f.key] = 0;
    });
    COLORS.forEach((c) => {
      if (typeof state.inventory[c.key] !== "number") state.inventory[c.key] = 0;
    });
    if (!state.achievements || typeof state.achievements !== "object") state.achievements = {};
    if (typeof state.xp !== "number") state.xp = 0;
    if (typeof state.level !== "number") state.level = 1;
    if (!state.story || typeof state.story !== "object") {
      state.story = { started: false, stage: 0, progress: 0, done: false };
    }
  } catch (e) {
    console.warn("よみこみに しっぱいしました", e);
  }
}

// ---------- じっせき（アチーブメント） ----------
const ACHIEVEMENTS = [
  { id: "first_building", label: "はじめての たてもの", emoji: "🏠" },
  { id: "five_buildings", label: "まちづくりマスター", emoji: "🏙️" },
  { id: "collector_50", label: "ブロックコレクター", emoji: "🧱" },
  { id: "rider", label: "うしのりめいじん", emoji: "🐄" },
  { id: "fisher", label: "つりめいじん", emoji: "🎣" },
  { id: "talker", label: "おしゃべりずき", emoji: "💬" },
  { id: "quest_complete", label: "おてつだいずき", emoji: "🎁" },
  { id: "shop_trade", label: "おかいものじょうず", emoji: "🛒" },
  { id: "photographer", label: "カメラマン", emoji: "📸" },
  { id: "school_built", label: "がっこう かんせい", emoji: "🏫" },
  { id: "matsuri_food", label: "おまつりずき", emoji: "🏮" },
  { id: "night_watcher", label: "よふかしさん", emoji: "🌙" },
  { id: "level_5", label: "レベル5に とうたつ", emoji: "⭐" },
  { id: "story_clear", label: "ものがたり クリア", emoji: "📖" },
];

function unlockAchievement(id) {
  if (state.achievements[id]) return;
  state.achievements[id] = true;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) {
    showMessage(`🏆 じっせき かいじょ：${a.emoji} ${a.label}`);
    playTone(880, 0.1);
    playTone(1100, 0.12);
    playTone(1400, 0.16);
  }
  renderAchievements();
  saveState();
}

function renderAchievements() {
  const el = document.getElementById("achievements-panel");
  if (!el) return;
  const doneCount = ACHIEVEMENTS.filter((a) => state.achievements[a.id]).length;
  el.innerHTML =
    `<div class="achievements-title">🏆 じっせき（${doneCount}/${ACHIEVEMENTS.length}）</div>` +
    ACHIEVEMENTS.map((a) => {
      const done = !!state.achievements[a.id];
      return `<div class="achievement-badge ${done ? "done" : ""}">${done ? a.emoji : "❔"} ${a.label}</div>`;
    }).join("");
}

// ---------- けいけんち・レベル ----------
function xpForNextLevel(level) {
  return 30 + (level - 1) * 20;
}

const LEVEL_PERKS = {
  2: "はしる スピードが ちょっと あがった！",
  3: "はなしかけられる きょりが ひろがった！",
  4: "はしる スピードが ちょっと あがった！",
  5: "ぼうしを てにいれた！",
  6: "はしる スピードが ちょっと あがった！",
  7: "アクションの とどく はんいが ひろがった！",
  8: "マントを てにいれた！",
  9: "はしる スピードが ちょっと あがった！",
  10: "スーパーアクションを おぼえた！",
};

function playerSpeedForLevel(level) {
  return 5.5 + (level - 1) * 0.25;
}

function talkRadiusBonus() {
  return state.level >= 3 ? 1.0 : 0;
}

function actionRadiusBonus() {
  return state.level >= 7 ? 1.0 : 0;
}

function onLevelUp(level) {
  playTone(880, 0.1);
  playTone(1100, 0.12);
  playTone(1320, 0.1);
  playTone(1600, 0.16);
  player.speed = playerSpeedForLevel(level);
  applyLevelCosmetics(level);
  const perk = LEVEL_PERKS[level];
  showMessage(`🌟 レベル${level}に なった！${perk ? " " + perk : ""}`);
  if (level >= 5) unlockAchievement("level_5");
}

function addXp(amount) {
  if (!amount) return;
  state.xp += amount;
  while (state.xp >= xpForNextLevel(state.level)) {
    state.xp -= xpForNextLevel(state.level);
    state.level++;
    onLevelUp(state.level);
  }
  renderLevelBadge();
  saveState();
}

function renderLevelBadge() {
  const badge = document.getElementById("level-badge");
  const bar = document.getElementById("xp-bar-fill");
  if (badge) badge.textContent = `⭐ レベル${state.level}`;
  if (bar) {
    const need = xpForNextLevel(state.level);
    bar.style.width = `${Math.min(100, Math.round((state.xp / need) * 100))}%`;
  }
}

// ---------- ものがたり（むらちょうさんの おねがい） ----------
const STORY_STAGES = [
  { key: "collect_blocks", title: "はじめての おてつだい", hint: "ブロックを 10こ あつめてきて！", target: 10, rewardXp: 20 },
  { key: "build_house", title: "じぶんの いえ", hint: "「いえ」を 1けん たてよう！", rewardXp: 25 },
  { key: "feed_animal", title: "どうぶつと なかよく", hint: "どうぶつに たべものを あげよう！", rewardXp: 20 },
  { key: "catch_fish", title: "つりに ちょうせん", hint: "「いけ」を つくって さかなを つろう！", rewardXp: 25 },
  { key: "shop_trade", title: "おかいもの", hint: "「おみせ」で ブロックを こうかんしよう！", rewardXp: 20 },
  { key: "watch_movie", title: "えいがかんへ", hint: "「えいがかん」の マネージャーに はなしかけて えいがを みよう！", rewardXp: 30 },
  { key: "restaurant_eat", title: "ごはんの じかん", hint: "「レストラン」で ごはんを たべよう！", rewardXp: 30 },
  { key: "grow_town", title: "まちを おおきく", hint: "たてものを あわせて 5つ たてよう！", target: 5, rewardXp: 50 },
];

function currentStoryStage() {
  if (!state.story.started || state.story.done) return null;
  return STORY_STAGES[state.story.stage] || null;
}

function advanceStory(key, amount = 1) {
  const stage = currentStoryStage();
  if (!stage || stage.key !== key) return;
  if (stage.target) {
    state.story.progress = key === "grow_town" ? state.structures.length : state.story.progress + amount;
    if (state.story.progress < stage.target) {
      renderStoryPanel();
      saveState();
      return;
    }
  }
  completeStoryStage();
}

function completeStoryStage() {
  const stage = STORY_STAGES[state.story.stage];
  addXp(stage.rewardXp);
  showMessage(`📖「${stage.title}」クリア！`);
  playTone(1000, 0.12);
  playTone(1300, 0.14);
  playTone(1600, 0.16);
  state.story.stage++;
  state.story.progress = 0;
  if (state.story.stage >= STORY_STAGES.length) {
    state.story.done = true;
    unlockAchievement("story_clear");
  }
  renderStoryPanel();
  saveState();
}

function handleChiefTalk() {
  if (!state.story.started) {
    state.story.started = true;
    state.story.stage = 0;
    state.story.progress = 0;
    showMessage("むらちょうさん「ようこそ！ この まちを もっと にぎやかに してほしいんじゃ。てつだって くれるかい？」");
    renderStoryPanel();
    saveState();
    return;
  }
  if (state.story.done) {
    showMessage("むらちょうさん「たくさん てつだって くれて ありがとう！ この まちは きみの おかげじゃ」");
    return;
  }
  const stage = STORY_STAGES[state.story.stage];
  const progressText = stage.target ? `（いま ${Math.min(state.story.progress, stage.target)}/${stage.target}）` : "";
  showMessage(`むらちょうさん「${stage.hint}${progressText}」`);
}

function renderStoryPanel() {
  if (!storyPanel) return;
  if (!state.story.started) {
    storyPanel.innerHTML =
      `<div class="story-title">📖 ものがたり</div>` +
      `<div class="story-hint">むらちょうさんに はなしかけて ぼうけんを はじめよう！</div>`;
    return;
  }
  if (state.story.done) {
    storyPanel.innerHTML =
      `<div class="story-title">📖 ものがたり クリア！</div>` +
      `<div class="story-hint">むらちょうさんの おねがいを ぜんぶ かなえたよ。ありがとう！</div>`;
    return;
  }
  const stage = STORY_STAGES[state.story.stage];
  const progressText = stage.target ? `（${Math.min(state.story.progress, stage.target)}/${stage.target}）` : "";
  storyPanel.innerHTML =
    `<div class="story-title">📖 ${state.story.stage + 1}/${STORY_STAGES.length}：${stage.title}</div>` +
    `<div class="story-hint">${stage.hint}${progressText}</div>` +
    `<div class="story-progress">むらちょうさんに はなしかけると すすみぐあいを おしえてくれるよ</div>`;
}

// ---------- まちの ランク ----------
const RANK_THRESHOLDS = [
  { name: "むら", min: 0 },
  { name: "まち", min: 5 },
  { name: "とかい", min: 12 },
  { name: "だいとかい", min: 25 },
];

function currentRank() {
  const count = state.structures.length + state.cars.length;
  let rank = RANK_THRESHOLDS[0];
  for (const r of RANK_THRESHOLDS) {
    if (count >= r.min) rank = r;
  }
  return rank;
}

function updateTownRank() {
  const el = document.getElementById("rank-badge");
  const rank = currentRank();
  if (el) el.textContent = `🏅 ${rank.name}`;
  if (state.lastRankName && state.lastRankName !== rank.name) {
    showMessage(`🏅 まちが「${rank.name}」に なったよ！`);
    playTone(700, 0.1);
    playTone(1000, 0.15);
  }
  state.lastRankName = rank.name;
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
const cameraViewBtn = document.getElementById("camera-view-btn");
const photoBtn = document.getElementById("photo-btn");
const exitHouseBtn = document.getElementById("exit-house-btn");
const shopTradeBtn = document.getElementById("shop-trade-btn");
const exitCarBtn = document.getElementById("exit-car-btn");
const confirmPlaceBtn = document.getElementById("confirm-place-btn");
const cancelPlaceBtn = document.getElementById("cancel-place-btn");
const doneToyBtn = document.getElementById("done-toy-btn");
const toyPaletteEl = document.getElementById("toy-palette");
const buildMenuToggle = document.getElementById("build-menu-toggle");
const buildMenuPanel = document.getElementById("build-menu");
const achievementsToggle = document.getElementById("achievements-toggle");
const achievementsPanel = document.getElementById("achievements-panel");
const storyToggle = document.getElementById("story-toggle");
const storyPanel = document.getElementById("story-panel");
const cinemaWatchBtn = document.getElementById("cinema-watch-btn");
const restaurantEatBtn = document.getElementById("restaurant-eat-btn");
const buildButtons = [
  document.getElementById("build-house-btn"),
  document.getElementById("build-building-btn"),
  document.getElementById("build-shop-btn"),
  document.getElementById("build-restaurant-btn"),
  document.getElementById("build-cinema-btn"),
  document.getElementById("build-school-btn"),
  document.getElementById("build-park-btn"),
  document.getElementById("build-pond-btn"),
  document.getElementById("build-yatai-btn"),
  document.getElementById("build-car-btn"),
  document.getElementById("build-train-btn"),
  document.getElementById("build-bicycle-btn"),
  document.getElementById("build-toy-btn"),
  document.getElementById("move-btn"),
];

buildMenuToggle.addEventListener("click", () => buildMenuPanel.classList.toggle("hidden"));
achievementsToggle.addEventListener("click", () => achievementsPanel.classList.toggle("hidden"));
storyToggle.addEventListener("click", () => storyPanel.classList.toggle("hidden"));

let mode = "town"; // 'town' | 'inside'

function updateHud() {
  const driving = !!drivingCar;
  const placing = !!placementKind;
  buildButtons.forEach((b) => b.classList.toggle("hidden", mode === "inside" || placing || driving));
  buildMenuToggle.classList.toggle("hidden", mode === "inside" || placing || driving);
  if (mode === "inside" || placing || driving) buildMenuPanel.classList.add("hidden");
  soundBtn.classList.toggle("hidden", placing);
  cameraViewBtn.classList.toggle("hidden", placing);
  photoBtn.classList.toggle("hidden", placing);
  achievementsToggle.classList.toggle("hidden", placing);
  if (placing) achievementsPanel.classList.add("hidden");
  storyToggle.classList.toggle("hidden", placing);
  if (placing) storyPanel.classList.add("hidden");
  exitHouseBtn.classList.toggle("hidden", mode !== "inside");
  shopTradeBtn.classList.toggle("hidden", !(mode === "inside" && currentBuilding && currentBuilding.type === "shop"));
  cinemaWatchBtn.classList.toggle("hidden", !(mode === "inside" && currentBuilding && currentBuilding.type === "cinema"));
  restaurantEatBtn.classList.toggle("hidden", !(mode === "inside" && currentBuilding && currentBuilding.type === "restaurant"));
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const SKY_COLOR = 0x8ed1fc;
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, 46, 118);

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

// ---------- ひると よる ----------
const DAY_CYCLE_SECONDS = 180;
const NIGHT_SKY_COLOR = new THREE.Color(0x0c1436);
const DAY_SKY_COLOR = new THREE.Color(SKY_COLOR);
const tmpSkyColor = new THREE.Color(SKY_COLOR);
scene.background = tmpSkyColor;

const STAR_COUNT = 160;
const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 60 + Math.random() * 45;
  starPositions[i * 3] = Math.cos(angle) * radius;
  starPositions[i * 3 + 1] = 26 + Math.random() * 44;
  starPositions[i * 3 + 2] = Math.sin(angle) * radius;
}
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, transparent: true, opacity: 0 });
const stars = new THREE.Points(starGeometry, starMaterial);
skyGroup.add(stars);

function updateDayNight(time) {
  const dayPhase = (time % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS;
  const theta = dayPhase * Math.PI * 2;
  const brightness = (Math.sin(theta) + 1) / 2; // 0(よる) ～ 1(ひる)
  tmpSkyColor.copy(NIGHT_SKY_COLOR).lerp(DAY_SKY_COLOR, brightness);
  scene.fog.color.copy(tmpSkyColor);
  ambientLight.intensity = 0.25 + brightness * 0.45;
  sunLight.intensity = 0.08 + brightness * 0.8;
  sun.material.color.set(brightness > 0.35 ? 0xfff2a8 : 0xe8eef5);
  stars.material.opacity = Math.max(0, 0.9 - brightness * 1.8);
  return brightness;
}

// ---------- てんき（はれ・あめ・ゆき） ----------
let weather = "clear";
let weatherTimer = 40 + Math.random() * 30;
const WEATHER_MESSAGES = {
  clear: "☀️ はれてきたよ",
  rain: "☔ あめが ふってきたよ",
  snow: "❄️ ゆきが ふってきたよ",
};

function makeWeatherPoints(count, color, size) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * 30;
    positions[i * 3 + 1] = Math.random() * 24;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * 30;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0 });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return points;
}
const RAIN_COUNT = 260;
const rainPoints = makeWeatherPoints(RAIN_COUNT, 0xaec9f2, 0.15);
const SNOW_COUNT = 200;
const snowPoints = makeWeatherPoints(SNOW_COUNT, 0xffffff, 0.3);

function pickNextWeather() {
  const r = Math.random();
  if (r < 0.55) return "clear";
  if (r < 0.8) return "rain";
  return "snow";
}

function setWeather(next) {
  if (next === weather) return;
  weather = next;
  showMessage(WEATHER_MESSAGES[weather]);
  playTone(weather === "clear" ? 660 : 420, 0.12);
}

function updateWeather(delta, centerX, centerZ) {
  weatherTimer -= delta;
  if (weatherTimer <= 0) {
    weatherTimer = 50 + Math.random() * 40;
    setWeather(pickNextWeather());
  }
  rainPoints.material.opacity = THREE.MathUtils.lerp(rainPoints.material.opacity, weather === "rain" ? 0.7 : 0, delta * 3);
  snowPoints.material.opacity = THREE.MathUtils.lerp(snowPoints.material.opacity, weather === "snow" ? 0.85 : 0, delta * 3);

  if (rainPoints.material.opacity > 0.02) {
    const pos = rainPoints.geometry.attributes.position;
    for (let i = 0; i < RAIN_COUNT; i++) {
      let y = pos.getY(i) - delta * 22;
      if (y < 0) y = 20 + Math.random() * 6;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
  if (snowPoints.material.opacity > 0.02) {
    const pos = snowPoints.geometry.attributes.position;
    for (let i = 0; i < SNOW_COUNT; i++) {
      let y = pos.getY(i) - delta * 3;
      if (y < 0) y = 20 + Math.random() * 6;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
  rainPoints.position.set(centerX, 0, centerZ);
  snowPoints.position.set(centerX, 0, centerZ);
}

// ---------- なつまつりの はなび ----------
const FIREWORK_COLORS = [0xff6b6b, 0xffd23b, 0x48cae4, 0x9d4edd, 0x43aa8b, 0xffffff];
const fireworks = [];

function spawnFirework(x, z) {
  const count = 60;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];
  const y = 18 + Math.random() * 8;
  for (let i = 0; i < count; i++) {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const speed = 4 + Math.random() * 3;
    velocities.push({
      x: Math.sin(phi) * Math.cos(theta) * speed,
      y: Math.sin(phi) * Math.sin(theta) * speed,
      z: Math.cos(phi) * speed,
    });
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
  const material = new THREE.PointsMaterial({ color, size: 0.35, transparent: true, opacity: 1 });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  fireworks.push({ points, velocities, age: 0, maxAge: 1.6, baseX: x, baseY: y, baseZ: z });
  playTone(180 + Math.random() * 60, 0.1);
  playTone(600 + Math.random() * 200, 0.3);
}

function updateFireworks(delta) {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const fw = fireworks[i];
    fw.age += delta;
    const t = fw.age;
    const pos = fw.points.geometry.attributes.position;
    for (let j = 0; j < fw.velocities.length; j++) {
      const v = fw.velocities[j];
      pos.setX(j, fw.baseX + v.x * t);
      pos.setY(j, fw.baseY + v.y * t - 2 * t * t);
      pos.setZ(j, fw.baseZ + v.z * t);
    }
    pos.needsUpdate = true;
    fw.points.material.opacity = Math.max(0, 1 - t / fw.maxAge);
    if (fw.age >= fw.maxAge) {
      scene.remove(fw.points);
      fw.points.geometry.dispose();
      fw.points.material.dispose();
      fireworks.splice(i, 1);
    }
  }
}

let fireworkTimer = 4;
function maybeSpawnFirework(delta, brightness, centerX, centerZ) {
  if (brightness > 0.32) {
    fireworkTimer = 3 + Math.random() * 3;
    return;
  }
  fireworkTimer -= delta;
  if (fireworkTimer <= 0) {
    fireworkTimer = 4 + Math.random() * 5;
    const angle = Math.random() * Math.PI * 2;
    const dist = 15 + Math.random() * 20;
    spawnFirework(centerX + Math.cos(angle) * dist, centerZ + Math.sin(angle) * dist);
  }
}

// ==========================================================
// フィールド（まち）の きほん サイズ
// ==========================================================
const FIELD_HALF_X = 66;
const FIELD_HALF_Z = 58;
const ROAD_HALF_W = 6.5;
const VERTICAL_ROAD_X = [0, 30];
const HORIZONTAL_ROAD_Z = [-24, 24];

function isOnRoad(x, z, margin) {
  const m = margin || 0;
  if (VERTICAL_ROAD_X.some((vx) => Math.abs(x - vx) < ROAD_HALF_W + m)) return true;
  if (HORIZONTAL_ROAD_Z.some((hz) => Math.abs(z - hz) < ROAD_HALF_W + m)) return true;
  return false;
}

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

// ---------- みち（どうろネットワーク：たてよこ の みちが こうさてんで まじわる） ----------
const roadMat = new THREE.MeshLambertMaterial({ color: 0xd9c9a0 });
const dashMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 });
const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xfff8ec });

function buildVerticalRoad(xCenter) {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF_W * 2, FIELD_HALF_Z * 2), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(xCenter, 0.015, 0);
  townGroup.add(road);

  for (let z = -FIELD_HALF_Z + 1; z < FIELD_HALF_Z; z += 3) {
    if (HORIZONTAL_ROAD_Z.some((hz) => Math.abs(z - hz) < ROAD_HALF_W + 1)) continue; // こうさてんは あけておく
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 1.4), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(xCenter, 0.02, z);
    townGroup.add(dash);
  }
  [-1, 1].forEach((side) => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.2, FIELD_HALF_Z * 2), edgeLineMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(xCenter + side * (ROAD_HALF_W - 0.25), 0.02, 0);
    townGroup.add(edge);
  });
}

function buildHorizontalRoad(zCenter) {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_HALF_X * 2, ROAD_HALF_W * 2), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.016, zCenter);
  townGroup.add(road);

  for (let x = -FIELD_HALF_X + 1; x < FIELD_HALF_X; x += 3) {
    if (VERTICAL_ROAD_X.some((vx) => Math.abs(x - vx) < ROAD_HALF_W + 1)) continue; // こうさてんは あけておく
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.15), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.021, zCenter);
    townGroup.add(dash);
  }
  [-1, 1].forEach((side) => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_HALF_X * 2, 0.2), edgeLineMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(0, 0.021, zCenter + side * (ROAD_HALF_W - 0.25));
    townGroup.add(edge);
  });
}

VERTICAL_ROAD_X.forEach(buildVerticalRoad);
HORIZONTAL_ROAD_Z.forEach(buildHorizontalRoad);

// ---------- しんごう（こうさてん） ----------
const nsRedMat = new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide });
const nsYellowMat = new THREE.MeshBasicMaterial({ color: 0x332b00, side: THREE.DoubleSide });
const nsGreenMat = new THREE.MeshBasicMaterial({ color: 0x003300, side: THREE.DoubleSide });
const ewRedMat = new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide });
const ewYellowMat = new THREE.MeshBasicMaterial({ color: 0x332b00, side: THREE.DoubleSide });
const ewGreenMat = new THREE.MeshBasicMaterial({ color: 0x003300, side: THREE.DoubleSide });

function createSignalHead(redMat, yellowMat, greenMat) {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.7, 0.22),
    new THREE.MeshLambertMaterial({ color: 0x2b2b2b })
  );
  group.add(box);
  const bulbGeo = new THREE.CircleGeometry(0.09, 12);
  const red = new THREE.Mesh(bulbGeo, redMat);
  red.position.set(0, 0.22, 0.12);
  group.add(red);
  const yellow = new THREE.Mesh(bulbGeo, yellowMat);
  yellow.position.set(0, 0, 0.12);
  group.add(yellow);
  const green = new THREE.Mesh(bulbGeo, greenMat);
  green.position.set(0, -0.22, 0.12);
  group.add(green);
  return group;
}

function createTrafficLightPole(x, z) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0x555555 })
  );
  pole.position.y = 1.5;
  group.add(pole);

  const headNS = createSignalHead(nsRedMat, nsYellowMat, nsGreenMat);
  headNS.position.y = 2.85;
  group.add(headNS);

  const headEW = createSignalHead(ewRedMat, ewYellowMat, ewGreenMat);
  headEW.position.y = 2.85;
  headEW.rotation.y = Math.PI / 2;
  group.add(headEW);

  group.position.set(x, 0, z);
  townGroup.add(group);
}

VERTICAL_ROAD_X.forEach((vx) => {
  HORIZONTAL_ROAD_Z.forEach((hz) => {
    createTrafficLightPole(vx + ROAD_HALF_W + 0.8, hz + ROAD_HALF_W + 0.8);
  });
});

const TRAFFIC_LIGHT_GREEN = 4;
const TRAFFIC_LIGHT_YELLOW = 1;
const TRAFFIC_LIGHT_HALF = TRAFFIC_LIGHT_GREEN + TRAFFIC_LIGHT_YELLOW;
const TRAFFIC_LIGHT_CYCLE = TRAFFIC_LIGHT_HALF * 2;

function trafficLightStates(time) {
  const t = time % TRAFFIC_LIGHT_CYCLE;
  if (t < TRAFFIC_LIGHT_GREEN) return { ns: "green", ew: "red" };
  if (t < TRAFFIC_LIGHT_HALF) return { ns: "yellow", ew: "red" };
  if (t < TRAFFIC_LIGHT_HALF + TRAFFIC_LIGHT_GREEN) return { ns: "red", ew: "green" };
  return { ns: "red", ew: "yellow" };
}

function applySignalState(redMat, yellowMat, greenMat, state) {
  redMat.color.set(state === "red" ? 0xff3b30 : 0x330000);
  yellowMat.color.set(state === "yellow" ? 0xffd23b : 0x332b00);
  greenMat.color.set(state === "green" ? 0x2ecc71 : 0x003300);
}

// ---------- き ----------

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

for (let i = 0; i < 46; i++) {
  let x, z;
  let tries = 0;
  do {
    x = (Math.random() * 2 - 1) * (FIELD_HALF_X - 3);
    z = (Math.random() * 2 - 1) * (FIELD_HALF_Z - 3);
    tries++;
  } while (isOnRoad(x, z, 2) && tries < 20);
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
    animate(phase, moving, punch, pose) {
      if (pose === "bike") {
        const pedal = Math.sin(phase) * 0.75;
        leftLeg.rotation.x = pedal;
        rightLeg.rotation.x = -pedal;
        leftArm.rotation.x = -1.1;
        rightArm.rotation.x = -1.1;
        return;
      }
      if (pose === "ride") {
        const sway = moving ? Math.sin(phase) * 0.35 : 0;
        leftLeg.rotation.x = sway;
        rightLeg.rotation.x = -sway;
        leftArm.rotation.x = -0.7;
        rightArm.rotation.x = -0.7;
        return;
      }
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

// ---------- レベルアップで てにいれる みため ----------
const playerHat = new THREE.Mesh(
  new THREE.ConeGeometry(0.28, 0.36, 8),
  new THREE.MeshLambertMaterial({ color: col("#ff6b6b") })
);
playerHat.position.set(0, 2.18, 0);
playerHat.visible = false;
playerRig.group.add(playerHat);

const playerCape = new THREE.Mesh(
  new THREE.PlaneGeometry(0.55, 0.75),
  new THREE.MeshLambertMaterial({ color: col("#9d4edd"), side: THREE.DoubleSide })
);
playerCape.position.set(0, 1.05, -0.17);
playerCape.rotation.x = 0.15;
playerCape.visible = false;
playerRig.group.add(playerCape);

function applyLevelCosmetics(level) {
  playerHat.visible = level >= 5;
  playerCape.visible = level >= 8;
}

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

function createRestaurantMesh(palette) {
  const p = palette || RESTAURANT_PALETTES[0];
  const wallHex = p.wall;
  const awningHex = p.awning;
  const doorHex = "#5b3a29";
  const group = new THREE.Group();

  const w = 3.8;
  const h = 2.6;
  const d = 3.2;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: col(wallHex) })
  );
  body.position.y = h / 2;
  group.add(body);

  // しましまの オーニング
  const stripeCount = 5;
  const stripeW = (w + 0.6) / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(stripeW, 0.3, 1.0),
      new THREE.MeshLambertMaterial({ color: col(i % 2 === 0 ? awningHex : "#fffdf5") })
    );
    stripe.position.set(-((w + 0.6) / 2) + stripeW * (i + 0.5), h - 0.1, d / 2 + 0.4);
    group.add(stripe);
  }

  const signTex = makeSignTexture(p.food, "#fff8ec", awningHex);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.6),
    new THREE.MeshLambertMaterial({ map: signTex })
  );
  sign.position.set(0, h + 0.5, d / 2 + 0.02);
  group.add(sign);

  // テラスせきの テーブルと パラソル
  const terraceX = w / 2 + 0.9;
  const terraceZ = d / 2 - 0.4;
  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.55, 12),
    new THREE.MeshLambertMaterial({ color: col("#8a5a2b") })
  );
  table.position.set(terraceX, 0.275, terraceZ);
  group.add(table);

  const parasolPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8),
    new THREE.MeshLambertMaterial({ color: col("#adb5bd") })
  );
  parasolPole.position.set(terraceX, 0.9, terraceZ);
  group.add(parasolPole);

  const parasol = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 0.4, 10),
    new THREE.MeshLambertMaterial({ color: col(p.parasol) })
  );
  parasol.position.set(terraceX, 1.55, terraceZ);
  group.add(parasol);

  [-0.55, 0.55].forEach((cz) => {
    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.5, 0.35),
      new THREE.MeshLambertMaterial({ color: col("#5b3a29") })
    );
    chair.position.set(terraceX, 0.25, terraceZ + cz);
    group.add(chair);
  });

  const doorLocal = addDoorAndWindows(group, w / 2, h, doorHex, 1);

  return { group, doorLocal, wallHex, label: "レストラン" };
}

const RESTAURANT_PALETTES = [
  { wall: "#fff3e0", awning: "#e63946", parasol: "#e63946", food: "パスタ" },
  { wall: "#ffe8d6", awning: "#43aa8b", parasol: "#43aa8b", food: "ピザ" },
  { wall: "#f6e3c6", awning: "#f9c74f", parasol: "#f9c74f", food: "カレー" },
  { wall: "#eef2f5", awning: "#48cae4", parasol: "#48cae4", food: "ハンバーグ" },
];

function createCinemaMesh(palette) {
  const p = palette || CINEMA_PALETTES[0];
  const wallHex = p.wall;
  const marqueeHex = p.marquee;
  const doorHex = "#2b2b2b";
  const group = new THREE.Group();

  const w = 4.4;
  const h = 2.8;
  const d = 3.4;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: col(wallHex) })
  );
  body.position.y = h / 2;
  group.add(body);

  const marquee = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.5, 0.9, 0.5),
    new THREE.MeshLambertMaterial({ color: col(marqueeHex) })
  );
  marquee.position.set(0, h - 0.55, d / 2 + 0.3);
  group.add(marquee);

  const signTex = makeSignTexture(p.text, marqueeHex, "#fff2a8");
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.7),
    new THREE.MeshLambertMaterial({ map: signTex })
  );
  sign.position.set(0, h - 0.55, d / 2 + 0.56);
  group.add(sign);

  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
  for (let i = 0; i < 7; i++) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), bulbMat);
    bulb.position.set(-1.6 + i * 0.53, h - 0.15, d / 2 + 0.3);
    group.add(bulb);
  }

  [-1, 1].forEach((side) => {
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 1.0),
      new THREE.MeshLambertMaterial({ color: col(shadeColor(marqueeHex, side * 15)) })
    );
    poster.position.set(side * (w / 2 - 0.6), h * 0.45, d / 2 + 0.02);
    group.add(poster);
  });

  const doorLocal = addDoorAndWindows(group, w / 2, h, doorHex, 1);

  return { group, doorLocal, wallHex, label: "えいがかん" };
}

const CINEMA_PALETTES = [
  { wall: "#3a3a3a", marquee: "#e63946", text: "えいがかん" },
  { wall: "#4a4e69", marquee: "#f9c74f", text: "シネマ" },
  { wall: "#22223b", marquee: "#9d4edd", text: "ロードショー" },
  { wall: "#5b3a29", marquee: "#48cae4", text: "えいがかん" },
];

function createSchoolMesh(palette) {
  const p = palette || SCHOOL_PALETTES[0];
  const wallHex = p.wall;
  const winHex = p.win;
  const doorHex = p.door;
  const group = new THREE.Group();

  const w = 5.6;
  const h = 4.2;
  const d = 3.4;
  const plainMat = new THREE.MeshLambertMaterial({ color: col(wallHex) });
  const winTex = makeWindowTexture(2, 6, wallHex, winHex);
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

  const signTex = makeSignTexture("がっこう", "#ffffff", doorHex);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 0.7),
    new THREE.MeshLambertMaterial({ map: signTex })
  );
  sign.position.set(0, h + 0.65, d / 2 + 0.02);
  group.add(sign);

  // こっきポール
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), poleMat);
  pole.position.set(w / 2 + 1.1, 1.5, d / 2 + 0.5);
  group.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.4),
    new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  );
  flag.position.set(w / 2 + 1.4, 2.75, d / 2 + 0.5);
  group.add(flag);
  const flagDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.11, 16),
    new THREE.MeshBasicMaterial({ color: 0xe63946, side: THREE.DoubleSide })
  );
  flagDot.position.set(w / 2 + 1.4, 2.75, d / 2 + 0.51);
  group.add(flagDot);

  const doorLocal = addDoorAndWindows(group, w / 2, h, doorHex, 1);

  return { group, doorLocal, wallHex, label: "がっこう" };
}

const SCHOOL_PALETTES = [
  { wall: "#fdf0d5", win: "#48cae4", door: "#e63946" },
  { wall: "#eef2f5", win: "#f9c74f", door: "#43aa8b" },
  { wall: "#fff3e0", win: "#9d4edd", door: "#48cae4" },
];

function createParkMesh(palette) {
  const p = palette || PARK_PALETTES[0];
  const group = new THREE.Group();

  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 0.05, 24),
    new THREE.MeshLambertMaterial({ color: col("#d9c9a0") })
  );
  plaza.position.y = 0.025;
  group.add(plaza);

  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.8, 0.4, 16),
    new THREE.MeshLambertMaterial({ color: col("#adb5bd") })
  );
  basin.position.y = 0.2;
  group.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.1, 16),
    new THREE.MeshLambertMaterial({ color: col("#48cae4") })
  );
  water.position.y = 0.42;
  group.add(water);
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8),
    new THREE.MeshLambertMaterial({ color: col("#adb5bd") })
  );
  spout.position.y = 0.65;
  group.add(spout);

  function makeBench(x, z, rotY) {
    const bench = new THREE.Group();
    const benchMat = new THREE.MeshLambertMaterial({ color: col(p.bench) });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.4), benchMat);
    seat.position.y = 0.35;
    bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 0.08), benchMat);
    back.position.set(0, 0.55, -0.16);
    bench.add(back);
    [-0.4, 0.4].forEach((lx) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.35, 0.35),
        new THREE.MeshLambertMaterial({ color: 0x5b3a29 })
      );
      leg.position.set(lx, 0.17, 0);
      bench.add(leg);
    });
    bench.position.set(x, 0, z);
    bench.rotation.y = rotY;
    group.add(bench);
  }
  makeBench(-1.7, 0.9, Math.PI / 2);
  makeBench(1.7, 0.9, -Math.PI / 2);

  const flowerColors = ["#e63946", "#f9c74f", "#9d4edd", "#48cae4"];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const fx = Math.cos(angle) * 1.9;
    const fz = Math.sin(angle) * 1.9 - 0.3;
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshLambertMaterial({ color: col(flowerColors[i % flowerColors.length]) })
    );
    flower.position.set(fx, 0.15, fz);
    group.add(flower);
  }

  const swing = new THREE.Group();
  const poleMat = new THREE.MeshLambertMaterial({ color: col(p.swing) });
  [-0.8, 0.8].forEach((lx) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), poleMat);
    pole.position.set(lx, 0.8, 0);
    swing.add(pole);
  });
  const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), poleMat);
  topBar.rotation.z = Math.PI / 2;
  topBar.position.y = 1.6;
  swing.add(topBar);
  const seatSwing = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.06, 0.25),
    new THREE.MeshLambertMaterial({ color: 0x8a5a2b })
  );
  seatSwing.position.set(0, 0.7, 0);
  swing.add(seatSwing);
  [-0.15, 0.15].forEach((sx) => {
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0x555555 })
    );
    rope.position.set(sx, 1.15, 0);
    swing.add(rope);
  });
  swing.position.set(0, 0, -1.8);
  group.add(swing);

  return { group, doorLocal: new THREE.Vector3(0, 0, 0), wallHex: p.bench, label: "こうえん" };
}

const PARK_PALETTES = [
  { bench: "#8a5a2b", swing: "#43aa8b" },
  { bench: "#5b3a29", swing: "#e63946" },
  { bench: "#a0662f", swing: "#48cae4" },
];

function createPondMesh(palette) {
  const p = palette || POND_PALETTES[0];
  const group = new THREE.Group();

  // くさむらから どろの きしべへ、そして みずへと グラデーションで つながる
  const grassBank = new THREE.Mesh(
    new THREE.CylinderGeometry(2.7, 2.85, 0.06, 28),
    new THREE.MeshLambertMaterial({ color: col(shadeColor(p.bank, 40)) })
  );
  grassBank.position.y = 0.03;
  group.add(grassBank);

  const bank = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.55, 0.1, 28),
    new THREE.MeshLambertMaterial({ color: col(p.bank) })
  );
  bank.position.y = 0.08;
  group.add(bank);

  const waterDeep = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.0, 0.08, 28),
    new THREE.MeshPhongMaterial({ color: col(shadeColor(p.water, -18)), shininess: 60, transparent: true, opacity: 0.92 })
  );
  waterDeep.position.y = 0.14;
  group.add(waterDeep);

  const waterShallow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.03, 28),
    new THREE.MeshPhongMaterial({ color: col(p.water), shininess: 90, transparent: true, opacity: 0.85 })
  );
  waterShallow.position.y = 0.185;
  group.add(waterShallow);

  // みずのなかに ゆれる さかなの かげ
  const fishMat = new THREE.MeshLambertMaterial({ color: 0x2b5f6b });
  [[-0.5, 0.3], [0.6, -0.4], [-0.1, -0.7]].forEach(([fx, fz]) => {
    const fish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), fishMat);
    fish.scale.set(1.6, 0.35, 0.7);
    fish.position.set(fx, 0.12, fz);
    fish.rotation.y = Math.random() * Math.PI * 2;
    group.add(fish);
  });

  // すいれんの は（はなつき）
  const padMat = new THREE.MeshLambertMaterial({ color: col("#4caf50") });
  const flowerMat = new THREE.MeshLambertMaterial({ color: 0xffb6d9 });
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    const rad = 0.9 + (i % 2) * 0.35;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12), padMat);
    pad.position.set(Math.cos(angle) * rad, 0.2, Math.sin(angle) * rad);
    group.add(pad);
    if (i % 2 === 0) {
      const flower = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 6), flowerMat);
      flower.position.set(Math.cos(angle) * rad, 0.27, Math.sin(angle) * rad);
      group.add(flower);
    }
  }

  // きしべの いわ
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8d99ae });
  [
    [2.15, 1.0, 0.22],
    [-2.0, -1.3, 0.28],
    [1.6, -1.9, 0.18],
  ].forEach(([rx, rz, rs]) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), rockMat);
    rock.position.set(rx, rs * 0.5, rz);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    group.add(rock);
  });

  // あしの くさむら
  function makeReedCluster(rx, rz) {
    const reedMat = new THREE.MeshLambertMaterial({ color: 0x5c8a3a });
    const capMat = new THREE.MeshLambertMaterial({ color: 0x6b4226 });
    for (let i = 0; i < 4; i++) {
      const h = 0.7 + Math.random() * 0.5;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 5), reedMat);
      const ox = rx + (Math.random() - 0.5) * 0.4;
      const oz = rz + (Math.random() - 0.5) * 0.4;
      stem.position.set(ox, h / 2 + 0.1, oz);
      stem.rotation.z = (Math.random() - 0.5) * 0.25;
      group.add(stem);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 6), capMat);
      cap.position.set(ox, h + 0.1, oz);
      cap.rotation.z = stem.rotation.z;
      group.add(cap);
    }
  }
  makeReedCluster(-2.3, 1.6);
  makeReedCluster(2.0, -1.6);

  // きの ドック（いたを ならべた ような みため）
  const dockMat = new THREE.MeshLambertMaterial({ color: col(p.dock) });
  const plankGapMat = new THREE.MeshLambertMaterial({ color: col(shadeColor(p.dock, -25)) });
  const dockBase = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 1.7), plankGapMat);
  dockBase.position.set(0, 0.16, 2.4);
  group.add(dockBase);
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 1.66), dockMat);
    plank.position.set(-0.24 + i * 0.16, 0.19, 2.4);
    group.add(plank);
  }
  [-0.28, 0.28].forEach((lx) => {
    [1.65, 3.15].forEach((lz) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), dockMat);
      leg.position.set(lx, 0.08, lz);
      group.add(leg);
    });
  });
  const postMat = new THREE.MeshLambertMaterial({ color: col(shadeColor(p.dock, -10)) });
  [-0.28, 0.28].forEach((lx) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 8), postMat);
    post.position.set(lx, 0.45, 3.1);
    group.add(post);
  });

  return { group, doorLocal: new THREE.Vector3(0, 0, 0), wallHex: p.bank, label: "いけ" };
}

const POND_PALETTES = [
  { bank: "#8a7355", water: "#48cae4", dock: "#8a5a2b" },
  { bank: "#7a6548", water: "#2b9eb3", dock: "#5b3a29" },
];

function createYataiMesh(palette) {
  const p = palette || YATAI_PALETTES[0];
  const group = new THREE.Group();

  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.7), new THREE.MeshLambertMaterial({ color: 0xceab7d }));
  counter.position.set(0, 0.45, 0.7);
  group.add(counter);

  [-1, 1].forEach((sideX) => {
    [-0.6, 0.9].forEach((posZ) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), woodMat);
      pole.position.set(sideX * 1.05, 1.1, posZ);
      group.add(pole);
    });
  });

  const clothMat = new THREE.MeshLambertMaterial({ color: col(p.cloth) });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 2.2), clothMat);
  roof.position.set(0, 2.2, 0.15);
  group.add(roof);

  const signTex = makeSignTexture(p.food, "#ffffff", p.cloth);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshLambertMaterial({ map: signTex }));
  sign.position.set(0, 1.7, 1.06);
  group.add(sign);

  const lanternMat = new THREE.MeshLambertMaterial({ color: 0xe63946 });
  [-1.4, 1.4].forEach((lx) => {
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 10), lanternMat);
    lantern.position.set(lx, 1.9, 0.9);
    group.add(lantern);
  });

  return { group, doorLocal: new THREE.Vector3(0, 0, 0), wallHex: p.cloth, label: "やたい" };
}

const YATAI_PALETTES = [
  { cloth: "#e63946", food: "やきそば" },
  { cloth: "#f9c74f", food: "たこやき" },
  { cloth: "#48cae4", food: "かき氷" },
];

const STRUCTURE_FACTORIES = {
  house: createHouseMesh,
  building: createBuildingMesh,
  shop: createShopMesh,
  cinema: createCinemaMesh,
  school: createSchoolMesh,
  park: createParkMesh,
  pond: createPondMesh,
  yatai: createYataiMesh,
  restaurant: createRestaurantMesh,
};
const STRUCTURE_PALETTES = {
  house: HOUSE_PALETTES,
  building: BUILDING_PALETTES,
  shop: SHOP_PALETTES,
  cinema: CINEMA_PALETTES,
  school: SCHOOL_PALETTES,
  park: PARK_PALETTES,
  pond: POND_PALETTES,
  yatai: YATAI_PALETTES,
  restaurant: RESTAURANT_PALETTES,
};
const STRUCTURE_RECIPES = {
  house: HOUSE_RECIPE,
  building: BUILDING_RECIPE,
  shop: SHOP_RECIPE,
  cinema: CINEMA_RECIPE,
  school: SCHOOL_RECIPE,
  park: PARK_RECIPE,
  pond: POND_RECIPE,
  yatai: YATAI_RECIPE,
  restaurant: RESTAURANT_RECIPE,
};
const STRUCTURE_HAS_DOOR = {
  house: true,
  building: true,
  shop: true,
  cinema: true,
  school: true,
  park: false,
  pond: false,
  yatai: false,
  restaurant: true,
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

const STRUCTURE_LABELS = {
  house: "🏠 いえ",
  building: "🏢 ビル",
  shop: "🏪 おみせ",
  cinema: "🎬 えいがかん",
  school: "🏫 がっこう",
  park: "🌳 こうえん",
  pond: "🎣 いけ",
  yatai: "🏮 やたい",
  restaurant: "🍝 レストラン",
};

document.getElementById("build-house-btn").addEventListener("click", () => requestBuild("house"));
document.getElementById("build-building-btn").addEventListener("click", () => requestBuild("building"));
document.getElementById("build-shop-btn").addEventListener("click", () => requestBuild("shop"));
document.getElementById("build-cinema-btn").addEventListener("click", () => requestBuild("cinema"));
document.getElementById("build-school-btn").addEventListener("click", () => requestBuild("school"));
document.getElementById("build-park-btn").addEventListener("click", () => requestBuild("park"));
document.getElementById("build-pond-btn").addEventListener("click", () => requestBuild("pond"));
document.getElementById("build-yatai-btn").addEventListener("click", () => requestBuild("yatai"));
document.getElementById("build-restaurant-btn").addEventListener("click", () => requestBuild("restaurant"));

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

function createTrainMesh(bodyHex) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.0, 4.2),
    new THREE.MeshLambertMaterial({ color: col(bodyHex) })
  );
  body.position.y = 0.75;
  group.add(body);

  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.9, 1.2),
    new THREE.MeshLambertMaterial({ color: col(shadeColor(bodyHex, -25)) })
  );
  cab.position.set(0, 1.65, -1.4);
  group.add(cab);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.0, 0.6),
    new THREE.MeshLambertMaterial({ color: col(shadeColor(bodyHex, -15)) })
  );
  nose.position.set(0, 0.75, 2.1);
  group.add(nose);

  const stack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.6, 10),
    new THREE.MeshLambertMaterial({ color: 0x2b2b2b })
  );
  stack.position.set(0, 1.55, 1.3);
  group.add(stack);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2a8 })
  );
  lamp.position.set(0, 1.0, 2.42);
  group.add(lamp);

  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 14);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  [-1.5, -0.5, 0.5, 1.5].forEach((z) => {
    [-0.95, 0.95].forEach((x) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.32, z);
      group.add(wheel);
    });
  });

  return group;
}

function createBicycleMesh(bodyHex) {
  const group = new THREE.Group();
  const wheelR = 0.42;
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
  const wheelGeo = new THREE.TorusGeometry(wheelR, 0.05, 8, 20);
  [-0.55, 0.55].forEach((z) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, wheelR, z);
    group.add(wheel);
  });

  const hubMat = new THREE.MeshLambertMaterial({ color: col(shadeColor(bodyHex, -15)) });
  [-0.55, 0.55].forEach((z) => {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(0, wheelR, z);
    group.add(hub);
  });

  const frameMat = new THREE.MeshLambertMaterial({ color: col(bodyHex) });
  const lowBar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.2, 8), frameMat);
  lowBar.rotation.x = Math.PI / 2;
  lowBar.position.set(0, wheelR, 0);
  group.add(lowBar);

  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), frameMat);
  seatPost.position.set(0, wheelR + 0.25, -0.35);
  group.add(seatPost);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.28), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
  seat.position.set(0, wheelR + 0.52, -0.35);
  group.add(seat);

  const handlePost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), frameMat);
  handlePost.position.set(0, wheelR + 0.3, 0.55);
  group.add(handlePost);
  const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.06), frameMat);
  handleBar.position.set(0, wheelR + 0.62, 0.55);
  group.add(handleBar);

  const pedal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 12), hubMat);
  pedal.rotation.x = Math.PI / 2;
  pedal.position.set(0, wheelR * 0.6, 0);
  group.add(pedal);

  return group;
}

const CAR_COLORS = ["#e63946", "#48cae4", "#f9c74f", "#43aa8b"];
const TRAIN_COLORS = ["#2b2b2b", "#264653", "#6a4c93", "#8d3b3b"];
const BICYCLE_COLORS = ["#e63946", "#48cae4", "#f9c74f", "#43aa8b", "#9d4edd"];
const VEHICLE_FACTORIES = { car: createCarMesh, train: createTrainMesh, bicycle: createBicycleMesh };
const VEHICLE_COLORS = { car: CAR_COLORS, train: TRAIN_COLORS, bicycle: BICYCLE_COLORS };
const VEHICLE_SPEED = { car: 9, train: 12, bicycle: 7 };
const VEHICLE_BOARD_RADIUS = { car: 2.1, train: 3, bicycle: 1.6 };
const VEHICLE_EXIT_DIST = { car: 2.8, train: 4, bicycle: 2.0 };
const placedCars = []; // {x, z, mesh, facing, type: 'car'|'train'|'bicycle'}

function pickVehicleColor(type) {
  const colors = VEHICLE_COLORS[type];
  const used = placedCars.filter((c) => (c.type || "car") === type).map((c) => c.colorIndex);
  const all = colors.map((_, i) => i);
  const unused = all.filter((i) => !used.includes(i));
  const pool = unused.length ? unused : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawnCar(x, z, colorIndex, type) {
  const vType = type || "car";
  const idx = colorIndex != null ? colorIndex : pickVehicleColor(vType);
  const mesh = VEHICLE_FACTORIES[vType](VEHICLE_COLORS[vType][idx]);
  mesh.position.set(x, 0, z);
  townGroup.add(mesh);
  placedCars.push({ x, z, mesh, facing: 0, colorIndex: idx, type: vType });
  return idx;
}

document.getElementById("build-car-btn").addEventListener("click", () => requestBuild("car"));
document.getElementById("build-train-btn").addEventListener("click", () => requestBuild("train"));
document.getElementById("build-bicycle-btn").addEventListener("click", () => requestBuild("bicycle"));

// ==========================================================
// どうろを はしる ほかの くるま（かざり）
// ==========================================================
const TRAFFIC_COLORS = ["#e63946", "#48cae4", "#f9c74f", "#43aa8b", "#9d4edd", "#f28482"];
const trafficCars = []; // {mesh, axis:'x'|'z', x, z, dir, speed}

function spawnTrafficCar(axis, roadCenter, dir) {
  const color = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
  const mesh = createCarMesh(color);
  const lane = roadCenter + (dir > 0 ? -ROAD_HALF_W * 0.45 : ROAD_HALF_W * 0.45);
  if (axis === "z") {
    const z = (Math.random() * 2 - 1) * FIELD_HALF_Z;
    mesh.position.set(lane, 0, z);
    mesh.rotation.y = dir > 0 ? 0 : Math.PI;
    townGroup.add(mesh);
    trafficCars.push({ mesh, axis, x: lane, z, dir, speed: 5 + Math.random() * 3 });
  } else {
    const x = (Math.random() * 2 - 1) * FIELD_HALF_X;
    mesh.position.set(x, 0, lane);
    mesh.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    townGroup.add(mesh);
    trafficCars.push({ mesh, axis, x, z: lane, dir, speed: 5 + Math.random() * 3 });
  }
}
VERTICAL_ROAD_X.forEach((vx) => {
  for (let i = 0; i < 2; i++) spawnTrafficCar("z", vx, 1);
  for (let i = 0; i < 2; i++) spawnTrafficCar("z", vx, -1);
});
HORIZONTAL_ROAD_Z.forEach((hz) => {
  for (let i = 0; i < 2; i++) spawnTrafficCar("x", hz, 1);
  for (let i = 0; i < 2; i++) spawnTrafficCar("x", hz, -1);
});

const TRAFFIC_STOP_MARGIN = ROAD_HALF_W + 1.5;
const TRAFFIC_STOP_LOOKAHEAD = 3;

function isTrafficStoppedByLight(pos, dir, crossLines, lightGo) {
  if (lightGo) return false;
  for (const line of crossLines) {
    const distToStop = dir > 0 ? line - TRAFFIC_STOP_MARGIN - pos : pos - (line + TRAFFIC_STOP_MARGIN);
    if (distToStop > 0 && distToStop < TRAFFIC_STOP_LOOKAHEAD) return true;
  }
  return false;
}

function updateTraffic(delta, lights) {
  trafficCars.forEach((t) => {
    if (t.axis === "z") {
      if (!isTrafficStoppedByLight(t.z, t.dir, HORIZONTAL_ROAD_Z, lights.ns === "green")) {
        t.z += t.dir * t.speed * delta;
        if (t.z > FIELD_HALF_Z + 3) t.z = -FIELD_HALF_Z - 3;
        if (t.z < -FIELD_HALF_Z - 3) t.z = FIELD_HALF_Z + 3;
      }
    } else {
      if (!isTrafficStoppedByLight(t.x, t.dir, VERTICAL_ROAD_X, lights.ew === "green")) {
        t.x += t.dir * t.speed * delta;
        if (t.x > FIELD_HALF_X + 3) t.x = -FIELD_HALF_X - 3;
        if (t.x < -FIELD_HALF_X - 3) t.x = FIELD_HALF_X + 3;
      }
    }
    t.mesh.position.set(t.x, 0, t.z);
  });
}

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
const RECIPES = {
  house: HOUSE_RECIPE,
  building: BUILDING_RECIPE,
  shop: SHOP_RECIPE,
  school: SCHOOL_RECIPE,
  car: CAR_RECIPE,
  train: TRAIN_RECIPE,
  bicycle: BICYCLE_RECIPE,
  pond: POND_RECIPE,
  yatai: YATAI_RECIPE,
  restaurant: RESTAURANT_RECIPE,
};
const OBJECT_RADIUS = {
  house: 2.1,
  building: 2.4,
  shop: 2.4,
  cinema: 2.9,
  school: 3.2,
  park: 2.8,
  pond: 2.8,
  yatai: 2.2,
  car: 1.9,
  train: 2.6,
  bicycle: 1.0,
  restaurant: 3.0,
};

// プレイヤーが すりぬけないように するための あたり判定
// （ドアの ある たてものは、入り口の はんてい半径(1.6)より せまく して、
// 　まっすぐ ドアに あるいたときに 中に 入れなくならないように している）
const COLLISION_RADIUS = {
  house: 1.7,
  building: 1.9,
  shop: 1.9,
  cinema: 2.1,
  school: 2.4,
  park: 2.6,
  pond: 2.5,
  yatai: 1.7,
  car: 1.3,
  train: 1.8,
  bicycle: 0.7,
  restaurant: 2.3,
};
const PLAYER_COLLISION_RADIUS = 0.35;

function isBlockedForPlayer(x, z) {
  for (const s of placedStructures) {
    const r = (COLLISION_RADIUS[s.type] || 1.6) + PLAYER_COLLISION_RADIUS;
    if (Math.hypot(x - s.x, z - s.z) < r) return true;
  }
  for (const c of placedCars) {
    const r = (COLLISION_RADIUS[c.type || "car"] || 1.3) + PLAYER_COLLISION_RADIUS;
    if (Math.hypot(x - c.x, z - c.z) < r) return true;
  }
  for (const npc of npcs) {
    if (npc.isFlyer) continue;
    const npcRadius = npc.kind === "cow" ? 0.55 : npc.isAnimal ? 0.35 : 0.4;
    if (Math.hypot(x - npc.x, z - npc.z) < npcRadius + PLAYER_COLLISION_RADIUS) return true;
  }
  return false;
}

// ひとや どうぶつが くるま・たてものを すりぬけないように するための はんてい
function isBlockedForNpc(x, z) {
  for (const s of placedStructures) {
    const r = (COLLISION_RADIUS[s.type] || 1.6) + 0.4;
    if (Math.hypot(x - s.x, z - s.z) < r) return true;
  }
  for (const c of placedCars) {
    const r = (COLLISION_RADIUS[c.type || "car"] || 1.3) + 0.4;
    if (Math.hypot(x - c.x, z - c.z) < r) return true;
  }
  return false;
}
const GHOST_DISTANCE = {
  house: 4.5,
  building: 5,
  shop: 4.5,
  cinema: 5.2,
  school: 5.6,
  park: 5,
  pond: 5,
  yatai: 4.5,
  car: 4,
  train: 5,
  bicycle: 3,
  block: 2.4,
  restaurant: 5,
};
const VEHICLE_LABELS = { car: "🚗 くるま", train: "🚂 でんしゃ", bicycle: "🚲 じてんしゃ" };

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
  if (VEHICLE_KINDS.includes(kind)) {
    const idx = forcedIndex != null ? forcedIndex : pickVehicleColor(kind);
    placementGhostPaletteIndex = idx;
    placementGhost = VEHICLE_FACTORIES[kind](VEHICLE_COLORS[kind][idx]);
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
  if (!VEHICLE_KINDS.includes(kind) && isOnRoad(x, z, 1.5)) return false;
  for (const s of placedStructures) {
    const minDist = OBJECT_RADIUS[s.type] + OBJECT_RADIUS[kind] + 0.6;
    if (Math.hypot(x - s.x, z - s.z) < minDist) return false;
  }
  for (const c of placedCars) {
    const minDist = OBJECT_RADIUS[c.type || "car"] + OBJECT_RADIUS[kind] + 0.6;
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
  if (VEHICLE_KINDS.includes(kind)) {
    spawnCar(x, z, placementGhostPaletteIndex, kind);
    state.cars.push({ x, z, colorIndex: placementGhostPaletteIndex, type: kind });
    showMessage(wasMoving ? `${VEHICLE_LABELS[kind]} を うごかしたよ` : `${VEHICLE_LABELS[kind]} が できた！ちかづくと のれるよ`);
    if (!wasMoving) addXp(10);
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
    if (!wasMoving) {
      if (kind === "school") unlockAchievement("school_built");
      if (state.structures.length >= 1) unlockAchievement("first_building");
      if (state.structures.length >= 5) unlockAchievement("five_buildings");
      addXp(12);
      if (kind === "house") advanceStory("build_house");
      advanceStory("grow_town");
    }
  }
  playTone(wasMoving ? 650 : 900, wasMoving ? 0.15 : 0.2);
  renderInventory();
  updateTownRank();
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
      spawnCar(o.x, o.z, o.colorIndex, o.vehicleType);
      state.cars.push({ x: o.x, z: o.z, colorIndex: o.colorIndex, type: o.vehicleType });
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
    const vType = c.type || "car";
    movingOriginal = { kind: "car", vehicleType: vType, x: c.x, z: c.z, colorIndex: c.colorIndex };
    isMovingExisting = true;
    startPlacement(vType, c.colorIndex);
  }
  saveState();
}
document.getElementById("move-btn").addEventListener("click", requestMove);

let drivingCar = null;

const BICYCLE_SEAT_DIST = 0.35;
const BICYCLE_SEAT_HEIGHT = 0.19;
const ANIMAL_RIDE_HEIGHT = 0.65;
VEHICLE_EXIT_DIST.animal = 2.2;

function boardCar(car) {
  drivingCar = car;
  playerRig.group.visible = car.type === "bicycle" || car.type === "animal";
  const exitLabels = {
    car: "🚪 くるまを おりる",
    train: "🚪 でんしゃを おりる",
    bicycle: "🚪 じてんしゃを おりる",
    animal: "🚪 どうぶつから おりる",
  };
  exitCarBtn.textContent = exitLabels[car.type || "car"];
  playTone(400, 0.1);
  updateHud();
}

function exitCarFn() {
  if (!drivingCar) return;
  const car = drivingCar;
  const exitDist = VEHICLE_EXIT_DIST[car.type || "car"];
  player.x = car.x - Math.sin(car.facing) * exitDist;
  player.z = car.z - Math.cos(car.facing) * exitDist;
  player.x = Math.max(-FIELD_HALF_X + 1, Math.min(FIELD_HALF_X - 1, player.x));
  player.z = Math.max(-FIELD_HALF_Z + 1, Math.min(FIELD_HALF_Z - 1, player.z));
  if (car.type === "animal" && car.npcRef) {
    car.npcRef.x = car.x;
    car.npcRef.z = car.z;
    car.npcRef.facing = car.facing;
    car.npcRef.target = null;
  }
  playerRig.group.visible = true;
  drivingCar = null;
  updateHud();
}
exitCarBtn.addEventListener("click", exitCarFn);

// ---------- どうぶつに のる ----------
const RIDE_RADIUS = 3.4;

function performRide() {
  if (mode !== "town" || drivingCar || placementKind) return;
  let nearest = null;
  let nearestDist = Infinity;
  npcs.forEach((npc) => {
    if (npc.kind !== "cow") return;
    const d = Math.hypot(npc.x - player.x, npc.z - player.z);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = npc;
    }
  });
  if (!nearest || nearestDist > RIDE_RADIUS) {
    showMessage("ちかくに のれる どうぶつが いないよ（うしを さがしてね）");
    return;
  }
  boardCar({ x: nearest.x, z: nearest.z, facing: nearest.facing, mesh: nearest.rig.group, type: "animal", npcRef: nearest, speed: nearest.speed * 2.4 });
  showMessage("🐄 うしに のったよ！");
  unlockAchievement("rider");
  addXp(5);
}

// ---------- いけで さかなを つる ----------
const FISH_RADIUS = 4;

function performFish() {
  if (mode !== "town" || drivingCar || placementKind) return;
  const pond = placedStructures.find(
    (s) => s.type === "pond" && Math.hypot(s.x - player.x, s.z - player.z) < FISH_RADIUS
  );
  if (!pond) {
    showMessage("ちかくに いけが ないよ（いけを つくって みよう）");
    return;
  }
  playTone(500, 0.08);
  playTone(650, 0.1);
  if (Math.random() < 0.7) {
    state.food.fish++;
    playTone(900, 0.15);
    showMessage("🎣 さかなが つれたよ！");
    unlockAchievement("fisher");
    addXp(10);
    advanceStory("catch_fish");
  } else {
    showMessage("🎣 ざんねん、にげられちゃった…");
  }
  renderFoodInventory();
  saveState();
}

// ---------- やたいで おまつりの たべものを もらう ----------
const YATAI_RADIUS = 3.5;
const YATAI_TRADE_COST = 3;

function performYatai() {
  if (mode !== "town" || drivingCar || placementKind) return;
  const yatai = placedStructures.find(
    (s) => s.type === "yatai" && Math.hypot(s.x - player.x, s.z - player.z) < YATAI_RADIUS
  );
  if (!yatai) {
    showMessage("ちかくに やたいが ないよ（やたいを つくって みよう）");
    return;
  }
  let bestKey = null;
  let bestCount = 0;
  COLORS.forEach((c) => {
    if (state.inventory[c.key] > bestCount) {
      bestCount = state.inventory[c.key];
      bestKey = c.key;
    }
  });
  if (!bestKey || bestCount < YATAI_TRADE_COST) {
    showMessage(`ブロックが ${YATAI_TRADE_COST}こ たりないよ（いろは なんでも いいよ）`);
    return;
  }
  state.inventory[bestKey] -= YATAI_TRADE_COST;
  state.food.kakigori++;
  playTone(600, 0.1);
  playTone(850, 0.12);
  showMessage(`🏮 やたいで 🍧かき氷を もらったよ！`);
  unlockAchievement("matsuri_food");
  addXp(8);
  renderInventory();
  renderFoodInventory();
  saveState();
}

// ==========================================================
// たてもの／くるまの じょうたい を さいこうちく（よみこみ時）
// ==========================================================
function rebuildFromState() {
  state.structures.forEach((s) => placeStructureMesh(s.type, s.x, s.z, s.paletteIndex, s.interiorTheme));
  state.cars.forEach((c) => spawnCar(c.x, c.z, c.colorIndex, c.type));
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
const MAX_FIELD_BLOCKS = 24;

function isNearAnyStructureOrCar(x, z, radius) {
  if (placedStructures.some((p) => Math.hypot(x - p.x, z - p.z) < radius)) return true;
  if (placedCars.some((p) => Math.hypot(x - p.x, z - p.z) < radius)) return true;
  return false;
}

// レゴブロックの おおきさ（スタッドの かず）と でやすさ
const BLOCK_SIZES = [
  { studs: 1, layout: [[0, 0]], weight: 60 },
  { studs: 2, layout: [[-0.32, 0], [0.32, 0]], weight: 28 },
  { studs: 4, layout: [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]], weight: 12 },
];

function pickBlockSize() {
  const total = BLOCK_SIZES.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const s of BLOCK_SIZES) {
    if (roll < s.weight) return s;
    roll -= s.weight;
  }
  return BLOCK_SIZES[0];
}

function createFieldBlockMesh(hex, sizeDef) {
  const group = new THREE.Group();
  const w = sizeDef.studs === 1 ? 0.6 : sizeDef.studs === 2 ? 1.1 : 1.1;
  const d = sizeDef.studs === 4 ? 1.1 : 0.6;
  const brick = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.6, d),
    new THREE.MeshLambertMaterial({ color: col(hex) })
  );
  group.add(brick);
  const studMat = new THREE.MeshLambertMaterial({ color: col(shadeColor(hex, -10)) });
  sizeDef.layout.forEach(([sx, sz]) => {
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 10), studMat);
    stud.position.set(sx, 0.37, sz);
    group.add(stud);
  });
  return group;
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
  const sizeDef = pickBlockSize();

  let x, z;
  let tries = 0;
  do {
    x = (Math.random() * 2 - 1) * (FIELD_HALF_X - 2);
    z = (Math.random() * 2 - 1) * (FIELD_HALF_Z - 2);
    tries++;
  } while (isNearAnyStructureOrCar(x, z, 4.5) && tries < 20);

  const hex = colorHex(colorKey);
  const group = createFieldBlockMesh(hex, sizeDef);
  group.position.set(x, 0.5, z);
  townGroup.add(group);

  fieldBlocks.push({ group, colorKey, studs: sizeDef.studs, baseY: 0.5, spin: Math.random() * Math.PI * 2 });
}

for (let i = 0; i < 16; i++) spawnBlock();
setInterval(() => {
  if (mode === "town") spawnBlock();
}, 1600);

function checkBlockCollisions(pos) {
  for (let i = fieldBlocks.length - 1; i >= 0; i--) {
    const b = fieldBlocks[i];
    const dist = Math.hypot(pos.x - b.group.position.x, pos.z - b.group.position.z);
    if (dist < 1.1) {
      state.inventory[b.colorKey] += b.studs;
      state.totalCollected += b.studs;
      townGroup.remove(b.group);
      fieldBlocks.splice(i, 1);
      playTone(700, 0.12);
      if (b.studs > 1) showMessage(`🧱 ${b.studs}こぶんの ブロックを ゲット！`);
      addXp(b.studs * 2);
      advanceStory("collect_blocks", b.studs);
      renderInventory();
      if (state.totalCollected >= 50) unlockAchievement("collector_50");
      saveState();
    }
  }
}

// ==========================================================
// たべもの（あつめる アイテム）
// ==========================================================
const foodItems = []; // {group, key, baseY, spin}
const MAX_FIELD_FOOD = 14;

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

for (let i = 0; i < 10; i++) spawnFood();
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
    if (STRUCTURE_HAS_DOOR[s.type] === false) continue;
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
    const boardRadius = VEHICLE_BOARD_RADIUS[c.type || "car"];
    if (dist < boardRadius) {
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
}

// ---------- いえの なか ----------
const houseFurnitureGroup = new THREE.Group();
{
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 3.2), insideBedMat);
  bed.position.set(-3, 0.3, -1.6);
  houseFurnitureGroup.add(bed);
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.25, 0.8),
    new THREE.MeshLambertMaterial({ color: 0xfffdf5 })
  );
  pillow.position.set(-3, 0.72, -2.9);
  houseFurnitureGroup.add(pillow);

  const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.4), insideTableMat);
  table.position.set(2.6, 0.35, 1.6);
  houseFurnitureGroup.add(table);

  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.05, 24), insideRugMat);
  rug.position.set(0, 0.03, 1.2);
  houseFurnitureGroup.add(rug);

  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.4, 10), insidePotMat);
  pot.position.set(3.6, 0.2, -2.8);
  houseFurnitureGroup.add(pot);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10), leafMat);
  leaf.position.set(3.6, 0.75, -2.8);
  houseFurnitureGroup.add(leaf);

  insideGroup.add(houseFurnitureGroup);
}

// ---------- おみせの なか ----------
const shopFurnitureGroup = new THREE.Group();
{
  const counterMat = new THREE.MeshLambertMaterial({ color: col("#deb887") });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.6), counterMat);
  counter.position.set(1.6, 0.45, -1.7);
  shopFurnitureGroup.add(counter);
  const register = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.3, 0.3),
    new THREE.MeshLambertMaterial({ color: col("#333333") })
  );
  register.position.set(1.6, 1.05, -1.7);
  shopFurnitureGroup.add(register);

  const shelfMat = new THREE.MeshLambertMaterial({ color: col("#a4753f") });
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 0.4), shelfMat);
  shelf.position.set(-1.8, 1.0, -3.3);
  shopFurnitureGroup.add(shelf);
  const goodsColors = ["#e63946", "#f9c74f", "#48cae4", "#43aa8b", "#9d4edd"];
  for (let i = 0; i < 5; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.3),
      new THREE.MeshLambertMaterial({ color: col(goodsColors[i]) })
    );
    box.position.set(-3.2 + i * 0.75, 1.55, -3.15);
    shopFurnitureGroup.add(box);
  }
  shopFurnitureGroup.visible = false;
  insideGroup.add(shopFurnitureGroup);
}

// ---------- ビルの なか ----------
const buildingFurnitureGroup = new THREE.Group();
{
  const deskMat = new THREE.MeshLambertMaterial({ color: col("#5b3a29") });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.9), deskMat);
  desk.position.set(0, 0.35, -2.6);
  buildingFurnitureGroup.add(desk);
  const monitor = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.45, 0.06),
    new THREE.MeshLambertMaterial({ color: col("#2d2d2d") })
  );
  monitor.position.set(0, 0.95, -2.85);
  buildingFurnitureGroup.add(monitor);
  const screenGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.35),
    new THREE.MeshBasicMaterial({ color: col("#48cae4") })
  );
  screenGlow.position.set(0, 0.95, -2.81);
  buildingFurnitureGroup.add(screenGlow);
  const chair = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshLambertMaterial({ color: col("#2d2d2d") })
  );
  chair.position.set(0, 0.25, -1.6);
  buildingFurnitureGroup.add(chair);
  const shelf2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2.2, 1.4),
    new THREE.MeshLambertMaterial({ color: col("#8a5a2b") })
  );
  shelf2.position.set(3.9, 1.1, -1.0);
  buildingFurnitureGroup.add(shelf2);
  const pot2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.24, 0.4, 10),
    new THREE.MeshLambertMaterial({ color: col("#a4753f") })
  );
  pot2.position.set(-3.6, 0.2, -2.8);
  buildingFurnitureGroup.add(pot2);
  const leaf2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0x4caf50 })
  );
  leaf2.position.set(-3.6, 0.75, -2.8);
  buildingFurnitureGroup.add(leaf2);
  buildingFurnitureGroup.visible = false;
  insideGroup.add(buildingFurnitureGroup);
}

// ---------- がっこうの なか ----------
const schoolFurnitureGroup = new THREE.Group();
{
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 1.3),
    new THREE.MeshLambertMaterial({ color: col("#2f5233") })
  );
  board.position.set(0, 2.0, -3.49);
  schoolFurnitureGroup.add(board);

  const deskMat = new THREE.MeshLambertMaterial({ color: col("#c9975b") });
  const chairMat = new THREE.MeshLambertMaterial({ color: col("#5b3a29") });
  for (let row = 0; row < 2; row++) {
    for (let colI = 0; colI < 3; colI++) {
      const dx = -1.8 + colI * 1.8;
      const dz = 0.6 + row * 1.4;
      const desk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.5), deskMat);
      desk.position.set(dx, 0.275, dz);
      schoolFurnitureGroup.add(desk);
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), chairMat);
      chair.position.set(dx, 0.25, dz + 0.5);
      schoolFurnitureGroup.add(chair);
    }
  }
  const teacherDesk = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.7, 0.7),
    new THREE.MeshLambertMaterial({ color: col("#8a5a2b") })
  );
  teacherDesk.position.set(0, 0.35, -2.6);
  schoolFurnitureGroup.add(teacherDesk);
  schoolFurnitureGroup.visible = false;
  insideGroup.add(schoolFurnitureGroup);
}

// ---------- レストランの なか ----------
const restaurantFurnitureGroup = new THREE.Group();
{
  const counter2 = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.9, 0.6),
    new THREE.MeshLambertMaterial({ color: col("#8a5a2b") })
  );
  counter2.position.set(-2.8, 0.45, -3.0);
  restaurantFurnitureGroup.add(counter2);
  const pot3 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.3, 12),
    new THREE.MeshLambertMaterial({ color: col("#adb5bd") })
  );
  pot3.position.set(-2.8, 1.05, -3.0);
  restaurantFurnitureGroup.add(pot3);

  const tableMat = new THREE.MeshLambertMaterial({ color: col("#fff8ec") });
  const diningChairMat = new THREE.MeshLambertMaterial({ color: col("#e63946") });
  [[-1.6, 0.6], [1.6, 0.6]].forEach(([tx, tz]) => {
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.55, 16), tableMat);
    table.position.set(tx, 0.275, tz);
    restaurantFurnitureGroup.add(table);
    [[-0.75, 0], [0.75, 0], [0, -0.75], [0, 0.75]].forEach(([cx, cz]) => {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), diningChairMat);
      chair.position.set(tx + cx, 0.25, tz + cz);
      restaurantFurnitureGroup.add(chair);
    });
  });
  restaurantFurnitureGroup.visible = false;
  insideGroup.add(restaurantFurnitureGroup);
}

// ---------- えいがかんの スクリーン ----------
const MOVIES = [
  { title: "ゆうやけの ぼうけん", top: "#ffe08a", mid: "#ff9e6d", bottom: "#5a4a8a", shape: "mountain" },
  { title: "きょうりゅうの くに", top: "#bfe6b0", mid: "#7fbf6a", bottom: "#2f5233", shape: "dino" },
  { title: "うちゅうの たび", top: "#0b1030", mid: "#1c1f4a", bottom: "#000010", shape: "stars" },
  { title: "うみの なかまたち", top: "#bdeaff", mid: "#48cae4", bottom: "#023e73", shape: "waves" },
  { title: "ゆきの おしろ", top: "#eaf6ff", mid: "#cfeaff", bottom: "#7fb8e0", shape: "castle" },
];

function makeMovieScreenTexture(movie) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 144;
  const ctx2d = c.getContext("2d");
  const grad = ctx2d.createLinearGradient(0, 0, 0, 144);
  grad.addColorStop(0, movie.top);
  grad.addColorStop(0.55, movie.mid);
  grad.addColorStop(1, movie.bottom);
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(0, 0, 256, 144);

  if (movie.shape === "stars") {
    ctx2d.fillStyle = "#ffffff";
    for (let i = 0; i < 40; i++) {
      ctx2d.fillRect(Math.random() * 256, Math.random() * 90, 2, 2);
    }
  } else if (movie.shape === "waves") {
    ctx2d.fillStyle = "rgba(255,255,255,0.6)";
    for (let w = 0; w < 3; w++) {
      ctx2d.beginPath();
      ctx2d.moveTo(0, 100 + w * 12);
      for (let x = 0; x <= 256; x += 16) ctx2d.lineTo(x, 100 + w * 12 + Math.sin(x * 0.05 + w) * 6);
      ctx2d.lineTo(256, 144);
      ctx2d.lineTo(0, 144);
      ctx2d.closePath();
      ctx2d.fill();
    }
  } else if (movie.shape === "castle") {
    ctx2d.fillStyle = "#ffffff";
    ctx2d.fillRect(90, 60, 76, 60);
    ctx2d.fillRect(80, 40, 20, 30);
    ctx2d.fillRect(156, 40, 20, 30);
    ctx2d.fillRect(115, 20, 26, 50);
  } else if (movie.shape === "dino") {
    ctx2d.fillStyle = "#274d1f";
    ctx2d.beginPath();
    ctx2d.ellipse(120, 100, 50, 24, 0, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.beginPath();
    ctx2d.moveTo(160, 90);
    ctx2d.lineTo(210, 60);
    ctx2d.lineTo(190, 100);
    ctx2d.closePath();
    ctx2d.fill();
  } else {
    ctx2d.fillStyle = "#fff6d9";
    ctx2d.beginPath();
    ctx2d.arc(190, 42, 24, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.fillStyle = "#3d2b56";
    ctx2d.beginPath();
    ctx2d.moveTo(0, 144);
    ctx2d.lineTo(0, 100);
    ctx2d.lineTo(60, 60);
    ctx2d.lineTo(120, 95);
    ctx2d.lineTo(170, 55);
    ctx2d.lineTo(256, 90);
    ctx2d.lineTo(256, 144);
    ctx2d.closePath();
    ctx2d.fill();
  }
  return new THREE.CanvasTexture(c);
}

let currentMovieIndex = 0;
const cinemaScreenGroup = new THREE.Group();
let cinemaScreenMesh = null;
{
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 2.6, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x161616 })
  );
  bezel.position.set(0, 2.5, -3.48);
  cinemaScreenGroup.add(bezel);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.2),
    new THREE.MeshBasicMaterial({ map: makeMovieScreenTexture(MOVIES[0]) })
  );
  screen.position.set(0, 2.5, -3.42);
  cinemaScreenGroup.add(screen);
  cinemaScreenMesh = screen;

  const curtainMat = new THREE.MeshLambertMaterial({ color: 0x7a1f2b });
  [-1, 1].forEach((side) => {
    const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.15), curtainMat);
    curtain.position.set(side * 2.2, 1.9, -3.45);
    cinemaScreenGroup.add(curtain);
  });

  const seatMat = new THREE.MeshLambertMaterial({ color: 0x9d4edd });
  const seatBackMat = new THREE.MeshLambertMaterial({ color: 0x6a2fa0 });
  [-1.4, 0, 1.4].forEach((x) => {
    [-1.4, -0.3].forEach((z) => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.55), seatMat);
      seat.position.set(x, 0.2, z);
      cinemaScreenGroup.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.1), seatBackMat);
      back.position.set(x, 0.55, z + 0.24);
      cinemaScreenGroup.add(back);
    });
  });

  cinemaScreenGroup.visible = false;
  insideGroup.add(cinemaScreenGroup);
}

// ---------- たてものの なかの ひと（てんいん・かぞく） ----------
const INTERIOR_NPC_COLORS = {
  shop: { shirt: "#ffffff", pants: "#e63946" },
  building: { shirt: "#5b3a29", pants: "#2d2d2d" },
  house: { shirt: "#43aa8b", pants: "#5b3a29" },
  cinema: { shirt: "#2b2b2b", pants: "#9d4edd" },
  school: { shirt: "#48cae4", pants: "#2d2d2d" },
  restaurant: { shirt: "#ffffff", pants: "#2d2d2d" },
};
const INTERIOR_NPC_LABEL = {
  shop: "てんいんさん",
  building: "けいびいん",
  house: "かぞく",
  cinema: "えいがかんの マネージャー",
  school: "せんせい",
  restaurant: "コックさん",
};
const INTERIOR_NPC_POS = {
  house: { x: 1.6, z: -0.6, rot: 0 },
  shop: { x: 1.6, z: -1.35, rot: Math.PI },
  building: { x: 0, z: -1.9, rot: Math.PI },
  school: { x: 0, z: -1.9, rot: Math.PI },
  cinema: { x: -1.6, z: -1.0, rot: 0.4 },
  restaurant: { x: -2.8, z: -1.6, rot: Math.PI },
};
const INTERIOR_FURNITURE_GROUPS = {
  house: houseFurnitureGroup,
  shop: shopFurnitureGroup,
  building: buildingFurnitureGroup,
  school: schoolFurnitureGroup,
  cinema: cinemaScreenGroup,
  restaurant: restaurantFurnitureGroup,
};
let interiorNpc = null;

function setupInteriorNpc(type) {
  if (interiorNpc) {
    insideGroup.remove(interiorNpc.rig.group);
    interiorNpc = null;
  }
  const cfg = INTERIOR_NPC_COLORS[type] || INTERIOR_NPC_COLORS.house;
  const pos = INTERIOR_NPC_POS[type] || INTERIOR_NPC_POS.house;
  const rig = createHumanoid({ skin: "#f4c98f", shirt: cfg.shirt, pants: cfg.pants, scale: 0.95 });
  rig.group.position.set(pos.x, 0, pos.z);
  rig.group.rotation.y = pos.rot;
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
  Object.entries(INTERIOR_FURNITURE_GROUPS).forEach(([type, group]) => {
    group.visible = type === structure.type;
  });
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
    // ドアの はんてい はんけい（1.6）より じゅうぶん とおくに だして、すぐ また 入って しまわないようにする
    player.x = currentBuilding.doorWorld.x + Math.sin(angle) * 2.6;
    player.z = currentBuilding.doorWorld.z + Math.cos(angle) * 2.6;
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
    kind: options.kind || null,
    flyHeight: options.flyHeight || 0,
    hopTimer: 0,
    happyTimer: 0,
    quest: null,
    questBadge: null,
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
for (let i = 0; i < 2; i++) spawnNpc(createCow(), { speed: 1.1, isAnimal: true, kind: "cow" });
for (let i = 0; i < 2; i++) spawnNpc(createDog(), { speed: 2.2, isAnimal: true, kind: "dog" });
for (let i = 0; i < 2; i++) spawnNpc(createCat(), { speed: 1.9, isAnimal: true, kind: "cat" });
for (let i = 0; i < 2; i++)
  spawnNpc(createBird(), { speed: 2.6, isFlyer: true, flyHeight: 2.2 + Math.random(), isAnimal: true, kind: "bird" });

// ---------- むらちょうさん（ものがたりを すすめる ひと） ----------
const chiefRig = createHumanoid({ skin: "#f4c98f", shirt: "#5b3a29", pants: "#2d2d2d", scale: 1.05 });
const chiefHat = new THREE.Mesh(
  new THREE.ConeGeometry(0.3, 0.4, 8),
  new THREE.MeshLambertMaterial({ color: col("#f9c74f") })
);
chiefHat.position.set(0, 2.22, 0);
chiefRig.group.add(chiefHat);
spawnNpc(chiefRig, { speed: 1.2 });
npcs[npcs.length - 1].isChief = true;

// ---------- ひとからの おねがい（クエスト） ----------
const QUEST_REWARD_FOOD_COUNT = 2;

function assignRandomQuest() {
  const candidates = npcs.filter((n) => !n.isAnimal && !n.quest && !n.isChief);
  if (!candidates.length) return;
  const npc = candidates[Math.floor(Math.random() * candidates.length)];
  const palette = unlockedColors();
  const color = palette[Math.floor(Math.random() * palette.length)];
  const amount = 3 + Math.floor(Math.random() * 4);
  npc.quest = { colorKey: color.key, amount };
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshLambertMaterial({ color: col(color.hex) })
  );
  badge.position.y = 2.3;
  npc.rig.group.add(badge);
  npc.questBadge = badge;
}
assignRandomQuest();
setInterval(() => {
  if (mode === "town" && !npcs.some((n) => n.quest)) assignRandomQuest();
}, 5000);

function updateNpc(npc, delta, time) {
  if (npc.questBadge) {
    npc.questBadge.position.y = 2.3 + Math.sin(time * 3) * 0.1;
    npc.questBadge.rotation.y += delta * 2;
  }
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
    const nextX = npc.x + nx * speed * delta;
    const nextZ = npc.z + nz * speed * delta;
    if (!npc.isFlyer && isBlockedForNpc(nextX, nextZ)) {
      npc.target = {
        x: (Math.random() * 2 - 1) * NPC_WANDER_HALF_X,
        z: (Math.random() * 2 - 1) * NPC_WANDER_HALF_Z,
      };
    } else {
      npc.x = nextX;
      npc.z = nextZ;
      npc.facing = Math.atan2(nx, nz);
    }
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
  if (mode !== "town" || drivingCar || placementKind || attackTimer > 0) return;
  attackTimer = ATTACK_DURATION;
  playTone(220, 0.1);
  const radius = 3.2 + actionRadiusBonus();
  let hitSomething = false;
  npcs.forEach((npc) => {
    const d = Math.hypot(npc.x - player.x, npc.z - player.z);
    if (d < radius && d > 0.01) {
      hitSomething = true;
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
    if (d < 2.6 + actionRadiusBonus()) {
      t.shakeTimer = 0.6;
      hitSomething = true;
    }
  });
  if (hitSomething) addXp(3);
}

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
  addXp(6);
  advanceStory("feed_animal");
  renderFoodInventory();
  saveState();
}

// ---------- ひとと はなす ----------
const TALK_LINES = [
  "こんにちは！",
  "きょうは いい てんきだね",
  "いっしょに あそぼうよ！",
  "ブロック あつめてる? がんばってね",
  "げんきそうだね！",
  "まちが どんどん にぎやかに なってきたね",
  "また あとで はなそうね",
];
const INTERIOR_TALK_LINES = {
  shop: ["いらっしゃいませ！", "きょうは なにか さがしてるの?", "ブロックを あつめて また きてね"],
  building: ["おつかれさま！", "けいびは まかせて！", "きょうも あんぜんに いこうね"],
  house: ["おかえりー！", "ごはん たべた?", "また あそびに きてね"],
  cinema: ["きょうは どの えいがを みる?", "ポップコーンも あるよ", "たのしんで いってね"],
  school: ["きょうも べんきょう がんばろうね！", "きゅうしょくは なにが すき?", "うんどうかいの れんしゅう しようか"],
  restaurant: ["いらっしゃい！ なにを たべる?", "きょうの おすすめは とくべつだよ", "おなかいっぱい たべてね"],
};

function pickLine(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

function performTalk() {
  if (drivingCar || placementKind) return;
  if (mode === "inside") {
    if (!interiorNpc) {
      showMessage("ちかくに はなせる ひとが いないよ");
      return;
    }
    interiorNpc.rig.group.rotation.y = Math.atan2(
      player.x - interiorNpc.rig.group.position.x,
      player.z - interiorNpc.rig.group.position.z
    );
    playTone(700, 0.1);
    playTone(880, 0.12);
    const npcType = currentBuilding ? currentBuilding.type : null;
    const label = INTERIOR_NPC_LABEL[npcType] || "だれか";
    const lines = INTERIOR_TALK_LINES[npcType] || TALK_LINES;
    showMessage(`${label}「${pickLine(lines)}」`);
    unlockAchievement("talker");
    return;
  }
  let nearest = null;
  let nearestDist = Infinity;
  npcs.forEach((npc) => {
    if (npc.isAnimal) return;
    const d = Math.hypot(npc.x - player.x, npc.z - player.z);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = npc;
    }
  });
  if (!nearest || nearestDist > 3.2 + talkRadiusBonus()) {
    showMessage("ちかくに はなせる ひとが いないよ");
    return;
  }
  nearest.facing = Math.atan2(player.x - nearest.x, player.z - nearest.z);
  nearest.happyTimer = 0.6;
  playTone(700, 0.1);
  playTone(880, 0.12);
  unlockAchievement("talker");
  if (nearest.isChief) {
    handleChiefTalk();
    return;
  }
  if (nearest.quest) {
    const q = nearest.quest;
    const colorName = COLORS.find((c) => c.key === q.colorKey).name;
    if (state.inventory[q.colorKey] >= q.amount) {
      state.inventory[q.colorKey] -= q.amount;
      const food = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
      state.food[food.key] += QUEST_REWARD_FOOD_COUNT;
      if (nearest.questBadge) nearest.rig.group.remove(nearest.questBadge);
      nearest.questBadge = null;
      nearest.quest = null;
      playTone(1000, 0.12);
      playTone(1300, 0.14);
      showMessage(`「${colorName}ブロック ありがとう！」 おれいに ${food.emoji}×${QUEST_REWARD_FOOD_COUNT} を もらったよ！`);
      unlockAchievement("quest_complete");
      addXp(15);
      renderInventory();
      renderFoodInventory();
      saveState();
    } else {
      showMessage(`「${colorName}ブロックを ${q.amount}こ もってきてほしいな（いま ${state.inventory[q.colorKey]}こ）」`);
    }
    return;
  }
  showMessage(`「${pickLine(TALK_LINES)}」`);
}

// ---------- おみせで こうかん ----------
const SHOP_TRADE_COST = 5;

function performShopTrade() {
  if (mode !== "inside" || !currentBuilding || currentBuilding.type !== "shop") return;
  let bestKey = null;
  let bestCount = 0;
  COLORS.forEach((c) => {
    if (state.inventory[c.key] > bestCount) {
      bestCount = state.inventory[c.key];
      bestKey = c.key;
    }
  });
  if (!bestKey || bestCount < SHOP_TRADE_COST) {
    showMessage(`ブロックが ${SHOP_TRADE_COST}こ たりないよ（いろは なんでも いいよ）`);
    return;
  }
  state.inventory[bestKey] -= SHOP_TRADE_COST;
  const food = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
  state.food[food.key]++;
  const colorName = COLORS.find((c) => c.key === bestKey).name;
  playTone(720, 0.1);
  playTone(980, 0.12);
  showMessage(`${colorName}ブロックを ${SHOP_TRADE_COST}こ わたして、${food.emoji} を もらったよ！`);
  unlockAchievement("shop_trade");
  addXp(8);
  advanceStory("shop_trade");
  renderInventory();
  renderFoodInventory();
  saveState();
}
shopTradeBtn.addEventListener("click", performShopTrade);

// ---------- えいがかんで えいがを リクエストする ----------
function performCinemaWatch() {
  if (mode !== "inside" || !currentBuilding || currentBuilding.type !== "cinema") return;
  currentMovieIndex = (currentMovieIndex + 1) % MOVIES.length;
  const movie = MOVIES[currentMovieIndex];
  cinemaScreenMesh.material.map = makeMovieScreenTexture(movie);
  cinemaScreenMesh.material.needsUpdate = true;
  playTone(500, 0.1);
  playTone(750, 0.12);
  playTone(950, 0.14);
  showMessage(`マネージャー「『${movie.title}』を じょうえいするね！」`);
  addXp(12);
  advanceStory("watch_movie");
  saveState();
}
cinemaWatchBtn.addEventListener("click", performCinemaWatch);

// ---------- レストランで ごはんを たべる ----------
const RESTAURANT_MEAL_COST = 3;
function performRestaurantEat() {
  if (mode !== "inside" || !currentBuilding || currentBuilding.type !== "restaurant") return;
  const available = FOOD_TYPES.find((f) => state.food[f.key] > 0);
  if (available) {
    state.food[available.key]--;
    playTone(700, 0.1);
    playTone(950, 0.14);
    showMessage(`🍽 ${available.emoji}を たべたよ！ とても おいしい！`);
    addXp(10);
    advanceStory("restaurant_eat");
    renderFoodInventory();
    saveState();
    return;
  }
  let bestKey = null;
  let bestCount = 0;
  COLORS.forEach((c) => {
    if (state.inventory[c.key] > bestCount) {
      bestCount = state.inventory[c.key];
      bestKey = c.key;
    }
  });
  if (!bestKey || bestCount < RESTAURANT_MEAL_COST) {
    showMessage(`コック「たべものが ないみたい。ブロックが ${RESTAURANT_MEAL_COST}こ あれば つくってあげるよ」`);
    return;
  }
  state.inventory[bestKey] -= RESTAURANT_MEAL_COST;
  playTone(700, 0.1);
  playTone(950, 0.14);
  showMessage("🍽 コックが つくってくれた ごはんを たべたよ！ とても おいしい！");
  addXp(10);
  advanceStory("restaurant_eat");
  renderInventory();
  saveState();
}
restaurantEatBtn.addEventListener("click", performRestaurantEat);

// ==========================================================
// カメラ（してんを きりかえられる）
// ==========================================================
const CAMERA_VIEWS = [
  { label: "ふつう", offset: new THREE.Vector3(0, 15, 17), targetY: 1.2 },
  { label: "ちかく", offset: new THREE.Vector3(0, 6, 8), targetY: 1.1 },
  { label: "うえから", offset: new THREE.Vector3(0, 42, 0.01), targetY: 0 },
];
let cameraViewIndex = 0;

function cycleCameraView() {
  cameraViewIndex = (cameraViewIndex + 1) % CAMERA_VIEWS.length;
  showMessage(`📷 してん: ${CAMERA_VIEWS[cameraViewIndex].label}`);
}
cameraViewBtn.addEventListener("click", cycleCameraView);

function takePhoto() {
  renderer.render(scene, camera);
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const fileName = `machi-photo_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, "image/png");
  playTone(880, 0.08);
  playTone(1200, 0.1);
  showMessage("📸 しゃしんを ほぞんしたよ！");
  unlockAchievement("photographer");
}
photoBtn.addEventListener("click", takePhoto);

const cameraTarget = new THREE.Vector3();
const desiredCamPos = new THREE.Vector3();

function updateCamera(pos, delta) {
  const view = CAMERA_VIEWS[cameraViewIndex];
  const py = pos.y || 0;
  desiredCamPos.set(pos.x + view.offset.x, py + view.offset.y, pos.z + view.offset.z);
  const lerpAmt = 1 - Math.pow(0.001, delta);
  camera.position.lerp(desiredCamPos, lerpAmt);
  cameraTarget.set(pos.x, py + view.targetY, pos.z);
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

// ---------- まとめて つかえる「アクション」ボタン ----------
// ばめんに あわせて、はなす・のる・つる・えさをあげる・うごかす・こうげきの
// なかから いちばん ちかい／ふさわしい こうどうを えらんで じっこうする
function performAction() {
  if (mode === "inside") {
    performTalk();
    return;
  }
  if (drivingCar) {
    exitCarFn();
    return;
  }
  if (placementKind) return;

  const pond = placedStructures.find((s) => s.type === "pond");
  if (pond && Math.hypot(pond.x - player.x, pond.z - player.z) <= FISH_RADIUS) {
    performFish();
    return;
  }

  const yatai = placedStructures.find((s) => s.type === "yatai");
  if (yatai && Math.hypot(yatai.x - player.x, yatai.z - player.z) <= YATAI_RADIUS) {
    performYatai();
    return;
  }

  let nearestCow = null;
  let nearestCowDist = Infinity;
  npcs.forEach((npc) => {
    if (npc.kind !== "cow") return;
    const d = Math.hypot(npc.x - player.x, npc.z - player.z);
    if (d < nearestCowDist) {
      nearestCowDist = d;
      nearestCow = npc;
    }
  });
  if (nearestCow && nearestCowDist <= RIDE_RADIUS) {
    performRide();
    return;
  }

  let nearestHumanDist = Infinity;
  npcs.forEach((npc) => {
    if (npc.isAnimal) return;
    const d = Math.hypot(npc.x - player.x, npc.z - player.z);
    if (d < nearestHumanDist) nearestHumanDist = d;
  });
  if (nearestHumanDist <= 3.2 + talkRadiusBonus()) {
    performTalk();
    return;
  }

  if (FOOD_TYPES.some((f) => state.food[f.key] > 0)) {
    let nearestAnimalDist = Infinity;
    npcs.forEach((npc) => {
      if (!npc.isAnimal) return;
      const d = Math.hypot(npc.x - player.x, npc.z - player.z);
      if (d < nearestAnimalDist) nearestAnimalDist = d;
    });
    if (nearestAnimalDist <= 3.2) {
      performFeed();
      return;
    }
  }

  let nearestMoveDist = Infinity;
  placedStructures.forEach((s) => {
    const d = Math.hypot(player.x - s.x, player.z - s.z);
    if (d < nearestMoveDist) nearestMoveDist = d;
  });
  placedCars.forEach((c) => {
    const d = Math.hypot(player.x - c.x, player.z - c.z);
    if (d < nearestMoveDist) nearestMoveDist = d;
  });
  if (nearestMoveDist <= MOVE_PICKUP_RADIUS) {
    requestMove();
    return;
  }

  performAttack();
}
document.getElementById("btn-action").addEventListener("click", performAction);

// ==========================================================
// にゅうりょく
// ==========================================================
window.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Spacebar") e.preventDefault();
  setKey(e.key, true);
});
window.addEventListener("keyup", (e) => setKey(e.key, false));

let actionKeyDown = false;
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
    case " ":
    case "Spacebar":
    case "Enter":
      if (isDown && !actionKeyDown) performAction();
      actionKeyDown = isDown;
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
    if (currentBuilding && currentBuilding.type === "cinema") {
      ambientLight.intensity = 0.1;
      sunLight.intensity = 0.02;
    }
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
      const vehicleSpeed = carState.speed || VEHICLE_SPEED[carState.type || "car"];
      const moving = applyMovement(carPos, vehicleSpeed, delta, (a) => (carState.facing = a));
      carPos.x = Math.max(-FIELD_HALF_X + 2, Math.min(FIELD_HALF_X - 2, carPos.x));
      carPos.z = Math.max(-FIELD_HALF_Z + 2, Math.min(FIELD_HALF_Z - 2, carPos.z));
      carState.x = carPos.x;
      carState.z = carPos.z;
      carState.mesh.position.set(carState.x, 0, carState.z);
      if (moving) carState.mesh.rotation.y = carState.facing;
      if (carState.type === "bicycle") {
        playerRig.group.position.set(
          carState.x - Math.sin(carState.facing) * BICYCLE_SEAT_DIST,
          BICYCLE_SEAT_HEIGHT,
          carState.z - Math.cos(carState.facing) * BICYCLE_SEAT_DIST
        );
        playerRig.group.rotation.y = carState.facing;
        if (moving) walkPhase += delta * 10;
        playerRig.animate(walkPhase, moving, 0, "bike");
      } else if (carState.type === "animal") {
        playerRig.group.position.set(carState.x, ANIMAL_RIDE_HEIGHT, carState.z);
        playerRig.group.rotation.y = carState.facing;
        if (moving) walkPhase += delta * 6;
        playerRig.animate(walkPhase, moving, 0, "ride");
        if (carState.npcRef) {
          carState.npcRef.phase += delta * 6;
          carState.npcRef.rig.animate(carState.npcRef.phase, moving);
        }
      }
      checkBlockCollisions(carState);
      checkFoodCollisions(carState);
      updateCamera(carState, delta);
    } else {
      const prevPlayerX = player.x;
      const prevPlayerZ = player.z;
      const runSpeed = player.speed * (keys.run ? RUN_MULTIPLIER : 1);
      const moving = applyMovement(player, runSpeed, delta, (a) => (player.facing = a));
      if (isBlockedForPlayer(player.x, prevPlayerZ)) player.x = prevPlayerX;
      if (isBlockedForPlayer(player.x, player.z)) player.z = prevPlayerZ;
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

    npcs.forEach((npc) => {
      if (drivingCar && drivingCar.npcRef === npc) return;
      updateNpc(npc, delta, time);
    });
    const lights = trafficLightStates(time);
    applySignalState(nsRedMat, nsYellowMat, nsGreenMat, lights.ns);
    applySignalState(ewRedMat, ewYellowMat, ewGreenMat, lights.ew);
    updateTraffic(delta, lights);
    const brightness = updateDayNight(time);
    const activePos = drivingCar || player;
    updateWeather(delta, activePos.x, activePos.z);
    maybeSpawnFirework(delta, brightness, activePos.x, activePos.z);
    updateFireworks(delta);
    if (brightness < 0.3) unlockAchievement("night_watcher");

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
// セーブスロット えらび
// ==========================================================
function peekSlotSummary(slot) {
  try {
    const raw = localStorage.getItem(saveKeyFor(slot));
    if (!raw) return "あたらしい まち";
    const data = JSON.parse(raw);
    const structCount = (data.structures || []).length;
    const carCount = (data.cars || []).length;
    if (structCount === 0 && carCount === 0) return "あたらしい まち";
    return `🏠×${structCount} 🚗×${carCount}`;
  } catch (e) {
    return "あたらしい まち";
  }
}

const slotButtons = Array.from(document.querySelectorAll(".slot-btn"));
function renderSlotPicker() {
  slotButtons.forEach((btn) => {
    const slot = Number(btn.dataset.slot);
    btn.classList.toggle("selected", slot === currentSlot);
    const sub = btn.querySelector(".slot-sub");
    if (sub) sub.textContent = peekSlotSummary(slot);
  });
}
slotButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentSlot = Number(btn.dataset.slot);
    localStorage.setItem(LAST_SLOT_KEY, String(currentSlot));
    renderSlotPicker();
  });
});
renderSlotPicker();

// ==========================================================
// スタート
// ==========================================================
document.getElementById("start-btn").addEventListener("click", () => {
  ensureAudio();
  loadState();
  rebuildFromState();
  soundBtn.textContent = state.soundOn ? "🔊" : "🔇";
  renderInventory();
  renderFoodInventory();
  renderAchievements();
  updateTownRank();
  player.speed = playerSpeedForLevel(state.level);
  applyLevelCosmetics(state.level);
  renderLevelBadge();
  renderStoryPanel();
  titleScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  resizeRenderer();
  started = true;
  updateHud();
  playTone(700, 0.15);
});
