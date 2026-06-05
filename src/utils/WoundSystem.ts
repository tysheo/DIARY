import {
  INTERACTIVE_LINE_COUNT,
  TOTAL_WOUNDS,
  WOUND_THRESHOLDS,
} from '../config';

export type WoundPhase =
  | 'clean'
  | 'first-bleed'
  | 'staining'
  | 'silhouette-gathering'
  | 'droplets-intensifying'
  | 'eyes-opening'
  | 'tear-forming'
  | 'final-line'
  | 'ending';

export interface WoundEvent {
  type: 'wound' | 'eyes-open' | 'tear-begin' | 'final-ready' | 'ending';
  woundCount: number;
}

export class WoundSystem {
  woundCount = 0;
  revealedLines: boolean[];
  phase: WoundPhase = 'clean';
  private pendingEvents: WoundEvent[] = [];
  private finalReady = false;
  private ended = false;

  constructor() {
    this.revealedLines = new Array(INTERACTIVE_LINE_COUNT).fill(false);
  }

  reveal(lineIndex: number): boolean {
    if (lineIndex < 0 || lineIndex >= INTERACTIVE_LINE_COUNT) return false;
    if (this.revealedLines[lineIndex]) return false;
    if (this.ended || this.finalReady) return false;

    this.revealedLines[lineIndex] = true;
    this.woundCount++;
    this.updatePhase();
    this.pendingEvents.push({ type: 'wound', woundCount: this.woundCount });

    if (this.woundCount === WOUND_THRESHOLDS.eyesOpen) {
      this.pendingEvents.push({ type: 'eyes-open', woundCount: this.woundCount });
    }

    if (this.woundCount === WOUND_THRESHOLDS.tearBegin) {
      this.pendingEvents.push({ type: 'tear-begin', woundCount: this.woundCount });
    }

    if (this.woundCount >= INTERACTIVE_LINE_COUNT) {
      this.finalReady = true;
      this.pendingEvents.push({ type: 'final-ready', woundCount: this.woundCount });
    }

    return true;
  }

  markFinalLineShown(): void {
    this.woundCount = TOTAL_WOUNDS;
    this.phase = 'final-line';
  }

  isFinalReady(): boolean {
    return this.finalReady;
  }

  consumeEvents(): WoundEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  triggerEnding(): void {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'ending';
    this.pendingEvents.push({ type: 'ending', woundCount: this.woundCount });
  }

  getProgress(): number {
    return Math.min(1, this.woundCount / TOTAL_WOUNDS);
  }

  getSilhouetteVisibility(): number {
    if (this.woundCount < WOUND_THRESHOLDS.silhouetteAppear) return 0;
    const progress =
      (this.woundCount - WOUND_THRESHOLDS.silhouetteAppear) /
      (TOTAL_WOUNDS - WOUND_THRESHOLDS.silhouetteAppear);
    return Math.min(1, progress * 1.25);
  }

  private updatePhase(): void {
    const w = this.woundCount;
    if (w >= WOUND_THRESHOLDS.finalLine) this.phase = 'final-line';
    else if (w >= WOUND_THRESHOLDS.tearBegin) this.phase = 'tear-forming';
    else if (w >= WOUND_THRESHOLDS.eyesOpen) this.phase = 'eyes-opening';
    else if (w >= WOUND_THRESHOLDS.dropletsIntensify) this.phase = 'droplets-intensifying';
    else if (w >= WOUND_THRESHOLDS.silhouetteAppear) this.phase = 'silhouette-gathering';
    else if (w >= WOUND_THRESHOLDS.stainAccumulate) this.phase = 'staining';
    else if (w >= WOUND_THRESHOLDS.firstBleed) this.phase = 'first-bleed';
    else this.phase = 'clean';
  }
}
