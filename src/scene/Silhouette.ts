import * as THREE from 'three';
import { PALETTE, PALETTE_CSS, LAYOUT, TIMING } from '../config';

// ─── Easing Helpers ────────────────────────────────────────────────
/** Smooth-start, smooth-end (hermite) */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** More dramatic easing – slow start, quick middle, gentle end */
function easeInOutQuart(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5
    ? 8 * c * c * c * c
    : 1 - Math.pow(-2 * c + 2, 4) / 2;
}

/** Simple seeded pseudo-random for deterministic textures */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ─── Canvas Texture Generators ─────────────────────────────────────

/**
 * Generate the silhouette body canvas – a dark head/shoulders/cloak
 * shape with painterly rough edges and subtle fabric-fold variation.
 */
function createSilhouetteCanvas(): HTMLCanvasElement {
  const W = 512;
  const H = 768;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Start fully transparent
  ctx.clearRect(0, 0, W, H);

  const rng = seededRandom(42);

  // --- Build the outline path with noise ---
  // We trace a closed path: top of head → right side → right shoulder →
  // right cloak edge → bottom → left cloak edge → left shoulder → left side → back to top.

  const cx = W / 2;

  // Head ellipse parameters
  const headCX = cx;
  const headCY = 170;
  const headRX = 132;   // horizontal radius
  const headRY = 138;   // vertical radius

  // Neck
  const neckWidth = 62;
  const neckBottom = headCY + headRY + 30;

  // Shoulders
  const shoulderY = neckBottom + 15;
  const shoulderWidth = 210;

  // Cloak flare
  const cloakBottomWidth = 275;
  const cloakBottom = H - 10;

  // Build outline points going clockwise from top of head
  const points: Array<{ x: number; y: number }> = [];

  // Top of head arc (left to right)
  for (let a = Math.PI; a >= 0; a -= 0.06) {
    const noise = (rng() - 0.5) * 6;
    points.push({
      x: headCX + Math.cos(a) * (headRX + noise),
      y: headCY - Math.sin(a) * (headRY + noise * 0.5),
    });
  }

  // Right side of head down to neck
  for (let a = 0; a <= Math.PI * 0.55; a += 0.08) {
    const noise = (rng() - 0.5) * 5;
    points.push({
      x: headCX + Math.cos(a) * (headRX + noise),
      y: headCY + Math.sin(a) * (headRY + noise * 0.3),
    });
  }

  // Right neck
  points.push({ x: cx + neckWidth + (rng() - 0.5) * 4, y: headCY + headRY * 0.55 });
  points.push({ x: cx + neckWidth + (rng() - 0.5) * 4, y: neckBottom });

  // Right shoulder slope
  const shoulderSteps = 8;
  for (let i = 0; i <= shoulderSteps; i++) {
    const t = i / shoulderSteps;
    const nx = (rng() - 0.5) * 7;
    const ny = (rng() - 0.5) * 5;
    points.push({
      x: cx + neckWidth + t * (shoulderWidth - neckWidth) + nx,
      y: neckBottom + t * (shoulderY - neckBottom) + ny + t * 25,
    });
  }

  // Right cloak edge — expands with bell-curve
  const cloakSteps = 20;
  for (let i = 0; i <= cloakSteps; i++) {
    const t = i / cloakSteps;
    const width = shoulderWidth + t * (cloakBottomWidth - shoulderWidth);
    const noise = (rng() - 0.5) * 10;
    points.push({
      x: cx + width + noise,
      y: shoulderY + 25 + t * (cloakBottom - shoulderY - 25),
    });
  }

  // Bottom edge (right to left)
  const bottomSteps = 12;
  for (let i = 0; i <= bottomSteps; i++) {
    const t = i / bottomSteps;
    const noise = (rng() - 0.5) * 8;
    points.push({
      x: cx + cloakBottomWidth - t * 2 * cloakBottomWidth + noise,
      y: cloakBottom + (rng() - 0.5) * 6,
    });
  }

  // Left cloak edge (bottom to shoulder)
  for (let i = cloakSteps; i >= 0; i--) {
    const t = i / cloakSteps;
    const width = shoulderWidth + t * (cloakBottomWidth - shoulderWidth);
    const noise = (rng() - 0.5) * 10;
    points.push({
      x: cx - width + noise,
      y: shoulderY + 25 + t * (cloakBottom - shoulderY - 25),
    });
  }

  // Left shoulder slope
  for (let i = shoulderSteps; i >= 0; i--) {
    const t = i / shoulderSteps;
    const nx = (rng() - 0.5) * 7;
    const ny = (rng() - 0.5) * 5;
    points.push({
      x: cx - neckWidth - t * (shoulderWidth - neckWidth) + nx,
      y: neckBottom + t * (shoulderY - neckBottom) + ny + t * 25,
    });
  }

  // Left neck
  points.push({ x: cx - neckWidth + (rng() - 0.5) * 4, y: neckBottom });
  points.push({ x: cx - neckWidth + (rng() - 0.5) * 4, y: headCY + headRY * 0.55 });

  // Left side of head back up
  for (let a = Math.PI * 0.55; a >= 0; a -= 0.08) {
    const noise = (rng() - 0.5) * 5;
    points.push({
      x: headCX - Math.cos(a) * (headRX + noise),
      y: headCY + Math.sin(a) * (headRY + noise * 0.3),
    });
  }

  // --- Draw the filled shape multiple times for dry-brush edge breakup ---
  // First pass: main fill
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    // Use quadratic curves through midpoints for smoothness
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }
  ctx.closePath();
  ctx.fillStyle = '#0D090E';
  ctx.fill();
  ctx.restore();

  // A faint sketched contour keeps the figure visible against the black void.
  const sketchRng = seededRandom(909);
  for (let pass = 0; pass < 9; pass++) {
    ctx.save();
    ctx.globalCompositeOperation = pass < 5 ? 'source-over' : 'lighter';
    ctx.globalAlpha = pass < 5 ? 0.14 : 0.055;
    ctx.strokeStyle = pass < 5 ? 'rgba(91, 64, 77, 0.72)' : 'rgba(216, 198, 160, 0.55)';
    ctx.lineWidth = pass < 5 ? 1.4 + sketchRng() * 2.8 : 0.6 + sketchRng() * 1.1;
    const offX = (sketchRng() - 0.5) * 11;
    const offY = (sketchRng() - 0.5) * 11;
    ctx.beginPath();
    ctx.moveTo(points[0].x + offX, points[0].y + offY);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2 + offX;
      const midY = (prev.y + curr.y) / 2 + offY;
      ctx.quadraticCurveTo(prev.x + offX, prev.y + offY, midX, midY);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // --- Subtle internal fabric-fold variation ---
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const foldRng = seededRandom(1337);
  for (let i = 0; i < 40; i++) {
    const fx = cx + (foldRng() - 0.5) * 300;
    const fy = 200 + foldRng() * 500;
    const fw = 30 + foldRng() * 80;
    const fh = 50 + foldRng() * 150;
    ctx.globalAlpha = 0.02 + foldRng() * 0.03;
    ctx.fillStyle = '#181018';
    ctx.beginPath();
    ctx.ellipse(fx, fy, fw, fh, foldRng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // --- Dry-brush edge breakup: redraw outline with offsets ---
  for (let pass = 0; pass < 5; pass++) {
    ctx.save();
    ctx.globalAlpha = 0.15 + rng() * 0.15;
    const offX = (rng() - 0.5) * 4;
    const offY = (rng() - 0.5) * 4;
    ctx.beginPath();
    ctx.moveTo(points[0].x + offX, points[0].y + offY);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2 + offX;
      const midY = (prev.y + curr.y) / 2 + offY;
      ctx.quadraticCurveTo(prev.x + offX, prev.y + offY, midX, midY);
    }
    ctx.closePath();
    ctx.fillStyle = '#0D090E';
    ctx.fill();
    ctx.restore();
  }

  // --- Edge grain: scatter tiny dots along the outline ---
  ctx.save();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    for (let d = 0; d < 6; d++) {
      const dx = (rng() - 0.5) * 16;
      const dy = (rng() - 0.5) * 12;
      ctx.globalAlpha = rng() * 0.25;
      ctx.fillStyle = rng() > 0.62 ? 'rgba(216, 198, 160, 0.32)' : 'rgba(91, 64, 77, 0.5)';
      ctx.fillRect(p.x + dx, p.y + dy, 1 + rng() * 2, 1 + rng() * 2);
    }
  }
  ctx.restore();

  return canvas;
}

