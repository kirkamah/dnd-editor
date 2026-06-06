/** Скриншот: табличка, front-картинка с фейдом, плавный ключ кирпичей. */
import { _electron } from 'playwright';

const bundle = 'C:/projects/dnd-recorder/recordings/session-2026-06-06T15-08-38.dndsession';
const app = await _electron.launch({ args: ['electron/main.cjs'] });
const page = await app.firstWindow();
await page.evaluate((p) => window.__test.openBundle(p), bundle);
await page.waitForSelector('#workspace:not(.hidden)');

await page.evaluate(async () => {
  const m = window.__test.manifest();
  const uid = (m.master ?? m.players[0]).userId;
  await window.__test.setPlateFromPath(uid, 'C:/projects/dnd-editor/brand/logo-256.png');
  window.__test.seek(9000);
  await window.__test.addOverlay('C:/projects/dnd-editor/brand/logo-256.png');
  window.__test.updateOverlay(0, { layer: 'front', fadeInMs: 2000, x: 1500, y: 100, w: 200, h: 200 });
  window.__test.seek(9700); // середина fadeIn — полупрозрачная
  window.__test.select({ type: 'participant', userId: uid });
});
await page.waitForTimeout(300);
await page.screenshot({ path: '.verify/plates.png' });
await app.close();
console.log('OK');
