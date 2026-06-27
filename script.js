import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22";

const cameraBtn = document.getElementById("cameraBtn");
const fallbackBtn = document.getElementById("fallbackBtn");
const webcam = document.getElementById("webcam");
const handCanvas = document.getElementById("handCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const threeCanvas = document.getElementById("threeCanvas");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const statusText = document.getElementById("statusText");
const gestureText = document.getElementById("gestureText");
const wealthText = document.getElementById("wealthText");
const coinText = document.getElementById("coinText");
const wealthBar = document.getElementById("wealthBar");
const modePill = document.getElementById("modePill");
const diagList = document.getElementById("diagList");
const resultCard = document.getElementById("resultCard");
const resultTitle = document.getElementById("resultTitle");
const resultNote = document.getElementById("resultNote");
const wealthRing = document.getElementById("wealthRing");

const drawCtx = drawCanvas.getContext("2d");
const handCtx = handCanvas.getContext("2d");

const IS_MOBILE = window.matchMedia("(max-width: 760px)").matches;
const PARTICLE_COUNT = IS_MOBILE ? 2600 : 5200;
const BASE_RADIUS = 2.2;

let scene, camera, renderer, particles, particleGeometry, material;
let particlePositions, particleBase, particleScatter, particleVelocity;
let coreScale = 1;
let spreadPower = 0.55;
let burstPower = 0;
let rotationTargetX = 0;
let rotationTargetY = 0;
let fingerNDC = { x: 0, y: 0, active: false };
let fingerScreen = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, active: false };
let trail = [];
let rings = [];
let coins = [];
let wealthEnergy = 8;
let coinsCollected = 0;
let handLandmarker = null;
let cameraRunning = false;
let fallbackMode = true;
let lastVideoTime = -1;
let lastGesture = "--";
let resultTimeout = null;
let lastCircleTrigger = 0;
let lastBurst = 0;

initDiagnostics();
initThree();
resizeCanvases();
createParticles();
animate();
activateFallbackMode("已準備，可用滑鼠 / 觸控先試玩");

cameraBtn.addEventListener("click", startCameraMode);
fallbackBtn.addEventListener("click", () => activateFallbackMode("已切換到滑鼠 / 觸控模式"));

window.addEventListener("resize", () => {
  resizeCanvases();
  resizeThree();
});

function initDiagnostics() {
  const lines = [];
  const secure = window.isSecureContext;
  const hasMedia = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const isHttps = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";

  lines.push(`${secure ? "✅" : "⚠️"} Secure context：${secure ? "可以使用鏡頭" : "需要 HTTPS 或 localhost"}`);
  lines.push(`${hasMedia ? "✅" : "⚠️"} Browser camera API：${hasMedia ? "支援" : "不支援 / 被封鎖"}`);
  lines.push(`${isHttps ? "✅" : "⚠️"} 網址環境：${isHttps ? "合適" : "請用 GitHub Pages / Live Server"}`);

  diagList.innerHTML = lines.map((line) => `<li>${line}</li>`).join("");
}

function initThree() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 7.2);

  renderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    alpha: true,
    antialias: !IS_MOBILE,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  const point = new THREE.PointLight(0xf5d77b, 18, 18);
  point.position.set(2.5, 2.5, 5);
  scene.add(ambient, point);
}

function resizeThree() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function resizeCanvases() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  drawCanvas.width = Math.floor(window.innerWidth * ratio);
  drawCanvas.height = Math.floor(window.innerHeight * ratio);
  drawCanvas.style.width = `${window.innerWidth}px`;
  drawCanvas.style.height = `${window.innerHeight}px`;
  drawCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const rect = handCanvas.getBoundingClientRect();
  handCanvas.width = Math.floor(Math.max(1, rect.width) * ratio);
  handCanvas.height = Math.floor(Math.max(1, rect.height) * ratio);
  handCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function createParticles() {
  particleGeometry = new THREE.BufferGeometry();
  particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  particleBase = new Float32Array(PARTICLE_COUNT * 3);
  particleScatter = new Float32Array(PARTICLE_COUNT * 3);
  particleVelocity = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = BASE_RADIUS * Math.cbrt(Math.random());

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    particleBase[i3] = x;
    particleBase[i3 + 1] = y;
    particleBase[i3 + 2] = z;

    const scatterRadius = 3.8 + Math.random() * 3.7;
    particleScatter[i3] = Math.sin(phi) * Math.cos(theta) * scatterRadius;
    particleScatter[i3 + 1] = Math.sin(phi) * Math.sin(theta) * scatterRadius;
    particleScatter[i3 + 2] = Math.cos(phi) * scatterRadius;

    particlePositions[i3] = x;
    particlePositions[i3 + 1] = y;
    particlePositions[i3 + 2] = z;
  }

  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

  material = new THREE.PointsMaterial({
    size: IS_MOBILE ? 0.028 : 0.022,
    color: 0xf5d77b,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  particles = new THREE.Points(particleGeometry, material);
  scene.add(particles);
}

function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() * 0.001;

  updateParticles(t);
  updateTrail();
  updateCoins(t);
  updateRings();

  particles.rotation.y += 0.002 + rotationTargetX * 0.018;
  particles.rotation.x += rotationTargetY * 0.008;
  particles.scale.setScalar(coreScale + Math.sin(t * 1.2) * 0.018);

  burstPower *= 0.94;
  renderer.render(scene, camera);

  if (cameraRunning) {
    predictHand();
  }
}

