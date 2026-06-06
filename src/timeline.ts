/**
 * Timeline: canvas-таймлайн редактора.
 * Ряды: cues сцены (ромбы) → overlay-картинки → музыка → речь по участникам.
 * Мышь: клик по пустому — плейхед; клик по элементу — выбор; перетаскивание
 * блока — сдвиг во времени; за края блока — ретайминг начала/конца.
 */
import type { LoadedScene } from './core/bundle-loader';
import type { EditorState } from './editor-state';

export const RULER_H = 26;
export const ROW_H = 30;
const EDGE = 6; // зона захвата края блока, px

export type Selection =
  | { type: 'cue'; i: number }
  | { type: 'overlay'; i: number }
  | { type: 'music'; i: number }
  | { type: 'speech'; i: number }
  | { type: 'participant'; userId: string }
  | null;

interface Row {
  kind: 'cues' | 'overlays' | 'music' | 'speech';
  userId?: string;
}

interface Hit {
  sel: Exclude<Selection, null>;
  mode: 'move' | 'resize-l' | 'resize-r';
  startMs: number;
  endMs: number;
}

export interface TimelineHooks {
  getPlayhead(): number;
  setPlayhead(ms: number): void;
  getSelection(): Selection;
  setSelection(sel: Selection): void;
  /** вызывается после живой правки перетаскиванием */
  onEdited(): void;
}

