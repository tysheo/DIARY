// ─── Background Layer ───
// Creates the black painterly void background with charcoal texture and
// a subtle brush noise overlay.

import * as THREE from 'three';
import { PALETTE, LAYOUT } from '../config';
import { createCharcoalCanvas, createBrushNoiseCanvas } from '../utils/ProceduralTextures';

export class Background {
  private bgMesh: THREE.Mesh;
  private overlayMesh: THREE.Mesh;

  constructor() {
    // ─── Charcoal Background ───
    const charcoalCanvas = createCharcoalCanvas(1024, 1024);
    const charcoalTexture = new THREE.CanvasTexture(charcoalCanvas);
    charcoalTexture.wrapS = THREE.RepeatWrapping;
    charcoalTexture.wrapT = THREE.RepeatWrapping;

    const bgGeo = new THREE.PlaneGeometry(LAYOUT.cameraSize * 3, LAYOUT.cameraSize * 3);
    const bgMat = new THREE.MeshBasicMaterial({
      map: charcoalTexture,
      color: new THREE.Color(PALETTE.nearBlack),
      depthWrite: false,
    });
    this.bgMesh = new THREE.Mesh(bgGeo, bgMat);
    this.bgMesh.position.z = -5;
    this.bgMesh.renderOrder = -10;

    // ─── Brush Noise Overlay ───
    const brushCanvas = createBrushNoiseCanvas(512, 512);
    const brushTexture = new THREE.CanvasTexture(brushCanvas);
    brushTexture.wrapS = THREE.RepeatWrapping;
    brushTexture.wrapT = THREE.RepeatWrapping;

    const overlayGeo = new THREE.PlaneGeometry(LAYOUT.cameraSize * 3, LAYOUT.cameraSize * 3);
    const overlayMat = new THREE.MeshBasicMaterial({
      map: brushTexture,
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
    this.overlayMesh.position.z = -4.9;
    this.overlayMesh.renderOrder = -9;
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.bgMesh);
    scene.add(this.overlayMesh);
  }

  update(_elapsed: number): void {
    // Subtle texture crawl for living feel
    const mat = this.overlayMesh.material as THREE.MeshBasicMaterial;
    if (mat.map) {
      mat.map.offset.x = Math.sin(_elapsed * 0.02) * 0.01;
      mat.map.offset.y = Math.cos(_elapsed * 0.015) * 0.01;
    }
  }
}
