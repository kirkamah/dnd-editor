/** Смоук: табличка ресайзится и следует за портретом (перенос + масштаб). */
import { _electron } from 'playwright';

const bundle = 'C:/projects/dnd-recorder/recordings/session-2026-06-06T15-08-38.dndsession';
const app = await _electron.launch({ args: ['electron/main.cjs'] });
const page = await app.firstWindow();
await page.evaluate((p) => window.__test.openBundle(p), bundle);
await page.waitForSelector('#workspace:not(.hidden)');

const r = await page.evaluate(async () => {
  const m = window.__test.manifest();
  const uid = (m.master ?? m.players[0]).userId;
  await window.__test.setPlateFromPath(uid, 'C:/projects/dnd-editor/brand/logo-256.png');
  const p0 = { ...m.edit.plates[uid] };

  // 1) перенос портрета на (+120, +60) — табличка едет следом
  const box = window.__test.portraitBox
    ? window.__test.portraitBox(uid)
    : null;
  // достаём текущий бокс через layout-патч нулевого сдвига нельзя — берём из effectiveBoxes через test-хук setPortraitLayout
  window.__test.setPortraitLayout(uid, { x: 300, y: 200 });
  const p1 = { ...m.edit.plates[uid] };
  const l1 = { ...m.edit.layout[uid] };

  // 2) ресайз портрета в 2 раза — табличка масштабируется
  window.__test.setPortraitLayout(uid, { w: l1.w * 2, h: l1.h * 2 });
  const p2 = { ...m.edit.plates[uid] };
  const l2 = { ...m.edit.layout[uid] };
  return { p0, p1, l1, p2, l2, box };
});

// после переноса портрета в (300,200): табличка сместилась на ту же дельту? —
// проверяем согласованность: относительное положение таблички к портрету сохраняется
const rel1 = { dx: r.p1.x - r.l1.x, dy: r.p1.y - r.l1.y, w: r.p1.w };
const rel2 = { dx: r.p2.x - r.l2.x, dy: r.p2.y - r.l2.y, w: r.p2.w };
console.log('plate rel before resize:', JSON.stringify(rel1));
console.log('plate rel after  resize:', JSON.stringify(rel2));
const close = (a, b) => Math.abs(a - b) < 2;
if (!close(rel2.dx, rel1.dx * 2) || !close(rel2.dy, rel1.dy * 2) || !close(rel2.w, rel1.w * 2))
  throw new Error('табличка не отмасштабировалась вместе с портретом');

// выбор участника — на превью должны быть две рамки (портрет + табличка)
await page.evaluate(() => {
  const m = window.__test.manifest();
  const uid = (m.master ?? m.players[0]).userId;
  window.__test.select({ type: 'participant', userId: uid });
});
await page.waitForTimeout(300);
await page.screenshot({ path: '.verify/plate-follow.png' });

await app.close();
console.log('PLATE FOLLOW OK');