export class Timeline {
  private ctx: CanvasRenderingContext2D;
  pxPerMs = 0.02;
  private drag:
    | null
    | { kind: 'playhead' }
    | ({ kind: 'item'; grabMs: number } & Hit) = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private scene: LoadedScene,
    private editor: EditorState,
    private hooks: TimelineHooks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', () => (this.drag = null));
    canvas.addEventListener('mousemove', (e) => this.updateCursor(e));
  }

  fitToWidth(containerW: number): void {
    this.pxPerMs = Math.max(0.0005, containerW / Math.max(1, this.scene.manifest.durationMs));
    this.resize();
  }

  zoom(mult: number): void {
    this.pxPerMs = Math.min(2, Math.max(0.0005, this.pxPerMs * mult));
    this.resize();
  }

  rows(): Row[] {
    return [
      { kind: 'cues' },
      { kind: 'overlays' },
      { kind: 'music' },
      ...this.scene.participants.map((p) => ({ kind: 'speech' as const, userId: p.userId })),
    ];
  }

  height(): number {
    return RULER_H + this.rows().length * ROW_H;
  }

  resize(): void {
    const w = Math.min(30000, Math.ceil(this.scene.manifest.durationMs * this.pxPerMs) + 20);
    this.pxPerMs = (w - 20) / this.scene.manifest.durationMs;
    this.canvas.width = w;
    this.canvas.height = this.height();
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${this.height()}px`;
  }

  private x(ms: number): number {
    return ms * this.pxPerMs;
  }

  private ms(x: number): number {
    return Math.max(0, Math.min(this.scene.manifest.durationMs, x / this.pxPerMs));
  }

  // ---------- отрисовка ----------

  draw(): void {
    const { ctx, canvas } = this;
    const m = this.scene.manifest;
    const sel = this.hooks.getSelection();

    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // линейка
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, canvas.width, RULER_H);
    const stepMs = niceStep(this.pxPerMs);
    ctx.fillStyle = '#6b7886';
    ctx.font = '10px system-ui';
    ctx.textBaseline = 'middle';
    for (let t = 0; t <= m.durationMs; t += stepMs) {
      const px = this.x(t);
      ctx.fillRect(px, RULER_H - 6, 1, 6);
      ctx.fillText(fmtTime(t), px + 3, RULER_H / 2);
    }

    const rows = this.rows();
    rows.forEach((row, ri) => {
      const y = RULER_H + ri * ROW_H;
      ctx.fillStyle = ri % 2 ? '#10141a' : '#0e1116';
      ctx.fillRect(0, y, canvas.width, ROW_H);

      if (row.kind === 'cues') {
        (m.sceneCues ?? []).forEach((cue, i) => {
          const selected = sel?.type === 'cue' && sel.i === i;
          drawDiamond(ctx, this.x(cue.tMs), y + ROW_H / 2, selected ? '#8ec7f0' : '#4ea1e0');
        });
      } else if (row.kind === 'overlays') {
        (m.edit?.overlays ?? []).forEach((ov, i) => {
          const selected = sel?.type === 'overlay' && sel.i === i;
          this.block(ov.startMs, ov.endMs, y, '#e0a73c', selected);
        });
      } else if (row.kind === 'music') {
        (m.edit?.music ?? []).forEach((mu, i) => {
          const buf = this.scene.music.get(mu.file);
          const endMs = mu.startMs + (buf ? buf.duration * 1000 : 10_000);
          const selected = sel?.type === 'music' && sel.i === i;
          this.block(mu.startMs, Math.min(endMs, m.durationMs), y, '#7c5cff', selected);
        });
      } else {
        m.speakingEvents.forEach((ev, i) => {
          if (ev.userId !== row.userId) return;
          const selected = sel?.type === 'speech' && sel.i === i;
          this.block(ev.startMs, ev.endMs, y, '#2fa37c', selected);
        });
      }
    });

    // плейхед
    const px = this.x(this.hooks.getPlayhead());
    ctx.fillStyle = '#e8554d';
    ctx.fillRect(px, 0, 2, canvas.height);
    ctx.beginPath();
    ctx.moveTo(px - 5, 0);
    ctx.lineTo(px + 7, 0);
    ctx.lineTo(px + 1, 8);
    ctx.closePath();
    ctx.fill();
  }

  private block(startMs: number, endMs: number, rowY: number, color: string, selected: boolean) {
    const { ctx } = this;
    const x = this.x(startMs);
    const w = Math.max(3, this.x(endMs) - x);
    ctx.fillStyle = color + (selected ? '' : '99');
    ctx.beginPath();
    ctx.roundRect(x, rowY + 5, w, ROW_H - 10, 4);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ---------- мышь ----------

  private hitTest(x: number, y: number): Hit | null {
    if (y < RULER_H) return null;
    const ri = Math.floor((y - RULER_H) / ROW_H);
    const row = this.rows()[ri];
    if (!row) return null;
    const m = this.scene.manifest;
    const t = x / this.pxPerMs;
    const tol = 8 / this.pxPerMs; // 8px в мс

    const mk = (
      sel: Exclude<Selection, null>,
      startMs: number,
      endMs: number,
    ): Hit => {
      const xl = this.x(startMs);
      const xr = this.x(endMs);
      let mode: Hit['mode'] = 'move';
      if (x - xl <= EDGE) mode = 'resize-l';
      else if (xr - x <= EDGE) mode = 'resize-r';
      return { sel, mode, startMs, endMs };
    };

    if (row.kind === 'cues') {
      const cues = m.sceneCues ?? [];
      for (let i = cues.length - 1; i >= 0; i--) {
        if (Math.abs(cues[i].tMs - t) <= tol) {
          return { sel: { type: 'cue', i }, mode: 'move', startMs: cues[i].tMs, endMs: cues[i].tMs };
        }
      }
    } else if (row.kind === 'overlays') {
      const list = m.edit?.overlays ?? [];
      for (let i = list.length - 1; i >= 0; i--) {
        if (t >= list[i].startMs - tol && t <= list[i].endMs + tol) {
          return mk({ type: 'overlay', i }, list[i].startMs, list[i].endMs);
        }
      }
    } else if (row.kind === 'music') {
      const list = m.edit?.music ?? [];
      for (let i = list.length - 1; i >= 0; i--) {
        const buf = this.scene.music.get(list[i].file);
        const endMs = list[i].startMs + (buf ? buf.duration * 1000 : 10_000);
        if (t >= list[i].startMs - tol && t <= endMs + tol) {
          // у музыки ретаймится только старт (длина = длина файла)
          return { sel: { type: 'music', i }, mode: 'move', startMs: list[i].startMs, endMs };
        }
      }
    } else {
      for (let i = m.speakingEvents.length - 1; i >= 0; i--) {
        const ev = m.speakingEvents[i];
        if (ev.userId !== row.userId) continue;
        if (t >= ev.startMs - tol && t <= ev.endMs + tol) {
          return mk({ type: 'speech', i }, ev.startMs, ev.endMs);
        }
      }
    }
    return null;
  }

  private onDown(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const hit = this.hitTest(x, y);
    if (hit) {
      this.hooks.setSelection(hit.sel);
      this.drag = { kind: 'item', grabMs: this.ms(x), ...hit };
    } else {
      this.hooks.setSelection(null);
      this.hooks.setPlayhead(this.ms(x));
      this.drag = { kind: 'playhead' };
    }
  }

  private onMove(e: MouseEvent): void {
    if (!this.drag) return;
    const r = this.canvas.getBoundingClientRect();
    const t = this.ms(e.clientX - r.left);

    if (this.drag.kind === 'playhead') {
      this.hooks.setPlayhead(t);
      return;
    }

    const d = this.drag;
    const delta = t - d.grabMs;
    const dur = this.scene.manifest.durationMs;
    const sel = d.sel;

    if (sel.type === 'cue') {
      this.editor.updateCue(sel.i, { tMs: Math.round(clamp(d.startMs + delta, 0, dur)) });
      // после сортировки индекс мог поменяться — найдём cue заново по близости
      const cues = this.scene.manifest.sceneCues;
      const near = cues.reduce(
        (best, c, i) =>
          Math.abs(c.tMs - (d.startMs + delta)) < Math.abs(cues[best].tMs - (d.startMs + delta))
            ? i
            : best,
        0,
      );
      this.hooks.setSelection({ type: 'cue', i: near });
    } else if (sel.type === 'overlay') {
      const len = d.endMs - d.startMs;
      if (d.mode === 'move') {
        const s = Math.round(clamp(d.startMs + delta, 0, dur - len));
        this.editor.updateOverlay(sel.i, { startMs: s, endMs: s + len });
      } else if (d.mode === 'resize-l') {
        this.editor.updateOverlay(sel.i, {
          startMs: Math.round(clamp(d.startMs + delta, 0, d.endMs - 100)),
        });
      } else {
        this.editor.updateOverlay(sel.i, {
          endMs: Math.round(clamp(d.endMs + delta, d.startMs + 100, dur)),
        });
      }
    } else if (sel.type === 'music') {
      this.editor.updateMusic(sel.i, { startMs: Math.round(clamp(d.startMs + delta, 0, dur)) });
    } else if (sel.type === 'speech') {
      const ev = this.scene.manifest.speakingEvents[sel.i];
      if (!ev) return;
      if (d.mode === 'move') {
        const len = d.endMs - d.startMs;
        const s = Math.round(clamp(d.startMs + delta, 0, dur - len));
        this.applySpeech(sel.i, s, s + len, d);
      } else if (d.mode === 'resize-l') {
        this.applySpeech(sel.i, Math.round(clamp(d.startMs + delta, 0, d.endMs - 50)), d.endMs, d);
      } else {
        this.applySpeech(sel.i, d.startMs, Math.round(clamp(d.endMs + delta, d.startMs + 50, dur)), d);
      }
    }
    this.hooks.onEdited();
  }

  /** Ретайминг реплики с отслеживанием индекса после пересортировки. */
  private applySpeech(i: number, startMs: number, endMs: number, d: { sel: Exclude<Selection, null> }): void {
    const ev = this.scene.manifest.speakingEvents[i];
    const userId = ev.userId;
    this.editor.updateSpeakingEvent(i, { startMs, endMs });
    const list = this.scene.manifest.speakingEvents;
    const ni = list.findIndex((e) => e.userId === userId && e.startMs === startMs && e.endMs === endMs);
    if (ni >= 0) {
      d.sel = { type: 'speech', i: ni };
      this.hooks.setSelection(d.sel);
    }
  }

  private updateCursor(e: MouseEvent): void {
    if (this.drag) return;
    const r = this.canvas.getBoundingClientRect();
    const hit = this.hitTest(e.clientX - r.left, e.clientY - r.top);
    this.canvas.style.cursor = !hit
      ? 'default'
      : hit.mode === 'move'
        ? 'grab'
        : 'ew-resize';
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x + 7, y);
  ctx.lineTo(x, y + 7);
  ctx.lineTo(x - 7, y);
  ctx.closePath();
  ctx.fill();
}

function niceStep(pxPerMs: number): number {
  const steps = [1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000, 600000];
  for (const s of steps) if (s * pxPerMs >= 70) return s;
  return 600000;
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
