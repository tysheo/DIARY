import * as THREE from 'three';
import { LAYOUT, PALETTE_CSS, TIMING } from '../config';

interface Fragment {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  baseX: number;
  baseY: number;
  drift: number;
  phase: number;
  lifeOffset: number;
}

const TEXT_SNIPPETS = [
  'not yet',
  'before you read',
  'no door',
  'stay shape',
  'do not name me',
  'under the ink',
  'look away',
  'almost seen',
  'not evidence',
  'i was here',
  'the light hurts',
  'presence',
];

function createFragmentTexture(text: string, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${30 + (seed % 3) * 5}px 'Caveat', cursive`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE_CSS.parchment;
  ctx.globalAlpha = 0.72;

  const chars = text.split('');
  const fullWidth = ctx.measureText(text).width;
  let x = canvas.width * 0.5 - fullWidth * 0.5;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const jitterX = Math.sin(seed * 7.1 + i * 3.3) * 2.5;
    const jitterY = Math.cos(seed * 4.7 + i * 5.1) * 2.2;
    ctx.fillText(ch, x + jitterX, canvas.height * 0.5 + jitterY);
    x += ctx.measureText(ch).width;
  }

  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    const px = (Math.sin(seed * 17 + i * 11) * 0.5 + 0.5) * canvas.width;
    const py = (Math.cos(seed * 13 + i * 7) * 0.5 + 0.5) * canvas.height;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(px, py, 4 + (i % 5), 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class MemoryFragments {
  private group = new THREE.Group();
  private fragments: Fragment[] = [];
  private active = true;
  private fadeTarget = 1;
  private fade = 0;

  constructor() {
    this.group.name = 'MemoryFragments';

    for (let i = 0; i < TEXT_SNIPPETS.length; i++) {
      const texture = createFragmentTexture(TEXT_SNIPPETS[i], i + 1);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        opacity: 0,
        color: new THREE.Color(0xD8C6A0),
      });
      const geo = new THREE.PlaneGeometry(2.1, 0.52);
      const mesh = new THREE.Mesh(geo, material);
      const baseX = (Math.sin(i * 2.18) * 0.5) * LAYOUT.cameraSize * 1.45;
      const baseY = (Math.cos(i * 1.73) * 0.5) * LAYOUT.cameraSize * 1.15;
      mesh.position.set(baseX, baseY, -1.2 - (i % 4) * 0.1);
      mesh.rotation.z = (Math.sin(i * 8.1) - 0.5) * 0.25;
      this.group.add(mesh);

      this.fragments.push({
        mesh,
        material,
        baseX,
        baseY,
        drift: 0.12 + (i % 4) * 0.035,
        phase: i * 0.57,
        lifeOffset: i * 1.7,
      });
    }
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.fadeTarget = active ? 1 : 0;
  }

  update(
    elapsed: number,
    deltaTime: number,
    mouseNDC: THREE.Vector2,
  ): void {
    const dir = Math.sign(this.fadeTarget - this.fade);
    if (dir !== 0) {
      this.fade += dir * deltaTime * 0.22;
      if ((dir > 0 && this.fade > this.fadeTarget) || (dir < 0 && this.fade < this.fadeTarget)) {
        this.fade = this.fadeTarget;
      }
    }

    const stepped = Math.floor(elapsed * TIMING.steppedFPS) / TIMING.steppedFPS;
    const mouseX = mouseNDC.x * LAYOUT.cameraSize * 1.2;
    const mouseY = mouseNDC.y * LAYOUT.cameraSize;

    for (const fragment of this.fragments) {
      const pulse = Math.sin((stepped + fragment.lifeOffset) * 0.75);
      const flicker = Math.sin((stepped + fragment.phase) * 5.7) > 0.88 ? 1 : 0;
      const dx = fragment.baseX - mouseX;
      const dy = fragment.baseY - mouseY;
      const proximity = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 2.7);
      const vanish = proximity > 0.55 ? 1 - Math.min(1, (proximity - 0.55) / 0.45) : 1;

      fragment.mesh.position.x =
        fragment.baseX + Math.sin(stepped * fragment.drift + fragment.phase) * 0.22;
      fragment.mesh.position.y =
        fragment.baseY + Math.cos(stepped * fragment.drift * 0.8 + fragment.phase) * 0.14;
      fragment.mesh.rotation.z += Math.sin(stepped + fragment.phase) * deltaTime * 0.01;

      const alpha =
        this.fade *
        (this.active ? 0.55 : 0.25) *
        vanish *
        (0.03 + Math.max(0, pulse) * 0.1 + proximity * 0.22 + flicker * 0.18);
      fragment.material.opacity = Math.min(0.34, alpha);
    }
  }
}
