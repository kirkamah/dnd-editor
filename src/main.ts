import { loadBundle, type LoadedScene } from './core/bundle-loader';
import { SceneRenderer, SCENE_W, SCENE_H } from './core/scene-renderer';
import { stateAt } from './core/scene-state';
import { AudioEngine } from './audio-engine';
import { EditorState } from './editor-state';
import { Timeline, fmtTime, ROW_H, RULER_H, type Selection } from './timeline';
import { Inspector } from './inspector';
import { PreviewEdit } from './preview-edit';
import { runExport, type ExportKind } from './export';
import { applyStatic, t } from './i18n';
import { loadSettings, applyTheme, buildSettingsModal } from './settings';
import { IS_TRIAL, TRIAL_MAX_DURATION_MS } from './trial';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`нет элемента ${sel}`);
  return el;
};

// ---------- настройки и язык ----------

const settings = loadSettings();
applyTheme(settings.theme);

function applyLanguage(): void {
  applyStatic();
  $('#welcome-sub').textContent = t('welcomeSub');
  buildHeaders();
  inspector?.rebuild();
}

// ---------- состояние приложения ----------

let scene: LoadedScene | null = null;
let editor: EditorState | null = null;
let engine: AudioEngine | null = null;
let renderer: SceneRenderer | null = null;
let timeline: Timeline | null = null;
let inspector: Inspector | null = null;
let previewEdit: PreviewEdit | null = null;
let selection: Selection = null;
let bundlePath: string | null = null;

const previewCanvas = $<HTMLCanvasElement>('#preview');
previewCanvas.width = SCENE_W;
previewCanvas.height = SCENE_H;
const previewCtx = previewCanvas.getContext('2d')!;

function setSelection(sel: Selection): void {
  selection = sel;
  inspector?.rebuild();
}

// ---------- открытие ----------

async function openBundle(givenPath?: string): Promise<void> {
  const path = givenPath ?? (await native.openBundleDialog());
  if (!path) return;
  const data = await native.readFile(path);
  const loaded = await loadBundle(data);
  // Пробная версия: открываем только записи не длиннее 1 часа.
  if (IS_TRIAL && loaded.manifest.durationMs > TRIAL_MAX_DURATION_MS) {
    toast(t('trialTooLong'));
    return;
  }
  scene = loaded;
  bundlePath = path;
  editor = new EditorState(scene);
  engine = new AudioEngine(scene);
  renderer = new SceneRenderer(previewCtx, scene);
  selection = null;

  timeline = new Timeline($<HTMLCanvasElement>('#timeline'), scene, editor, {
    getPlayhead: () => engine!.timeMs,
    setPlayhead: (ms) => engine!.seek(ms),
    getSelection: () => selection,
    setSelection,
    onEdited: () => inspector!.rebuild(),
    onDragEnd: () => engine!.refreshMusic(), // перепланировать клипы после перетаскивания
  });
  inspector = new Inspector($('#inspector'), scene, editor, {
    playhead: () => engine!.timeMs,
    refresh: refreshAll,
    audioChanged: () => {
      engine!.applyGains();
      engine!.refreshMusic();
      buildHeaders();
    },
    selection: () => selection,
    setSelection: (sel) => (selection = sel),
  });
  previewEdit = new PreviewEdit(previewCanvas, scene, editor, {
    playhead: () => engine!.timeMs,
    selection: () => selection,
    setSelection,
    onEdited: () => {
      renderer!.refresh();
      inspector!.rebuild();
    },
  });

  $('#welcome').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  timeline.fitToWidth();
  buildHeaders();
  inspector.rebuild();
  updateTitle();
}

function refreshAll(): void {
  renderer?.refresh();
  buildHeaders();
  updateTitle();
}

function updateTitle(): void {
  const name = bundlePath?.split(/[\\/]/).pop() ?? '';
  document.title = `DnD Editor — ${name}${editor?.dirty ? ' *' : ''}`;
}

// ---------- заголовки рядов таймлайна ----------

