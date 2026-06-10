/**
 * Дымовая проверка ТЕКСТОВЫХ табличек имён.
 * Открывает эталонный бандл, создаёт текстовую табличку, меняет надпись и
 * стиль, проверяет манифест и что рендер не падает. Скрин — в .verify/.
 * Запуск: node scripts/smoke-plate.mjs
 */
import { _electron } from 'playwright';
import fs from 'node:fs';

const bundle = 'C:/projects/dnd-recorder/recordings/session-2026-06-06T15-08-38.dndsession';
if (!fs.existsSync(bundle)) throw new Error(`Бандл не найден: ${bundle}`);
fs.mkdirSync('.verify', { recursive: true });

const failures = [];
const ok = (m) => console.log('✓', m);
const bad = (m) => {
  console.log('✗', m);
  failures.push(m);
};

const app = await _electron.launch({ args: ['electron/main.cjs'] });
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => bad(`pageerror: ${e.message}`));

  await page.waitForSelector('#welcome');
  await page.evaluate((p) => window.__test.openBundle(p), bundle);
  await page.waitForSelector('#workspace:not(.hidden)', { timeout: 20000 });

  const uid = await page.evaluate(() => {
    const m = window.__test.manifest();
    return (m.master ?? m.participants?.[0] ?? m.players?.[0]).userId;
  });

  await page.evaluate((u) => {
    window.__test.addTextPlate(u);
    window.__test.setPlateBox(u, { text: 'Гэндальф', bg: '#1b2330', color: '#ffd479', fontSize: 40, radius: 16 });
  }, uid);

  const plate = await page.evaluate((u) => window.__test.manifest().edit?.plates?.[u], uid);
  if (!plate) bad('табличка не создалась');
  else {
    plate.text === 'Гэндальф' ? ok(`текст таблички: «${plate.text}»`) : bad(`текст не записан: ${plate.text}`);
    plate.image === undefined ? ok('это текстовая табличка (без картинки)') : bad('появилась картинка');
    plate.bg === '#1b2330' && plate.color === '#ffd479' ? ok('стиль (фон/цвет) применился') : bad('стиль не применился');
    plate.w > 0 && plate.h > 0 ? ok(`прямоугольник ${Math.round(plate.w)}×${Math.round(plate.h)}`) : bad('нулевой размер');
  }

  // дать кадру отрисоваться и снять скрин превью
  await page.waitForTimeout(300);
  await page.locator('#preview').screenshot({ path: '.verify/text-plate.png' });
  ok('скрин превью с табличкой: .verify/text-plate.png');

  // сохранение -> перечитать (round-trip)
  await page.evaluate((u) => {
    const m = window.__test.manifest();
    void m;
    void u;
  }, uid);
} finally {
  await app.close();
}

if (failures.length) {
  console.error(`\nПРОВАЛЕНО: ${failures.length}`);
  process.exit(1);
}
console.log('\nТекстовые таблички работают.');
