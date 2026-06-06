/**
 * Экспорт: финальный mp4 и/или «проект под After Effects».
 * Кадры рисует SceneRenderer (30 fps), сырые RGBA уходят пайпом в ffmpeg
 * через IPC. Звук сводится OfflineAudioContext'ом в WAV.
 *
 * AE-режим: AE не открывает .dndsession, поэтому сцена раскладывается на
 * стандартные ассеты: мультитрек WAV + статичные слои PNG + динамические
 * слои (портреты, overlay) ProRes 4444 с альфа-каналом.
 */
import type { LoadedScene } from './core/bundle-loader';
import { SceneRenderer, SCENE_W, SCENE_H, type LayerName } from './core/scene-renderer';
import { stateAt } from './core/scene-state';
import { AudioEngine, encodeWavMono16 } from './audio-engine';
import { fmtTime } from './timeline';
import { t } from './i18n';

export const FPS = 30;

export type ExportKind = 'video' | 'ae' | 'both';

export interface ExportProgress {
  phase: string;
  done: number;
  total: number;
}

export interface ExportJob {
  scene: LoadedScene;
  engine: AudioEngine;
  outDir: string;
  kind: ExportKind;
  onProgress: (p: ExportProgress) => void;
  isCancelled: () => boolean;
}

export async function runExport(job: ExportJob): Promise<string[]> {
  const produced: string[] = [];
  if (job.kind === 'video' || job.kind === 'both') {
    produced.push(await exportVideo(job));
  }
  if (job.kind === 'ae' || job.kind === 'both') {
    produced.push(...(await exportAE(job)));
  }
  return produced;
}

// ---------- общий рендер кадров в ffmpeg-пайп ----------

async function streamFrames(
  job: ExportJob,
  ffArgs: string[],
  phase: string,
  layers: ReadonlySet<LayerName> | null, // null = вся сцена
): Promise<void> {
  const { scene } = job;
  const canvas = document.createElement('canvas');
  canvas.width = SCENE_W;
  canvas.height = SCENE_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const renderer = new SceneRenderer(ctx, scene);

  const totalFrames = Math.ceil((scene.manifest.durationMs / 1000) * FPS);
  const id = await native.ffmpegStart(ffArgs);
  try {
    for (let f = 0; f < totalFrames; f++) {
      if (job.isCancelled()) {
        await native.ffmpegKill(id);
        throw new Error(t('exportCancelled'));
      }
      const tMs = (f / FPS) * 1000;
      const state = stateAt(scene.manifest, tMs);
      renderer.render(state, layers ? { layers, transparent: true } : {});
      const px = ctx.getImageData(0, 0, SCENE_W, SCENE_H);
      await native.ffmpegWrite(id, px.data.buffer as ArrayBuffer);
      if (f % 10 === 0) job.onProgress({ phase, done: f, total: totalFrames });
    }
  } catch (e) {
    await native.ffmpegKill(id).catch(() => {});
    throw e;
  }
  const { code, stderr } = await native.ffmpegClose(id);
  if (code !== 0) throw new Error(`ffmpeg (${phase}) завершился с кодом ${code}:\n${stderr}`);
}