function updateParticles(t) {
  const targetSpread = spreadPower + burstPower;
  const attraction = fingerNDC.active ? 0.11 : 0;
  const targetX = fingerNDC.x * 3.6;
  const targetY = fingerNDC.y * 2.4;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    let tx = particleBase[i3] * (1 - targetSpread) + particleScatter[i3] * targetSpread;
    let ty = particleBase[i3 + 1] * (1 - targetSpread) + particleScatter[i3 + 1] * targetSpread;
    let tz = particleBase[i3 + 2] * (1 - targetSpread) + particleScatter[i3 + 2] * targetSpread;

    if (attraction) {
      const magnet = Math.max(0, 1 - Math.hypot(tx - targetX, ty - targetY) / 8);
      tx = tx * (1 - attraction * magnet) + targetX * attraction * magnet;
      ty = ty * (1 - attraction * magnet) + targetY * attraction * magnet;
      tz = tz * (1 - attraction * 0.3 * magnet);
    }

    const wave = Math.sin(t * 2.1 + i * 0.013) * 0.035;
    particlePositions[i3] += (tx + wave - particlePositions[i3]) * 0.055;
    particlePositions[i3 + 1] += (ty + wave - particlePositions[i3 + 1]) * 0.055;
    particlePositions[i3 + 2] += (tz - particlePositions[i3 + 2]) * 0.055;
  }

  particleGeometry.attributes.position.needsUpdate = true;
  material.size = (IS_MOBILE ? 0.028 : 0.022) + burstPower * 0.022;
}

function updateTrail() {
  drawCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  if (fingerScreen.active) {
    trail.push({ x: fingerScreen.x, y: fingerScreen.y, t: performance.now() });
  }

  const now = performance.now();
  trail = trail.filter((p) => now - p.t < 1650);

  if (trail.length > 1) {
    drawCtx.save();
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";

    for (let i = 1; i < trail.length; i++) {
      const age = (now - trail[i].t) / 1650;
      const alpha = Math.max(0, 1 - age);
      drawCtx.strokeStyle = `rgba(245, 215, 123, ${alpha * 0.86})`;
      drawCtx.lineWidth = 3 + alpha * 8;
      drawCtx.shadowBlur = 24 * alpha;
      drawCtx.shadowColor = "rgba(245, 215, 123, 0.8)";
      drawCtx.beginPath();
      drawCtx.moveTo(trail[i - 1].x, trail[i - 1].y);
      drawCtx.lineTo(trail[i].x, trail[i].y);
      drawCtx.stroke();
    }

    drawCtx.restore();
  }

  rings.forEach((ring) => {
    const age = (now - ring.t) / 1400;
    if (age < 1) {
      drawCtx.save();
      drawCtx.beginPath();
      drawCtx.arc(ring.x, ring.y, ring.r * (1 + age * 0.38), 0, Math.PI * 2);
      drawCtx.strokeStyle = `rgba(248, 231, 176, ${0.88 * (1 - age)})`;
      drawCtx.lineWidth = 5;
      drawCtx.shadowBlur = 48;
      drawCtx.shadowColor = "rgba(245, 215, 123, 0.9)";
      drawCtx.stroke();
      drawCtx.restore();
    }
  });

  if (fingerScreen.active) {
    drawCtx.save();
    drawCtx.beginPath();
    drawCtx.arc(fingerScreen.x, fingerScreen.y, 13 + Math.sin(now * 0.012) * 3, 0, Math.PI * 2);
    drawCtx.fillStyle = "rgba(245, 215, 123, 0.95)";
    drawCtx.shadowBlur = 34;
    drawCtx.shadowColor = "rgba(245, 215, 123, 1)";
    drawCtx.fill();
    drawCtx.restore();
  }

  detectCircleGesture();
}

