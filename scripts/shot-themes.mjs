/** Скриншоты: 3 темы, круг-портрет, рамка с позицией. Настройки откатываются. */
import { _electron } from 'playwright';

const bundle = 'C:/projects/dnd-recorder/recordings/session-2026-06-06T15-08-38.dndsession';
const app = await _electron.launch({ args: ['electron/main.cjs'] });
const page = await app.firstWindow();
await page.evaluate((p) => window.__test.openBundle(p), bundle);
await page.waitForSelector('#workspace:not(.hidden)');

// круг + рамка (логотип как тестовая картинка рамки) + свечение фиолетовым
await page.evaluate(async () => {
  window.__test.setStyle({ radius: 300 });
  const m = window.__test.manifest();
  const uid = (m.master ?? m.players[0]).userId;
  window.__test.setPortraitLayout(uid, { glowColor: '#a877ff', glowSize: 60 });
  await window.__test.setLayerFromPath('frame', 'C:/projects/dnd-editor/brand/logo-256.png');
  window.__test.setFrameBox({ x: 1100, y: 400, w: 300, h: 300 });
  window.__test.seek(9000);
  window.__test.select({ type: 'scene' });
});
await page.waitForTimeout(300);

for (const theme of ['dark', 'space', 'light']) {
  await page.evaluate((th) => {
    document.body.dataset.theme = th;
  }, theme);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `.verify/theme-${theme}.png` });
}

await page.evaluate(() => {
  localStorage.removeItem('dnd-editor-settings');
  localStorage.removeItem('dnd-editor-lang');
});
await app.close();
console.log('OK');
