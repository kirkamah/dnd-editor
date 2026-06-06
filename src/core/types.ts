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
  /** v1.3: громкость этой реплики (умножается на громкость дорожки), по умолчанию 1 */
  gain?: number;
}

export interface SceneCue {
  tMs: number;
  bricksOpacity?: number;
  background?: string;
  /** v1.4: плавный переход bricksOpacity к значению ключа (мс), 0 — мгновенно */
  fadeMs?: number;
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

/** v1.4: план, на котором рисуется overlay-картинка (снизу вверх) */
export type OverlayLayer = 'back' | 'scene' | 'default' | 'front';

export interface OverlayEntry {
  image: string; // путь в zip (art/...)
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  /** v1.4: back — за кирпичами, scene — под портретами, default — над ними, front — поверх рамки */
  layer?: OverlayLayer;
  /** v1.4: плавное появление, мс */
  fadeInMs?: number;
  /** v1.4: плавное исчезание, мс */
  fadeOutMs?: number;
}

/** v1.2: позиция/размер портрета; v1.3: + настройки свечения говорящего */
export interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
  /** свечение вокруг портрета, когда участник говорит (по умолчанию включено) */
  glow?: boolean;
  /** цвет свечения (по умолчанию style.speakingColor) */
  glowColor?: string;
  /** размах свечения, px сцены (по умолчанию 28) */
  glowSize?: number;
  /** скругление углов ЭТОГО портрета (по умолчанию style.radius; клампится до круга) */
  radius?: number;
}

/** v1.2: стиль обводки портретов */
export interface PortraitStyle {
  borderColor?: string;
  speakingColor?: string;
  borderWidth?: number;
  radius?: number;
}

/** v1.3: положение слоя frame (рамки портретов); locked — не таскается на превью */
export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
  locked?: boolean;
}

/** v1.4: табличка с именем персонажа — картинка выше рамки портретов */
export interface PlateEntry {
  image: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
}

export interface EditData {
  tracks?: Record<string, TrackEdit>;
  music?: MusicEntry[];
  overlays?: OverlayEntry[];
  layout?: Record<string, LayoutBox>;
  style?: PortraitStyle;
  frameBox?: FrameBox;
  plates?: Record<string, PlateEntry>;
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
