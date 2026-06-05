import * as THREE from 'three';
import {
  ACT_TIMING,
  DIARY_LINES,
  FINAL_LINE_INDEX,
  INTERACTIVE_LINE_COUNT,
  LAYOUT,
  PALETTE_CSS,
  REVEAL_ZONES,
  TIMING,
} from '../config';

interface LineState {
  phase: 'hidden' | 'revealing' | 'holding' | 'dissolving' | 'dissolved';
  revealProgress: number;
  holdTimer: number;
  dissolveProgress: number;
  wasRevealed: boolean;
}

interface StainData {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  color: string;
}

const CANVAS_W = 1024;
const CANVAS_H = 1408;
const TEXT_FONT_SIZE = 28;
const FINAL_FONT_SIZE = 40;
const STAIN_COLORS = [
  PALETTE_CSS.wineRed,
  PALETTE_CSS.hotRed,
  PALETTE_CSS.bruisedPurple,
];

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouseUV;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float curvature = ${LAYOUT.diaryCurve.toFixed(4)};
    float halfW = ${(LAYOUT.diaryWidth * 0.5).toFixed(4)};
    float nx = pos.x / halfW;
    pos.z += curvature * (1.0 - nx * nx);
    pos.z += sin(uTime * 0.5) * 0.012;

    vec2 d = vUv - uMouseUV;
    float push = exp(-dot(d, d) * 60.0) * 0.04;
    pos.z += push;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uGlobalFade;
  uniform float uPageOpacity;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec4 tex = texture2D(uTexture, vUv);
    float grain = (hash(vUv * 512.0 + uTime * 0.3) - 0.5) * 0.04;
    tex.rgb += grain;

    float edgeDist = 1.0 - max(abs(vUv.x - 0.5) * 2.0, abs(vUv.y - 0.5) * 2.0);
    float edgeFactor = smoothstep(0.0, 0.35, edgeDist);
    vec3 edgeTint = vec3(0.72, 0.62, 0.45);
    tex.rgb = mix(edgeTint, tex.rgb, edgeFactor);

    float ash = hash(vUv * 120.0 + floor(uTime * 8.0));
    float pageMask = smoothstep(0.02, 0.45, edgeDist + ash * 0.18 + uPageOpacity * 0.7);
    tex.a *= pageMask * uPageOpacity * (1.0 - uGlobalFade);
    gl_FragColor = tex;
  }
