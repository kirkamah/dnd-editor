/** Смоук новых функций таймлайна: зум-лимиты, доли секунд, хоткеи, модалка ⌨. */
import { _electron } from 'playwright';

const bundle = 'C:/projects/dnd-recorder/recordings/session-2026-06-06T15-08-38.dndsession';
const app = await _electron.launch({ args: ['electron/main.cjs'] });
const page = await app.firstWindow();
await page.evaluate((p) => window.__test.openBundle(p), bundle);
await page.waitForSelector('#workspace:not(.hidden)');
await page.waitForTimeout(400);

// 1) максимально отдалить: дорожка обязана доходить до края (canvas = видимая область)
for (let i = 0; i < 25; i++) await page.click('#zoom-out');
await page.waitForTimeout(200);
const fit = await page.evaluate(() => {
  const scroll = document.querySelector('#timeline-scroll');
  const spacer = document.querySelector('#timeline-spacer');
  return {
    view: scroll.clientWidth,
    spacer: spacer.getBoundingClientRect().width,
    canvas: document.querySelector('#timeline').width,
  };
});
console.log('zoom-out floor:', JSON.stringify(fit));
if (fit.spacer > fit.view + 2 || fit.spacer < fit.view - 30)
  throw new Error('минимальный зум не упирается в ширину окна');
await page.screenshot({ path: '.verify/tl-zoom-out.png' });

// 2) максимально приблизить: на линейке должны появиться доли секунд
await page.evaluate(() => window.__test.seek(9000));
for (let i = 0; i < 30; i++) await page.click('#zoom-in');
await page.waitForTimeout(200);
await page.screenshot({ path: '.verify/tl-zoom-in.png' });

// 3) хоткеи: Home/End, шаг кадра, минутный прыжок
await page.keyboard.press('Home');
await page.waitForTimeout(100);
let t = await page.evaluate(() => window.__test.manifest() && document.querySelector('#timecode').textContent);
console.log('Home →', t);
await page.keyboard.press('Shift+ArrowRight'); // +1 c
await page.keyboard.press('ArrowRight'); // +1 кадр
await page.waitForTimeout(100);
t = await page.evaluate(() => document.querySelector('#timecode').textContent);
console.log('Shift+→, → →', t);
await page.keyboard.press('End');
await page.waitForTimeout(100);
t = await page.evaluate(() => document.querySelector('#timecode').textContent);
console.log('End →', t);

// 4) модалка хоткеев
await page.click('#hotkeys-btn');
await page.waitForSelector('#hotkeys-modal:not(.hidden)');
await page.screenshot({ path: '.verify/tl-hotkeys.png' });
await page.keyboard.press('Escape');
const hidden = await page.evaluate(() =>
  document.querySelector('#hotkeys-modal').classList.contains('hidden'),
);
if (!hidden) throw new Error('Esc не закрыл модалку хоткеев');

await app.close();
console.log('TIMELINE SMOKE OK');
