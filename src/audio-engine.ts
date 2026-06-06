/**
 * AudioEngine: воспроизведение в редакторе + офлайн-сведение для экспорта.
 * Дорожки участников — моно 48кГц c GainNode (громкость/мьют из manifest.edit),
 * музыка — AudioBuffer из бандла со своим стартом и громкостью.
 * Сведение: OfflineAudioContext тех же графов -> стерео WAV.
 */
import type { LoadedScene } from './core/bundle-loader';

export class AudioEngine {
  private ctx = new AudioContext({ sampleRate: 48000 });
  private trackBuffers = new Map<string, AudioBuffer>(); // userId -> буфер
  private trackGains = new Map<string, GainNode>();
  private sources: AudioBufferSourceNode[] = [];
  private startCtxTime = 0;
  private offsetMs = 0;
  private _playing = false;

  onEnded: (() => void) | null = null;

  constructor(private scene: LoadedScene) {
    for (const [userId, samples] of scene.audio) {
      const buf = this.ctx.createBuffer(1, samples.length, 48000);
      buf.copyToChannel(samples, 0);
      this.trackBuffers.set(userId, buf);
      const gain = this.ctx.createGain();
      gain.connect(this.ctx.destination);
      this.trackGains.set(userId, gain);
    }
    this.applyGains();
  }

  get durationMs(): number {
    return this.scene.manifest.durationMs;
  }

  get playing(): boolean {
    return this._playing;
  }

  get timeMs(): number {
    if (!this._playing) return this.offsetMs;
    return Math.min(
      this.durationMs,
      this.offsetMs + (this.ctx.currentTime - this.startCtxTime) * 1000,
    );
  }

  /** Применить gain/mute из manifest.edit к живым GainNode (дёргать после правок). */
  applyGains(): void {
    for (const [userId, gain] of this.trackGains) {
      const e = this.scene.manifest.edit?.tracks?.[userId];
      gain.gain.value = e?.muted ? 0 : (e?.gain ?? 1);
    }
  }

  /** Музыка добавилась/изменилась: на ходу перезапускаем источники. */
  refreshMusic(): void {
    if (this._playing) {
      this.stopSources();
      this.offsetMs = this.timeMs;
      this.startSources();
    }
  }

  async play(): Promise<void> {
    if (this._playing) return;
    if (this.offsetMs >= this.durationMs) this.offsetMs = 0;
    await this.ctx.resume();
    this.startSources();
    this._playing = true;
  }

  pause(): void {
    if (!this._playing) return;
    this.offsetMs = this.timeMs;
    this._playing = false;
    this.stopSources();
  }

  seek(ms: number): void {
    const clamped = Math.max(0, Math.min(this.durationMs, ms));
    if (this._playing) {
      this.stopSources();
      this.offsetMs = clamped;
      this.startSources();
    } else {
      this.offsetMs = clamped;
    }
  }

  tick(): void {
    if (this._playing && this.timeMs >= this.durationMs) {
      this.offsetMs = this.durationMs;
      this._playing = false;
      this.stopSources();
      this.onEnded?.();
    }
  }

  private startSources(): void {
    const when = this.ctx.currentTime + 0.05;
    const offsetSec = this.offsetMs / 1000;
    this.startCtxTime = when;
    this.sources = [];

    for (const [userId, buf] of this.trackBuffers) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.trackGains.get(userId)!);
      src.start(when, offsetSec);
      this.sources.push(src);
    }
    this.scheduleMusic(this.ctx, this.ctx.destination, when, this.offsetMs, this.sources);
  }

  /**
   * Планирование музыки относительно плейхеда — общая логика для живого
   * воспроизведения и офлайн-сведения.
   */
  private scheduleMusic(
    ctx: BaseAudioContext,
    dest: AudioNode,
    when: number,
    playheadMs: number,
    out: AudioBufferSourceNode[],
  ): void {
    for (const entry of this.scene.manifest.edit?.music ?? []) {
      const buf = this.scene.music.get(entry.file);
      if (!buf) continue;
      const gain = ctx.createGain();
      gain.gain.value = entry.gain;
      gain.connect(dest);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);

      const relMs = playheadMs - entry.startMs; // куда плейхед попадает внутри трека
      if (relMs < 0) src.start(when - relMs / 1000, 0);
      else if (relMs / 1000 < buf.duration) src.start(when, relMs / 1000);
      else continue; // музыка уже закончилась к этому моменту
      out.push(src);
    }
  }

  private stopSources(): void {
    for (const s of this.sources) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        /* уже остановлен */
      }
    }
    this.sources = [];
  }

  /** Офлайн-сведение всей сессии (дорожки с gain/mute + музыка) в стерео WAV. */
  async renderMixWav(): Promise<ArrayBuffer> {
    const samples = Math.round((this.durationMs / 1000) * 48000);
    const off = new OfflineAudioContext(2, samples, 48000);

    for (const [userId, samplesF32] of this.scene.audio) {
      const e = this.scene.manifest.edit?.tracks?.[userId];
      const g = e?.muted ? 0 : (e?.gain ?? 1);
      if (g === 0) continue;
      const buf = off.createBuffer(1, samplesF32.length, 48000);
      buf.copyToChannel(samplesF32, 0);
      const gain = off.createGain();
      gain.gain.value = g;
      gain.connect(off.destination);
      const src = off.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.start(0);
    }
    this.scheduleMusic(off, off.destination, 0, 0, []);

    const rendered = await off.startRendering();
    return encodeWavStereo16(rendered);
  }
}

/** AudioBuffer (стерео) -> WAV s16le. */
export function encodeWavStereo16(buf: AudioBuffer): ArrayBuffer {
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const frames = buf.length;
  const dataBytes = frames * 2 * 2;
  const out = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(out);

  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, 48000, true);
  dv.setUint32(28, 48000 * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  wstr(36, 'data');
  dv.setUint32(40, dataBytes, true);

  let o = 44;
  for (let i = 0; i < frames; i++) {
    dv.setInt16(o, clamp16(ch0[i]), true);
    dv.setInt16(o + 2, clamp16(ch1[i]), true);
    o += 4;
  }
  return out;
}

/** Моно Float32 -> WAV s16le mono (для AE-экспорта дорожек). */
export function encodeWavMono16(samples: Float32Array): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const out = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(out);
  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 48000, true);
  dv.setUint32(28, 48000 * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  wstr(36, 'data');
  dv.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, clamp16(samples[i]), true);
  return out;
}

function clamp16(v: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
}
