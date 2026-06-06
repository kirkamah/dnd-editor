import { loadBundle, type LoadedScene } from './core/bundle-loader';
import { SceneRenderer, SCENE_W, SCENE_H } from './core/scene-renderer';
import { stateAt } from './core/scene-state';
import { AudioEngine } from './audio-engine';
import { EditorState } from './editor-state';
import { Timeline, fmtTime, ROW_H, RULER_H, type Selection } from './timeline';
import { Inspector } from './inspector';
import { runExport, type ExportKind } from './export';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`нет элемента ${sel}`);
  return el;
};

// ---------- состояние приложения ----------

let scene: LoadedScene | null = null;
let editor: EditorState | null = null;
let engine: AudioEngine | null = null;
let renderer: SceneRenderer | null = null;
let timeline: Timeline | null = null;
let inspector: Inspector | null = null;
let selection: Selection = null;
let bundlePath: string | null = null;

const previewCanvas = $<HTMLCanvasElement>('#preview');
previewCanvas.width = SCENE_W;
previewCanvas.height = SCENE_H;
const previewCtx = previewCanvas.getContext('2d')!;

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
    setSelection: (sel) => {
      selection = sel;
      inspector!.rebuild();
    },
    onEdited: () => {
      inspector!.rebuild();
    },
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
  add('Сцена (ключи)');
  add('Картинки');
  add('Музыка');

  for (const p of scene.participants) {
    const div = add('', 'participant');
    const name = document.createElement('button');
    name.className = 'name';
    name.textContent = p.slot === 'master' ? `👑 ${p.characterName}` : p.characterName;
    name.title = 'Свойства участника';
    name.onclick = () => {
      selection = { type: 'participant', userId: p.userId };
      inspector!.rebuild();
    };
    const te = editor.trackEdit(p.userId);
    const mute = document.createElement('button');
    mute.className = `mute ${te.muted ? 'on' : ''}`;
    mute.textContent = 'M';
    mute.title = 'Мьют дорожки';
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
  if (!engine) return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    playBtn.click();
  } else if (e.code === 'Delete' && selection && editor) {
    if (selection.type === 'cue') editor.removeCue(selection.i);
    else if (selection.type === 'overlay') editor.removeOverlay(selection.i);
    else if (selection.type === 'music') {
      editor.removeMusic(selection.i);
      engine.refreshMusic();
    } else if (selection.type === 'speech') editor.removeSpeakingEvent(selection.i);
    else return;
    selection = null;
    inspector!.rebuild();
    refreshAll();
  }
});

function loop(): void {
  if (scene && engine && renderer && timeline) {
    engine.tick();
    if (!engine.playing) playBtn.textContent = '▶';
    const t = engine.timeMs;
    renderer.render(stateAt(scene.manifest, t));
    timeline.draw();
    $('#timecode').textContent = `${fmtTime(t)} / ${fmtTime(scene.manifest.durationMs)}`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- тулбар ----------

$('#open-btn').onclick = () => void openBundle();
$('#open-btn2').onclick = () => void openBundle();

$('#save-btn').onclick = async () => {
  if (!editor || !bundlePath) return;
  const data = editor.saveBundle();
  await native.writeFile(bundlePath, data.slice().buffer as ArrayBuffer);
  updateTitle();
  toast(`Сохранено: ${bundlePath}`);
};

$('#saveas-btn').onclick = async () => {
  if (!editor) return;
  const path = await native.saveBundleDialog(bundlePath ?? 'session.dndsession');
  if (!path) return;
  const data = editor.saveBundle();
  await native.writeFile(path, data.slice().buffer as ArrayBuffer);
  bundlePath = path;
  updateTitle();
  toast(`Сохранено: ${path}`);
};

$('#add-cue-btn').onclick = () => {
  if (!editor || !engine || !scene) return;
  const tMs = Math.round(engine.timeMs);
  const cur = stateAt(scene.manifest, tMs);
  editor.addCue({ tMs, bricksOpacity: cur.bricksOpacity });
  selection = { type: 'cue', i: scene.manifest.sceneCues.findIndex((c) => c.tMs === tMs) };
  inspector!.rebuild();
};

$('#add-music-btn').onclick = async () => {
  if (!editor || !engine) return;
  const path = await native.openFileDialog('Музыка', ['mp3', 'wav', 'ogg', 'flac', 'm4a']);
  if (!path) return;
  const bytes = new Uint8Array(await native.readFile(path));
  await editor.addMusic(path.split(/[\\/]/).pop()!, bytes, Math.round(engine.timeMs));
  engine.refreshMusic();
  selection = { type: 'music', i: (scene!.manifest.edit?.music?.length ?? 1) - 1 };
  inspector!.rebuild();
};

$('#add-overlay-btn').onclick = async () => {
  if (!editor || !engine) return;
  const path = await native.openFileDialog('Картинка', ['png', 'jpg', 'jpeg', 'webp']);
  if (!path) return;
  const bytes = new Uint8Array(await native.readFile(path));
  await editor.addOverlay(path.split(/[\\/]/).pop()!, bytes, Math.round(engine.timeMs));
  selection = { type: 'overlay', i: (scene!.manifest.edit?.overlays?.length ?? 1) - 1 };
  inspector!.rebuild();
};

$('#zoom-in').onclick = () => timeline?.zoom(1.5);
$('#zoom-out').onclick = () => timeline?.zoom(1 / 1.5);

// ---------- экспорт ----------

let cancelExport = false;

$('#export-btn').onclick = () => $('#export-modal').classList.remove('hidden');
$('#export-close').onclick = () => $('#export-modal').classList.add('hidden');
$('#export-cancel').onclick = () => (cancelExport = true);

for (const [btnId, kind] of [
  ['export-video', 'video'],
  ['export-ae', 'ae'],
  ['export-both', 'both'],
] as Array<[string, ExportKind]>) {
  $(btnId ? `#${btnId}` : '').onclick = async () => {
    if (!scene || !engine) return;
    const outDir = await native.pickDirDialog('Папка для экспорта');
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
      label.textContent = `Готово: ${files.length} файлов`;
      toast(`Экспорт завершён: ${outDir}`);
      await native.showInFolder(files[0]);
    } catch (e) {
      label.textContent = `Ошибка: ${(e as Error).message}`;
    } finally {
      $('#export-choices').classList.remove('hidden');
      $('#export-progress').classList.toggle('hidden', !cancelExport && false);
    }
  };
}

// ---------- мелочи ----------

function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}

void (async () => {
  const v = await native.ffmpegCheck();
  $('#ffmpeg-status').textContent = v ? `ffmpeg: ок` : 'ffmpeg НЕ НАЙДЕН — экспорт не сработает';
  if (!v) $('#ffmpeg-status').classList.add('bad');
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
