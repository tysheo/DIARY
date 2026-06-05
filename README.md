# You Never Saw Me

An interactive web art piece — a single diary page in darkness, revealed by the cursor, dissolved by reading.

## Setup

```bash
npm install
npm run dev
```

## Audio

Place your audio file at:
```
public/audio/diary.mp3
```

The piece runs without audio — if the file is missing, visuals still work fully. Audio playback begins after the first click.

## How It Works

A diary floats in a black painterly void. Move your cursor over the page to reveal hidden writing. Every revealed line melts, bleeds, and falls as wine-red ink. As lines are destroyed, a shadow figure gathers behind the diary. Its huge eyes open. A tear falls. The words become wine. The final line appears:

> "you read every line, but you never saw me"

Then everything empties.

## Customisation

### Diary Lines

Edit the `DIARY_LINES` array in [`src/config.ts`](src/config.ts):

```typescript
export const DIARY_LINES = [
  'i kept writing because silence made you real',
  'you loved the parts of me you could understand',
  // ... lines 0-5 are cursor-revealed
  'you read every line, but you never saw me', // line 6 is the final auto-reveal
];
```

### Trigger Thresholds

Adjust `WOUND_THRESHOLDS` in [`src/config.ts`](src/config.ts) to change when events fire:

```typescript
export const WOUND_THRESHOLDS = {
  firstBleed: 1,        // first reveal causes ink bleed
  stainAccumulate: 2,   // stains appear on the page
  silhouetteAppear: 3,  // shadow figure starts gathering
  dropletsIntensify: 4, // more visible wine droplets
  eyesOpen: 5,          // eyes open (major moment)
  tearBegin: 6,         // single tear begins forming
  finalLine: 7,         // final accusation line appears
};
```

### Colour Palette

All colours are defined in `PALETTE` / `PALETTE_CSS` at the top of [`src/config.ts`](src/config.ts):

```typescript
export const PALETTE = {
  nearBlack:     0x050405,
  parchment:     0xD8C6A0,
  wineRed:       0x5A0712,
  hotRed:        0xB31323,
  // ...
};
```

### Post-Processing Intensity

Adjust `POST` in [`src/config.ts`](src/config.ts):

```typescript
export const POST = {
  grainIntensity: 0.08,           // film grain amount
  vignetteIntensity: 0.45,        // edge darkening
  chromaticAberration: 0.0015,    // base print misregistration
  chromaticAberrationMax: 0.004,  // max during intense moments
  halftoneScale: 180.0,           // halftone dot density
};
```

### Timing

Adjust `TIMING` in [`src/config.ts`](src/config.ts) to change animation speeds:

```typescript
export const TIMING = {
  revealDuration: 1.8,     // how long text takes to appear
  holdDuration: 2.5,       // how long text stays before dissolving
  dissolveDuration: 4.0,   // how long the melt/bleed takes
  eyeOpenDuration: 3.0,    // eye opening animation length
  tearFormDuration: 4.0,   // tear formation time
  tearFallDuration: 6.0,   // tear fall time
  steppedFPS: 12,          // painterly animation frame rate
};
```

## Technical Stack

- **Vite** — build tool
- **Three.js** — 3D rendering (orthographic camera, layered 2D composition)
- **TypeScript** — type safety
- **CanvasTexture** — diary text reveal/bleed effects
- **Custom GLSL shaders** — painterly materials, halftone, grain, vignette
- **EffectComposer** — post-processing pipeline
- **Procedural textures** — no external assets required

## Design Notes

The visual style references painterly non-photorealistic rendering:
- Toon colour banding
- Halftone dots in shadows
- Dry-brush edge breakup
- Film grain and paper texture
- Print-like chromatic aberration (misregistration)
- Stepped animation at 12fps for painterly wobble

The piece is designed to be screen-recorded as a finished artwork.

## License

Art piece by the creator. All rights reserved.