/**
 * Generate a single eye canvas – an off-white oval with bloodshot veins
 * and paper-grain texture.
 */
function createEyeCanvas(): HTMLCanvasElement {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);

  const cx = S / 2;
  const cy = S / 2;
  const rx = S * 0.44;  // oval horizontal radius — nearly filling canvas
  const ry = S * 0.36;  // oval vertical radius

  const rng = seededRandom(777);

  // --- Draw rough oval ---
  // Build outline with small random offsets for organic feel
  const ovalPoints: Array<{ x: number; y: number }> = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const noiseR = (rng() - 0.5) * 4;
    ovalPoints.push({
      x: cx + Math.cos(a) * (rx + noiseR),
      y: cy + Math.sin(a) * (ry + noiseR * 0.7),
    });
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ovalPoints[0].x, ovalPoints[0].y);
  for (let i = 1; i < ovalPoints.length; i++) {
    const prev = ovalPoints[i - 1];
    const curr = ovalPoints[i];
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
  }
  ctx.closePath();

  // Fill with eye-white
  ctx.fillStyle = PALETTE_CSS.eyeWhite;
  ctx.fill();
  ctx.restore();

  // --- Paper-like grain ---
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 3000; i++) {
    const gx = rng() * S;
    const gy = rng() * S;
    ctx.globalAlpha = 0.02 + rng() * 0.04;
    ctx.fillStyle = rng() > 0.5 ? '#DDD8CC' : '#E8E2D6';
    ctx.fillRect(gx, gy, 1, 1);
  }
  ctx.restore();

  // --- Bloodshot veins ---
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const veinCount = 14;
  for (let v = 0; v < veinCount; v++) {
    const angle = rng() * Math.PI * 2;
    const startDist = 0.7 + rng() * 0.25;
    const endDist = 0.2 + rng() * 0.35;
    const sx = cx + Math.cos(angle) * rx * startDist;
    const sy = cy + Math.sin(angle) * ry * startDist;
    const ex = cx + Math.cos(angle + (rng() - 0.5) * 0.6) * rx * endDist;
    const ey = cy + Math.sin(angle + (rng() - 0.5) * 0.6) * ry * endDist;

    ctx.beginPath();
    ctx.moveTo(sx, sy);

    // Wiggly vein path with 3–5 segments
    const segments = 3 + Math.floor(rng() * 3);
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const mx = sx + (ex - sx) * t + (rng() - 0.5) * 15;
      const my = sy + (ey - sy) * t + (rng() - 0.5) * 10;
      ctx.lineTo(mx, my);
    }

    ctx.strokeStyle = `rgba(180, ${60 + Math.floor(rng() * 40)}, ${60 + Math.floor(rng() * 30)}, ${0.08 + rng() * 0.12})`;
    ctx.lineWidth = 0.5 + rng() * 1.0;
    ctx.stroke();

    // Occasional branch
    if (rng() > 0.5) {
      const bt = 0.3 + rng() * 0.4;
      const bx = sx + (ex - sx) * bt;
      const by = sy + (ey - sy) * bt;
      const branchAngle = angle + (rng() - 0.5) * 1.2;
      const bLen = 10 + rng() * 20;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(branchAngle) * bLen, by + Math.sin(branchAngle) * bLen);
      ctx.strokeStyle = `rgba(170, 70, 60, ${0.05 + rng() * 0.08})`;
      ctx.lineWidth = 0.3 + rng() * 0.5;
      ctx.stroke();
    }
  }
  ctx.restore();

  // --- Clip everything to oval shape (erase outside) ---
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.moveTo(ovalPoints[0].x, ovalPoints[0].y);
  for (let i = 1; i < ovalPoints.length; i++) {
    const prev = ovalPoints[i - 1];
    const curr = ovalPoints[i];
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFF';
  ctx.fill();
  ctx.restore();

  return canvas;
}

