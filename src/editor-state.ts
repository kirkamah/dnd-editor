/**
 * editor-state: все мутации сцены (манифест + файлы бандла) и сохранение
 * обратно в .dndsession. UI зовёт только эти функции — единая точка правок.
 */
import { zipSync, type Zippable } from 'fflate';
import type { LoadedScene } from './core/bundle-loader';
import { decodeImage, decodeMusic } from './core/bundle-loader';
import type {
  EditData,
  MusicEntry,
  OverlayEntry,
  ParticipantEntry,
  SceneCue,
  SpeakingEvent,
} from './core/types';
import { SCENE_W, SCENE_H } from './core/scene-renderer';

export class EditorState {
  /** есть несохранённые правки */
  dirty = false;

  constructor(readonly scene: LoadedScene) {}

  private edit(): EditData {
    return (this.scene.manifest.edit ??= {});
  }

  private touch(): void {
    this.dirty = true;
  }

  // ---------- дорожки ----------

  trackEdit(userId: string): { gain: number; muted: boolean } {
    return this.scene.manifest.edit?.tracks?.[userId] ?? { gain: 1, muted: false };
  }

  setTrack(userId: string, patch: Partial<{ gain: number; muted: boolean }>): void {
    const tracks = (this.edit().tracks ??= {});
    tracks[userId] = { ...this.trackEdit(userId), ...patch };
    this.touch();
  }

  // ---------- музыка ----------

  async addMusic(fileName: string, bytes: Uint8Array, startMs: number): Promise<MusicEntry> {
    const path = this.uniquePath(`music/${sanitize(fileName)}`);
    this.scene.rawFiles.set(path, bytes);
    this.scene.music.set(path, await decodeMusic(bytes));
    const entry: MusicEntry = { file: path, startMs, gain: 0.6 };
    (this.edit().music ??= []).push(entry);
    this.touch();
    return entry;
  }

  updateMusic(i: number, patch: Partial<MusicEntry>): void {
    const list = this.edit().music ?? [];
    if (list[i]) Object.assign(list[i], patch);
    this.touch();
  }

  removeMusic(i: number): void {
    const list = this.edit().music ?? [];
    const [gone] = list.splice(i, 1);
    if (gone) {
      this.scene.rawFiles.delete(gone.file);
      this.scene.music.delete(gone.file);
    }
    this.touch();
  }

  // ---------- overlay-картинки ----------

  async addOverlay(fileName: string, bytes: Uint8Array, startMs: number): Promise<OverlayEntry> {
    const path = this.uniquePath(`art/overlay-${sanitize(fileName)}`);
    this.scene.rawFiles.set(path, bytes);
    const img = await decodeImage(bytes);
    this.scene.images.set(path, img);
    // вписываем в сцену с сохранением пропорций, по центру
    const scale = Math.min(1, (SCENE_W * 0.5) / img.width, (SCENE_H * 0.5) / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const entry: OverlayEntry = {
      image: path,
      startMs,
      endMs: Math.min(startMs + 10_000, this.scene.manifest.durationMs),
      x: Math.round((SCENE_W - w) / 2),
      y: Math.round((SCENE_H - h) / 2),
      w,
      h,
      opacity: 1,
    };
    (this.edit().overlays ??= []).push(entry);
    this.touch();
    return entry;
  }

  updateOverlay(i: number, patch: Partial<OverlayEntry>): void {
    const list = this.edit().overlays ?? [];
    if (list[i]) Object.assign(list[i], patch);
    this.touch();
  }

  removeOverlay(i: number): void {
    const list = this.edit().overlays ?? [];
    const [gone] = list.splice(i, 1);
    if (gone) {
      this.scene.rawFiles.delete(gone.image);
      this.scene.images.delete(gone.image);
    }
    this.touch();
  }

  // ---------- sceneCues ----------

  addCue(cue: SceneCue): void {
    this.scene.manifest.sceneCues ??= [];
    this.scene.manifest.sceneCues.push(cue);
    this.sortCues();
    this.touch();
  }

  updateCue(i: number, patch: Partial<SceneCue>): void {
    const c = this.scene.manifest.sceneCues?.[i];
    if (c) Object.assign(c, patch);
    this.sortCues();
    this.touch();
  }

  removeCue(i: number): void {
    this.scene.manifest.sceneCues?.splice(i, 1);
    this.touch();
  }

  private sortCues(): void {
    this.scene.manifest.sceneCues?.sort((a, b) => a.tMs - b.tMs);
  }

  // ---------- speakingEvents (ретайминг) ----------

  updateSpeakingEvent(i: number, patch: Partial<SpeakingEvent>): void {
    const ev = this.scene.manifest.speakingEvents[i];
    if (!ev) return;
    Object.assign(ev, patch);
    ev.startMs = Math.max(0, Math.min(ev.startMs, this.scene.manifest.durationMs - 1));
    ev.endMs = Math.max(ev.startMs + 1, Math.min(ev.endMs, this.scene.manifest.durationMs));
    this.scene.manifest.speakingEvents.sort((a, b) => a.startMs - b.startMs);
    this.touch();
  }

  addSpeakingEvent(userId: string, startMs: number): void {
    this.scene.manifest.speakingEvents.push({
      userId,
      startMs,
      endMs: Math.min(startMs + 2000, this.scene.manifest.durationMs),
    });
    this.scene.manifest.speakingEvents.sort((a, b) => a.startMs - b.startMs);
    this.touch();
  }

  removeSpeakingEvent(i: number): void {
    this.scene.manifest.speakingEvents.splice(i, 1);
    this.touch();
  }

  /** Просто положить картинку в бандл (например, новый фон) и вернуть путь. */
  async addImageFile(fileName: string, bytes: Uint8Array): Promise<string> {
    const path = this.uniquePath(`art/${sanitize(fileName)}`);
    this.scene.rawFiles.set(path, bytes);
    this.scene.images.set(path, await decodeImage(bytes));
    this.touch();
    return path;
  }

  // ---------- замена артов ----------

  async replaceArt(
    p: ParticipantEntry,
    kind: 'idle' | 'speaking',
    fileName: string,
    bytes: Uint8Array,
  ): Promise<void> {
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.png';
    const path = this.uniquePath(`art/${p.characterId}-${kind}${ext}`);
    this.scene.rawFiles.set(path, bytes);
    this.scene.images.set(path, await decodeImage(bytes));
    (p.art ??= {})[kind] = path;
    this.touch();
  }

  // ---------- сохранение ----------

  /** Собрать .dndsession: правки в манифесте, файлы — без перекодирования. */
  saveBundle(): Uint8Array {
    this.scene.manifest.formatVersion = '1.1';
    const zip: Zippable = {};
    for (const [path, bytes] of this.scene.rawFiles) {
      if (path === 'manifest.json') continue;
      // WAV несжимаем — store ради скорости; остальное мелкое, тоже store.
      zip[path] = [bytes, { level: 0 }];
    }
    zip['manifest.json'] = new TextEncoder().encode(
      JSON.stringify(this.scene.manifest, null, 2),
    );
    const out = zipSync(zip);
    this.dirty = false;
    return out;
  }

  private uniquePath(base: string): string {
    if (!this.scene.rawFiles.has(base)) return base;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    for (let i = 2; ; i++) {
      const p = `${stem}-${i}${ext}`;
      if (!this.scene.rawFiles.has(p)) return p;
    }
  }
}

function sanitize(name: string): string {
  return name.replace(/[^\wа-яё.\-]+/gi, '_');
}