function buildHeaders(): void {
  if (!scene || !editor) return;
  const host = $('#track-headers');
  host.replaceChildren();
  host.style.paddingTop = `${RULER_H}px`;

  const add = (label: string, cls = '') => {
    const div = document.createElement('div');
    div.className = `track-header ${cls}`;
    div.style.height = `${ROW_H}px`;
    div.textContent = label;
    host.append(div);
    return div;
  };
  const sceneHeader = add(t('rowScene'), 'clickable');
  sceneHeader.title = t('sceneProps');
  sceneHeader.onclick = () => setSelection({ type: 'scene' });
  add(t('rowImages'));
  add(t('rowMusic'));

  for (const p of scene.participants) {
    const div = add('', 'participant');
    const name = document.createElement('button');
    name.className = 'name';
    name.textContent = p.slot === 'master' ? `👑 ${p.characterName}` : p.characterName;
    name.onclick = () => setSelection({ type: 'participant', userId: p.userId });
    div.append(name);
    // Пробная версия: громкость голоса участника не меняется — мьют скрыт.
    if (!IS_TRIAL) {
      const te = editor.trackEdit(p.userId);
      const mute = document.createElement('button');
      mute.className = `mute ${te.muted ? 'on' : ''}`;
      mute.textContent = 'M';
      mute.title = t('mute');
      mute.onclick = () => {
        editor!.setTrack(p.userId, { muted: !editor!.trackEdit(p.userId).muted });
        engine!.applyGains();
        buildHeaders();
        if (selection?.type === 'participant') inspector!.rebuild();
      };
      div.append(mute);
    }
  }
}

// ---------- транспорт и цикл ----------

const playBtn = $<HTMLButtonElement>('#play-btn');
playBtn.onclick = () => {
  if (!engine) return;
  if (engine.playing) engine.pause();
  else void engine.play();
  playBtn.textContent = engine.playing ? '⏸' : '▶';
};

// ---------- хоткеи (раскладка в духе AE/Premiere, список — кнопка ⌨) ----------

const FRAME_MS = 1000 / 30; // экспорт идёт в 30 fps — шаг «кадра»

function clampT(ms: number): number {
  return Math.max(0, Math.min(scene?.manifest.durationMs ?? 0, ms));
}

/** Перейти к моменту и подскроллить таймлайн. */
function seekTo(ms: number): void {
  if (!engine) return;
  engine.seek(clampT(ms));
  timeline?.ensureVisible(engine.timeMs);
}

/** Все монтажные точки: края клипов всех рядов + ключи + начало/конец. */
function editPoints(): number[] {
  const m = scene!.manifest;
  const pts = new Set<number>([0, m.durationMs]);
  (m.sceneCues ?? []).forEach((c) => pts.add(c.tMs));
  (m.edit?.overlays ?? []).forEach((o) => {
    pts.add(o.startMs);
    pts.add(o.endMs);
  });
  (m.edit?.music ?? []).forEach((mu) => {
    pts.add(mu.startMs);
    pts.add(timeline!.musicEnd(mu));
  });
  m.speakingEvents.forEach((ev) => {
    pts.add(ev.startMs);
    pts.add(ev.endMs);
  });
  return [...pts].sort((a, b) => a - b);
}

/** Границы выбранного клипа (для I/O и [ ]). */
function selBounds(): { start: number; end: number } | null {
  if (!scene || !selection) return null;
  const m = scene.manifest;
  if (selection.type === 'cue') {
    const c = m.sceneCues?.[selection.i];
    return c ? { start: c.tMs, end: c.tMs } : null;
  }
  if (selection.type === 'overlay') {
    const o = m.edit?.overlays?.[selection.i];
    return o ? { start: o.startMs, end: o.endMs } : null;
  }
  if (selection.type === 'music') {
    const mu = m.edit?.music?.[selection.i];
    return mu ? { start: mu.startMs, end: timeline!.musicEnd(mu) } : null;
  }
  if (selection.type === 'speech') {
    const ev = m.speakingEvents[selection.i];
    return ev ? { start: ev.startMs, end: ev.endMs } : null;
  }
  return null;
}

/** Начало/конец фразы у плейхеда — fallback для I/O без выделения. */
function phraseEdge(dir: 'start' | 'end'): number | null {
  const evs = scene!.manifest.speakingEvents;
  const tNow = engine!.timeMs;
  if (dir === 'end') {
    const inside = evs.find((ev) => tNow >= ev.startMs && tNow < ev.endMs - 1);
    if (inside) return inside.endMs;
    const next = evs.filter((ev) => ev.startMs > tNow).sort((a, b) => a.startMs - b.startMs)[0];
    return next ? next.endMs : null;
  }
  const inside = [...evs].reverse().find((ev) => tNow > ev.startMs + 1 && tNow <= ev.endMs);
  if (inside) return inside.startMs;
  const prev = evs.filter((ev) => ev.endMs < tNow).sort((a, b) => b.endMs - a.endMs)[0];
  return prev ? prev.startMs : null;
}