`;

function charRand(charIndex: number, seed: number): number {
  const x = Math.sin(charIndex * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function canvasToWorld(cx: number, cy: number): THREE.Vector3 {
  const worldX = (cx / CANVAS_W - 0.5) * LAYOUT.diaryWidth;
  const worldY = LAYOUT.diaryY + (0.5 - cy / CANVAS_H) * LAYOUT.diaryHeight;
  return new THREE.Vector3(worldX, worldY, 0);
}

export class DiaryPage {
  mesh: THREE.Mesh;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private grainCanvas: HTMLCanvasElement;
  private lineStates: LineState[];
  private stains: StainData[] = [];
  private bleedParticles: THREE.Vector3[] = [];
  private hoverProgress: number[];
  private dirty = true;
  private lastSteppedTime = -1;
  private globalFade = 0;
  private fading = false;
  private pageOpacity = 0;
  private pageFadeTarget = 0;

  private uniforms: {
    uTime: THREE.IUniform<number>;
    uTexture: THREE.IUniform<THREE.CanvasTexture>;
    uMouseUV: THREE.IUniform<THREE.Vector2>;
    uGlobalFade: THREE.IUniform<number>;
    uPageOpacity: THREE.IUniform<number>;
  };

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.grainCanvas = this.createGrainCanvas();
    this.lineStates = DIARY_LINES.map(() => ({
      phase: 'hidden',
      revealProgress: 0,
      holdTimer: 0,
      dissolveProgress: 0,
      wasRevealed: false,
    }));
    this.hoverProgress = new Array(INTERACTIVE_LINE_COUNT).fill(0);

    this.uniforms = {
      uTime: { value: 0 },
      uTexture: { value: this.texture },
      uMouseUV: { value: new THREE.Vector2(0.5, 0.5) },
      uGlobalFade: { value: 0 },
      uPageOpacity: { value: 0 },
    };

    const geo = new THREE.PlaneGeometry(
      LAYOUT.diaryWidth,
      LAYOUT.diaryHeight,
      LAYOUT.diarySubdivisions,
      LAYOUT.diarySubdivisions,
    );

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(0, LAYOUT.diaryY, 0);
    this.mesh.renderOrder = 1;
    this.paintCanvas(0);
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.mesh);
  }

  fadeIn(): void {
    this.pageFadeTarget = 1;
  }

  isVisible(): boolean {
    return this.pageOpacity > 0.95;
  }

  checkCursorProximity(uvX: number, uvY: number): number {
    for (const zone of REVEAL_ZONES) {
      if (
        Math.abs(uvX - zone.u) <= zone.hw &&
        Math.abs(uvY - zone.v) <= zone.hh
      ) {
        return zone.line;
      }
    }
    return -1;
  }

  revealLine(index: number, deltaTime = 0.1): boolean {
    if (index < 0 || index >= INTERACTIVE_LINE_COUNT) return false;
    const state = this.lineStates[index];
    if (state.phase !== 'hidden') return false;

    const requiredHover = index < 4 ? 0.08 : index < 8 ? 0.32 : 0.58;
    this.hoverProgress[index] += deltaTime;
    if (this.hoverProgress[index] < requiredHover) return false;

    state.phase = 'revealing';
    state.revealProgress = 0;
    state.wasRevealed = true;
    this.dirty = true;
    return true;
  }

  showFinalLine(): void {
    const state = this.lineStates[FINAL_LINE_INDEX];
    if (state.phase !== 'hidden') return;
    state.phase = 'revealing';
    state.revealProgress = 0;
    state.wasRevealed = true;
    this.dirty = true;
  }

  fadeAll(): void {
    this.fading = true;
  }

  consumeBleedParticles(): THREE.Vector3[] {
    const out = this.bleedParticles;
    this.bleedParticles = [];
    return out;
  }

  update(
    elapsed: number,
    deltaTime: number,
    mouseUV: { x: number; y: number } | null,
  ): void {
    this.uniforms.uTime.value = elapsed;
    if (mouseUV) this.uniforms.uMouseUV.value.set(mouseUV.x, mouseUV.y);

    if (this.pageOpacity !== this.pageFadeTarget) {
      const dir = Math.sign(this.pageFadeTarget - this.pageOpacity);
      this.pageOpacity += dir * (deltaTime / ACT_TIMING.diaryFadeInDuration);
      if (
        (dir > 0 && this.pageOpacity > this.pageFadeTarget) ||
        (dir < 0 && this.pageOpacity < this.pageFadeTarget)
      ) {
        this.pageOpacity = this.pageFadeTarget;
      }
      this.uniforms.uPageOpacity.value = this.pageOpacity;
      this.dirty = true;
    }

    const steppedTime = Math.floor(elapsed * TIMING.steppedFPS) / TIMING.steppedFPS;
    const newSteppedFrame = steppedTime !== this.lastSteppedTime;
    this.lastSteppedTime = steppedTime;

    if (mouseUV) {
      const activeLine = this.checkCursorProximity(mouseUV.x, mouseUV.y);
      for (let i = 0; i < this.hoverProgress.length; i++) {
        if (i !== activeLine && this.lineStates[i].phase === 'hidden') {
          this.hoverProgress[i] = Math.max(0, this.hoverProgress[i] - deltaTime * 0.5);
        }
      }
    }

    let anyActive = false;
    for (let i = 0; i < this.lineStates.length; i++) {
      const state = this.lineStates[i];
      switch (state.phase) {
        case 'revealing':
          state.revealProgress += deltaTime / this.getRevealDuration(i);
          if (state.revealProgress >= 1) {
            state.revealProgress = 1;
            state.phase = 'holding';
            state.holdTimer = 0;
          }
          this.dirty = true;
          anyActive = true;
          break;

        case 'holding': {
          const hold =
            i === FINAL_LINE_INDEX ? TIMING.finalLineHoldDuration : TIMING.holdDuration;
          state.holdTimer += deltaTime;
          if (state.holdTimer >= hold) {
            state.phase = 'dissolving';
            state.dissolveProgress = 0;
          }
          if (newSteppedFrame) this.dirty = true;
          anyActive = true;
          break;
        }

        case 'dissolving':
          state.dissolveProgress += deltaTime / TIMING.dissolveDuration;
          if (state.dissolveProgress >= 1) {
            state.dissolveProgress = 1;
            state.phase = 'dissolved';
            this.depositStains(i);
          }
          this.dirty = true;
          anyActive = true;
          break;
      }
    }

    if (this.fading) {
      this.globalFade = Math.min(1, this.globalFade + deltaTime / TIMING.fadeOutDuration);
      this.uniforms.uGlobalFade.value = this.globalFade;
      this.dirty = true;
    }

    if (this.dirty || (anyActive && newSteppedFrame)) {
      this.paintCanvas(steppedTime);
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  private getRevealDuration(index: number): number {
    return index >= 8 ? TIMING.resistedRevealDuration : TIMING.revealDuration;
  }

  private createGrainCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    const g = c.getContext('2d')!;
    const imgData = g.createImageData(CANVAS_W, CANVAS_H);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const base = 180 + Math.random() * 40;
      const warmShift = Math.random() * 12;
      d[i] = base + warmShift;
      d[i + 1] = base;
      d[i + 2] = base - warmShift * 1.5;
      d[i + 3] = Math.random() * 14;
    }
    g.putImageData(imgData, 0, 0);
    return c;
  }

  private paintCanvas(steppedTime: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PALETTE_CSS.parchment;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(this.grainCanvas, 0, 0);

    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = PALETTE_CSS.oldGold;
    ctx.lineWidth = 1;
    for (const zone of REVEAL_ZONES) {
      const y = zone.v * CANVAS_H;
      ctx.beginPath();
      ctx.moveTo(CANVAS_W * 0.08, y + TEXT_FONT_SIZE * 0.5);
      ctx.lineTo(CANVAS_W * 0.92, y + TEXT_FONT_SIZE * 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.moveTo(CANVAS_W * 0.08, CANVAS_H * 0.5 + FINAL_FONT_SIZE * 0.55);
    ctx.lineTo(CANVAS_W * 0.92, CANVAS_H * 0.5 + FINAL_FONT_SIZE * 0.55);
    ctx.stroke();
    ctx.globalAlpha = 1;

    this.drawStains(ctx);

    for (let i = 0; i < this.lineStates.length; i++) {
      const state = this.lineStates[i];
      if (state.phase === 'hidden' || state.phase === 'dissolved') continue;
      this.drawLine(ctx, i, state, steppedTime);
    }
  }

  private drawLine(
    ctx: CanvasRenderingContext2D,
    index: number,
    state: LineState,
    steppedTime: number,
  ): void {
    const text = DIARY_LINES[index];
    const isFinal = index === FINAL_LINE_INDEX;
    const baseV = isFinal ? 0.5 : REVEAL_ZONES[index].v;
    const baseY = baseV * CANVAS_H;
    const fontSize = isFinal ? FINAL_FONT_SIZE : TEXT_FONT_SIZE;

    switch (state.phase) {
      case 'revealing':
        this.drawRevealing(ctx, text, baseY, fontSize, state);
        break;
      case 'holding':
        this.drawHolding(ctx, text, baseY, fontSize, steppedTime, index);
        break;
      case 'dissolving':
        this.drawDissolving(ctx, text, baseY, fontSize, state, steppedTime, index);
        break;
    }
  }

  private setFont(ctx: CanvasRenderingContext2D, text: string, fontSize: number): number {
    let size = fontSize;
    do {
      ctx.font = `${size}px 'Caveat', cursive`;
      if (ctx.measureText(text).width <= CANVAS_W * 0.88) break;
      size -= 1;
    } while (size > 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    return size;
  }

  private drawRevealing(
    ctx: CanvasRenderingContext2D,
    text: string,
    baseY: number,
    fontSize: number,
    state: LineState,
  ): void {
    this.setFont(ctx, text, fontSize);
    const visibleCount = Math.ceil(state.revealProgress * text.length);
    const fullWidth = ctx.measureText(text).width;
    let cursorX = CANVAS_W * 0.5 - fullWidth * 0.5;

    for (let c = 0; c < visibleCount; c++) {
      const ch = text[c];
      const distFromEdge = visibleCount - c;
      const charAlpha =
        distFromEdge <= 3 ? Math.min(1, state.revealProgress * text.length - c) : 1;
      ctx.globalAlpha = charAlpha * state.revealProgress;
      ctx.fillStyle = PALETTE_CSS.inkBlack;
      ctx.fillText(ch, cursorX, baseY);
      cursorX += ctx.measureText(ch).width;
    }
    ctx.globalAlpha = 1;
  }

  private drawHolding(
    ctx: CanvasRenderingContext2D,
    text: string,
    baseY: number,
    fontSize: number,
    steppedTime: number,
    lineIndex: number,
  ): void {
    this.setFont(ctx, text, fontSize);
    const fullWidth = ctx.measureText(text).width;
    let cursorX = CANVAS_W * 0.5 - fullWidth * 0.5;
    const resistanceJitter = lineIndex >= 8 ? 2.2 : 1.1;

    ctx.fillStyle = PALETTE_CSS.inkBlack;
    ctx.globalAlpha = 1;
    for (let c = 0; c < text.length; c++) {
      const ch = text[c];
      const jx = (charRand(c, steppedTime * 7 + lineIndex) - 0.5) * resistanceJitter;
      const jy = (charRand(c + 50, steppedTime * 13 + lineIndex) - 0.5) * 1.0;
      ctx.fillText(ch, cursorX + jx, baseY + jy);
      cursorX += ctx.measureText(ch).width;
    }
  }

  private drawDissolving(
    ctx: CanvasRenderingContext2D,
    text: string,
    baseY: number,
    fontSize: number,
    state: LineState,
    steppedTime: number,
    lineIndex: number,
  ): void {
    const t = state.dissolveProgress;
    const actualSize = this.setFont(ctx, text, fontSize);
    const fullWidth = ctx.measureText(text).width;
    let cursorX = CANVAS_W * 0.5 - fullWidth * 0.5;
    const textColor = this.lerpColor(PALETTE_CSS.inkBlack, PALETTE_CSS.wineRed, t);
    const severity = 1 + lineIndex / INTERACTIVE_LINE_COUNT;

    for (let c = 0; c < text.length; c++) {
      const ch = text[c];
      const charW = ctx.measureText(ch).width;
      const drift = t * 70 * severity * (0.5 + charRand(c, lineIndex * 3) * 0.5);
      const jitterX = (charRand(c, steppedTime * 11 + lineIndex) - 0.5) * t * 18 * severity;
      const charAlpha = Math.max(0, 1 - t * (0.8 + charRand(c, lineIndex) * 0.4));

      ctx.globalAlpha = charAlpha;
      ctx.fillStyle = textColor;
      ctx.fillText(ch, cursorX + jitterX, baseY + drift);

      if (t > 0.15) {
        const dripStrength = (t - 0.15) / 0.85;
        const dripLength =
          dripStrength * 105 * severity * (0.4 + charRand(c, lineIndex * 7) * 0.6);
        const dripX = cursorX + charW * 0.5 + jitterX * 0.3;
        const dripStartY = baseY + drift + actualSize * 0.4;
        const gradient = ctx.createLinearGradient(
          dripX,
          dripStartY,
          dripX,
          dripStartY + dripLength,
        );
        gradient.addColorStop(0, this.withAlpha(PALETTE_CSS.wineRed, charAlpha * 0.65));
        gradient.addColorStop(0.6, this.withAlpha(PALETTE_CSS.hotRed, charAlpha * 0.32));
        gradient.addColorStop(1, this.withAlpha(PALETTE_CSS.wineRed, 0));

        ctx.globalAlpha = 1;
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.0 + charRand(c, lineIndex * 11) * 1.5;
        const midY = dripStartY + dripLength * 0.5;
        const wave = (charRand(c, steppedTime * 3) - 0.5) * 4 * dripStrength;
        ctx.beginPath();
        ctx.moveTo(dripX, dripStartY);
        ctx.quadraticCurveTo(dripX + wave, midY, dripX + wave * 0.5, dripStartY + dripLength);
        ctx.stroke();
      }

      if (t > 0.1 && t < 0.95 && charRand(c, steppedTime * 19 + lineIndex) > 0.75) {
        const px = cursorX + jitterX + charW * 0.5;
        const py = baseY + drift + actualSize * 0.5 + charRand(c, steppedTime * 23) * 40;
        this.bleedParticles.push(canvasToWorld(px, py));
      }

      cursorX += charW;
    }
    ctx.globalAlpha = 1;
  }

  private drawStains(ctx: CanvasRenderingContext2D): void {
    for (const stain of this.stains) {
      const grad = ctx.createRadialGradient(stain.x, stain.y, 0, stain.x, stain.y, stain.radius);
      grad.addColorStop(0, this.withAlpha(stain.color, stain.opacity));
      grad.addColorStop(0.5, this.withAlpha(stain.color, stain.opacity * 0.6));
      grad.addColorStop(1, this.withAlpha(stain.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(stain.x, stain.y, stain.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private depositStains(lineIndex: number): void {
    const isFinal = lineIndex === FINAL_LINE_INDEX;
    const v = isFinal ? 0.5 : REVEAL_ZONES[lineIndex].v;
    const cy = v * CANVAS_H;
    const count = isFinal ? 8 : 2 + Math.floor(Math.random() * 4);
    const severity = isFinal ? 1.8 : 1 + lineIndex / INTERACTIVE_LINE_COUNT;

    for (let i = 0; i < count; i++) {
      this.stains.push({
        x: CANVAS_W * (0.22 + Math.random() * 0.56),
        y: cy + (Math.random() - 0.5) * 70,
        radius: (18 + Math.random() * 48) * severity,
        opacity: 0.07 + Math.random() * 0.12,
        color: STAIN_COLORS[Math.floor(Math.random() * STAIN_COLORS.length)],
      });
    }
    this.dirty = true;
  }

  private lerpColor(a: string, b: string, t: number): string {
    const ar = parseInt(a.slice(1, 3), 16);
    const ag = parseInt(a.slice(3, 5), 16);
    const ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16);
    const bg = parseInt(b.slice(3, 5), 16);
    const bb = parseInt(b.slice(5, 7), 16);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bv = Math.round(ab + (bb - ab) * t);
    return `rgb(${r},${g},${bv})`;
  }

  private withAlpha(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }
}