/**
 * Generate the iris canvas – a black circle with subtle dark-grey edge.
 */
function createIrisCanvas(): HTMLCanvasElement {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);

  const cx = S / 2;
  const cy = S / 2;
  const r = 28;

  // Radial gradient: black centre → very dark grey edge
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, '#040304');
  grad.addColorStop(0.75, '#060506');
  grad.addColorStop(0.92, '#121012');
  grad.addColorStop(1.0, 'rgba(12, 10, 12, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

/**
 * Generate a smoky eye socket texture that anchors the white eye in the head.
 */
function createEyeSocketCanvas(): HTMLCanvasElement {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const cx = S / 2;
  const cy = S / 2;

  ctx.clearRect(0, 0, S, S);

  const grad = ctx.createRadialGradient(cx, cy, 12, cx, cy, 116);
  grad.addColorStop(0, 'rgba(36, 20, 38, 0.52)');
  grad.addColorStop(0.48, 'rgba(18, 10, 18, 0.38)');
  grad.addColorStop(1, 'rgba(5, 4, 5, 0)');

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1.35, 0.78);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(216, 198, 160, 0.16)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    const y = cy - 24 + i * 8;
    ctx.beginPath();
    ctx.ellipse(cx, y, 92 - i * 5, 26 + i * 2, 0, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
  }
  ctx.restore();

  return canvas;
}

/**
 * Generate the tear canvas – a teardrop shape, pale grey-blue with
 * a small white highlight.
 */
function createTearCanvas(): HTMLCanvasElement {
  const W = 32;
  const H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;

  // Teardrop: circle at bottom, tapering to top
  ctx.beginPath();
  // Top point
  ctx.moveTo(cx, 6);
  // Right curve down to circle
  ctx.bezierCurveTo(cx + 2, 20, cx + 13, 35, cx + 12, 46);
  // Bottom circle arc
  ctx.arc(cx, 48, 12, 0, Math.PI, false);
  // Left curve back up
  ctx.bezierCurveTo(cx - 13, 35, cx - 2, 20, cx, 6);
  ctx.closePath();

  // Fill with tear grey-blue
  const grad = ctx.createLinearGradient(0, 6, 0, 60);
  grad.addColorStop(0, '#D0DDE0');
  grad.addColorStop(0.5, PALETTE_CSS.tearGrey);
  grad.addColorStop(1, '#B8C8CC');
  ctx.fillStyle = grad;
  ctx.fill();

  // White highlight spot
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.6;
  const hlGrad = ctx.createRadialGradient(cx - 2, 38, 0, cx - 2, 38, 6);
  hlGrad.addColorStop(0, '#FFFFFF');
  hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hlGrad;
  ctx.beginPath();
  ctx.arc(cx - 2, 38, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return canvas;
}

function createTearTrailCanvas(): HTMLCanvasElement {
  const W = 32;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(200, 212, 216, 0)');
  grad.addColorStop(0.28, 'rgba(200, 212, 216, 0.28)');
  grad.addColorStop(0.68, 'rgba(90, 7, 18, 0.22)');
  grad.addColorStop(1, 'rgba(90, 7, 18, 0)');

  ctx.strokeStyle = grad;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W / 2, 16);
  ctx.bezierCurveTo(W / 2 - 5, 70, W / 2 + 6, 150, W / 2, H - 16);
  ctx.stroke();

  return canvas;
}

