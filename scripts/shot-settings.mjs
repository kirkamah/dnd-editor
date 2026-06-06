/** Скриншоты: настройки + светлая тема + EN. Настройки откатываются в конце. */
import { _electron } from 'playwright';

const bundle = 'C:/projects/dnd-recorder/recordings/session-2026-06-06T15-08-38.dndsession';
const app = await _electron.launch({ args: ['electron/main.cjs'] });
const page = await app.firstWindow();
await page.evaluate((p) => window.__test.openBundle(p), bundle);
await page.waitForSelector('#workspace:not(.hidden)');

await page.click('#settings-btn');
await page.waitForSelector('#settings-modal:not(.hidden)');
await page.screenshot({ path: '.verify/settings-ru.png' });

// светлая тема + английский
await page.selectOption('#settings-body select >> nth=0', 'light');
await page.selectOption('#settings-body select >> nth=1', 'en');
await page.waitForTimeout(200);
await page.screenshot({ path: '.verify/settings-light-en.png' });
await page.click('#settings-close');
await page.evaluate(() => window.__test.select({ type: 'scene' }));
await page.waitForTimeout(200);
await page.screenshot({ path: '.verify/scene-light-en.png' });

// откат
await page.evaluate(() => {
  localStorage.removeItem('dnd-editor-settings');
  localStorage.removeItem('dnd-editor-lang');
});
await app.close();
console.log('OK');
