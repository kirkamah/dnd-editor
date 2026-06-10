/**
 * Timeline: canvas-таймлайн редактора.
 * Ряды: cues сцены (ромбы) → overlay-картинки → музыка → речь по участникам.
 * Мышь: клик по пустому — плейхед; клик по элементу — выбор; перетаскивание
 * блока — сдвиг во времени; за края блока — ретайминг начала/конца.
 *
 * Канвас виртуализирован: его ширина = видимая область, прокрутку задаёт
 * spacer-див, а отрисовка идёт со сдвигом scrollLeft. Поэтому зум не упирается
 * в предел ширины canvas, а минимальный зум — «вся запись по ширине окна»
 * (линейка никогда не отрывается от края). При сильном приближении на
 * линейке появляются доли секунд.
 */
import type { LoadedScene } from './core/bundle-loader';
import type { EditorState } from './editor-state';

export const RULER_H = 26;
export const ROW_H = 30;
const EDGE = 6; // зона захвата края блока, px
const PAD = 20; // запас справа от конца записи, px
const MAX_PX_PER_MS = 2; // максимальный зум (2000 px на секунду)
const SNAP_PX = 8; // радиус прилипания, px

export type Selection =
  | { type: 'cue'; i: number }
  | { type: 'overlay'; i: number }
  | { type: 'music'; i: number }
  | { type: 'speech'; i: number }
  | { type: 'participant'; userId: string }
  | { type: 'scene' }
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
  /** позиция звука в источнике на момент захвата (фразы и музыка) */
  srcMs?: number;
}

export interface TimelineHooks {
  getPlayhead(): number;
  setPlayhead(ms: number): void;
  getSelection(): Selection;
  setSelection(sel: Selection): void;
  /** вызывается после живой правки перетаскиванием */
  onEdited(): void;
  /** отпустили мышь после перетаскивания (пора перепланировать звук) */
  onDragEnd?(): void;
}