/** Сдвинуть выбранный клип целиком на deltaMs (Alt+стрелки, [ и ]). */
function shiftSelected(deltaMs: number): void {
  if (!selection || !editor || !scene) return;
  const m = scene.manifest;
  const dur = m.durationMs;
  if (selection.type === 'cue') {
    const c = m.sceneCues?.[selection.i];
    if (!c) return;
    editor.updateCue(selection.i, { tMs: Math.round(clampT(c.tMs + deltaMs)) });
    setSelection({ type: 'cue', i: m.sceneCues.indexOf(c) });
  } else if (selection.type === 'overlay') {
    const o = m.edit?.overlays?.[selection.i];
    if (!o) return;
    const len = o.endMs - o.startMs;
    const s = Math.round(Math.max(0, Math.min(dur - len, o.startMs + deltaMs)));
    editor.updateOverlay(selection.i, { startMs: s, endMs: s + len });
  } else if (selection.type === 'music') {
    const mu = m.edit?.music?.[selection.i];
    if (!mu) return;
    const len = timeline!.musicEnd(mu) - mu.startMs;
    const s = Math.round(Math.max(0, Math.min(dur - Math.min(len, dur), mu.startMs + deltaMs)));
    editor.updateMusic(selection.i, { startMs: s, endMs: s + len, srcStartMs: mu.srcStartMs ?? 0 });
  } else if (selection.type === 'speech') {
    const ev = m.speakingEvents[selection.i];
    if (!ev) return;
    const len = ev.endMs - ev.startMs;
    const s = Math.round(Math.max(0, Math.min(dur - len, ev.startMs + deltaMs)));
    // звук едет за блоком целиком
    editor.updateSpeakingEvent(selection.i, {
      startMs: s,
      endMs: s + len,
      srcStartMs: ev.srcStartMs ?? ev.startMs,
    });
    setSelection({ type: 'speech', i: m.speakingEvents.indexOf(ev) });
  } else return;
  engine?.refreshMusic();
  inspector?.rebuild();
}

/** Подрезать начало/конец выбранного клипа до плейхеда (Alt+[ / Alt+]). */
function trimSelected(edge: 'l' | 'r'): void {
  if (!selection || !editor || !scene || !engine) return;
  const at = Math.round(engine.timeMs);
  const m = scene.manifest;
  if (selection.type === 'overlay') {
    const o = m.edit?.overlays?.[selection.i];
    if (!o) return;
    if (edge === 'l' && at < o.endMs - 100) editor.updateOverlay(selection.i, { startMs: at });
    else if (edge === 'r' && at > o.startMs + 100) editor.updateOverlay(selection.i, { endMs: at });
    else return;
  } else if (selection.type === 'music') {
    const mu = m.edit?.music?.[selection.i];
    if (!mu) return;
    const src = mu.srcStartMs ?? 0;
    const end = timeline!.musicEnd(mu);
    if (edge === 'l' && at < end - 100 && at >= mu.startMs - src) {
      // голова: точка в файле сдвигается вместе с краем
      editor.updateMusic(selection.i, { startMs: at, srcStartMs: src + (at - mu.startMs) });
    } else if (edge === 'r' && at > mu.startMs + 100) {
      const buf = scene.music.get(mu.file);
      const maxEnd = buf ? mu.startMs + buf.duration * 1000 - src : at;
      editor.updateMusic(selection.i, { endMs: Math.min(at, maxEnd) });
    } else return;
  } else if (selection.type === 'speech') {
    const ev = m.speakingEvents[selection.i];
    if (!ev) return;
    // подрезка головы: srcStartMs пересчитается в updateSpeakingEvent
    if (edge === 'l' && at < ev.endMs - 50) editor.updateSpeakingEvent(selection.i, { startMs: at });
    else if (edge === 'r' && at > ev.startMs + 50) editor.updateSpeakingEvent(selection.i, { endMs: at });
    else return;
    setSelection({ type: 'speech', i: m.speakingEvents.indexOf(ev) });
  } else return;
  engine.refreshMusic();
  inspector?.rebuild();
}

