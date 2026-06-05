// ─────────────────────────────────────────────────────────────
// InkSystem.ts — Falling ink/wine particles & ink pool
// Part of "You Never Saw Me" — a Three.js interactive art piece
// ─────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { PALETTE, LAYOUT } from '../config';

// ── Constants ────────────────────────────────────────────────
const MAX_PARTICLES = 400;
const LIFE_DECAY_RATE = 0.15;
const GRAVITY = 0.3;
const POOL_FADE_DURATION = 5.0; // seconds for fadeOut

// ── Shader source ────────────────────────────────────────────

const inkVertexShader = /* glsl */ `
  attribute vec3 aVelocity;
  attribute float aLife;
  attribute float aSize;
  attribute float aColorMix;

  varying float vLife;
  varying float vColorMix;

  void main() {
    // Offset position along velocity, modulated by remaining life
    vec3 displaced = position;

    vLife = aLife;
    vColorMix = aColorMix;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);

    // Size attenuated by life — particles shrink as they die
    float sizeFactor = aSize * smoothstep(0.0, 0.3, aLife);
    gl_PointSize = sizeFactor * (300.0 / -mvPosition.z);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const inkFragmentShader = /* glsl */ `
  precision highp float;

  varying float vLife;
  varying float vColorMix;

  // Colour palette (linear-space approximations)
  const vec3 wineRed      = vec3(0.352, 0.027, 0.071);
  const vec3 hotRed       = vec3(0.702, 0.075, 0.137);
  const vec3 orangeRed    = vec3(0.941, 0.290, 0.102);
  const vec3 bruisedPurp  = vec3(0.141, 0.078, 0.149);

  // Simple pseudo-random for painterly noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    // Soft circle
    vec2 centre = gl_PointCoord - 0.5;
    float dist = length(centre);
    if (dist > 0.5) discard;

    // Soft edge falloff
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

    // Painterly noise on edges — subtle irregularity
    float noise = hash(gl_PointCoord * 73.19) * 0.15;
    alpha *= 1.0 - noise * smoothstep(0.2, 0.5, dist);

    // Colour mixing across palette
    vec3 col;
    float t = vColorMix;
    if (t < 0.33) {
      col = mix(wineRed, hotRed, t / 0.33);
    } else if (t < 0.66) {
      col = mix(hotRed, orangeRed, (t - 0.33) / 0.33);
    } else {
      col = mix(orangeRed, bruisedPurp, (t - 0.66) / 0.34);
    }

    // Life-based fade
    alpha *= smoothstep(0.0, 0.15, vLife);

    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Pool texture generation ──────────────────────────────────

/**
 * Generates a procedural ink-pool canvas texture with:
 * - Irregular blob outline with noise
 * - Dark core, bruised-purple edges
 * - Halftone dot pattern in dark regions
 * - Painterly orange-red highlight spots
 */
function createPoolTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Clear
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const rx = W * 0.42; // horizontal radius
  const ry = H * 0.38; // vertical radius

  // ── Seeded pseudo-random for consistent noise ──
  let seed = 42;
  function seededRandom(): number {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  // ── Draw irregular blob shape ──
  // Build an outline with noise offsets
  ctx.beginPath();
  const segments = 64;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    // Multiple octaves of noise for organic edges
    const noiseVal =
      Math.sin(angle * 3.0 + 1.7) * 0.12 +
      Math.sin(angle * 7.0 + 4.2) * 0.06 +
      Math.sin(angle * 13.0 + 0.3) * 0.03;
    const r = 1.0 + noiseVal;
    const px = cx + Math.cos(angle) * rx * r;
    const py = cy + Math.sin(angle) * ry * r;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();

  // ── Fill with gradient: wine-red body, dark core ──
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  gradient.addColorStop(0.0, '#050405'); // near-black core
  gradient.addColorStop(0.35, '#5A0712'); // wine-red body
  gradient.addColorStop(0.7, '#5A0712');
  gradient.addColorStop(1.0, '#241426'); // bruised-purple edges

  ctx.fillStyle = gradient;
  ctx.fill();

  // ── Halftone dots in darker regions ──
  ctx.save();
  ctx.clip(); // clip to blob shape
  const dotSpacing = 6;
  for (let gx = 0; gx < W; gx += dotSpacing) {
    for (let gy = 0; gy < H; gy += dotSpacing) {
      // Distance from centre, normalised
      const dx = (gx - cx) / rx;
      const dy = (gy - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);

      // Only in blob area and darker towards centre
      if (d < 1.0) {
        const darkness = Math.max(0.0, 1.0 - d); // darker near centre
        const radius = darkness * 2.2;
        if (radius > 0.3) {
          ctx.beginPath();
          ctx.arc(gx, gy, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(5, 4, 5, ${darkness * 0.5})`;
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();

  // ── Painterly highlights: small orange-red spots ──
  ctx.save();
  // Re-create clip path
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const noiseVal =
      Math.sin(angle * 3.0 + 1.7) * 0.12 +
      Math.sin(angle * 7.0 + 4.2) * 0.06 +
      Math.sin(angle * 13.0 + 0.3) * 0.03;
    const r = 1.0 + noiseVal;
    const px = cx + Math.cos(angle) * rx * r;
    const py = cy + Math.sin(angle) * ry * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.clip();

  for (let i = 0; i < 18; i++) {
    const angle = seededRandom() * Math.PI * 2;
    const dist = seededRandom() * 0.6;
    const px = cx + Math.cos(angle) * rx * dist;
    const py = cy + Math.sin(angle) * ry * dist;
    const spotR = 1.5 + seededRandom() * 3.0;
    ctx.beginPath();
    ctx.arc(px, py, spotR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(240, 74, 26, ${0.15 + seededRandom() * 0.2})`;
    ctx.fill();
  }

  // A few bruised-purple accent spots near edges
  for (let i = 0; i < 10; i++) {
    const angle = seededRandom() * Math.PI * 2;
    const dist = 0.5 + seededRandom() * 0.4;
    const px = cx + Math.cos(angle) * rx * dist;
    const py = cy + Math.sin(angle) * ry * dist;
    const spotR = 2.0 + seededRandom() * 4.0;
    ctx.beginPath();
    ctx.arc(px, py, spotR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(36, 20, 38, ${0.2 + seededRandom() * 0.25})`;
    ctx.fill();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ── InkSystem class ──────────────────────────────────────────

export class InkSystem {
  // Particle system
  private geometry: THREE.BufferGeometry;
  private positionAttr: THREE.BufferAttribute;
  private velocityAttr: THREE.BufferAttribute;
  private lifeAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private colorMixAttr: THREE.BufferAttribute;
  private particleMesh: THREE.Points;

  // Pool
  private poolMesh: THREE.Mesh;
  private poolMaterial: THREE.MeshBasicMaterial;
  private poolTargetOpacity: number = 0.0;
  private poolCurrentScale: number = 0.8;
  private poolTargetScale: number = 0.8;
  private poolSurfaceY: number = LAYOUT.poolY + LAYOUT.poolHeight * 0.4;

  // Fade state
  private fadingOut: boolean = false;
  private fadeAlpha: number = 1.0;

  constructor() {
    // ── Initialise particle buffers ──
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(MAX_PARTICLES * 3);
    const velocities = new Float32Array(MAX_PARTICLES * 3);
    const lives = new Float32Array(MAX_PARTICLES);
    const sizes = new Float32Array(MAX_PARTICLES);
    const colorMixes = new Float32Array(MAX_PARTICLES);

    // All particles start dead
    lives.fill(0.0);

    this.positionAttr = new THREE.BufferAttribute(positions, 3);
    this.velocityAttr = new THREE.BufferAttribute(velocities, 3);
    this.lifeAttr = new THREE.BufferAttribute(lives, 1);
    this.sizeAttr = new THREE.BufferAttribute(sizes, 1);
    this.colorMixAttr = new THREE.BufferAttribute(colorMixes, 1);

    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('aVelocity', this.velocityAttr);
    this.geometry.setAttribute('aLife', this.lifeAttr);
    this.geometry.setAttribute('aSize', this.sizeAttr);
    this.geometry.setAttribute('aColorMix', this.colorMixAttr);

    const material = new THREE.ShaderMaterial({
      vertexShader: inkVertexShader,
      fragmentShader: inkFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending, // Ink is opaque, NormalBlending reads better
    });

    this.particleMesh = new THREE.Points(this.geometry, material);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.renderOrder = 2; // In front of diary

    // ── Initialise pool ──
    const poolTexture = createPoolTexture();
    this.poolMaterial = new THREE.MeshBasicMaterial({
      map: poolTexture,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    const poolGeo = new THREE.PlaneGeometry(LAYOUT.poolWidth, LAYOUT.poolHeight);
    this.poolMesh = new THREE.Mesh(poolGeo, this.poolMaterial);
    this.poolMesh.position.set(0, LAYOUT.poolY, LAYOUT.poolZ);
    this.poolMesh.renderOrder = -2;
    this.poolMesh.scale.set(this.poolCurrentScale, this.poolCurrentScale, 1.0);
  }

  /** Add particle system and pool to the scene */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.particleMesh);
    scene.add(this.poolMesh);
  }

  /**
   * Spawn ink droplets at world positions.
   * @param positions - Array of spawn points
   * @param intensity - Optional multiplier for velocity (default 1.0)
   */
  spawnDroplets(positions: THREE.Vector3[], intensity: number = 1.0): void {
    const posArr = this.positionAttr.array as Float32Array;
    const velArr = this.velocityAttr.array as Float32Array;
    const lifeArr = this.lifeAttr.array as Float32Array;
    const sizeArr = this.sizeAttr.array as Float32Array;
    const colArr = this.colorMixAttr.array as Float32Array;

    let spawned = 0;

    for (const spawnPos of positions) {
      if (spawned >= positions.length) break;

      // Find a dead particle slot
      let slotIndex = -1;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (lifeArr[i] <= 0.0) {
          slotIndex = i;
          break;
        }
      }

      if (slotIndex === -1) break; // No free slots

      const i3 = slotIndex * 3;

      // Position
      posArr[i3] = spawnPos.x;
      posArr[i3 + 1] = spawnPos.y;
      posArr[i3 + 2] = spawnPos.z;

      // Velocity: mostly downward with slight X spread
      velArr[i3] = (Math.random() - 0.5) * 0.4 * intensity;
      velArr[i3 + 1] = -(0.5 + Math.random() * 1.5) * intensity;
      velArr[i3 + 2] = (Math.random() - 0.5) * 0.1 * intensity;

      // Random size
      sizeArr[slotIndex] = 0.05 + Math.random() * 0.10;

      // Random colour mix
      colArr[slotIndex] = Math.random();

      // Full life
      lifeArr[slotIndex] = 1.0;

      spawned++;
    }

    // Flag all attributes for upload
    this.positionAttr.needsUpdate = true;
    this.velocityAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colorMixAttr.needsUpdate = true;
  }

  /**
   * Grow the ink pool.
   * @param amount - Value between 0 and 1 to add to pool visibility
   */
  growPool(amount: number): void {
    this.poolTargetOpacity = Math.min(1.0, this.poolTargetOpacity + amount);
    this.poolTargetScale = Math.min(1.3, this.poolTargetScale + amount * 0.15);
  }

  private absorbDrop(size: number): void {
    const amount = 0.018 + Math.min(0.035, size * 0.12);
    this.poolTargetOpacity = Math.min(1.0, this.poolTargetOpacity + amount);
    this.poolTargetScale = Math.min(1.38, this.poolTargetScale + amount * 0.12);
  }

  /**
   * Per-frame update. Simulates particle physics and animates pool.
   * @param elapsed - Total elapsed time in seconds
   * @param deltaTime - Time since last frame in seconds
   */
  update(elapsed: number, deltaTime: number): void {
    const posArr = this.positionAttr.array as Float32Array;
    const velArr = this.velocityAttr.array as Float32Array;
    const lifeArr = this.lifeAttr.array as Float32Array;

    let anyAlive = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (lifeArr[i] <= 0.0) continue;

      anyAlive = true;

      // Decay life
      lifeArr[i] -= deltaTime * LIFE_DECAY_RATE;
      if (lifeArr[i] <= 0.0) {
        lifeArr[i] = 0.0;
        continue;
      }

      const i3 = i * 3;

      // Gravity
      velArr[i3 + 1] -= GRAVITY * deltaTime;

      // Integrate position
      posArr[i3] += velArr[i3] * deltaTime;
      posArr[i3 + 1] += velArr[i3 + 1] * deltaTime;
      posArr[i3 + 2] += velArr[i3 + 2] * deltaTime;

      if (posArr[i3 + 1] <= this.poolSurfaceY) {
        posArr[i3 + 1] = this.poolSurfaceY;
        lifeArr[i] = 0.0;
        this.absorbDrop((this.sizeAttr.array as Float32Array)[i]);
        continue;
      }
    }

    // Mark for GPU upload
    this.positionAttr.needsUpdate = true;
    this.velocityAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;

    // ── Pool animation ──
    // Smooth opacity interpolation
    const opacitySpeed = 0.8 * deltaTime;
    this.poolMaterial.opacity += (this.poolTargetOpacity - this.poolMaterial.opacity) * opacitySpeed;

    // Smooth scale interpolation
    const scaleSpeed = 1.2 * deltaTime;
    this.poolCurrentScale += (this.poolTargetScale - this.poolCurrentScale) * scaleSpeed;

    // Subtle edge wobble via sin-based oscillation
    const wobbleX = 1.0 + Math.sin(elapsed * 0.7) * 0.008 + Math.sin(elapsed * 1.3) * 0.004;
    const wobbleY = 1.0 + Math.sin(elapsed * 0.9 + 1.0) * 0.006 + Math.sin(elapsed * 1.7 + 0.5) * 0.003;

    this.poolMesh.scale.set(
      this.poolCurrentScale * wobbleX,
      this.poolCurrentScale * wobbleY,
      1.0
    );

    // ── Fade-out handling ──
    if (this.fadingOut) {
      this.fadeAlpha -= deltaTime / POOL_FADE_DURATION;
      if (this.fadeAlpha <= 0.0) {
        this.fadeAlpha = 0.0;
      }
      this.poolMaterial.opacity *= this.fadeAlpha;

      // Also fade particles faster
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (lifeArr[i] > 0.0) {
          lifeArr[i] -= deltaTime * 0.5; // accelerated death
        }
      }
      this.lifeAttr.needsUpdate = true;
    }
  }

  /** Begin fading everything out over ~5 seconds */
  fadeOut(): void {
    this.fadingOut = true;
    this.fadeAlpha = 1.0;
  }
}
