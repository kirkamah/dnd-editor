/**
 * bundle-loader: .dndsession (zip) -> объект сцены.
 * Версия редактора: дополнительно держит сырые байты всех файлов архива
 * (rawFiles), чтобы сохранять бандл обратно без перекодирования, и умеет
 * декодировать музыку (mp3/ogg/wav) в AudioBuffer-совместимые сэмплы.
 */
import { unzipSync } from 'fflate';
import type { Manifest, ParticipantEntry } from './types';

export interface LoadedScene {
  manifest: Manifest;
  participants: ParticipantEntry[];
  /** userId -> моно-сэмплы float32 [-1..1], 48 кГц */
  audio: Map<string, Float32Array<ArrayBuffer>>;
  /** путь внутри zip -> картинка */
  images: Map<string, ImageBitmap>;
  /** путь внутри zip -> декодированная музыка */
  music: Map<string, AudioBuffer>;
  /** сырые байты всех файлов архива — для сохранения без потерь */
  rawFiles: Map<string, Uint8Array>;
}

export async function loadBundle(data: ArrayBuffer): Promise<LoadedScene> {
  const files = unzipSync(new Uint8Array(data));

  const manifestRaw = files['manifest.json'];
  if (!manifestRaw) throw new Error('В архиве нет manifest.json — это не .dndsession');
  const manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as Manifest;

  const major = manifest.formatVersion?.split('.')[0];
  if (major !== '1') {
    throw new Error(`Неподдерживаемая версия формата: ${manifest.formatVersion} (ожидается 1.x)`);
  }
  if (manifest.sampleRate !== 48000 || manifest.channels !== 1) {
    throw new Error(
      `Ожидается mono 48kHz, в манифесте ${manifest.channels}ch ${manifest.sampleRate}Hz`,
    );
  }

  const participants: ParticipantEntry[] = [
    ...(manifest.master ? [manifest.master] : []),
    ...manifest.players,
  ];

  const rawFiles = new Map<string, Uint8Array>(Object.entries(files));

  const audio = new Map<string, Float32Array<ArrayBuffer>>();
  for (const p of participants) {
    const wav = files[p.audioFile];
    if (!wav) throw new Error(`Нет дорожки ${p.audioFile}`);
    audio.set(p.userId, decodeCanonicalWav(wav));
  }

  const imagePaths = new Set<string>();
  for (const p of participants) {
    if (p.art?.idle) imagePaths.add(p.art.idle);
    if (p.art?.speaking) imagePaths.add(p.art.speaking);
  }
  for (const ref of Object.values(manifest.layers ?? {})) if (ref) imagePaths.add(ref);
  for (const cue of manifest.sceneCues ?? []) if (cue.background) imagePaths.add(cue.background);
  for (const ov of manifest.edit?.overlays ?? []) imagePaths.add(ov.image);

  const images = new Map<string, ImageBitmap>();
  await Promise.all(
    [...imagePaths].map(async (path) => {
      const raw = files[path];
      if (!raw) {
        console.warn(`[bundle] манифест ссылается на ${path}, но файла нет в архиве`);
        return;
      }
      images.set(path, await decodeImage(raw));
    }),
  );

  const music = new Map<string, AudioBuffer>();
  for (const entry of manifest.edit?.music ?? []) {
    const raw = files[entry.file];
    if (!raw) {
      console.warn(`[bundle] музыка ${entry.file} отсутствует в архиве`);
      continue;
    }
    music.set(entry.file, await decodeMusic(raw));
  }

  return { manifest, participants, audio, images, music, rawFiles };
}

export async function decodeImage(raw: Uint8Array): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([raw.slice().buffer]));
}

/** Декодирование mp3/ogg/wav средствами браузера (48 кГц контекст). */
export async function decodeMusic(raw: Uint8Array): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, 48000);
  return ctx.decodeAudioData(raw.slice().buffer);
}

/** PCM s16le mono из канонического 44-байтного WAV (гарантия FORMAT.md). */
function decodeCanonicalWav(wav: Uint8Array): Float32Array<ArrayBuffer> {
  const ascii = (off: number, len: number) =>
    String.fromCharCode(...wav.subarray(off, off + len));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE' || ascii(36, 4) !== 'data') {
    throw new Error('WAV не в каноническом виде из FORMAT.md');
  }
  const pcmBytes = wav.slice(44);
  const pcm = new Int16Array(pcmBytes.buffer, 0, Math.floor(pcmBytes.length / 2));
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}
