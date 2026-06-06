/**
 * Типы манифеста .dndsession — зеркало FORMAT.md v1.1.
 * Источник правды спеки — проект dnd-recorder; ядро (core/) растёт из
 * модулей плеера dnd-player и расширено блоком edit.
 */

export type PlayerSlot = 0 | 1 | 2 | 3 | 4 | 5;
export type Slot = PlayerSlot | 'master';

export interface ArtRefs {
  idle?: string;
  speaking?: string;
}

export interface ParticipantEntry {
  userId: string;
  displayName: string;
  characterId: string;
  characterName: string;
  slot: Slot | null;
  audioFile: string;
  art?: ArtRefs;
}

export interface SpeakingEvent {
  userId: string;
  startMs: number;
  endMs: number;
  /**
   * v1.2: откуда в ИСХОДНОЙ дорожке берётся звук клипа (длина = endMs-startMs).
   * Отсутствует — звук с позиции startMs (как записано ботом).
   */
  srcStartMs?: number;
}

export interface SceneCue {
  tMs: number;
  bricksOpacity?: number;
  background?: string;
}

export interface Layers {
  background?: string;
  bricks?: string;
  frame?: string;
}

// --- v1.1: правки редактора ---

export interface TrackEdit {
  gain: number;
  muted: boolean;
}

export interface MusicEntry {
  file: string; // путь в zip (music/...)
  startMs: number;
  gain: number;
  /** v1.2: конец окна на таймлайне (по умолчанию старт + длина файла) */
  endMs?: number;
  /** v1.2: смещение внутри файла (по умолчанию 0) */
  srcStartMs?: number;
}

export interface OverlayEntry {
  image: string; // путь в zip (art/...)
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
}

/** v1.2: позиция/размер портрета, заданные в редакторе */
export interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
}

/** v1.2: стиль обводки портретов */
export interface PortraitStyle {
  borderColor?: string;
  speakingColor?: string;
  borderWidth?: number;
  radius?: number;
}

export interface EditData {
  tracks?: Record<string, TrackEdit>;
  music?: MusicEntry[];
  overlays?: OverlayEntry[];
  layout?: Record<string, LayoutBox>;
  style?: PortraitStyle;
}

export interface Manifest {
  formatVersion: string;
  sessionId: string;
  recordedAt: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
  master: ParticipantEntry | null;
  players: ParticipantEntry[];
  speakingEvents: SpeakingEvent[];
  layers: Layers;
  sceneCues: SceneCue[];
  edit?: EditData;
}
