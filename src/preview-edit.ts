/**
 * PreviewEdit: редактирование сцены прямо на превью-канвасе.
 * Клик по портрету/overlay — выбор; перетаскивание — перенос;
 * уголок снизу-справа — изменение размера. Рисует рамку выбора и ручку.
 */
import type { LoadedScene } from './core/bundle-loader';
import { effectiveBoxes, SCENE_W, SCENE_H } from './core/scene-renderer';
import { stateAt } from './core/scene-state';
import type { EditorState } from './editor-state';
import type { Selection } from './timeline';

const HANDLE = 26; // размер ручки ресайза в координатах сцены

export interface PreviewHooks {
  playhead(): number;
  selection(): Selection;
  setSelection(sel: Selection): void;
  onEdited(): void;
}

interface DragState {
  kind: 'portrait' | 'overlay';
  userId?: string;
  overlayIndex?: number;
  mode: 'move' | 'resize';
  grabX: number;
  grabY: number;
  box: { x: number; y: number; w: number; h: number };
  /** сохранение пропорций при ресайзе портрета */
  ratio: number;
}

export class PreviewEdit {
  private drag: DragState | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private scene: LoadedScene,
    private editor: EditorState,
    private hooks: PreviewHooks,
  ) {
    canvas.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', () => (this.drag = null));
    canvas.addEventListener('mousemove', (e) => this.cursor(e));
  }

  /** Координаты мыши -> координаты сцены 1920x1080. */
  private toScene(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SCENE_W,
      y: ((e.clientY - r.top) / r.height) * SCENE_H,
    };
  }

  private hit(x: number, y: number): DragState | null {
    // overlay рисуются поверх портретов — проверяем первыми (с конца списка)
    const overlays = this.scene.manifest.edit?.overlays ?? [];
    const t = this.hooks.playhead();
    for (let i = overlays.length - 1; i >= 0; i--) {
      const ov = overlays[i];
      if (t < ov.startMs || t >= ov.endMs) continue;
      const m = this.mode(x, y, ov);
      if (m) {
        return {
          kind: 'overlay',
          overlayIndex: i,
          mode: m,
          grabX: x,
          grabY: y,
          box: { x: ov.x, y: ov.y, w: ov.w, h: ov.h },
          ratio: ov.w / ov.h,
        };
      }
    }
    for (const [p, box] of effectiveBoxes(this.scene)) {
      if (box.hidden) continue;
      const m = this.mode(x, y, box);
      if (m) {
        return {
          kind: 'portrait',
          userId: p.userId,
          mode: m,
          grabX: x,
          grabY: y,
          box: { x: box.x, y: box.y, w: box.w, h: box.h },
          ratio: box.w / box.h,
        };
      }
    }
    return null;
  }

  private mode(
    x: number,
    y: number,
    b: { x: number; y: number; w: number; h: number },
  ): 'move' | 'resize' | null {
    if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return null;
    return x > b.x + b.w - HANDLE && y > b.y + b.h - HANDLE ? 'resize' : 'move';
  }

  private onDown(e: MouseEvent): void {
    const { x, y } = this.toScene(e);
    const hit = this.hit(x, y);
    if (!hit) return;
    this.drag = hit;
    this.hooks.setSelection(
      hit.kind === 'portrait'
        ? { type: 'participant', userId: hit.userId! }
        : { type: 'overlay', i: hit.overlayIndex! },
    );
  }

  private onMove(e: MouseEvent): void {
    if (!this.drag) return;
    const { x, y } = this.toScene(e);
    const d = this.drag;
    const dx = x - d.grabX;
    const dy = y - d.grabY;

    let nb: { x: number; y: number; w: number; h: number };
    if (d.mode === 'move') {
      nb = { ...d.box, x: Math.round(d.box.x + dx), y: Math.round(d.box.y + dy) };
    } else {
      const w = Math.max(40, Math.round(d.box.w + dx));
      // портреты ресайзятся с сохранением пропорций, overlay — свободно
      const h = d.kind === 'portrait' ? Math.round(w / d.ratio) : Math.max(40, Math.round(d.box.h + dy));
      nb = { ...d.box, w, h };
    }
    nb.x = Math.max(-nb.w + 40, Math.min(SCENE_W - 40, nb.x));
    nb.y = Math.max(-nb.h + 40, Math.min(SCENE_H - 40, nb.y));

    if (d.kind === 'portrait') this.editor.setPortraitLayout(d.userId!, nb);
    else this.editor.updateOverlay(d.overlayIndex!, nb);
    this.hooks.onEdited();
  }

  private cursor(e: MouseEvent): void {
    if (this.drag) return;
    const { x, y } = this.toScene(e);
    const hit = this.hit(x, y);
    this.canvas.style.cursor = !hit ? 'default' : hit.mode === 'resize' ? 'nwse-resize' : 'move';
  }

  /** Рамка выбора + ручка ресайза — рисовать ПОСЛЕ SceneRenderer.render. */
  drawSelectionUI(ctx: CanvasRenderingContext2D): void {
    const sel = this.hooks.selection();
    let box: { x: number; y: number; w: number; h: number } | null = null;

    if (sel?.type === 'participant') {
      for (const [p, b] of effectiveBoxes(this.scene)) {
        if (p.userId === sel.userId && !b.hidden) box = b;
      }
    } else if (sel?.type === 'overlay') {
      const ov = this.scene.manifest.edit?.overlays?.[sel.i];
      const t = stateAt(this.scene.manifest, this.hooks.playhead());
      if (ov && t.overlays.includes(ov)) box = ov;
    }
    if (!box) return;

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(box.x + box.w - HANDLE / 2, box.y + box.h - HANDLE / 2, HANDLE, HANDLE);
    ctx.restore();
  }
}