function detectCircleGesture() {
  if (trail.length < 34) return;
  const now = performance.now();
  if (now - lastCircleTrigger < 2200) return;

  const recent = trail.slice(-48);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const xs = recent.map((p) => p.x);
  const ys = recent.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const closeEnough = Math.hypot(first.x - last.x, first.y - last.y) < Math.max(70, Math.min(width, height) * 0.45);
  const bigEnough = width > 95 && height > 95;
  const roundEnough = Math.min(width, height) / Math.max(width, height) > 0.48;

  if (closeEnough && bigEnough && roundEnough) {
    lastCircleTrigger = now;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const radius = Math.max(width, height) / 2;
    rings.push({ x: cx, y: cy, r: radius, t: now });
    triggerWealthRing(cx, cy);
    increaseWealth(18);
    emitCoins(cx, cy, 40);
    showResult("招財光圈已完成", "你剛剛畫出完整金圈，Money Magnet 已啟動。");
  }
}

function triggerWealthRing(x, y) {
  wealthRing.style.left = `${x}px`;
  wealthRing.style.top = `${y}px`;
  wealthRing.classList.remove("active");
  void wealthRing.offsetWidth;
  wealthRing.classList.add("active");
  burstPower = Math.max(burstPower, 0.8);
  spreadPower = Math.min(1.15, spreadPower + 0.24);
}

function updateRings() {
  const now = performance.now();
  rings = rings.filter((ring) => now - ring.t < 1400);
}

function emitCoins(x, y, count = 16) {
  for (let i = 0; i < count; i++) {
    coins.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 12 - 3,
      size: 12 + Math.random() * 18,
      life: 1,
      spin: Math.random() * Math.PI * 2,
      kind: Math.random() > 0.82 ? "$" : "●"
    });
  }
}

function updateCoins() {
  if (!coins.length) return;
  drawCtx.save();
  drawCtx.textAlign = "center";
  drawCtx.textBaseline = "middle";

  coins.forEach((coin) => {
    coin.x += coin.vx;
    coin.y += coin.vy;
    coin.vy += 0.34;
    coin.vx *= 0.985;
    coin.life -= 0.012;
    coin.spin += 0.1;

    drawCtx.globalAlpha = Math.max(0, coin.life);
    drawCtx.translate(coin.x, coin.y);
    drawCtx.rotate(coin.spin);
    drawCtx.font = `900 ${coin.size}px Inter, Arial`;
    drawCtx.fillStyle = coin.kind === "$" ? "#f8e7b0" : "#d4af37";
    drawCtx.shadowBlur = 24;
    drawCtx.shadowColor = "rgba(245,215,123,0.9)";
    drawCtx.fillText(coin.kind, 0, 0);
    drawCtx.setTransform(1, 0, 0, 1, 0, 0);
  });

  drawCtx.restore();
  coins = coins.filter((coin) => coin.life > 0 && coin.y < window.innerHeight + 80);
}

async function startCameraMode() {
  fallbackMode = false;
  modePill.textContent = "Loading Camera";
  setStatus("正在載入手部模型...");

  try {
    if (!window.isSecureContext) {
      throw new Error("NOT_SECURE_CONTEXT");
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("NO_CAMERA_API");
    }

    if (!handLandmarker) {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
      );

      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 720 }
      },
      audio: false
    });

    webcam.srcObject = stream;
    await webcam.play();
    webcam.classList.add("is-live");
    cameraPlaceholder.classList.add("hidden");
    cameraRunning = true;
    modePill.textContent = "Camera Mode";
    setStatus("鏡頭已啟動。伸出食指開始畫金圈。");
  } catch (error) {
    console.error(error);
    cameraRunning = false;
    activateFallbackMode(getCameraErrorMessage(error));
  }
}

function getCameraErrorMessage(error) {
  const name = error?.name || error?.message;

  if (name === "NOT_SECURE_CONTEXT") {
    return "相機需要 HTTPS 或 localhost。請用 GitHub Pages / Live Server。已切換到觸控模式。";
  }

  if (name === "NO_CAMERA_API") {
    return "這個瀏覽器不支援鏡頭 API。已切換到觸控模式。";
  }

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "鏡頭權限被拒絕。請按網址旁邊的鎖頭允許 Camera。已切換到觸控模式。";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "找不到鏡頭裝置。已切換到觸控模式。";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "鏡頭可能正被其他 app 使用。關閉 Zoom/Meet 後再試。已切換到觸控模式。";
  }

  return "鏡頭啟動失敗。已自動切換到滑鼠 / 觸控模式。";
}

