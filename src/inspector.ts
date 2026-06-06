/**
 * Inspector: панель свойств выбранного элемента таймлайна.
 * Чистый DOM без фреймворков: rebuild() пересобирает форму под выбор.
 */
import type { LoadedScene } from './core/bundle-loader';
import type { EditorState } from './editor-state';
import type { Selection } from './timeline';
import { fmtTime } from './timeline';

export interface InspectorHooks {
  playhead(): number;
  /** перерисовать всё после правки (превью, таймлайн, заголовки) */
  refresh(): void;
  /** правка затронула звук (gain/mute/музыка) */
  audioChanged(): void;
  selection(): Selection;
  setSelection(sel: Selection): void;
}

export class Inspector {
  constructor(
    private root: HTMLElement,
    private scene: LoadedScene,
    private editor: EditorState,
    private hooks: InspectorHooks,
  ) {}

  rebuild(): void {
    const sel = this.hooks.selection();
    this.root.replaceChildren();
    if (!sel) {
      this.root.append(
        h('p', 'hint', 'Кликни элемент на таймлайне или участника слева — здесь появятся его свойства.'),
      );
      return;
    }
    switch (sel.type) {
      case 'cue':
        return this.cueForm(sel.i);
      case 'overlay':
        return this.overlayForm(sel.i);
      case 'music':
        return this.musicForm(sel.i);
      case 'speech':
        return this.speechForm(sel.i);
      case 'participant':
        return this.participantForm(sel.userId);
    }
  }

  // ---------- формы ----------

  private cueForm(i: number): void {
    const cue = this.scene.manifest.sceneCues?.[i];
    if (!cue) return;
    this.root.append(h('h3', '', `Ключ сцены · ${fmtTime(cue.tMs)}`));
    this.root.append(
      this.msField('Время', cue.tMs, (v) => this.editor.updateCue(i, { tMs: v })),
      rangeField('Прозрачность кирпичей', cue.bricksOpacity ?? 1, 0, 1, 0.01, (v) => {
        this.editor.updateCue(i, { bricksOpacity: v });
        this.hooks.refresh();
      }),
      this.imagePicker('Фон с этого момента', cue.background, async (path) => {
        this.editor.updateCue(i, { background: path ?? undefined });
        this.hooks.refresh();
        this.rebuild();
      }),
      dangerBtn('Удалить ключ', () => {
        this.editor.removeCue(i);
        this.hooks.setSelection(null);
        this.hooks.refresh();
      }),
    );
  }

  private overlayForm(i: number): void {
    const ov = this.scene.manifest.edit?.overlays?.[i];
    if (!ov) return;
    this.root.append(h('h3', '', `Картинка · ${ov.image.split('/').pop()}`));
    const upd = (patch: Parameters<EditorState['updateOverlay']>[1]) => {
      this.editor.updateOverlay(i, patch);
      this.hooks.refresh();
    };
    this.root.append(
      this.msField('Появление', ov.startMs, (v) => upd({ startMs: v })),
      this.msField('Исчезание', ov.endMs, (v) => upd({ endMs: v })),
      numField('X', ov.x, (v) => upd({ x: v })),
      numField('Y', ov.y, (v) => upd({ y: v })),
      numField('Ширина', ov.w, (v) => upd({ w: v })),
      numField('Высота', ov.h, (v) => upd({ h: v })),
      rangeField('Прозрачность', ov.opacity, 0, 1, 0.01, (v) => upd({ opacity: v })),
      dangerBtn('Удалить картинку', () => {
        this.editor.removeOverlay(i);
        this.hooks.setSelection(null);
        this.hooks.refresh();
      }),
    );
  }

  private musicForm(i: number): void {
    const mu = this.scene.manifest.edit?.music?.[i];
    if (!mu) return;
    const buf = this.scene.music.get(mu.file);
    this.root.append(
      h('h3', '', `Музыка · ${mu.file.split('/').pop()}`),
      h('p', 'hint', buf ? `Длительность ${fmtTime(buf.duration * 1000)}` : ''),
      this.msField('Старт', mu.startMs, (v) => {
        this.editor.updateMusic(i, { startMs: v });
        this.hooks.audioChanged();
      }),
      rangeField('Громкость', mu.gain, 0, 1.5, 0.01, (v) => {
        this.editor.updateMusic(i, { gain: v });
        this.hooks.audioChanged();
      }),
      dangerBtn('Удалить музыку', () => {
        this.editor.removeMusic(i);
        this.hooks.setSelection(null);
        this.hooks.audioChanged();
        this.hooks.refresh();
      }),
    );
  }

