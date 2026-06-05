import './styles.css';
import * as THREE from 'three';

import { ACT_TIMING, AUDIO, LAYOUT, PALETTE, TIMING } from './config';
import { WoundSystem } from './utils/WoundSystem';
import { AudioManager } from './utils/AudioManager';
import { Background } from './scene/Background';
import { DiaryPage } from './scene/DiaryPage';
import { Silhouette } from './scene/Silhouette';
import { InkSystem } from './scene/InkSystem';
import { MemoryFragments } from './scene/MemoryFragments';
import { createPostProcessing } from './PostProcessing';

let started = false;
let elapsed = 0;
let lastTime = 0;
let instructionFaded = false;
let diaryAppearing = false;
let diaryInteractive = false;
let diaryVisibleAt = Number.POSITIVE_INFINITY;
let finalReadyAt: number | null = null;
let finalLineShowing = false;
let finalLineDissolvingTimer = 0;
let endingTriggered = false;
let cursorRedness = 0;

let openingBlinkDone = false;
let openingEyesOpened = false;
let openingTearStarted = false;
let openingEyesClosed = false;
let diaryEyesOpened = false;
let tearStarted = false;

const mouseNDC = new THREE.Vector2(0, 0);
let mouseUV: { x: number; y: number } | null = null;
let cursorGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;
const introOverlay = document.getElementById('intro-overlay') as HTMLDivElement;
const instructionEl = document.getElementById('instruction') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(PALETTE.nearBlack, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const aspect = window.innerWidth / window.innerHeight;
const camSize = LAYOUT.cameraSize;
const camera = new THREE.OrthographicCamera(
  -camSize * aspect,
  camSize * aspect,
  camSize,
  -camSize,
  0.1,
  100,
);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

const woundSystem = new WoundSystem();
const audioManager = new AudioManager();
const background = new Background();
const memoryFragments = new MemoryFragments();
const diaryPage = new DiaryPage();
const silhouette = new Silhouette();
const inkSystem = new InkSystem();

background.addToScene(scene);
memoryFragments.addToScene(scene);
diaryPage.addToScene(scene);
silhouette.addToScene(scene);
inkSystem.addToScene(scene);

function createCursorGlow(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const geo = new THREE.PlaneGeometry(1.35, 1.35);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uOpacity: { value: 0.12 },
      uRedness: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uOpacity;
      uniform float uRedness;
      void main() {
        vec2 centre = vUv - 0.5;
        float dist = length(centre) * 2.0;
        float glow = pow(1.0 - smoothstep(0.0, 1.0, dist), 2.5);
        vec3 parchment = vec3(0.85, 0.78, 0.63);
        vec3 wound = vec3(0.75, 0.05, 0.08);
        vec3 col = mix(parchment, wound, uRedness);
        gl_FragColor = vec4(col, glow * uOpacity);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 100;
  mesh.position.z = 5;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}
cursorGlow = createCursorGlow();

const postFX = createPostProcessing(
  renderer,
  scene,
  camera,
  window.innerWidth,
  window.innerHeight,
);

function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const a = w / h;

  camera.left = -camSize * a;
  camera.right = camSize * a;
  camera.top = camSize;
  camera.bottom = -camSize;
  camera.updateProjectionMatrix();

  renderer.setSize(w, h);
  postFX.resize(w, h);
}
window.addEventListener('resize', onResize);
onResize();

function onMouseMove(e: MouseEvent): void {
  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

  const worldX = mouseNDC.x * camSize * (window.innerWidth / window.innerHeight);
  const worldY = mouseNDC.y * camSize;

  cursorGlow.position.x = worldX;
  cursorGlow.position.y = worldY;

  const u = worldX / LAYOUT.diaryWidth + 0.5;
  const v = (worldY - LAYOUT.diaryY) / LAYOUT.diaryHeight + 0.5;
  const vFlipped = 1.0 - v;

  if (u >= 0 && u <= 1 && vFlipped >= 0 && vFlipped <= 1) {
    mouseUV = { x: u, y: vFlipped };
  } else {
    mouseUV = null;
  }
}
window.addEventListener('mousemove', onMouseMove);

async function startExperience(): Promise<void> {
  if (started) return;
  started = true;
  introOverlay.classList.add('hidden');
  cursorGlow.visible = true;

  lastTime = performance.now() / 1000;
  requestAnimationFrame(animate);

  const loaded = await audioManager.load('/audio/diary.mp3');
  if (loaded) {
    audioManager.play({
      startAt: AUDIO.startAt,
      fadeInDuration: AUDIO.fadeInDuration,
    });
  }
}

introOverlay.addEventListener('click', startExperience);
canvas.addEventListener('click', () => {
  if (!started) startExperience();
});

function getTimelineAudioTime(): number {
  const audioTime = audioManager.getTime();
  return audioTime > 0 ? audioTime : AUDIO.startAt + elapsed;
}

function updateTimeline(audioTime: number, deltaTime: number): void {
  const preDiaryProgress = Math.min(1, elapsed / 22);
  if (!diaryAppearing) {
    silhouette.showPresence(0.68 + preDiaryProgress * 0.22);
  }

  if (!openingBlinkDone && elapsed > 2.4) {
    openingBlinkDone = true;
    silhouette.showEyeGlint();
  }

  if (!openingEyesOpened && elapsed > 5.5) {
    openingEyesOpened = true;
    silhouette.openEyes();
  }

  if (openingEyesOpened && !diaryAppearing && !openingEyesClosed) {
    const lookT = Math.max(0, elapsed - 7.4);
    let lookX = 0;
    let lookY = 0;
    if (lookT < 1.2) {
      lookX = -0.85;
      lookY = -0.08;
    } else if (lookT < 2.5) {
      lookX = 0.82;
      lookY = 0.12;
    } else if (lookT < 4.0) {
      lookX = 0.1;
      lookY = -0.72;
    } else if (lookT < 5.6) {
      lookX = -0.25;
      lookY = 0.58;
    } else {
      lookX = Math.sin(lookT * 1.8) * 0.08;
      lookY = Math.cos(lookT * 1.3) * 0.06;
    }
    silhouette.setIrisTarget(lookX, lookY);
  }

  if (!openingTearStarted && elapsed > 13.2) {
    openingTearStarted = true;
    silhouette.startTear();
  }

  if (!openingEyesClosed && elapsed > 21.2) {
    openingEyesClosed = true;
    silhouette.closeEyes();
  }

  if (!diaryAppearing && audioTime >= AUDIO.diaryAppearAt) {
    diaryAppearing = true;
    diaryVisibleAt = elapsed;
    silhouette.showPresence(0.24);
    diaryPage.fadeIn();
    memoryFragments.setActive(false);
    instructionEl.classList.add('visible');
  }

  if (diaryAppearing && !diaryInteractive && diaryPage.isVisible()) {
    diaryInteractive = true;
  }

  if (finalLineShowing) {
    cursorRedness = Math.min(
      1,
      cursorRedness + deltaTime / ACT_TIMING.cursorRedFadeDuration,
    );
  }
  cursorGlow.material.uniforms.uRedness.value = cursorRedness;
}

function processInteraction(deltaTime: number): void {
  if (!started || endingTriggered || !diaryInteractive || finalLineShowing) return;

  if (mouseUV) {
    const lineIndex = diaryPage.checkCursorProximity(mouseUV.x, mouseUV.y);
    if (lineIndex >= 0) {
      const didBeginReveal = diaryPage.revealLine(lineIndex, deltaTime);
      if (didBeginReveal) {
        const isNewWound = woundSystem.reveal(lineIndex);
        if (isNewWound && !instructionFaded) {
          instructionFaded = true;
          setTimeout(() => {
            instructionEl.classList.remove('visible');
            instructionEl.classList.add('hidden');
          }, TIMING.instructionFadeDelay * 1000);
        }
      }
    }
  }

  const events = woundSystem.consumeEvents();
  for (const event of events) {
    switch (event.type) {
      case 'wound':
        handleWound(event.woundCount);
        break;
      case 'eyes-open':
        if (!diaryEyesOpened) {
          diaryEyesOpened = true;
          silhouette.openEyes();
        }
        break;
      case 'tear-begin':
        if (!tearStarted) {
          tearStarted = true;
          silhouette.startTear();
        }
        break;
      case 'final-ready':
        finalReadyAt = elapsed;
        silhouette.blink();
        break;
      case 'ending':
        handleEnding();
        break;
    }
  }
}

function handleWound(count: number): void {
  silhouette.setVisibility(Math.max(0.28, woundSystem.getSilhouetteVisibility()));
  postFX.setIntensity(woundSystem.getProgress());

  if (count === 4 || count === 9) silhouette.lookAway();
  if (count === 6 || count === 11) silhouette.blink();
}

function maybeStartFinalLine(): void {
  if (finalLineShowing || finalReadyAt === null) return;
  const diaryHasBreathed = elapsed - diaryVisibleAt >= ACT_TIMING.minimumDiaryDuration;
  const stareDelayPassed = elapsed - finalReadyAt >= ACT_TIMING.finalStareDelay;
  if (!diaryHasBreathed || !stareDelayPassed) return;

  finalLineShowing = true;
  woundSystem.markFinalLineShown();
  silhouette.lockIrisForward();
  silhouette.blink();
  diaryPage.showFinalLine();
  finalLineDissolvingTimer =
    TIMING.finalLineHoldDuration +
    TIMING.dissolveDuration +
    ACT_TIMING.recognitionLingerDuration;
}

function handleEnding(): void {
  if (endingTriggered) return;
  endingTriggered = true;
  diaryPage.fadeAll();
  silhouette.fadeOut();
  inkSystem.fadeOut();
  memoryFragments.setActive(false);
  audioManager.fadeOut(TIMING.fadeOutDuration);
}

function animate(now: number): void {
  requestAnimationFrame(animate);

  const currentTime = now / 1000;
  const deltaTime = Math.min(currentTime - lastTime, 0.1);
  lastTime = currentTime;
  elapsed += deltaTime;

  const audioTime = getTimelineAudioTime();
  updateTimeline(audioTime, deltaTime);
  processInteraction(deltaTime);
  maybeStartFinalLine();

  if (diaryEyesOpened && diaryInteractive && !finalLineShowing) {
    silhouette.setIrisTarget(mouseNDC.x * 0.6, mouseNDC.y * 0.6);
  }

  background.update(elapsed);
  memoryFragments.update(elapsed, deltaTime, mouseNDC);
  diaryPage.update(elapsed, deltaTime, diaryAppearing ? mouseUV : null);
  const tearDropPos = silhouette.update(elapsed, deltaTime);
  inkSystem.update(elapsed, deltaTime);

  // Parallax depth effect
  camera.position.x += (mouseNDC.x * 0.5 - camera.position.x) * 0.05;
  camera.position.y += (mouseNDC.y * 0.5 - camera.position.y) * 0.05;

  const bleedPositions = diaryPage.consumeBleedParticles();
  if (bleedPositions.length > 0) {
    inkSystem.spawnDroplets(bleedPositions);
  }

  if (tearDropPos) {
    const tearParticles = [tearDropPos.clone()];
    for (let i = 0; i < 4; i++) {
      const p = tearDropPos.clone();
      p.x += (Math.random() - 0.5) * 0.35;
      p.y += (Math.random() - 0.5) * 0.12;
      tearParticles.push(p);
    }
    inkSystem.spawnDroplets(tearParticles, 1.3);
  }

  if (finalLineShowing && !endingTriggered) {
    finalLineDissolvingTimer -= deltaTime;
    if (finalLineDissolvingTimer <= 0) {
      woundSystem.triggerEnding();
      handleEnding();
    }
  }

  postFX.update(elapsed);
  postFX.composer.render();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderer.dispose();
  });
}