function activateFallbackMode(message) {
  fallbackMode = true;
  modePill.textContent = "Touch / Mouse Mode";
  setStatus(message);
  gestureText.textContent = "Touch / Mouse";
  fingerScreen.active = true;
  fingerNDC.active = true;

  drawCanvas.removeEventListener("pointermove", handlePointerMove);
  drawCanvas.removeEventListener("pointerdown", handlePointerMove);
  drawCanvas.addEventListener("pointermove", handlePointerMove);
  drawCanvas.addEventListener("pointerdown", handlePointerMove);
  drawCanvas.addEventListener("pointerup", () => {
    fingerScreen.active = false;
    fingerNDC.active = false;
  });
}

function handlePointerMove(event) {
  if (!fallbackMode) return;
  const x = event.clientX;
  const y = event.clientY;
  updateFingerPosition(x, y, true);
  spreadPower = 0.62 + (1 - y / window.innerHeight) * 0.42;
  rotationTargetX = (x / window.innerWidth - 0.5) * 1.8;
  rotationTargetY = (y / window.innerHeight - 0.5) * 0.8;
  coreScale = 0.92 + Math.max(0, 1 - y / window.innerHeight) * 0.16;
  setGesture("Gold Finger Drawing");
  if (Math.random() > 0.82) emitCoins(x, y, 1);
}

function predictHand() {
  if (!handLandmarker || !cameraRunning || webcam.readyState < 2) return;

  const videoTime = webcam.currentTime;
  if (videoTime === lastVideoTime) return;
  lastVideoTime = videoTime;

  const now = performance.now();
  const results = handLandmarker.detectForVideo(webcam, now);

  clearHandCanvas();

  if (!results.landmarks || results.landmarks.length === 0) {
    updateFingerPosition(fingerScreen.x, fingerScreen.y, false);
    setGesture("未偵測到手");
    setStatus("請將一隻手放入鏡頭範圍。手機請保持光線充足。", true);
    spreadPower = smooth(spreadPower, 0.42, 0.05);
    return;
  }

  const landmarks = results.landmarks[0];
  drawHandSkeleton(landmarks);
  const gesture = classifyGesture(landmarks);
  setGesture(gesture.label);

  const indexTip = landmarks[8];
  const mirroredX = (1 - indexTip.x) * window.innerWidth;
  const screenY = indexTip.y * window.innerHeight;
  updateFingerPosition(mirroredX, screenY, gesture.isDrawing);

  rotationTargetX = smooth(rotationTargetX, (0.5 - indexTip.x) * 1.9, 0.12);
  rotationTargetY = smooth(rotationTargetY, (indexTip.y - 0.5) * 1.1, 0.12);

  if (gesture.type === "open") {
    spreadPower = smooth(spreadPower, 1.0, 0.12);
    coreScale = smooth(coreScale, 1.12, 0.12);
    maybeBurst(indexTip, "金幣爆發", 12);
  } else if (gesture.type === "fist") {
    spreadPower = smooth(spreadPower, 0.08, 0.16);
    coreScale = smooth(coreScale, 0.82, 0.14);
    increaseWealth(0.08);
  } else if (gesture.type === "pinch") {
    spreadPower = smooth(spreadPower, 0.22, 0.18);
    coreScale = smooth(coreScale, 0.7, 0.14);
    increaseCoins(2);
  } else if (gesture.type === "thumb") {
    spreadPower = smooth(spreadPower, 1.22, 0.16);
    coreScale = smooth(coreScale, 1.22, 0.16);
    triggerRichMode(indexTip);
  } else if (gesture.type === "point") {
    spreadPower = smooth(spreadPower, 0.72, 0.10);
    coreScale = smooth(coreScale, 1.02, 0.08);
    increaseWealth(0.05);
  } else {
    spreadPower = smooth(spreadPower, 0.52, 0.06);
    coreScale = smooth(coreScale, 1, 0.06);
  }
}

