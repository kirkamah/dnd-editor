/** Скриншот карточки участника и картинки — проверка, что ничего не выезжает. */
import { _electron } from 'playwright';

const bundle = 'C:/projects/dnd-recorder/recordings/session-2026-06-06T15-08-38.dndsession';
const app = await _electron.launch({ args: ['electron/main.cjs'] });
const page = await app.firstWindow();
await page.evaluate((p) => window.__test.openBundle(p), bundle);
await page.waitForSelector('#workspace:not(.hidden)');

await page.evaluate(async () => {
  const m = window.__test.manifest();
  const uid = (m.master ?? m.players[0]).userId;
  window.__test.setPortraitLayout(uid, { radius: 170 });
  await window.__test.addOverlay('C:/projects/dnd-editor/brand/logo-256.png');
  window.__test.seek(2000);
  window.__test.select({ type: 'participant', userId: uid });
});
await page.waitForTimeout(250);
await page.screenshot({ path: '.verify/participant-form.png' });

await page.evaluate(() => window.__test.select({ type: 'overlay', i: 0 }));
await page.waitForTimeout(200);
await page.screenshot({ path: '.verify/overlay-form.png' });

// горизонтальный перелив инспектора?
const overflow = await page.evaluate(() => {
  const el = document.querySelector('#inspector');
  return el.scrollWidth - el.clientWidth;
});
console.log(overflow > 1 ? `✗ инспектор шире на ${overflow}px` : '✓ инспектор не выезжает');
await app.close();
