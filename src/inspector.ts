/**
 * Inspector: панель свойств выбранного элемента таймлайна/сцены.
 * Чистый DOM без фреймворков: rebuild() пересобирает форму под выбор.
 */
import type { LoadedScene } from './core/bundle-loader';
import type { EditorState } from './editor-state';
import type { Selection } from './timeline';
import { fmtTime } from './timeline';
import { t } from './i18n';

export interface InspectorHooks {
  playhead(): number;
  /** перерисовать всё после правки (превью, таймлайн, заголовки) */
  refresh(): void;
  /** правка затронула звук (gain/mute/музыка/клипы) */
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
      this.root.append(h('p', 'hint', t('hintInspector')));
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
      case 'scene':
        return this.sceneForm();
    }
  }

  // ---------- формы ----------

  private cueForm(i: number): void {
    const cue = this.scene.manifest.sceneCues?.[i];
    if (!cue) return;
    this.root.append(h('h3', '', `${t('sceneCueAt')} · ${fmtTime(cue.tMs)}`));
    this.root.append(
      this.msField(t('time'), cue.tMs, (v) => this.editor.updateCue(i, { tMs: v })),
      rangeField(t('bricksOpacity'), cue.bricksOpacity ?? 1, 0, 1, 0.01, (v) => {
        this.editor.updateCue(i, { bricksOpacity: v });
        this.hooks.refresh();
      }),
      numField(t('cueFade'), cue.fadeMs ?? 0, (v) => {
        this.editor.updateCue(i, { fadeMs: Math.max(0, v) });
        this.hooks.refresh();
      }),
      this.imagePicker(t('bgFromHere'), cue.background, async (path) => {
        this.editor.updateCue(i, { background: path ?? undefined });
        this.hooks.refresh();
        this.rebuild();
      }),
      dangerBtn(t('deleteCue'), () => {
        this.editor.removeCue(i);
        this.hooks.setSelection(null);
        this.hooks.refresh();
      }),
    );
  }

  private overlayForm(i: number): void {
    const ov = this.scene.manifest.edit?.overlays?.[i];
    if (!ov) return;
    this.root.append(h('h3', '', `${t('image')} · ${ov.image.split('/').pop()}`));
    const upd = (patch: Parameters<EditorState['updateOverlay']>[1]) => {
      this.editor.updateOverlay(i, patch);
      this.hooks.refresh();
    };
    this.root.append(
      this.msField(t('appear'), ov.startMs, (v) => upd({ startMs: v })),
      this.msField(t('disappear'), ov.endMs, (v) => upd({ endMs: v })),
      numField(t('posX'), ov.x, (v) => upd({ x: v })),
      numField(t('posY'), ov.y, (v) => upd({ y: v })),
      numField(t('width'), ov.w, (v) => upd({ w: v })),
      numField(t('height'), ov.h, (v) => upd({ h: v })),
      rangeField(t('opacity'), ov.opacity, 0, 1, 0.01, (v) => upd({ opacity: v })),
      this.layerPicker(ov.layer ?? 'default', (v) => {
        upd({ layer: v });
        this.rebuild();
      }),
      row(
        numField(t('fadeIn'), ov.fadeInMs ?? 0, (v) => upd({ fadeInMs: Math.max(0, v) })),
        numField(t('fadeOut'), ov.fadeOutMs ?? 0, (v) => upd({ fadeOutMs: Math.max(0, v) })),
      ),
      row(
        btn(`▲ ${t('moveUp')}`, () => {
          const ni = this.editor.moveOverlay(i, 1); // позже в списке = выше
          this.hooks.setSelection({ type: 'overlay', i: ni });
          this.hooks.refresh();
          this.rebuild();
        }),
        btn(`▼ ${t('moveDown')}`, () => {
          const ni = this.editor.moveOverlay(i, -1);
          this.hooks.setSelection({ type: 'overlay', i: ni });
          this.hooks.refresh();
          this.rebuild();
        }),
      ),
      dangerBtn(t('deleteImage'), () => {
        this.editor.removeOverlay(i);
        this.hooks.setSelection(null);
        this.hooks.refresh();
      }),
    );
  }

  /** Выбор плана картинки: за кирпичами / под портретами / над / поверх рамки. */
  private layerPicker(current: string, onPick: (v: 'back' | 'scene' | 'default' | 'front') => void) {
    const wrap = h('label', 'field', t('overlayLayer'));
    const sel = document.createElement('select');
    for (const v of ['back', 'scene', 'default', 'front'] as const) {
      sel.append(new Option(t(`layer_${v}`), v, false, v === current));
    }
    sel.onchange = () => onPick(sel.value as 'back' | 'scene' | 'default' | 'front');
    wrap.append(sel);
    return wrap;
  }

  private musicForm(i: number): void {
    const mu = this.scene.manifest.edit?.music?.[i];
    if (!mu) return;
    const buf = this.scene.music.get(mu.file);
    const srcStart = mu.srcStartMs ?? 0;
    const maxLen = buf ? buf.duration * 1000 - srcStart : 10_000;
    const endMs = Math.min(mu.endMs ?? mu.startMs + maxLen, mu.startMs + maxLen);
    this.root.append(
      h('h3', '', `${t('music')} · ${mu.file.split('/').pop()}`),
      h('p', 'hint', buf ? `${t('durationOf')}: ${fmtTime(buf.duration * 1000)}` : ''),
      this.msField(t('start'), mu.startMs, (v) => {
        this.editor.updateMusic(i, { startMs: v, endMs: v + (endMs - mu.startMs) });
        this.hooks.audioChanged();
      }),
      this.msField(t('end'), endMs, (v) => {
        this.editor.updateMusic(i, { endMs: v });
        this.hooks.audioChanged();
      }),
      rangeField(t('volume'), mu.gain, 0, 1.5, 0.01, (v) => {
        this.editor.updateMusic(i, { gain: v });
        this.hooks.audioChanged();
      }),
      dangerBtn(t('deleteMusic'), () => {
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
    this.root.append(h('h3', '', `${t('phrase')} · ${p?.characterName ?? ev.userId}`));
    const retime = (patch: { startMs?: number; endMs?: number }) => {
      const userId = ev.userId;
      const ns = patch.startMs ?? ev.startMs;
      const ne = patch.endMs ?? ev.endMs;
      this.editor.updateSpeakingEvent(i, patch);
      const ni = this.scene.manifest.speakingEvents.findIndex(
        (e) => e.userId === userId && e.startMs === ns && e.endMs === ne,
      );
      if (ni >= 0) this.hooks.setSelection({ type: 'speech', i: ni });
      this.hooks.audioChanged();
      this.hooks.refresh();
      this.rebuild();
    };
    this.root.append(
      this.msField(t('begin'), ev.startMs, (v) => retime({ startMs: v })),
      this.msField(t('end'), ev.endMs, (v) => retime({ endMs: v })),
      rangeField(t('phraseVolume'), ev.gain ?? 1, 0, 2, 0.01, (v) => {
        this.editor.updateSpeakingEvent(i, { gain: v, srcStartMs: ev.srcStartMs ?? ev.startMs });
        this.hooks.audioChanged();
      }),
      dangerBtn(t('deletePhrase'), () => {
        this.editor.removeSpeakingEvent(i);
        this.hooks.setSelection(null);
        this.hooks.audioChanged();
        this.hooks.refresh();
      }),
    );
  }

  private participantForm(userId: string): void {
    const p = this.scene.participants.find((x) => x.userId === userId);
    if (!p) return;
    const te = this.editor.trackEdit(userId);
    const box = this.editor.portraitBox(userId);
    const lay = this.scene.manifest.edit?.layout?.[userId];
    const layout = (patch: Parameters<EditorState['setPortraitLayout']>[1]) => {
      this.editor.setPortraitLayout(userId, patch);
      this.hooks.refresh();
    };
    this.root.append(
      h('h3', '', `${p.characterName} · ${p.displayName}`),
      textField(t('charName'), p.characterName, (v) => {
        p.characterName = v || p.characterName;
        this.editor.dirty = true;
        this.hooks.refresh();
      }),
      rangeField(t('trackVolume'), te.gain, 0, 2, 0.01, (v) => {
        this.editor.setTrack(userId, { gain: v });
        this.hooks.audioChanged();
      }),
      checkField(t('mute'), te.muted, (v) => {
        this.editor.setTrack(userId, { muted: v });
        this.hooks.audioChanged();
      }),
      row(
        numField(t('posX'), box.x, (v) => layout({ x: v })),
        numField(t('posY'), box.y, (v) => layout({ y: v })),
      ),
      row(
        numField(t('width'), box.w, (v) => layout({ w: v })),
        numField(t('height'), box.h, (v) => layout({ h: v })),
      ),
      checkField(t('hidePortrait'), box.hidden ?? false, (v) => layout({ hidden: v })),
      rangeField(
        t('cornerRadius'),
        lay?.radius ?? this.scene.manifest.edit?.style?.radius ?? 14,
        0,
        200,
        1,
        (v) => layout({ radius: v }),
      ),
      checkField(t('glowEnabled'), lay?.glow ?? true, (v) => layout({ glow: v })),
      colorField(t('glowColor'), lay?.glowColor ?? this.scene.manifest.edit?.style?.speakingColor ?? '#2FA37C', (v) =>
        layout({ glowColor: v }),
      ),
      rangeField(t('glowSize'), lay?.glowSize ?? 28, 0, 80, 1, (v) => layout({ glowSize: v })),
      btn(t('resetLayout'), () => {
        this.editor.resetPortraitLayout(userId);
        this.hooks.refresh();
        this.rebuild();
      }),
      this.artBtn(p, 'idle', `${t('replaceIdle')}…`),
      this.artBtn(p, 'speaking', `${t('replaceSpeaking')}…`),
      btn(`${t('uploadPlate')}…`, async () => {
        const fp = await native.openFileDialog(t('image'), ['png', 'jpg', 'jpeg', 'webp']);
        if (!fp) return;
        const bytes = new Uint8Array(await native.readFile(fp));
        await this.editor.setPlateFile(userId, fp.split(/[\\/]/).pop()!, bytes);
        this.hooks.refresh();
        this.rebuild();
      }),
      ...(this.scene.manifest.edit?.plates?.[userId]
        ? [
            h('p', 'hint', t('plateHint')),
            dangerBtn(t('removePlate'), () => {
              this.editor.removePlate(userId);
              this.hooks.refresh();
              this.rebuild();
            }),
          ]
        : []),
      btn(t('addPhraseAtPlayhead'), () => {
        this.editor.addSpeakingEvent(userId, Math.round(this.hooks.playhead()));
        this.hooks.audioChanged();
        this.hooks.refresh();
      }),
    );
  }

  /** Свойства сцены: слои (рамка/фон/кирпичи) и стиль обводки портретов. */
  private sceneForm(): void {
    this.root.append(h('h3', '', t('sceneProps')));

    const layerRow = (layer: 'frame' | 'background' | 'bricks', label: string) => {
      const wrap = h('label', 'field', label);
      const cur = this.scene.manifest.layers?.[layer];
      wrap.append(h('span', 'dir-label', cur ? cur.split('/').pop()! : t('notSet')));
      const rowEl = h('div', 'dir-row');
      rowEl.append(
        btn(`${t('uploadFile')}…`, async () => {
          const fp = await native.openFileDialog(label, ['png', 'jpg', 'jpeg', 'webp']);
          if (!fp) return;
          const bytes = new Uint8Array(await native.readFile(fp));
          await this.editor.setLayerFile(layer, fp.split(/[\\/]/).pop()!, bytes);
          this.hooks.refresh();
          this.rebuild();
        }),
      );
      if (cur) {
        rowEl.append(
          btn(t('removeFile'), () => {
            this.editor.removeLayer(layer);
            this.hooks.refresh();
            this.rebuild();
          }),
        );
      }
      wrap.append(rowEl);
      return wrap;
    };

    this.root.append(layerRow('frame', t('frameLayer')));

    // позиция/размер/замок рамки — если рамка загружена
    const fb = this.scene.manifest.edit?.frameBox;
    if (this.scene.manifest.layers?.frame && fb) {
      const setFb = (patch: Parameters<EditorState['setFrameBox']>[0]) => {
        this.editor.setFrameBox(patch);
        this.hooks.refresh();
      };
      this.root.append(
        row(
          numField(t('posX'), fb.x, (v) => setFb({ x: v })),
          numField(t('posY'), fb.y, (v) => setFb({ y: v })),
        ),
        row(
          numField(t('width'), fb.w, (v) => setFb({ w: v })),
          numField(t('height'), fb.h, (v) => setFb({ h: v })),
        ),
        checkField(`🔒 ${t('lockFrame')}`, fb.locked ?? false, (v) => {
          setFb({ locked: v });
          this.rebuild();
        }),
        h('p', 'hint', t('frameHint')),
      );
    }

    this.root.append(
      layerRow('background', t('bgLayer')),
      layerRow('bricks', t('bricksLayer')),
      h('p', 'hint', t('bricksHint')),
      h('h3', '', t('borderStyle')),
    );

    const style = this.scene.manifest.edit?.style ?? {};
    const setStyle = (patch: Parameters<EditorState['setStyle']>[0]) => {
      this.editor.setStyle(patch);
      this.hooks.refresh();
    };
    this.root.append(
      colorField(t('borderColor'), style.borderColor ?? '#39434f', (v) => setStyle({ borderColor: v })),
      colorField(t('speakingColor'), style.speakingColor ?? '#2FA37C', (v) => setStyle({ speakingColor: v })),
      rangeField(t('borderWidth'), style.borderWidth ?? 2, 0, 16, 1, (v) => setStyle({ borderWidth: v })),
      // до 200 — на больших портретах хватает до полного круга (рендер клампит min(w,h)/2)
      rangeField(t('cornerRadius'), style.radius ?? 14, 0, 200, 1, (v) => setStyle({ radius: v })),
      h('p', 'hint', t('radiusHint')),
    );
  }

  // ---------- помощники с контекстом ----------

  private artBtn(p: { characterId: string; userId: string }, kind: 'idle' | 'speaking', label: string) {
    return btn(label, async () => {
      const path = await native.openFileDialog(t('image'), ['png', 'jpg', 'jpeg', 'webp']);
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
    const toPh = btn(t('toPlayhead'), () => {
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
    sel.append(new Option(t('keepBg'), ''));
    for (const path of this.scene.rawFiles.keys()) {
      if (/\.(png|jpe?g|webp)$/i.test(path)) sel.append(new Option(path, path, false, path === current));
    }
    sel.onchange = () => onPick(sel.value || null);
    wrap.append(sel);
    wrap.append(
      btn(`${t('addFile')}…`, async () => {
        const fp = await native.openFileDialog(t('image'), ['png', 'jpg', 'jpeg', 'webp']);
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

function row(...children: HTMLElement[]): HTMLElement {
  const el = h('div', 'field-row');
  el.append(...children);
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

function colorField(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const wrap = h('label', 'field', label);
  const input = document.createElement('input');
  input.type = 'color';
  input.value = value;
  input.oninput = () => onChange(input.value);
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
  const wrap = h('label', 'field', `${label}: ${roundStep(value, step)}`);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.oninput = () => {
    wrap.firstChild!.textContent = `${label}: ${roundStep(Number(input.value), step)}`;
    onChange(Number(input.value));
  };
  wrap.append(input);
  return wrap;
}

function roundStep(v: number, step: number): string {
  return step >= 1 ? String(Math.round(v)) : v.toFixed(2);
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
