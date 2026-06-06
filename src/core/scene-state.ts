/**
 * scene-state: чистая функция «манифест + время t -> состояние сцены».
 * v1.4: bricksOpacity плавно интерполируется по fadeMs ключей; у overlay
 * считается эффективная прозрачность с рампами появления/исчезания.
 */
import type { Manifest, OverlayEntry } from './types';

export interface ActiveOverlay extends OverlayEntry {
  /** прозрачность с учётом fadeIn/fadeOut в момент t */
  effOpacity: number;
}

export interface SceneState {
  tMs: number;
  speaking: ReadonlySet<string>;
  bricksOpacity: number;
  background?: string;
  overlays: ActiveOverlay[];
}

export function stateAt(manifest: Manifest, tMs: number): SceneState {
  const speaking = new Set<string>();
  for (const ev of manifest.speakingEvents) {
    if (ev.startMs > tMs) break; // отсортированы по startMs
    if (tMs < ev.endMs) speaking.add(ev.userId);
  }

  // Кирпичи: ключи со ступенью либо плавным переходом (fadeMs) от
  // предыдущего значения. Более поздний ключ всегда главнее.
  let bricksOpacity = 1.0;
  let background = manifest.layers?.background;
  for (const cue of manifest.sceneCues ?? []) {
    if (cue.tMs > tMs) break;
    if (cue.bricksOpacity !== undefined) {
      const fade = cue.fadeMs ?? 0;
      if (fade > 0 && tMs < cue.tMs + fade) {
        const k = (tMs - cue.tMs) / fade;
        bricksOpacity = bricksOpacity + (cue.bricksOpacity - bricksOpacity) * k;
      } else {
        bricksOpacity = cue.bricksOpacity;
      }
    }
    if (cue.background !== undefined) background = cue.background;
  }

  const overlays: ActiveOverlay[] = [];
  for (const ov of manifest.edit?.overlays ?? []) {
    if (ov.startMs > tMs || tMs >= ov.endMs) continue;
    let ramp = 1;
    const fadeIn = ov.fadeInMs ?? 0;
    const fadeOut = ov.fadeOutMs ?? 0;
    if (fadeIn > 0) ramp = Math.min(ramp, (tMs - ov.startMs) / fadeIn);
    if (fadeOut > 0) ramp = Math.min(ramp, (ov.endMs - tMs) / fadeOut);
    overlays.push({ ...ov, effOpacity: ov.opacity * Math.max(0, Math.min(1, ramp)) });
  }

  return { tMs, speaking, bricksOpacity, background, overlays };
}
