/**
 * scene-state: чистая функция «манифест + время t -> состояние сцены».
 * Версия редактора: + активные overlay-картинки (v1.1 edit.overlays).
 */
import type { Manifest, OverlayEntry } from './types';

export interface SceneState {
  tMs: number;
  speaking: ReadonlySet<string>;
  bricksOpacity: number;
  background?: string;
  overlays: OverlayEntry[];
}

export function stateAt(manifest: Manifest, tMs: number): SceneState {
  const speaking = new Set<string>();
  for (const ev of manifest.speakingEvents) {
    if (ev.startMs > tMs) break; // отсортированы по startMs
    if (tMs < ev.endMs) speaking.add(ev.userId);
  }

  let bricksOpacity = 1.0;
  let background = manifest.layers?.background;
  for (const cue of manifest.sceneCues ?? []) {
    if (cue.tMs > tMs) break;
    if (cue.bricksOpacity !== undefined) bricksOpacity = cue.bricksOpacity;
    if (cue.background !== undefined) background = cue.background;
  }

  const overlays = (manifest.edit?.overlays ?? []).filter(
    (ov) => ov.startMs <= tMs && tMs < ov.endMs,
  );

  return { tMs, speaking, bricksOpacity, background, overlays };
}
