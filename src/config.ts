// Colour palette
export const PALETTE = {
  nearBlack: 0x050405,
  inkBlack: 0x090609,
  parchment: 0xD8C6A0,
  oldGold: 0xB8893D,
  wineRed: 0x5A0712,
  hotRed: 0xB31323,
  orangeRed: 0xF04A1A,
  bruisedPurple: 0x241426,
  eyeWhite: 0xF2EEE4,
  tearGrey: 0xC8D4D8,
} as const;

export const PALETTE_CSS = {
  nearBlack: '#050405',
  inkBlack: '#090609',
  parchment: '#D8C6A0',
  oldGold: '#B8893D',
  wineRed: '#5A0712',
  hotRed: '#B31323',
  orangeRed: '#F04A1A',
  bruisedPurple: '#241426',
  eyeWhite: '#F2EEE4',
  tearGrey: '#C8D4D8',
} as const;

// Audio and act timing
export const AUDIO = {
  startAt: 22,
  fadeInDuration: 6,
  diaryAppearAt: 45,
} as const;

export const ACT_TIMING = {
  diaryFadeInDuration: 4.8,
  minimumDiaryDuration: 22,
  finalStareDelay: 3,
  recognitionLingerDuration: 4,
  cursorRedFadeDuration: 3,
} as const;

// All entries except the last are cursor-revealed. The last is auto-revealed.
export const DIARY_LINES = [
  'i heard you arrive before the light touched me',
  'i tried to stay shape, not story',
  'every secret became easier once it bled',
  'you called it tender because it was quiet',
  'i moved the sentence and you followed',
  'my fear learned the size of your hand',
  'there were rooms in me with no door',
  'you wanted proof more than presence',
  'i kept my name under the ink',
  'even my silence became material',
  'look how carefully you damaged me',
  'i was here before you read me',
  'you read every line, but you never saw me',
] as const;

export const FINAL_LINE_INDEX = DIARY_LINES.length - 1;
export const INTERACTIVE_LINE_COUNT = FINAL_LINE_INDEX;
export const TOTAL_WOUNDS = INTERACTIVE_LINE_COUNT + 1;

// Layout in orthographic world units
export const LAYOUT = {
  diaryWidth: 6.95,
  diaryHeight: 8.95,
  diaryY: 0.3,
  diaryCurve: 0.25,
  diarySubdivisions: 48,

  silhouetteY: 1.0,
  silhouetteWidth: 8.2,
  silhouetteHeight: 11.4,
  silhouetteZ: -2,

  eyeWidth: 1.95,
  eyeHeight: 1.42,
  eyeSpacing: 2.35,
  eyeY: 4.17,
  eyeZ: -1.5,
  irisRadius: 0.34,

  poolY: -4.95,
  poolWidth: 10.4,
  poolHeight: 2.05,
  poolZ: -0.5,

  cameraSize: 8,
} as const;

export const WOUND_THRESHOLDS = {
  firstBleed: 1,
  stainAccumulate: 2,
  silhouetteAppear: 3,
  dropletsIntensify: 5,
  eyesOpen: 7,
  tearBegin: 10,
  finalLine: TOTAL_WOUNDS,
} as const;

export const TIMING = {
  revealDuration: 2.2,
  resistedRevealDuration: 3.1,
  holdDuration: 3.2,
  dissolveDuration: 5.0,
  eyeOpenDuration: 3.0,
  tearFormDuration: 3.2,
  tearFallDuration: 4.8,
  finalLineHoldDuration: 7.0,
  fadeOutDuration: 6.0,
  steppedFPS: 12,
  instructionFadeDelay: 2.0,
} as const;

// Reveal zone rects in diary UV space.
export const REVEAL_ZONES = [
  { line: 0, u: 0.50, v: 0.09, hw: 0.40, hh: 0.028 },
  { line: 1, u: 0.50, v: 0.16, hw: 0.40, hh: 0.028 },
  { line: 2, u: 0.50, v: 0.23, hw: 0.40, hh: 0.028 },
  { line: 3, u: 0.50, v: 0.30, hw: 0.40, hh: 0.028 },
  { line: 4, u: 0.50, v: 0.37, hw: 0.40, hh: 0.028 },
  { line: 5, u: 0.50, v: 0.44, hw: 0.40, hh: 0.028 },
  { line: 6, u: 0.50, v: 0.51, hw: 0.40, hh: 0.028 },
  { line: 7, u: 0.50, v: 0.58, hw: 0.40, hh: 0.028 },
  { line: 8, u: 0.50, v: 0.65, hw: 0.40, hh: 0.028 },
  { line: 9, u: 0.50, v: 0.72, hw: 0.40, hh: 0.028 },
  { line: 10, u: 0.50, v: 0.79, hw: 0.40, hh: 0.028 },
  { line: 11, u: 0.50, v: 0.86, hw: 0.40, hh: 0.028 },
] as const;

export const POST = {
  grainIntensity: 0.08,
  vignetteIntensity: 0.45,
  vignetteSoftness: 0.35,
  chromaticAberration: 0.0015,
  chromaticAberrationMax: 0.004,
  halftoneScale: 180.0,
} as const;