// ─── Animation State Enums ─────────────────────────────────────────
const enum EyeState { Closed, Opening, Open }
const enum TearState { Idle, Forming, Falling, Done }
const enum FadeState { None, FadingOut, Done }

// ─── The Silhouette Class ──────────────────────────────────────────
export class Silhouette {
  group: THREE.Group;

  // Meshes
  private silhouetteMesh: THREE.Mesh;
  private leftSocketMesh: THREE.Mesh;
  private rightSocketMesh: THREE.Mesh;
  private leftEyeMesh: THREE.Mesh;
  private rightEyeMesh: THREE.Mesh;
  private leftIrisMesh: THREE.Mesh;
  private rightIrisMesh: THREE.Mesh;
  private tearMesh: THREE.Mesh;
  private tearTrailMesh: THREE.Mesh;

  // Materials (kept for opacity manipulation)
  private silhouetteMat: THREE.MeshBasicMaterial;
  private leftSocketMat: THREE.MeshBasicMaterial;
  private rightSocketMat: THREE.MeshBasicMaterial;
  private leftEyeMat: THREE.MeshBasicMaterial;
  private rightEyeMat: THREE.MeshBasicMaterial;
  private leftIrisMat: THREE.MeshBasicMaterial;
  private rightIrisMat: THREE.MeshBasicMaterial;
  private tearMat: THREE.MeshBasicMaterial;
  private tearTrailMat: THREE.MeshBasicMaterial;

  // Eye animation
  private eyeState: EyeState = EyeState.Closed;
  private eyeOpenStart = 0;

  // Iris tracking
  private irisTargetX = 0;
  private irisTargetY = -0.15; // initially looking down at the diary
  private irisLocked = false;
  private irisMaxOffset = 0.25;
  private irisLerpFactor = 0.02;

  // Tear animation
  private tearState: TearState = TearState.Idle;
  private tearStartTime = 0;
  private tearDetached = false;
  private tearWorldPos = new THREE.Vector3();
  private tearHasEmitted = false;

  // Fade out
  private fadeState: FadeState = FadeState.None;
  private fadeStartTime = 0;

  // Pre-diary presence and eye beats
  private presenceAmount = 0;
  private glintTimer = 0;
  private partialOpenTimer = 0;
  private blinkTimer = 0;
  private lookAwayTimer = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Silhouette';

    // ─── Silhouette Body ───────────────────────────────────────
    const silhouetteCanvas = createSilhouetteCanvas();
    const silhouetteTex = new THREE.CanvasTexture(silhouetteCanvas);
    silhouetteTex.minFilter = THREE.LinearFilter;
    silhouetteTex.magFilter = THREE.LinearFilter;

    this.silhouetteMat = new THREE.MeshBasicMaterial({
      map: silhouetteTex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      opacity: 0,
    });

    const silhouetteGeo = new THREE.PlaneGeometry(
      LAYOUT.silhouetteWidth,
      LAYOUT.silhouetteHeight,
    );
    this.silhouetteMesh = new THREE.Mesh(silhouetteGeo, this.silhouetteMat);
    this.silhouetteMesh.position.set(0, LAYOUT.silhouetteY, LAYOUT.silhouetteZ);
    this.silhouetteMesh.renderOrder = -1;
    this.group.add(this.silhouetteMesh);

    const socketCanvas = createEyeSocketCanvas();
    const socketTex = new THREE.CanvasTexture(socketCanvas);
    socketTex.minFilter = THREE.LinearFilter;
    socketTex.magFilter = THREE.LinearFilter;
    const socketGeo = new THREE.PlaneGeometry(
      LAYOUT.eyeWidth * 1.55,
      LAYOUT.eyeHeight * 1.25,
    );