/** Разрезать выбранный клип по плейхеду (Ctrl+K / Ctrl+Shift+D). */
function splitSelected(): void {
  if (!selection || !editor || !engine) return;
  const at = Math.round(engine.timeMs);
  let ni: number | null = null;
  if (selection.type === 'speech') {
    ni = editor.splitSpeech(selection.i, at);
    if (ni !== null) setSelection({ type: 'speech', i: ni });
  } else if (selection.type === 'music') {
    ni = editor.splitMusic(selection.i, at);
    if (ni !== null) setSelection({ type: 'music', i: ni });
  } else if (selection.type === 'overlay') {
    ni = editor.splitOverlay(selection.i, at);
    if (ni !== null) setSelection({ type: 'overlay', i: ni });
  }
  if (ni !== null) {
    engine.refreshMusic();
    refreshAll();
  }
}

function deleteSelected(): void {
  if (!selection || !editor || !engine) return;
  if (selection.type === 'cue') editor.removeCue(selection.i);
  else if (selection.type === 'overlay') editor.removeOverlay(selection.i);
  else if (selection.type === 'music') editor.removeMusic(selection.i);
  else if (selection.type === 'speech') editor.removeSpeakingEvent(selection.i);
  else return;
  engine.refreshMusic();
  setSelection(null);
  refreshAll();
}

document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const ctrl = e.ctrlKey || e.metaKey;

  // список хоткеев и Esc работают всегда
  if (e.code === 'F1' || e.key === '?') {
    e.preventDefault();
    openHotkeys();
    return;
  }
  if (e.code === 'Escape') {
    for (const id of ['hotkeys-modal', 'export-modal', 'settings-modal']) {
      const modal = $(`#${id}`);
      if (!modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
        return;
      }
    }
    setSelection(null);
    return;
  }
  if (!engine || !editor || !scene) return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      playBtn.click();
      break;

    // -- навигация --
    case 'Home':
      e.preventDefault();
      seekTo(0);
      break;
    case 'End':
      e.preventDefault();
      seekTo(scene.manifest.durationMs);
      break;
    case 'ArrowLeft':
    case 'ArrowRight': {
      e.preventDefault();
      const dir = e.code === 'ArrowRight' ? 1 : -1;
      if (e.altKey) {
        // Alt — двигаем выбранный клип, а не плейхед
        shiftSelected(dir * (e.shiftKey ? 1000 : FRAME_MS));
        break;
      }
      if (ctrl) seekTo(engine.timeMs + dir * 60_000);
      else if (e.shiftKey) seekTo(engine.timeMs + dir * 1000);
      else seekTo((Math.round(engine.timeMs / FRAME_MS) + dir) * FRAME_MS); // по сетке кадров
      break;
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      e.preventDefault();
      const tNow = engine.timeMs;
      const pts = editPoints();
      const target =
        e.code === 'ArrowDown'
          ? pts.find((p) => p > tNow + 1)
          : [...pts].reverse().find((p) => p < tNow - 1);
      if (target !== undefined) seekTo(target);
      break;
    }
    case 'KeyI': {
      e.preventDefault();
      const target = selBounds()?.start ?? phraseEdge('start');
      if (target !== null && target !== undefined) seekTo(target);
      break;
    }
    case 'KeyO': {
      if (ctrl) {
        e.preventDefault();
        void openBundle();
        break;
      }
      e.preventDefault();
      const target = selBounds()?.end ?? phraseEdge('end');
      if (target !== null && target !== undefined) seekTo(target);
      break;
    }

    // -- монтаж --
    case 'BracketLeft': {
      e.preventDefault();
      if (e.altKey) trimSelected('l');
      else {
        const b = selBounds();
        if (b) shiftSelected(Math.round(engine.timeMs) - b.start);
      }
      break;
    }
    case 'BracketRight': {
      e.preventDefault();
      if (e.altKey) trimSelected('r');
      else {
        const b = selBounds();
        if (b) shiftSelected(Math.round(engine.timeMs) - b.end);
      }
      break;
    }
    case 'KeyK':
      if (ctrl) {
        e.preventDefault();
        splitSelected();
      }
      break;
    case 'KeyD':
      if (ctrl && e.shiftKey) {
        // Ctrl+Shift+D — как в AE
        e.preventDefault();
        splitSelected();
      }
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      deleteSelected();
      break;
    case 'KeyM':
      e.preventDefault();
      $('#add-cue-btn').click();
      break;

    // -- вид --
    case 'Equal':
    case 'NumpadAdd':
      e.preventDefault();
      timeline?.zoom(1.5);
      break;
    case 'Minus':
    case 'NumpadSubtract':
      e.preventDefault();
      timeline?.zoom(1 / 1.5);
      break;
    case 'Backslash':
      e.preventDefault();
      timeline?.fitToWidth();
      break;

    // -- файл --
    case 'KeyS':
      if (ctrl) {
        e.preventDefault();
        $(e.shiftKey ? '#saveas-btn' : '#save-btn').click();
      }
      break;
  }
});

