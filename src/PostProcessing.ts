// ─────────────────────────────────────────────────────────────
// PostProcessing.ts — EffectComposer with painterly post-fx
// Part of "You Never Saw Me" — a Three.js interactive art piece
// ─────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { POST, PALETTE } from './config';

// ── Painterly / Halftone shader ──────────────────────────────

const PainterlyHalftoneShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uHalftoneScale: { value: POST.halftoneScale },
    uIntensity: { value: 0.5 },
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

    uniform sampler2D tDiffuse;
    uniform float uHalftoneScale;
    uniform float uIntensity;

    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // Luminance
      float lum = dot(color, vec3(0.299, 0.587, 0.114));

      // ── Halftone dots in dark regions ──
      if (lum < 0.3) {
        // Grid coordinates
        vec2 grid = vUv * uHalftoneScale;
        vec2 cell = floor(grid);
        vec2 cellUv = fract(grid);

        // Distance from centre of cell
        float dist = length(cellUv - 0.5);

        // Dot radius proportional to darkness (darker = bigger)
        float darkness = 1.0 - (lum / 0.3);
        float dotRadius = darkness * 0.42;

        // Smooth circle
        float dot = 1.0 - smoothstep(dotRadius - 0.04, dotRadius + 0.04, dist);

        // Darken with halftone pattern
        float halftoneBlend = darkness * uIntensity * 0.35;
        color = mix(color, color * (1.0 - dot * 0.4), halftoneBlend);
      }

      // ── Subtle cross-hatch in mid-tones ──
      if (lum > 0.15 && lum < 0.5) {
        float midFactor = smoothstep(0.15, 0.3, lum) * (1.0 - smoothstep(0.4, 0.5, lum));

        // Diagonal lines
        float line1 = abs(sin((vUv.x + vUv.y) * uHalftoneScale * 1.5));
        float line2 = abs(sin((vUv.x - vUv.y) * uHalftoneScale * 1.5));

        float hatch = min(line1, line2);
        float hatchMask = smoothstep(0.0, 0.15, hatch);

        color = mix(color, color * (0.92 + hatchMask * 0.08), midFactor * uIntensity * 0.2);
      }

      // ── Subtle colour banding (toon-shading feel) ──
      // Quantise to ~8 levels per channel, then mix 50/50 with original
      float levels = 8.0;
      vec3 quantised = floor(color * levels + 0.5) / levels;
      color = mix(color, quantised, 0.5 * uIntensity);

      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

// ── Grain + Vignette + Chromatic Aberration shader ───────────

const GrainVignetteChromaticShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0.0 },
    uGrainIntensity: { value: POST.grainIntensity },
    uVignetteIntensity: { value: POST.vignetteIntensity },
    uVignetteSoftness: { value: POST.vignetteSoftness },
    uChromatic: { value: POST.chromaticAberration },
    uResolution: { value: new THREE.Vector2(1, 1) },
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

    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrainIntensity;
    uniform float uVignetteIntensity;
    uniform float uVignetteSoftness;
    uniform float uChromatic;
    uniform vec2 uResolution;

    varying vec2 vUv;

    // ── Film-grain noise ──
    // Two layers of hash for organic paper-grain feel
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float grain(vec2 uv, float t) {
      // Animate grain by mixing time into the seed
      vec2 seed = uv * uResolution + vec2(t * 117.3, t * 243.7);
      float n1 = hash(seed);
      float n2 = hash(seed + 71.37);
      // Blend two octaves for natural paper grain
      return mix(n1, n2, 0.5) - 0.5;
    }

    void main() {
      // ── Chromatic aberration (print misregistration) ──
      vec2 dir = vUv - 0.5; // direction from centre
      float r = texture2D(tDiffuse, vUv + dir * uChromatic).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * uChromatic).b;
      float a = texture2D(tDiffuse, vUv).a;

      vec3 color = vec3(r, g, b);

      // ── Film grain ──
      float grainNoise = grain(vUv, uTime);
      color += grainNoise * uGrainIntensity;

      // ── Vignette ──
      float dist = length(vUv - 0.5) * 1.414; // normalised diagonal distance
      float vig = smoothstep(1.0 - uVignetteSoftness, 1.0, dist);
      // Warm vignette: darken more in blue, less in red
      vec3 vigColor = vec3(
        1.0 - vig * uVignetteIntensity * 0.85,
        1.0 - vig * uVignetteIntensity * 0.95,
        1.0 - vig * uVignetteIntensity * 1.0
      );
      color *= vigColor;

      // ── Warm tint ──
      color *= vec3(1.0, 0.98, 0.95);

      // ── Shadow colour crush: lift blacks slightly ──
      color = mix(vec3(0.015, 0.01, 0.018), color, smoothstep(0.0, 0.08, dot(color, vec3(0.333))));

      gl_FragColor = vec4(color, a);
    }
  `,
};

// ── Factory function ─────────────────────────────────────────

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number
): {
  composer: EffectComposer;
  setIntensity: (woundProgress: number) => void;
  resize: (width: number, height: number) => void;
  update: (elapsed: number) => void;
} {
  const composer = new EffectComposer(renderer);

  // 1. Standard scene render
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 1.5. Unreal Bloom Pass
  // Vector2(resolutionX, resolutionY), strength, radius, threshold
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.6,   // Initial strength (low for subtle ethereal glow)
    0.8,   // Radius
    0.85   // Threshold - only bloom very bright elements (prevents diary page from blinding)
  );
  composer.addPass(bloomPass);

  // 2. Painterly halftone pass
  const halftonePass = new ShaderPass(PainterlyHalftoneShader);
  composer.addPass(halftonePass);

  // 3. Final grain + vignette + chromatic aberration pass
  const finalPass = new ShaderPass(GrainVignetteChromaticShader);
  finalPass.uniforms.uResolution.value.set(width, height);
  composer.addPass(finalPass);

  // ── Control API ──

  /**
   * Scale post-processing intensity with wound progression.
   * @param woundProgress - 0 (clean) to 1 (fully wounded)
   */
  function setIntensity(woundProgress: number): void {
    const t = Math.max(0.0, Math.min(1.0, woundProgress));

    // Chromatic aberration ramps from base to max
    finalPass.uniforms.uChromatic.value =
      POST.chromaticAberration + (POST.chromaticAberrationMax - POST.chromaticAberration) * t;

    // Grain increases slightly
    finalPass.uniforms.uGrainIntensity.value =
      POST.grainIntensity * (1.0 + t * 0.6);

    // Vignette darkens slightly
    finalPass.uniforms.uVignetteIntensity.value =
      POST.vignetteIntensity * (1.0 + t * 0.35);

    // Halftone becomes more pronounced
    halftonePass.uniforms.uIntensity.value = 0.5 + t * 0.4;
    
    // Bloom strength increases slightly with tension
    bloomPass.strength = 0.6 + t * 0.8;
  }

  /**
   * Handle viewport resize.
   */
  function resize(w: number, h: number): void {
    composer.setSize(w, h);
    finalPass.uniforms.uResolution.value.set(w, h);
    bloomPass.resolution.set(w, h);
  }

  /**
   * Per-frame update — advances time-based uniforms.
   */
  function update(elapsed: number): void {
    finalPass.uniforms.uTime.value = elapsed;
  }

  return { composer, setIntensity, resize, update };
}