    this.leftSocketMat = new THREE.MeshBasicMaterial({
      map: socketTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.leftSocketMesh = new THREE.Mesh(socketGeo, this.leftSocketMat);
    this.leftSocketMesh.position.set(
      -LAYOUT.eyeSpacing / 2,
      LAYOUT.eyeY - 0.03,
      LAYOUT.eyeZ - 0.03,
    );
    this.leftSocketMesh.renderOrder = 0;
    this.group.add(this.leftSocketMesh);

    this.rightSocketMat = new THREE.MeshBasicMaterial({
      map: socketTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.rightSocketMesh = new THREE.Mesh(socketGeo, this.rightSocketMat);
    this.rightSocketMesh.position.set(
      LAYOUT.eyeSpacing / 2,
      LAYOUT.eyeY - 0.03,
      LAYOUT.eyeZ - 0.03,
    );
    this.rightSocketMesh.renderOrder = 0;
    this.group.add(this.rightSocketMesh);

    // ─── Eyes ──────────────────────────────────────────────────
    const eyeCanvas = createEyeCanvas();
    const eyeTex = new THREE.CanvasTexture(eyeCanvas);
    eyeTex.minFilter = THREE.LinearFilter;
    eyeTex.magFilter = THREE.LinearFilter;

    const eyeGeo = new THREE.PlaneGeometry(LAYOUT.eyeWidth, LAYOUT.eyeHeight);

    // Left eye
    this.leftEyeMat = new THREE.MeshBasicMaterial({
      map: eyeTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.leftEyeMesh = new THREE.Mesh(eyeGeo, this.leftEyeMat);
    this.leftEyeMesh.position.set(
      -LAYOUT.eyeSpacing / 2,
      LAYOUT.eyeY,
      LAYOUT.eyeZ,
    );
    this.leftEyeMesh.scale.y = 0; // closed
    this.leftEyeMesh.renderOrder = 1;
    this.group.add(this.leftEyeMesh);

    // Right eye
    this.rightEyeMat = new THREE.MeshBasicMaterial({
      map: eyeTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.rightEyeMesh = new THREE.Mesh(eyeGeo, this.rightEyeMat);
    this.rightEyeMesh.position.set(
      LAYOUT.eyeSpacing / 2,
      LAYOUT.eyeY,
      LAYOUT.eyeZ,
    );
    this.rightEyeMesh.scale.y = 0; // closed
    this.rightEyeMesh.renderOrder = 1;
    this.group.add(this.rightEyeMesh);

    // ─── Irises ────────────────────────────────────────────────
    const irisCanvas = createIrisCanvas();
    const irisTex = new THREE.CanvasTexture(irisCanvas);
    irisTex.minFilter = THREE.LinearFilter;
    irisTex.magFilter = THREE.LinearFilter;

    const irisDiameter = LAYOUT.irisRadius * 2;
    const irisGeo = new THREE.PlaneGeometry(irisDiameter, irisDiameter);

    this.leftIrisMat = new THREE.MeshBasicMaterial({
      map: irisTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.leftIrisMesh = new THREE.Mesh(irisGeo, this.leftIrisMat);
    this.leftIrisMesh.position.set(0, -0.15, 0.01); // looking down
    this.leftIrisMesh.renderOrder = 2;
    this.leftEyeMesh.add(this.leftIrisMesh);

    this.rightIrisMat = new THREE.MeshBasicMaterial({
      map: irisTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.rightIrisMesh = new THREE.Mesh(irisGeo, this.rightIrisMat);
    this.rightIrisMesh.position.set(0, -0.15, 0.01); // looking down
    this.rightIrisMesh.renderOrder = 2;
    this.rightEyeMesh.add(this.rightIrisMesh);

    // ─── Tear ──────────────────────────────────────────────────
    const tearCanvas = createTearCanvas();
    const tearTex = new THREE.CanvasTexture(tearCanvas);
    tearTex.minFilter = THREE.LinearFilter;
    tearTex.magFilter = THREE.LinearFilter;

    const tearGeo = new THREE.PlaneGeometry(0.15, 0.3);
    this.tearMat = new THREE.MeshBasicMaterial({
      map: tearTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.tearMesh = new THREE.Mesh(tearGeo, this.tearMat);
    this.tearMesh.renderOrder = 2;
    // Start as child of the right eye, at bottom edge
    this.tearMesh.position.set(0, -LAYOUT.eyeHeight / 2 + 0.05, 0.02);
    this.rightEyeMesh.add(this.tearMesh);

    const trailCanvas = createTearTrailCanvas();
    const trailTex = new THREE.CanvasTexture(trailCanvas);
    trailTex.minFilter = THREE.LinearFilter;
    trailTex.magFilter = THREE.LinearFilter;
    const trailGeo = new THREE.PlaneGeometry(0.18, 1.35);
    this.tearTrailMat = new THREE.MeshBasicMaterial({
      map: trailTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      opacity: 0,
    });
    this.tearTrailMesh = new THREE.Mesh(trailGeo, this.tearTrailMat);
    this.tearTrailMesh.renderOrder = 2;
    this.tearTrailMesh.position.set(0, 0, 0);
    this.group.add(this.tearTrailMesh);
  }

  // ─── Public API ──────────────────────────────────────────────

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  /** Set silhouette body visibility (0 = invisible, 1 = fully visible) */
  setVisibility(amount: number): void {
    this.presenceAmount = Math.max(0, Math.min(1, amount));
  }

  /** Set the pre-diary silhouette presence without fully revealing the figure. */
  showPresence(amount: number): void {
    this.presenceAmount = Math.max(0, Math.min(1, amount));
  }

  /** Flash the eyes briefly in darkness before they are fully open. */
  showEyeGlint(): void {
    this.glintTimer = 0.9;
  }

  /** Let the eyes crack open for a moment, then close again. */
  partialOpenEyes(): void {
    if (this.eyeState !== EyeState.Closed) return;
    this.partialOpenTimer = 2.6;
  }

  blink(): void {
    if (this.eyeState !== EyeState.Open) return;
    this.blinkTimer = 0.42;
  }

  lookAway(): void {
    if (this.irisLocked) return;
    this.lookAwayTimer = 2.2;
  }

  closeEyes(): void {
    this.eyeState = EyeState.Closed;
    this.glintTimer = 0;
    this.partialOpenTimer = 0;
    this.blinkTimer = 0;
    this.irisLocked = false;
  }

  private preserveIrisShape(): void {
    const leftOpen = Math.max(0.001, Math.abs(this.leftEyeMesh.scale.y));
    const rightOpen = Math.max(0.001, Math.abs(this.rightEyeMesh.scale.y));
    this.leftIrisMesh.scale.y = Math.min(12, 1 / leftOpen);
    this.rightIrisMesh.scale.y = Math.min(12, 1 / rightOpen);
  }

  /** Begin the eye-opening animation */
  openEyes(): void {
    if (this.eyeState !== EyeState.Closed) return;
    this.eyeState = EyeState.Opening;
    // eyeOpenStart will be captured on next update()
    this.eyeOpenStart = -1; // sentinel: capture on first update
  }

  /** Set target position for iris tracking (normalised -1 to 1 range) */
  setIrisTarget(x: number, y: number): void {
    if (this.irisLocked) return;
    if (this.lookAwayTimer > 0) {
      this.irisTargetX = -0.65;
      this.irisTargetY = -0.1;
      return;
    }
    this.irisTargetX = x;
    this.irisTargetY = y;
  }

  /** Lock irises staring straight forward */
  lockIrisForward(): void {
    this.irisLocked = true;
    this.irisTargetX = 0;
    this.irisTargetY = 0;
  }

  /** Begin the tear formation and fall */
  startTear(): void {
    if (this.tearState === TearState.Forming || this.tearState === TearState.Falling) return;
    if (this.tearDetached || this.tearState === TearState.Done) {
      this.group.remove(this.tearMesh);
      this.rightEyeMesh.add(this.tearMesh);
      this.tearMesh.position.set(0, -LAYOUT.eyeHeight / 2 + 0.05, 0.02);
      this.tearMesh.scale.set(0.25, 0.25, 1);
      this.tearMat.opacity = 0;
      this.tearMat.color.set(PALETTE.tearGrey);
      this.tearDetached = false;
      this.tearHasEmitted = false;
      this.tearTrailMat.opacity = 0;
    }
    this.tearState = TearState.Forming;
    this.tearStartTime = -1; // sentinel: capture on first update
  }

  /** Fade everything out (end of piece) */
  fadeOut(): void {
    if (this.fadeState !== FadeState.None) return;
    this.fadeState = FadeState.FadingOut;
    this.fadeStartTime = -1; // sentinel
  }

  /**
   * Main update loop.
   * @returns world-space position of the tear when it detaches, or null.
   */
  update(elapsed: number, deltaTime: number): THREE.Vector3 | null {
    let tearDropPos: THREE.Vector3 | null = null;

    // Stepped time for painterly movement
    const steppedTime =
      Math.floor(elapsed * TIMING.steppedFPS) / TIMING.steppedFPS;

    // ─── Silhouette breathing ──────────────────────────────
    const breathScale = Math.sin(steppedTime * 0.3) * 0.005 + 1.0;
    const floatY = Math.sin(steppedTime * 0.2) * 0.05;
    this.silhouetteMesh.scale.y = breathScale;
    this.silhouetteMesh.position.y = LAYOUT.silhouetteY + floatY;
    const bodyTargetOpacity = this.presenceAmount * 0.95;
    const bodyLerp = 1 - Math.pow(0.01, deltaTime);
    this.silhouetteMat.opacity +=
      (bodyTargetOpacity - this.silhouetteMat.opacity) * bodyLerp;

    if (this.glintTimer > 0) {
      this.glintTimer = Math.max(0, this.glintTimer - deltaTime);
      const t = this.glintTimer / 0.9;
      const alpha = Math.sin(t * Math.PI) * 0.58;
      this.leftEyeMesh.scale.y = 0.08;
      this.rightEyeMesh.scale.y = 0.08;
      this.leftEyeMat.opacity = Math.max(this.leftEyeMat.opacity, alpha);
      this.rightEyeMat.opacity = Math.max(this.rightEyeMat.opacity, alpha);
      this.leftIrisMat.opacity = Math.max(this.leftIrisMat.opacity, alpha * 0.25);
      this.rightIrisMat.opacity = Math.max(this.rightIrisMat.opacity, alpha * 0.25);
      this.preserveIrisShape();
    }

    if (this.partialOpenTimer > 0 && this.eyeState === EyeState.Closed) {
      this.partialOpenTimer = Math.max(0, this.partialOpenTimer - deltaTime);
      const p = this.partialOpenTimer / 2.6;
      const openAmount = Math.sin((1 - p) * Math.PI) * 0.32;
      this.leftEyeMesh.scale.y = Math.max(this.leftEyeMesh.scale.y, openAmount);
      this.rightEyeMesh.scale.y = Math.max(this.rightEyeMesh.scale.y, openAmount * 0.82);
      this.leftEyeMat.opacity = Math.max(this.leftEyeMat.opacity, openAmount * 0.75);
      this.rightEyeMat.opacity = Math.max(this.rightEyeMat.opacity, openAmount * 0.65);
      this.leftIrisMat.opacity = Math.max(this.leftIrisMat.opacity, openAmount * 0.5);
      this.rightIrisMat.opacity = Math.max(this.rightIrisMat.opacity, openAmount * 0.42);
      this.preserveIrisShape();
    }
    
    if (this.eyeState === EyeState.Closed && this.glintTimer <= 0 && this.partialOpenTimer <= 0) {
      this.leftEyeMesh.scale.y *= Math.pow(0.01, deltaTime);
      this.rightEyeMesh.scale.y *= Math.pow(0.01, deltaTime);
      this.leftEyeMat.opacity *= Math.pow(0.02, deltaTime);
      this.rightEyeMat.opacity *= Math.pow(0.02, deltaTime);
      this.leftIrisMat.opacity *= Math.pow(0.02, deltaTime);
      this.rightIrisMat.opacity *= Math.pow(0.02, deltaTime);
    }

    // ─── Eye opening animation ─────────────────────────────
    if (this.eyeState === EyeState.Opening) {
      if (this.eyeOpenStart < 0) this.eyeOpenStart = elapsed;
      const t = (elapsed - this.eyeOpenStart) / TIMING.eyeOpenDuration;
      const eased = easeInOutQuart(t);
      const openScale = Math.min(1.12, eased * 1.12);

      this.leftEyeMesh.scale.y = openScale;
      this.rightEyeMesh.scale.y = openScale;
      this.leftEyeMat.opacity = eased;
      this.rightEyeMat.opacity = eased;
      this.leftIrisMat.opacity = eased;
      this.rightIrisMat.opacity = eased;
      this.preserveIrisShape();

      if (t >= 1) {
        this.eyeState = EyeState.Open;
        this.leftEyeMesh.scale.y = 1.08;
        this.rightEyeMesh.scale.y = 1.08;
        this.leftEyeMat.opacity = 1;
        this.rightEyeMat.opacity = 1;
        this.leftIrisMat.opacity = 1;
        this.rightIrisMat.opacity = 1;
        this.preserveIrisShape();
      }
    }

    // ─── Iris tracking ─────────────────────────────────────
    if (this.eyeState === EyeState.Opening || this.eyeState === EyeState.Open) {
      if (this.lookAwayTimer > 0) {
        this.lookAwayTimer = Math.max(0, this.lookAwayTimer - deltaTime);
      }
      if (this.eyeState === EyeState.Open && this.blinkTimer <= 0) {
        const restore = 1 - Math.pow(0.001, deltaTime);
        this.leftEyeMesh.scale.y += (1.08 - this.leftEyeMesh.scale.y) * restore;
        this.rightEyeMesh.scale.y += (1.08 - this.rightEyeMesh.scale.y) * restore;
        this.leftIrisMat.opacity += (1 - this.leftIrisMat.opacity) * restore;
        this.rightIrisMat.opacity += (1 - this.rightIrisMat.opacity) * restore;
        this.preserveIrisShape();
      }
      // Compute clamped target
      const clampedX =
        Math.max(-this.irisMaxOffset, Math.min(this.irisMaxOffset, this.irisTargetX * this.irisMaxOffset));
      const clampedY =
        Math.max(-this.irisMaxOffset, Math.min(this.irisMaxOffset, this.irisTargetY * this.irisMaxOffset));

      // Lerp toward target
      const lerpF = 1 - Math.pow(1 - this.irisLerpFactor, deltaTime * 60);
      this.leftIrisMesh.position.x += (clampedX - this.leftIrisMesh.position.x) * lerpF;
      this.leftIrisMesh.position.y += (clampedY - this.leftIrisMesh.position.y) * lerpF;
      this.rightIrisMesh.position.x += (clampedX - this.rightIrisMesh.position.x) * lerpF;
      this.rightIrisMesh.position.y += (clampedY - this.rightIrisMesh.position.y) * lerpF;

      if (this.blinkTimer > 0) {
        this.blinkTimer = Math.max(0, this.blinkTimer - deltaTime);
        const p = this.blinkTimer / 0.42;
        const closed = Math.sin((1 - p) * Math.PI);
        const scale = Math.max(0.06, 1 - closed);
        this.leftEyeMesh.scale.y = Math.min(this.leftEyeMesh.scale.y, scale);
        this.rightEyeMesh.scale.y = Math.min(this.rightEyeMesh.scale.y, scale);
        const irisAlpha = Math.max(0.18, scale);
        this.leftIrisMat.opacity = Math.min(this.leftIrisMat.opacity, irisAlpha);
        this.rightIrisMat.opacity = Math.min(this.rightIrisMat.opacity, irisAlpha);
        this.preserveIrisShape();
      }
    }

    const socketAlpha = Math.min(
      this.presenceAmount * 0.7,
      Math.max(this.leftEyeMat.opacity, this.rightEyeMat.opacity) * 0.78,
    );
    this.leftSocketMat.opacity = socketAlpha;
    this.rightSocketMat.opacity = socketAlpha;

    // ─── Tear animation ────────────────────────────────────
    if (this.tearState === TearState.Forming) {
      if (this.tearStartTime < 0) this.tearStartTime = elapsed;
      const t = (elapsed - this.tearStartTime) / TIMING.tearFormDuration;
      const eased = smoothstep(t);

      this.tearMat.opacity = eased * 0.9;
      const shimmer = 1 + Math.sin(steppedTime * 8.0) * 0.08 * eased;
      const s = (0.38 + eased * 1.0) * shimmer;
      this.tearMesh.scale.set(s, s, 1);

      if (t >= 1) {
        this.tearState = TearState.Falling;
        this.tearMat.opacity = 0.9;
        this.tearMesh.scale.set(1, 1, 1);

        // Detach tear from eye → add to main group at equivalent world position
        this.tearMesh.getWorldPosition(this.tearWorldPos);
        this.rightEyeMesh.remove(this.tearMesh);
        this.tearMesh.position.copy(this.tearWorldPos);
        this.group.add(this.tearMesh);
        this.tearDetached = true;
        this.tearStartTime = elapsed; // re-use for fall timing
      }
    }

    if (this.tearState === TearState.Falling) {
      const fallElapsed = elapsed - this.tearStartTime;
      const t = Math.min(fallElapsed / TIMING.tearFallDuration, 1);

      // Accelerating fall
      const fallDistance = t * t * (LAYOUT.eyeY - LAYOUT.silhouetteY + LAYOUT.silhouetteHeight * 0.35);
      this.tearMesh.position.y = this.tearWorldPos.y - fallDistance;
      this.tearTrailMesh.position.set(
        this.tearMesh.position.x,
        this.tearMesh.position.y + 0.58,
        this.tearMesh.position.z - 0.01,
      );
      this.tearTrailMesh.scale.y = 0.55 + t * 0.85;
      this.tearTrailMat.opacity = 0.42 * (1 - smoothstep((t - 0.7) / 0.3));

      // Tint from grey-blue toward wine-red
      const tearColour = new THREE.Color(PALETTE.tearGrey);
      const wineColour = new THREE.Color(PALETTE.wineRed);
      tearColour.lerp(wineColour, smoothstep(t));
      this.tearMat.color.copy(tearColour);

      // Slight fade near end
      if (t > 0.85) {
        this.tearMat.opacity = 0.9 * (1 - smoothstep((t - 0.85) / 0.15));
      }

      // When tear reaches near the silhouette bottom, emit position
      if (t >= 0.95 && !this.tearHasEmitted) {
        this.tearHasEmitted = true;
        tearDropPos = new THREE.Vector3();
        this.tearMesh.getWorldPosition(tearDropPos);
      }

      if (t >= 1) {
        this.tearState = TearState.Done;
        this.tearMat.opacity = 0;
        this.tearTrailMat.opacity = 0;
      }
    }

    // ─── Fade out ──────────────────────────────────────────
    if (this.fadeState === FadeState.FadingOut) {
      if (this.fadeStartTime < 0) this.fadeStartTime = elapsed;
      const t = (elapsed - this.fadeStartTime) / TIMING.fadeOutDuration;
      const alpha = 1 - smoothstep(t);

      this.silhouetteMat.opacity = Math.min(this.silhouetteMat.opacity, alpha);
      this.leftEyeMat.opacity = Math.min(this.leftEyeMat.opacity, alpha);
      this.rightEyeMat.opacity = Math.min(this.rightEyeMat.opacity, alpha);
      this.leftSocketMat.opacity = Math.min(this.leftSocketMat.opacity, alpha);
      this.rightSocketMat.opacity = Math.min(this.rightSocketMat.opacity, alpha);
      this.leftIrisMat.opacity = alpha;
      this.rightIrisMat.opacity = alpha;
      if (this.tearState !== TearState.Done) {
        this.tearMat.opacity = Math.min(this.tearMat.opacity, alpha);
      }

      if (t >= 1) {
        this.fadeState = FadeState.Done;
        this.silhouetteMat.opacity = 0;
        this.leftEyeMat.opacity = 0;
        this.rightEyeMat.opacity = 0;
        this.leftSocketMat.opacity = 0;
        this.rightSocketMat.opacity = 0;
        this.leftIrisMat.opacity = 0;
        this.rightIrisMat.opacity = 0;
        this.tearMat.opacity = 0;
        this.tearTrailMat.opacity = 0;
      }
    }

    return tearDropPos;
  }
}