  private speechForm(i: number): void {
    const ev = this.scene.manifest.speakingEvents[i];
    if (!ev) return;
    const p = this.scene.participants.find((x) => x.userId === ev.userId);
    this.root.append(h('h3', '', `Реплика · ${p?.characterName ?? ev.userId}`));
    const retime = (patch: { startMs?: number; endMs?: number }) => {
      const userId = ev.userId;
      const ns = patch.startMs ?? ev.startMs;
      const ne = patch.endMs ?? ev.endMs;
      this.editor.updateSpeakingEvent(i, patch);
      const ni = this.scene.manifest.speakingEvents.findIndex(
        (e) => e.userId === userId && e.startMs === ns && e.endMs === ne,
      );
      if (ni >= 0) this.hooks.setSelection({ type: 'speech', i: ni });
      this.hooks.refresh();
      this.rebuild();
    };
    this.root.append(
      this.msField('Начало', ev.startMs, (v) => retime({ startMs: v })),
      this.msField('Конец', ev.endMs, (v) => retime({ endMs: v })),
      dangerBtn('Удалить реплику', () => {
        this.editor.removeSpeakingEvent(i);
        this.hooks.setSelection(null);
        this.hooks.refresh();
      }),
    );
  }

  private participantForm(userId: string): void {
    const p = this.scene.participants.find((x) => x.userId === userId);
    if (!p) return;
    const te = this.editor.trackEdit(userId);
    this.root.append(
      h('h3', '', `${p.characterName} · ${p.displayName}`),
      textField('Имя персонажа', p.characterName, (v) => {
        p.characterName = v || p.characterName;
        this.editor.dirty = true;
        this.hooks.refresh();
      }),
      rangeField('Громкость дорожки', te.gain, 0, 2, 0.01, (v) => {
        this.editor.setTrack(userId, { gain: v });
        this.hooks.audioChanged();
      }),
      checkField('Мьют', te.muted, (v) => {
        this.editor.setTrack(userId, { muted: v });
        this.hooks.audioChanged();
      }),
      this.artBtn(p, 'idle', 'Заменить арт (молчит)…'),
      this.artBtn(p, 'speaking', 'Заменить арт (говорит)…'),
      btn('+ Реплика на плейхеде', () => {
        this.editor.addSpeakingEvent(userId, Math.round(this.hooks.playhead()));
        this.hooks.refresh();
      }),
    );
  }

  // ---------- помощники с контекстом ----------

  private artBtn(p: { characterId: string; userId: string }, kind: 'idle' | 'speaking', label: string) {
    return btn(label, async () => {
      const path = await native.openFileDialog('Картинка', ['png', 'jpg', 'jpeg', 'webp']);
      if (!path) return;
      const bytes = new Uint8Array(await native.readFile(path));
      await this.editor.replaceArt(
        this.scene.participants.find((x) => x.userId === p.userId)!,
        kind,
        path.split(/[\\/]/).pop()!,
        bytes,
      );
      this.hooks.refresh();
    });
  }

  private msField(label: string, value: number, onChange: (v: number) => void): HTMLElement {
    const wrap = numField(label, Math.round(value), onChange);
    const toPh = btn('⟵ плейхед', () => {
      onChange(Math.round(this.hooks.playhead()));
      this.hooks.refresh();
      this.rebuild();
    });
    toPh.classList.add('mini');
    wrap.append(toPh);
    return wrap;
  }

  private imagePicker(
    label: string,
    current: string | undefined,
    onPick: (path: string | null) => void,
  ): HTMLElement {
    const wrap = h('label', 'field', label);
    const sel = document.createElement('select');
    sel.append(new Option('— не менять —', ''));
    for (const path of this.scene.rawFiles.keys()) {
      if (/\.(png|jpe?g|webp)$/i.test(path)) sel.append(new Option(path, path, false, path === current));
    }
    sel.onchange = () => onPick(sel.value || null);
    wrap.append(sel);
    wrap.append(
      btn('Добавить файл…', async () => {
        const fp = await native.openFileDialog('Картинка фона', ['png', 'jpg', 'jpeg', 'webp']);
        if (!fp) return;
        const bytes = new Uint8Array(await native.readFile(fp));
        const path = await this.editor.addImageFile(fp.split(/[\\/]/).pop()!, bytes);
        onPick(path);
      }),
    );
    return wrap;
  }
}

// ---------- DOM-помощники ----------

function h(tag: string, cls: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function dangerBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = btn(label, onClick);
  b.classList.add('danger');
  return b;
}

function numField(label: string, value: number, onChange: (v: number) => void): HTMLElement {
  const wrap = h('label', 'field', label);
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.onchange = () => onChange(Number(input.value));
  wrap.append(input);
  return wrap;
}

function textField(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const wrap = h('label', 'field', label);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.onchange = () => onChange(input.value);
  wrap.append(input);
  return wrap;
}

function rangeField(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
): HTMLElement {
  const wrap = h('label', 'field', `${label}: ${value.toFixed(2)}`);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.oninput = () => {
    wrap.firstChild!.textContent = `${label}: ${Number(input.value).toFixed(2)}`;
    onChange(Number(input.value));
  };
  wrap.append(input);
  return wrap;
}

function checkField(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrap = h('label', 'field check', label);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.onchange = () => onChange(input.checked);
  wrap.prepend(input);
  return wrap;
}
