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

export interface EditData {
  tracks?: Record<string, TrackEdit>;
  music?: MusicEntry[];
  overlays?: OverlayEntry[];
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
