// ─── Audio Manager ───
// Handles loading and playing the diary audio track.
// Gracefully degrades if audio file is missing.

export class AudioManager {
  private audio: HTMLAudioElement | null = null;
  private loaded = false;
  private _isPlaying = false;

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * Attempt to load audio from the given URL.
   * Returns true if loaded successfully, false otherwise.
   */
  async load(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = url;

        const onCanPlay = () => {
          this.audio = audio;
          this.loaded = true;
          audio.removeEventListener('canplaythrough', onCanPlay);
          audio.removeEventListener('error', onError);
          resolve(true);
        };

        const onError = () => {
          console.warn('[AudioManager] Could not load audio from:', url);
          audio.removeEventListener('canplaythrough', onCanPlay);
          audio.removeEventListener('error', onError);
          resolve(false);
        };

        audio.addEventListener('canplaythrough', onCanPlay);
        audio.addEventListener('error', onError);

        // Timeout fallback
        setTimeout(() => {
          if (!this.loaded) {
            audio.removeEventListener('canplaythrough', onCanPlay);
            audio.removeEventListener('error', onError);
            console.warn('[AudioManager] Audio load timeout');
            resolve(false);
          }
        }, 5000);

        audio.load();
      } catch {
        console.warn('[AudioManager] Audio loading failed');
        resolve(false);
      }
    });
  }

  /**
   * Play the loaded audio. Must be called from a user gesture context.
   */
  play(options: { startAt?: number; fadeInDuration?: number } = {}): void {
    if (!this.audio || !this.loaded) return;
    const audio = this.audio;
    const startAt = options.startAt ?? 0;
    const fadeInDuration = options.fadeInDuration ?? 0;
    audio.currentTime = startAt;
    audio.volume = fadeInDuration > 0 ? 0 : 1;

    this.audio.play().then(() => {
      this._isPlaying = true;
      if (fadeInDuration > 0) {
        const startT = performance.now();
        const fade = () => {
          if (!this.audio || !this._isPlaying) return;
          const elapsed = (performance.now() - startT) / 1000;
          const progress = Math.min(1, elapsed / fadeInDuration);
          audio.volume = progress;
          if (progress < 1) requestAnimationFrame(fade);
        };
        requestAnimationFrame(fade);
      }
    }).catch((err) => {
      console.warn('[AudioManager] Playback failed:', err);
    });
  }

  /**
   * Get current playback time in seconds.
   */
  getTime(): number {
    if (!this.audio || !this._isPlaying) return 0;
    return this.audio.currentTime;
  }

  /**
   * Fade out audio over the given duration (seconds).
   */
  fadeOut(duration = 3): void {
    if (!this.audio || !this._isPlaying) return;
    const audio = this.audio;
    const startVol = audio.volume;
    const startT = performance.now();
    const fade = () => {
      const elapsed = (performance.now() - startT) / 1000;
      const progress = Math.min(1, elapsed / duration);
      audio.volume = startVol * (1 - progress);
      if (progress < 1) {
        requestAnimationFrame(fade);
      } else {
        audio.pause();
        this._isPlaying = false;
      }
    };
    requestAnimationFrame(fade);
  }
}
