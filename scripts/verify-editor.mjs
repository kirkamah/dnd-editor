/**
 * Автопроверка редактора полным циклом:
 * открыть реальный бандл → правки (ключ, мьют, музыка, картинка) → сохранить →
 * прогнать validate-bundle из dnd-recorder → экспорт mp4 + AE → проверить ffprobe.
 * Запуск: npm run verify [-- путь-к-бандлу]
 */
import { _electron } from 'playwright';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const bundle =
  process.argv[2] ??
  'C:/projects/dnd-recorder/recordings/session-2026-06-06T15-08-38.dndsession';
if (!fs.existsSync(bundle)) throw new Error(`Бандл не найден: ${bundle}`);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-editor-verify-'));
const savedBundle = path.join(work, 'edited.dndsession');
const exportDir = path.join(work, 'export');
fs.mkdirSync(exportDir, { recursive: true });
fs.mkdirSync('.verify', { recursive: true });

// тестовая музыка: 5 секунд тона через ffmpeg
const musicPath = path.join(work, 'test-music.wav');
execSync(`ffmpeg -y -f lavfi -i "sine=frequency=330:duration=5" -ar 48000 "${musicPath}"`, {
  stdio: 'pipe',
});
const overlayPath = 'C:/projects/dnd-editor/brand/logo-256.png';

const failures = [];
const ok = (msg) => console.log('✓', msg);

const app = await _electron.launch({ args: ['electron/main.cjs'] });
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));

  await page.waitForSelector('#welcome');
  await page.evaluate((p) => window.__test.openBundle(p), bundle);
  await page.waitForSelector('#workspace:not(.hidden)', { timeout: 20000 });
  ok('бандл открылся');

  // правки
  await page.evaluate(() => window.__test.seek(9000));
  await page.evaluate(() => window.__test.addCue({ tMs: 5000, bricksOpacity: 0.3 }));
  await page.evaluate((p) => window.__test.addMusic(p), musicPath);
  await page.evaluate((p) => window.__test.addOverlay(p), overlayPath);
  const m1 = await page.evaluate(() => window.__test.manifest());
  const uid = (m1.master ?? m1.players[0]).userId;
  await page.evaluate((u) => window.__test.setTrack(u, { gain: 0.7 }), uid);

  // v1.2: клипы, разрезание, лейаут, стиль
  await page.evaluate((u) => {
    // переезд первой реплики на 1с вперёд с сохранением источника звука
    const m = window.__test.manifest();
    const ev = m.speakingEvents[0];
    window.__test.splitSpeech(1, m.speakingEvents[1].startMs + 400); // разрезать вторую
    void ev;
    window.__test.setPortraitLayout(u, { x: 600, y: 100, w: 500, h: 500 });
    window.__test.setStyle({ borderColor: '#ff0000', borderWidth: 6, radius: 30 });
  }, uid);

  const m = await page.evaluate(() => window.__test.manifest());
  if (!m.sceneCues.some((c) => c.tMs === 5000 && c.bricksOpacity === 0.3))
    failures.push('cue не добавился');
  if (!(m.edit?.music?.length === 1)) failures.push('музыка не добавилась');
  if (!(m.edit?.overlays?.length === 1)) failures.push('overlay не добавился');
  if (m.edit?.tracks?.[uid]?.gain !== 0.7) failures.push('gain не применился');
  if (m.speakingEvents.length !== 9) failures.push(`split: ожидалось 9 реплик, есть ${m.speakingEvents.length}`);
  if (!m.speakingEvents.some((e) => typeof e.srcStartMs === 'number'))
    failures.push('split: srcStartMs не записался');
  if (m.edit?.layout?.[uid]?.w !== 500) failures.push('layout портрета не применился');
  if (m.edit?.style?.borderColor !== '#ff0000') failures.push('стиль обводки не применился');
  if (m.formatVersion !== '1.0') void 0; // версия станет 1.2 при сохранении
  ok('правки: cue, музыка, картинка, громкость, split (+srcStartMs), layout, стиль');

  await page.screenshot({ path: '.verify/editor-overlay.png' });

  // сохранение
  await page.evaluate((p) => window.__test.save(p), savedBundle);
  const m2 = await page.evaluate(() => window.__test.manifest());
  if (m2.formatVersion !== '1.2') failures.push(`после сохранения formatVersion ${m2.formatVersion}, ожидалось 1.2`);
  ok(`сохранено (v${m2.formatVersion}): ${(fs.statSync(savedBundle).size / 1024 / 1024).toFixed(1)} МБ`);

  // экспорт (оба режима)
  console.log('  экспорт (mp4 + AE)…');
  await page.evaluate(({ d }) => window.__test.export(d, 'both'), { d: exportDir });
  ok('экспорт завершился без ошибок');
} finally {
  await app.close();
}

// ---- проверки вне приложения ----

// validate-bundle из Проекта 1 (источник правды формата)
try {
  const out = execFileSync(
    'npx.cmd',
    ['tsx', 'src/bundle/validate.ts', savedBundle],
    { cwd: 'C:/projects/dnd-recorder', shell: true, encoding: 'utf8' },
  );
  ok(`validate-bundle: ${out.trim().split('\n').pop()}`);
} catch (e) {
  failures.push(`validate-bundle провалился:\n${e.stdout}${e.stderr}`);
}

// ffprobe экспортов
function probe(file, args) {
  return execSync(`ffprobe -v error ${args} "${file}"`, { encoding: 'utf8' }).trim();
}
const mp4 = path.join(exportDir, 'session.mp4');
if (fs.existsSync(mp4)) {
  const dur = Number(probe(mp4, '-show_entries format=duration -of csv=p=0'));
  const streams = probe(mp4, '-show_entries stream=codec_name -of csv=p=0');
  if (Math.abs(dur - 29.674) > 0.5) failures.push(`mp4 длительность ${dur}, ожидалось ~29.7`);
  if (!streams.includes('h264') || !streams.includes('aac'))
    failures.push(`mp4 кодеки: ${streams}`);
  ok(`session.mp4: ${dur.toFixed(2)} c, кодеки [${streams.replace('\n', ', ')}]`);
} else failures.push('session.mp4 не создан');

const mov = path.join(exportDir, 'layers', 'portraits.mov');
if (fs.existsSync(mov)) {
  const fmt = probe(mov, '-show_entries stream=codec_name,pix_fmt -of csv=p=0');
  // ProRes 4444 кодируется 12-битным, главное — yuvA (альфа-канал на месте)
  if (!fmt.includes('prores') || !fmt.includes('yuva444p'))
    failures.push(`portraits.mov не ProRes4444 с альфой: ${fmt}`);
  ok(`portraits.mov: ${fmt}`);
} else failures.push('portraits.mov не создан');

for (const f of ['layers/overlays.mov', 'README-export.txt']) {
  if (!fs.existsSync(path.join(exportDir, f))) failures.push(`${f} не создан`);
}
const wavs = fs.readdirSync(path.join(exportDir, 'audio'));
if (wavs.filter((f) => f.endsWith('.wav')).length < 2)
  failures.push(`в audio/ мало WAV: ${wavs.join(', ')}`);
ok(`AE-ассеты: audio/[${wavs.join(', ')}], overlays.mov, README-export.txt`);

console.log(`\nАртефакты проверки: ${work}`);
if (failures.length) {
  for (const f of failures) console.error('✗', f);
  process.exit(1);
}
console.log('EDITOR VERIFY OK');