export class Timeline {
  private ctx: CanvasRenderingContext2D;
  pxPerMs = 0.02;
  private container: HTMLElement;
  private spacer: HTMLElement;
  /** точки прилипания, собранные в момент захвата */
  private snaps: number[] = [];
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
    this.spacer = canvas.parentElement as HTMLElement;
    this.container = this.spacer.parentElement as HTMLElement;
    canvas.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', () => {
      if (this.drag?.kind === 'item') this.hooks.onDragEnd?.();
      this.drag = null;
    });
    canvas.addEventListener('mousemove', (e) => this.updateCursor(e));
    // Ctrl/Alt+колесо — зум к курсору; просто колесо — горизонтальная прокрутка
    this.container.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.altKey) {
          e.preventDefault();
          const r = this.canvas.getBoundingClientRect();
          this.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left);
        } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          this.container.scrollLeft += e.deltaY;
        }
      },
      { passive: false },
    );
    // окно растянули/сжали — пересчитать минимальный зум и ширину канваса
    new ResizeObserver(() => {
      this.pxPerMs = clamp(this.pxPerMs, this.minPxPerMs(), MAX_PX_PER_MS);
      this.resize();
    }).observe(this.container);
  }

  private get scrollX(): number {
    return this.container.scrollLeft;
  }

  private viewW(): number {
    return this.container.clientWidth || 1;
  }

  /** минимальный зум: вся запись ровно по ширине видимой области */
  private minPxPerMs(): number {
    return Math.max(1e-6, (this.viewW() - PAD) / Math.max(1, this.scene.manifest.durationMs));
  }

  fitToWidth(): void {
    this.pxPerMs = this.minPxPerMs();
    this.resize();
    this.container.scrollLeft = 0;
  }

  /** Зум с фиксированной точкой: время под anchorPx (px от левого края видимой
   *  области) остаётся на месте. Без anchorPx — плейхед, если он виден, иначе центр. */
  zoom(mult: number, anchorPx?: number): void {
    const a = anchorPx ?? this.defaultAnchor();
    const t = (this.scrollX + a) / this.pxPerMs;
    this.pxPerMs = clamp(this.pxPerMs * mult, this.minPxPerMs(), MAX_PX_PER_MS);
    this.resize();
    this.container.scrollLeft = Math.max(0, t * this.pxPerMs - a);
  }

  private defaultAnchor(): number {
    const px = this.hooks.getPlayhead() * this.pxPerMs - this.scrollX;
    return px >= 0 && px <= this.viewW() ? px : this.viewW() / 2;
  }

  /** Подскроллить, чтобы момент ms оказался в видимой области (для хоткеев). */
  ensureVisible(ms: number): void {
    const px = ms * this.pxPerMs;
    if (px < this.scrollX + 4 || px > this.scrollX + this.viewW() - 4)
      this.container.scrollLeft = Math.max(0, px - this.viewW() / 2);
  }

  /** Постраничное следование за плейхедом при воспроизведении (как в Premiere). */
  followPlayhead(): void {
    const px = this.hooks.getPlayhead() * this.pxPerMs;
    if (px > this.scrollX + this.viewW() - 2 || px < this.scrollX)
      this.container.scrollLeft = Math.max(0, px - 40);
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
    const total = Math.ceil(this.scene.manifest.durationMs * this.pxPerMs) + PAD;
    this.spacer.style.width = `${total}px`;
    this.spacer.style.height = `${this.height()}px`;
    const w = Math.min(total, this.viewW());
    this.canvas.width = w;
    this.canvas.height = this.height();
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${this.height()}px`;
  }

  private x(ms: number): number {
    return ms * this.pxPerMs - this.scrollX;
  }

  private ms(x: number): number {
    return Math.max(0, Math.min(this.scene.manifest.durationMs, (x + this.scrollX) / this.pxPerMs));
  }

  // ---------- отрисовка ----------

  draw(): void {
    const { ctx, canvas } = this;
    const m = this.scene.manifest;
    const sel = this.hooks.getSelection();
    const css = getComputedStyle(document.body);
    const rowA = css.getPropertyValue('--row-a') || '#10141a';
    const rowB = css.getPropertyValue('--row-b') || '#0e1116';
    const panel2 = css.getPropertyValue('--panel2') || '#161b22';
    const muted = css.getPropertyValue('--muted') || '#6b7886';

    ctx.fillStyle = rowB;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // линейка: рисуем только видимый диапазон; при сильном зуме — доли секунд
    ctx.fillStyle = panel2;
    ctx.fillRect(0, 0, canvas.width, RULER_H);
    const stepMs = niceStep(this.pxPerMs);
    const decimals = stepMs >= 1000 ? 0 : stepMs >= 100 ? 1 : stepMs >= 10 ? 2 : 3;
    const tEnd = Math.min(m.durationMs, this.ms(canvas.width));
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui';
    ctx.textBaseline = 'middle';
    // мелкие промежуточные деления (1/5 шага) — как в AE
    const sub = stepMs / 5;
    if (sub * this.pxPerMs >= 5) {
      const s0 = Math.floor(this.scrollX / this.pxPerMs / sub) * sub;
      for (let t = s0; t <= tEnd; t += sub) ctx.fillRect(this.x(t), RULER_H - 3, 1, 3);
    }
    const t0 = Math.floor(this.scrollX / this.pxPerMs / stepMs) * stepMs;
    for (let t = t0; t <= tEnd; t += stepMs) {
      const px = this.x(t);
      ctx.fillRect(px, RULER_H - 7, 1, 7);
      ctx.fillText(fmtTime(t, decimals), px + 3, RULER_H / 2);
    }

    const rows = this.rows();
    rows.forEach((row, ri) => {
      const y = RULER_H + ri * ROW_H;
      ctx.fillStyle = ri % 2 ? rowA : rowB;
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
          const selected = sel?.type === 'music' && sel.i === i;
          this.block(mu.startMs, Math.min(this.musicEnd(mu), m.durationMs), y, '#7c5cff', selected);
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
    if (x + w < 0 || x > this.canvas.width) return; // за пределами видимого
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

  // ---------- прилипание ----------

  /** Все края клипов/ключей + начало/конец записи (+ плейхед для блоков). */
  private collectSnaps(except?: Exclude<Selection, null>): number[] {
    const m = this.scene.manifest;
    const out: number[] = [0, m.durationMs];
    if (except) out.push(this.hooks.getPlayhead());
    (m.sceneCues ?? []).forEach((c, i) => {
      if (!(except?.type === 'cue' && except.i === i)) out.push(c.tMs);
    });
    (m.edit?.overlays ?? []).forEach((o, i) => {
      if (!(except?.type === 'overlay' && except.i === i)) out.push(o.startMs, o.endMs);
    });
    (m.edit?.music ?? []).forEach((mu, i) => {
      if (!(except?.type === 'music' && except.i === i)) out.push(mu.startMs, this.musicEnd(mu));
    });
    m.speakingEvents.forEach((ev, i) => {
      if (!(except?.type === 'speech' && except.i === i)) out.push(ev.startMs, ev.endMs);
    });
    return out;
  }

  /** Сдвиг к ближайшей точке прилипания (или 0, если рядом ничего нет). */
  private snapAdjust(edges: number[]): number {
    const tol = SNAP_PX / this.pxPerMs;
    let best: number | null = null;
    for (const e of edges)
      for (const s of this.snaps) {
        const d = s - e;
        if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
    return best ?? 0;
  }

  // ---------- мышь ----------

  private hitTest(x: number, y: number): Hit | null {
    if (y < RULER_H) return null;
    const ri = Math.floor((y - RULER_H) / ROW_H);
    const row = this.rows()[ri];
    if (!row) return null;
    const m = this.scene.manifest;
    const t = this.ms(x);
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
        const endMs = this.musicEnd(list[i]);
        if (t >= list[i].startMs - tol && t <= endMs + tol) {
          const hit = mk({ type: 'music', i }, list[i].startMs, endMs);
          hit.srcMs = list[i].srcStartMs ?? 0;
          return hit;
        }
      }
    } else {
      for (let i = m.speakingEvents.length - 1; i >= 0; i--) {
        const ev = m.speakingEvents[i];
        if (ev.userId !== row.userId) continue;
        if (t >= ev.startMs - tol && t <= ev.endMs + tol) {
          const hit = mk({ type: 'speech', i }, ev.startMs, ev.endMs);
          hit.srcMs = ev.srcStartMs ?? ev.startMs;
          return hit;
        }
      }
    }
    return null;
  }

  /** Конец музыкального окна с учётом endMs/srcStartMs и длины файла. */
  musicEnd(mu: { file: string; startMs: number; endMs?: number; srcStartMs?: number }): number {
    const buf = this.scene.music.get(mu.file);
    const srcStart = mu.srcStartMs ?? 0;
    const maxLen = buf ? buf.duration * 1000 - srcStart : 10_000;
    return Math.min(mu.endMs ?? mu.startMs + maxLen, mu.startMs + maxLen);
  }

  private onDown(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const hit = this.hitTest(x, y);
    if (hit) {
      this.hooks.setSelection(hit.sel);
      this.snaps = this.collectSnaps(hit.sel);
      this.drag = { kind: 'item', grabMs: this.ms(x), ...hit };
    } else {
      this.hooks.setSelection(null);
      this.snaps = this.collectSnaps();
      this.hooks.setPlayhead(this.ms(x));
      this.drag = { kind: 'playhead' };
    }
  }

  private onMove(e: MouseEvent): void {
    if (!this.drag) return;
    // авто-прокрутка, когда тянем за край видимой области
    const rc = this.container.getBoundingClientRect();
    if (e.clientX > rc.right - 16) this.container.scrollLeft += Math.min(40, e.clientX - (rc.right - 16));
    else if (e.clientX < rc.left + 16) this.container.scrollLeft -= Math.min(40, rc.left + 16 - e.clientX);

    const r = this.canvas.getBoundingClientRect();
    let t = this.ms(e.clientX - r.left);

    if (this.drag.kind === 'playhead') {
      // Shift — прилипание плейхеда к краям клипов
      if (e.shiftKey) t += this.snapAdjust([t]);
      this.hooks.setPlayhead(t);
      return;
    }

    const d = this.drag;
    let delta = t - d.grabMs;
    const dur = this.scene.manifest.durationMs;
    const sel = d.sel;

    // прилипание двигаемого края к краям соседей и плейхеду (Alt — отключить)
    if (!e.altKey) {
      const edges =
        d.mode === 'resize-l'
          ? [d.startMs + delta]
          : d.mode === 'resize-r'
            ? [d.endMs + delta]
            : [d.startMs + delta, d.endMs + delta];
      delta += this.snapAdjust(edges);
    }

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
      const len = d.endMs - d.startMs;
      const srcGrab = d.srcMs ?? 0;
      if (d.mode === 'move') {
        const s = Math.round(clamp(d.startMs + delta, 0, dur - Math.min(len, dur)));
        this.editor.updateMusic(sel.i, { startMs: s, endMs: s + len, srcStartMs: srcGrab });
      } else if (d.mode === 'resize-l') {
        // подрезка головы: вместе с краем сдвигается и точка в файле
        const dd = Math.round(clamp(delta, -srcGrab, len - 100));
        this.editor.updateMusic(sel.i, {
          startMs: Math.round(clamp(d.startMs + dd, 0, d.endMs - 100)),
          srcStartMs: srcGrab + dd,
        });
      } else {
        const buf = this.scene.music.get(this.scene.manifest.edit!.music![sel.i].file);
        const maxEnd = buf ? d.startMs + buf.duration * 1000 - srcGrab : dur;
        this.editor.updateMusic(sel.i, {
          endMs: Math.round(clamp(d.endMs + delta, d.startMs + 100, Math.min(dur, maxEnd))),
        });
      }
    } else if (sel.type === 'speech') {
      const ev = this.scene.manifest.speakingEvents[sel.i];
      if (!ev) return;
      const srcGrab = d.srcMs ?? d.startMs;
      if (d.mode === 'move') {
        // переезд клипа целиком: звук едет за блоком (src не меняется)
        const len = d.endMs - d.startMs;
        const s = Math.round(clamp(d.startMs + delta, 0, dur - len));
        this.applySpeech(sel.i, { startMs: s, endMs: s + len, srcStartMs: srcGrab }, d);
      } else if (d.mode === 'resize-l') {
        // подрезка головы: srcStartMs сдвигается на ту же величину
        const dd = Math.round(clamp(delta, -srcGrab, d.endMs - d.startMs - 50));
        this.applySpeech(
          sel.i,
          { startMs: Math.round(clamp(d.startMs + dd, 0, d.endMs - 50)), endMs: d.endMs, srcStartMs: srcGrab + dd },
          d,
        );
      } else {
        this.applySpeech(
          sel.i,
          { startMs: d.startMs, endMs: Math.round(clamp(d.endMs + delta, d.startMs + 50, dur)), srcStartMs: srcGrab },
          d,
        );
      }
    }
    this.hooks.onEdited();
  }

  /** Ретайминг реплики с отслеживанием индекса после пересортировки. */
  private applySpeech(
    i: number,
    patch: { startMs: number; endMs: number; srcStartMs: number },
    d: { sel: Exclude<Selection, null> },
  ): void {
    const ev = this.scene.manifest.speakingEvents[i];
    const userId = ev.userId;
    this.editor.updateSpeakingEvent(i, patch);
    const list = this.scene.manifest.speakingEvents;
    const ni = list.findIndex(
      (e) => e.userId === userId && e.startMs === patch.startMs && e.endMs === patch.endMs,
    );
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
  const steps = [
    10, 20, 50, 100, 200, 500, // доли секунды — видны при сильном зуме
    1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000, 600000,
  ];
  for (const s of steps) if (s * pxPerMs >= 70) return s;
  return 600000;
}

/** mm:ss, с decimals>0 — с долями секунды (mm:ss.D / mm:ss.DD / mm:ss.DDD). */
export function fmtTime(ms: number, decimals = 0): string {
  const total = Math.max(0, Math.round(ms));
  const mm = Math.floor(total / 60000);
  const rest = total - mm * 60000;
  const ss = Math.floor(rest / 1000);
  const base = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  if (decimals <= 0) return base;
  const frac = Math.floor((rest - ss * 1000) / 10 ** (3 - decimals));
  return `${base}.${String(frac).padStart(decimals, '0')}`;
}
