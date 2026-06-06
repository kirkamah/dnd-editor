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
  scene = await loadBundle(data);
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
  timeline.fitToWidth($('#timeline-scroll').clientWidth - 10);
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
    div.append(name, mute);
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

document.addEventListener('keydown', (e) => {
  if (!engine || !editor) return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  if (e.code === 'Space') {
    e.preventDefault();
    playBtn.click();
  } else if (e.code === 'KeyK' && (e.ctrlKey || e.metaKey)) {
    // Ctrl+K — разрезать выбранный клип по плейхеду
    e.preventDefault();
    if (!selection) return;
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
  } else if (e.code === 'Delete' && selection) {
    if (selection.type === 'cue') editor.removeCue(selection.i);
    else if (selection.type === 'overlay') editor.removeOverlay(selection.i);
    else if (selection.type === 'music') editor.removeMusic(selection.i);
    else if (selection.type === 'speech') editor.removeSpeakingEvent(selection.i);
    else return;
    engine.refreshMusic();
    setSelection(null);
    refreshAll();
  }
});

function loop(): void {
  if (scene && engine && renderer && timeline) {
    engine.tick();
    if (!engine.playing) playBtn.textContent = '▶';
    const tMs = engine.timeMs;
    renderer.render(stateAt(scene.manifest, tMs));
    previewEdit?.drawSelectionUI(previewCtx);
    timeline.draw();
    $('#timecode').textContent = `${fmtTime(tMs)} / ${fmtTime(scene.manifest.durationMs)}`;
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