// ---------- модалка со списком хоткеев ----------

function hotkeyGroups(): Array<{ title: string; rows: Array<[string, string]> }> {
  return [
    {
      title: t('hkTransport'),
      rows: [
        ['Space', t('hkPlay')],
        ['Home / End', t('hkHomeEnd')],
        ['← / →', t('hkFrame')],
        ['Shift+← / →', t('hkSecond')],
        ['Ctrl+← / →', t('hkMinute')],
        ['↑ / ↓', t('hkEditPoint')],
        ['I / O', t('hkInOut')],
      ],
    },
    {
      title: t('hkEdit'),
      rows: [
        ['Ctrl+K / Ctrl+Shift+D', t('hkSplit')],
        ['Delete / Backspace', t('hkDelete')],
        ['[ / ]', t('hkAlign')],
        ['Alt+[ / Alt+]', t('hkTrim')],
        ['Alt+← / →', t('hkNudge')],
        ['M', t('hkMarker')],
        ['Esc', t('hkDeselect')],
      ],
    },
    {
      title: t('hkView'),
      rows: [
        ['= / −', t('hkZoom')],
        ['\\', t('hkFit')],
        [t('hkWheelKeys'), t('hkWheel')],
        [t('hkDrag'), t('hkSnapDrag')],
      ],
    },
    {
      title: t('hkFile'),
      rows: [
        ['Ctrl+S / Ctrl+Shift+S', t('hkSave')],
        ['Ctrl+O', t('hkOpen')],
        ['F1 / ?', t('hkHelp')],
      ],
    },
  ];
}

function openHotkeys(): void {
  const body = $('#hotkeys-body');
  body.replaceChildren();
  for (const g of hotkeyGroups()) {
    const h = document.createElement('h3');
    h.textContent = g.title;
    body.append(h);
    const grid = document.createElement('div');
    grid.className = 'hk-grid';
    for (const [keys, desc] of g.rows) {
      const k = document.createElement('div');
      k.className = 'hk-keys';
      keys.split(' / ').forEach((combo, idx) => {
        if (idx) k.append(' / ');
        const kb = document.createElement('kbd');
        kb.textContent = combo;
        k.append(kb);
      });
      const d = document.createElement('div');
      d.className = 'hk-desc';
      d.textContent = desc;
      grid.append(k, d);
    }
    body.append(grid);
  }
  $('#hotkeys-modal').classList.remove('hidden');
}

$('#hotkeys-btn').onclick = openHotkeys;
$('#hotkeys-close').onclick = () => $('#hotkeys-modal').classList.add('hidden');