function classifyGesture(lm) {
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y, lm[a].z - lm[b].z);
  const wrist = lm[0];

  const indexExtended = lm[8].y < lm[6].y - 0.02;
  const middleExtended = lm[12].y < lm[10].y - 0.02;
  const ringExtended = lm[16].y < lm[14].y - 0.02;
  const pinkyExtended = lm[20].y < lm[18].y - 0.02;
  const thumbOpen = Math.abs(lm[4].x - lm[2].x) > 0.055;
  const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length + (thumbOpen ? 1 : 0);
  const pinchDistance = d(4, 8);
  const thumbHigh = lm[4].y < wrist.y - 0.12;
  const fingersFolded = !indexExtended && !middleExtended && !ringExtended && !pinkyExtended;

  if (pinchDistance < 0.055) {
    return { type: "pinch", label: "Pinch：吸金", isDrawing: true };
  }

  if (thumbHigh && fingersFolded) {
    return { type: "thumb", label: "Thumb Up：Rich Mode", isDrawing: false };
  }

  if (extendedCount >= 4) {
    return { type: "open", label: "Open Palm：金幣擴散", isDrawing: false };
  }

  if (extendedCount <= 1 && !indexExtended) {
    return { type: "fist", label: "Closed Fist：鎖住財氣", isDrawing: false };
  }

  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return { type: "point", label: "Pointing Up：招財金手指", isDrawing: true };
  }

  if (indexExtended) {
    return { type: "draw", label: "Gold Finger Drawing", isDrawing: true };
  }

  return { type: "idle", label: "手勢待命", isDrawing: false };
}

function updateFingerPosition(x, y, active) {
  fingerScreen.x = x;
  fingerScreen.y = y;
  fingerScreen.active = active;
  fingerNDC.x = x / window.innerWidth - 0.5;
  fingerNDC.y = -(y / window.innerHeight - 0.5);
  fingerNDC.active = active;
}

function maybeBurst(indexTip, label, coinCount) {
  const now = performance.now();
  if (now - lastBurst < 1200) return;
  lastBurst = now;
  const x = (1 - indexTip.x) * window.innerWidth;
  const y = indexTip.y * window.innerHeight;
  emitCoins(x, y, coinCount);
  burstPower = Math.max(burstPower, 0.35);
  increaseWealth(4);
  increaseCoins(coinCount);
  setStatus(label);
}

function triggerRichMode(indexTip) {
  const now = performance.now();
  if (now - lastBurst < 1800) return;
  lastBurst = now;
  const x = (1 - indexTip.x) * window.innerWidth;
  const y = indexTip.y * window.innerHeight;
  burstPower = 1.4;
  emitCoins(x, y, 68);
  triggerWealthRing(x, y);
  increaseWealth(22);
  increaseCoins(88);
  showResult("Rich Mode Activated", "金色爆發已啟動。今日財運能量上升。");
}

function drawHandSkeleton(lm) {
  const rect = handCanvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const sx = (p) => (1 - p.x) * w;
  const sy = (p) => p.y * h;
  const connections = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17]
  ];

  handCtx.save();
  handCtx.lineWidth = 2;
  handCtx.strokeStyle = "rgba(245, 215, 123, 0.78)";
  handCtx.shadowBlur = 12;
  handCtx.shadowColor = "rgba(245, 215, 123, 0.7)";

  connections.forEach(([a, b]) => {
    handCtx.beginPath();
    handCtx.moveTo(sx(lm[a]), sy(lm[a]));
    handCtx.lineTo(sx(lm[b]), sy(lm[b]));
    handCtx.stroke();
  });

  lm.forEach((p, idx) => {
    handCtx.beginPath();
    handCtx.arc(sx(p), sy(p), idx === 8 ? 5 : 3, 0, Math.PI * 2);
    handCtx.fillStyle = idx === 8 ? "#f8e7b0" : "rgba(212,175,55,0.9)";
    handCtx.fill();
  });

  handCtx.restore();
}

function clearHandCanvas() {
  const rect = handCanvas.getBoundingClientRect();
  handCtx.clearRect(0, 0, rect.width, rect.height);
}

function smooth(current, target, amount) {
  return current + (target - current) * amount;
}

function setStatus(text, quiet = false) {
  statusText.textContent = text;
  if (!quiet) resultNote.textContent = text;
}

function setGesture(text) {
  if (text === lastGesture) return;
  lastGesture = text;
  gestureText.textContent = text;
}

function increaseWealth(amount) {
  wealthEnergy = Math.min(100, wealthEnergy + amount);
  wealthText.textContent = Math.round(wealthEnergy);
  wealthBar.style.width = `${Math.round(wealthEnergy)}%`;
}

function increaseCoins(amount) {
  coinsCollected = Math.min(9999, coinsCollected + amount);
  coinText.textContent = Math.round(coinsCollected);
}

function showResult(title, note) {
  resultTitle.textContent = title;
  resultNote.textContent = note;
  resultCard.classList.add("show");
  clearTimeout(resultTimeout);
  resultTimeout = setTimeout(() => {
    resultCard.classList.remove("show");
  }, 2800);
}