const RAW_IN = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${SCENE_W}x${SCENE_H}`, '-r', String(FPS), '-i', 'pipe:0'];

// ---------- финальное видео ----------

async function exportVideo(job: ExportJob): Promise<string> {
  job.onProgress({ phase: t('mixingAudio'), done: 0, total: 1 });
  const mixWav = await job.engine.renderMixWav();
  const tmp = await native.tempDir();
  const mixPath = `${tmp}\\mix.wav`;
  await native.writeFile(mixPath, mixWav);

  const out = `${job.outDir}\\session.mp4`;
  await streamFrames(
    job,
    [
      '-y',
      ...RAW_IN,
      '-i', mixPath,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest',
      out,
    ],
    t('renderingVideo'),
    null,
  );
  return out;
}

// ---------- проект под After Effects ----------

async function exportAE(job: ExportJob): Promise<string[]> {
  const { scene } = job;
  const m = scene.manifest;
  const dir = job.outDir;
  const produced: string[] = [];
  await native.mkdir(`${dir}\\audio`);
  await native.mkdir(`${dir}\\layers`);

  // 1. Мультитрек: каждый участник отдельным WAV (исходный звук, без гейнов —
  //    громкость крутится в AE; применённые в редакторе значения — в README).
  job.onProgress({ phase: t('participantTracks'), done: 0, total: scene.participants.length });
  let n = 0;
  for (const p of scene.participants) {
    const samples = scene.audio.get(p.userId)!;
    const path = `${dir}\\audio\\${safe(p.characterName)}-${p.userId}.wav`;
    await native.writeFile(path, encodeWavMono16(samples));
    produced.push(path);
    job.onProgress({ phase: t('participantTracks'), done: ++n, total: scene.participants.length });
  }

  // 2. Музыка отдельными WAV (конвертация ffmpeg'ом из исходного формата)
  const tmp = await native.tempDir();
  const musicList = m.edit?.music ?? [];
  for (let i = 0; i < musicList.length; i++) {
    const entry = musicList[i];
    const raw = scene.rawFiles.get(entry.file);
    if (!raw) continue;
    const ext = entry.file.slice(entry.file.lastIndexOf('.'));
    const tmpIn = `${tmp}\\music-${i}${ext}`;
    await native.writeFile(tmpIn, raw.slice().buffer as ArrayBuffer);
    const out = `${dir}\\audio\\music-${i + 1}-${safe(entry.file.split('/').pop()!)}.wav`;
    const r = await native.ffmpegRun(['-y', '-i', tmpIn, '-ar', '48000', out]);
    if (r.code !== 0) throw new Error(`ffmpeg (музыка): ${r.stderr}`);
    produced.push(out);
  }

  // 3. Статичные слои — PNG как есть из бандла
  const staticLayers: Array<[string, string | undefined]> = [
    ['bricks', m.layers?.bricks],
    ['frame', m.layers?.frame],
  ];
  // фоны: стартовый + все из cues
  const backgrounds = new Set<string>();
  if (m.layers?.background) backgrounds.add(m.layers.background);
  for (const cue of m.sceneCues ?? []) if (cue.background) backgrounds.add(cue.background);
  let bi = 0;
  for (const bg of backgrounds) staticLayers.push([`background-${++bi}-${safe(bg.split('/').pop()!)}`, bg]);

  for (const [name, ref] of staticLayers) {
    if (!ref) continue;
    const raw = scene.rawFiles.get(ref);
    if (!raw) continue;
    const ext = ref.slice(ref.lastIndexOf('.')) || '.png';
    const path = `${dir}\\layers\\${name}${name.includes('.') ? '' : ext}`;
    await native.writeFile(path, raw.slice().buffer as ArrayBuffer);
    produced.push(path);
  }

  // 4. Динамические слои с альфой — ProRes 4444
  const prores = (out: string) => [
    '-y',
    ...RAW_IN,
    '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
    out,
  ];
  const portraitsOut = `${dir}\\layers\\portraits.mov`;
  await streamFrames(job, prores(portraitsOut), t('portraitsLayer'), new Set(['portraits']));
  produced.push(portraitsOut);

  if ((m.edit?.overlays ?? []).length > 0) {
    const overlaysOut = `${dir}\\layers\\overlays.mov`;
    await streamFrames(job, prores(overlaysOut), t('overlaysLayer'), new Set(['overlays']));
    produced.push(overlaysOut);
  }

  // 5. README экспорта
  const readmePath = `${dir}\\README-export.txt`;
  await native.writeFile(readmePath, new TextEncoder().encode(buildReadme(scene)).buffer as ArrayBuffer);
  produced.push(readmePath);

  return produced;
}

function buildReadme(scene: LoadedScene): string {
  const m = scene.manifest;
  const lines: string[] = [];
  const L = (s = '') => lines.push(s);

  L('ЭКСПОРТ D&D-СЕССИИ ДЛЯ AFTER EFFECTS');
  L('=====================================');
  L();
  L(`Сессия:        ${m.sessionId}`);
  L(`Записана:      ${m.recordedAt}`);
  L(`Длительность:  ${fmtTime(m.durationMs)} (${m.durationMs} мс)`);
  L(`Разрешение:    ${SCENE_W}x${SCENE_H}`);
  L(`Частота кадров: ${FPS} fps`);
  L(`Звук:          WAV PCM, 48000 Гц`);
  L();
  L('КАК СОБРАТЬ КОМПОЗИЦИЮ');
  L('-----------------------');
  L(`1. Новая композиция ${SCENE_W}x${SCENE_H}, ${FPS} fps, длительность ${fmtTime(m.durationMs)}.`);
  L('2. Слои снизу вверх:');
  L('   - layers/background-*.png  (фон; времена переключения — ниже)');
  L('   - layers/bricks.png        (кирпичи; ключи прозрачности — ниже)');
  L('   - layers/frame.png         (рамка, если есть)');
  L('   - layers/portraits.mov     (портреты с альфой — уже анимированы)');
  L('   - layers/overlays.mov      (добавленные картинки с альфой, если есть)');
  L('3. Аудио: перетащи все audio/*.wav; дорожки начинаются с 0:00 и уже');
  L('   выровнены между собой. Музыка music-*.wav — старт по таблице ниже.');
  L();
  L('ДОРОЖКИ УЧАСТНИКОВ (громкость/мьют, применённые в редакторе):');
  for (const p of scene.participants) {
    const e = m.edit?.tracks?.[p.userId];
    L(
      `  ${safe(p.characterName)}-${p.userId}.wav` +
        `  громкость ${(e?.gain ?? 1).toFixed(2)}${e?.muted ? ', MUTED' : ''}`,
    );
  }
  const music = m.edit?.music ?? [];
  if (music.length) {
    L();
    L('МУЗЫКА (старт от начала композиции):');
    music.forEach((mu, i) =>
      L(`  music-${i + 1}-*.wav  старт ${fmtTime(mu.startMs)}  громкость ${mu.gain.toFixed(2)}`),
    );
  }
  const cues = m.sceneCues ?? [];
  if (cues.length) {
    L();
    L('КЛЮЧИ СЦЕНЫ (для ручного воспроизведения в AE):');
    for (const c of cues) {
      const parts: string[] = [];
      if (c.bricksOpacity !== undefined) parts.push(`кирпичи opacity=${Math.round(c.bricksOpacity * 100)}%`);
      if (c.background) parts.push(`фон -> ${c.background.split('/').pop()}`);
      L(`  ${fmtTime(c.tMs)}  ${parts.join('; ')}`);
    }
  }
  L();
  L('Прозрачность кирпичей и смену фона можно крутить в AE по этим ключам —');
  L('слои отдаются «сырыми» именно для этого. Портреты уже отрендерены с');
  L('подсветкой говорящего по таймлайну записи.');
  L();
  L('Сделано в DnD Editor · no harm org · Kirkamah');
  return lines.join('\r\n');
}

function safe(name: string): string {
  return name.replace(/[^\wа-яё\-]+/gi, '_');
}