function loop(): void {
  if (scene && engine && renderer && timeline) {
    engine.tick();
    if (!engine.playing) playBtn.textContent = '▶';
    const tMs = engine.timeMs;
    renderer.render(stateAt(scene.manifest, tMs));
    previewEdit?.drawSelectionUI(previewCtx);
    if (engine.playing) timeline.followPlayhead();
    timeline.draw();
    // сотые секунды — точный таймкод для монтажа
    $('#timecode').textContent = `${fmtTime(tMs, 2)} / ${fmtTime(scene.manifest.durationMs)}`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- тулбар ----------

$('#open-btn').onclick = () => void openBundle();
$('#open-btn2').onclick = () => void openBundle();
$('#scene-btn').onclick = () => setSelection({ type: 'scene' });

$('#save-btn').onclick = async () => {
  if (!editor || !bundlePath) return;
  const data = editor.saveBundle();
  await native.writeFile(bundlePath, data.slice().buffer as ArrayBuffer);
  updateTitle();
  toast(`${t('saved')}: ${bundlePath}`);
};

$('#saveas-btn').onclick = async () => {
  if (!editor) return;
  const path = await native.saveBundleDialog(bundlePath ?? 'session.dndsession');
  if (!path) return;
  const data = editor.saveBundle();
  await native.writeFile(path, data.slice().buffer as ArrayBuffer);
  bundlePath = path;
  updateTitle();
  toast(`${t('saved')}: ${path}`);
};

$('#add-cue-btn').onclick = () => {
  if (!editor || !engine || !scene) return;
  const tMs = Math.round(engine.timeMs);
  const cur = stateAt(scene.manifest, tMs);
  editor.addCue({ tMs, bricksOpacity: cur.bricksOpacity });
  setSelection({ type: 'cue', i: scene.manifest.sceneCues.findIndex((c) => c.tMs === tMs) });
};

$('#add-music-btn').onclick = async () => {
  if (!editor || !engine) return;
  const path = await native.openFileDialog(t('music'), ['mp3', 'wav', 'ogg', 'flac', 'm4a']);
  if (!path) return;
  const bytes = new Uint8Array(await native.readFile(path));
  await editor.addMusic(path.split(/[\\/]/).pop()!, bytes, Math.round(engine.timeMs));
  engine.refreshMusic();
  setSelection({ type: 'music', i: (scene!.manifest.edit?.music?.length ?? 1) - 1 });
};

$('#add-overlay-btn').onclick = async () => {
  if (!editor || !engine) return;
  const path = await native.openFileDialog(t('image'), ['png', 'jpg', 'jpeg', 'webp']);
  if (!path) return;
  const bytes = new Uint8Array(await native.readFile(path));
  await editor.addOverlay(path.split(/[\\/]/).pop()!, bytes, Math.round(engine.timeMs));
  setSelection({ type: 'overlay', i: (scene!.manifest.edit?.overlays?.length ?? 1) - 1 });
};

$('#zoom-in').onclick = () => timeline?.zoom(1.5);
$('#zoom-out').onclick = () => timeline?.zoom(1 / 1.5);
$('#zoom-fit').onclick = () => timeline?.fitToWidth();

// ---------- настройки ----------

$('#settings-btn').onclick = () => {
  buildSettingsModal($('#settings-body'), settings, applyLanguage);
  $('#settings-modal').classList.remove('hidden');
};
$('#settings-close').onclick = () => $('#settings-modal').classList.add('hidden');

// ---------- экспорт ----------

let cancelExport = false;

$('#export-btn').onclick = () => {
  $('#export-choices').classList.remove('hidden');
  $('#export-progress').classList.add('hidden');
  $('#export-modal').classList.remove('hidden');
};
$('#export-close').onclick = () => $('#export-modal').classList.add('hidden');
$('#export-cancel').onclick = () => (cancelExport = true);

async function resolveExportDir(): Promise<string | null> {
  if (settings.exportDir) {
    // подпапка с именем сессии и временем — экспорт не затирает прошлый
    const name = (bundlePath?.split(/[\\/]/).pop() ?? 'session').replace(/\.dndsession$/i, '');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = `${settings.exportDir}\\${name}-${stamp}`;
    await native.mkdir(dir);
    return dir;
  }
  return native.pickDirDialog(t('exportFolder'));
}

for (const [btnId, kind] of [
  ['export-video', 'video'],
  ['export-ae', 'ae'],
  ['export-both', 'both'],
] as Array<[string, ExportKind]>) {
  $(`#${btnId}`).onclick = async () => {
    if (!scene || !engine) return;
    const outDir = await resolveExportDir();
    if (!outDir) return;
    cancelExport = false;
    $('#export-choices').classList.add('hidden');
    $('#export-progress').classList.remove('hidden');
    const bar = $<HTMLProgressElement>('#export-bar');
    const label = $('#export-phase');
    try {
      const files = await runExport({
        scene,
        engine,
        outDir,
        kind,
        onProgress: (p) => {
          label.textContent = `${p.phase}… ${p.total ? Math.round((p.done / p.total) * 100) : 0}%`;
          bar.max = p.total || 1;
          bar.value = p.done;
        },
        isCancelled: () => cancelExport,
      });
      label.textContent = `${t('exportDone')}: ${files.length} ${t('files')}`;
      toast(`${t('exportDone')}: ${outDir}`);
      await native.showInFolder(files[0]);
    } catch (e) {
      label.textContent = `${t('error')}: ${(e as Error).message}`;
    }
  };
}

// ---------- мелочи ----------

function toast(msg: string): void {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

applyLanguage();

// ---------- пробная версия ----------

if (IS_TRIAL) {
  document.title = 'DnD Editor Trial';
  // нельзя добавлять свою музыку
  $('#add-music-btn').style.display = 'none';
  // заметная пометка в тулбаре
  const badge = document.createElement('span');
  badge.className = 'trial-badge';
  badge.textContent = t('trialBadge');
  badge.title = t('trialAboutNote');
  $('#topbar').append(badge);
}

void (async () => {
  const v = await native.ffmpegCheck();
  const text = v ? t('ffmpegOk') : t('ffmpegMissing');
  $('#ffmpeg-status').textContent = text;
  if (!v) {
    $('#ffmpeg-status').classList.add('bad');
    $('#ffmpeg-status-w').textContent = text;
  }
})();

// ---------- хуки для автотестов (scripts/verify-editor.mjs) ----------

declare global {
  interface Window {
    __test: Record<string, unknown>;
  }
}
window.__test = {
  openBundle: (p: string) => openBundle(p),
  manifest: () => scene?.manifest,
  seek: (ms: number) => engine?.seek(ms),
  select: (sel: Selection) => setSelection(sel),
  addMusic: async (p: string) => {
    const bytes = new Uint8Array(await native.readFile(p));
    await editor!.addMusic(p.split(/[\\/]/).pop()!, bytes, Math.round(engine!.timeMs));
    engine!.refreshMusic();
  },
  addOverlay: async (p: string) => {
    const bytes = new Uint8Array(await native.readFile(p));
    await editor!.addOverlay(p.split(/[\\/]/).pop()!, bytes, Math.round(engine!.timeMs));
  },
  addCue: (cue: { tMs: number; bricksOpacity?: number }) => editor!.addCue(cue),
  setTrack: (userId: string, patch: { gain?: number; muted?: boolean }) => {
    editor!.setTrack(userId, patch);
    engine!.applyGains();
  },
  splitSpeech: (i: number, atMs: number) => editor!.splitSpeech(i, atMs),
  splitMusic: (i: number, atMs: number) => editor!.splitMusic(i, atMs),
  setPortraitLayout: (userId: string, patch: Record<string, number | boolean>) => {
    editor!.setPortraitLayout(userId, patch);
    renderer!.refresh();
  },
  setPhraseGain: (i: number, gain: number) => {
    const ev = scene!.manifest.speakingEvents[i];
    editor!.updateSpeakingEvent(i, { gain, srcStartMs: ev.srcStartMs ?? ev.startMs });
    engine!.refreshMusic();
  },
  setStyle: (patch: Record<string, string | number>) => {
    editor!.setStyle(patch);
  },
  setLayerFromPath: async (layer: 'frame' | 'background' | 'bricks', p: string) => {
    const bytes = new Uint8Array(await native.readFile(p));
    await editor!.setLayerFile(layer, p.split(/[\\/]/).pop()!, bytes);
    renderer!.refresh();
  },
  setFrameBox: (patch: Record<string, number | boolean>) => editor!.setFrameBox(patch),
  updateOverlay: (i: number, patch: Record<string, unknown>) => editor!.updateOverlay(i, patch),
  setPlateFromPath: async (userId: string, p: string) => {
    const bytes = new Uint8Array(await native.readFile(p));
    await editor!.setPlateFile(userId, p.split(/[\\/]/).pop()!, bytes);
    renderer!.refresh();
  },
  addTextPlate: (userId: string) => editor!.addTextPlate(userId),
  setPlateBox: (userId: string, patch: Record<string, string | number | boolean>) =>
    editor!.setPlateBox(userId, patch as Parameters<EditorState['setPlateBox']>[1]),
  save: async (p: string) => {
    const data = editor!.saveBundle();
    await native.writeFile(p, data.slice().buffer as ArrayBuffer);
  },
  export: (outDir: string, kind: ExportKind) =>
    runExport({
      scene: scene!,
      engine: engine!,
      outDir,
      kind,
      onProgress: () => {},
      isCancelled: () => false,
    }),
};
