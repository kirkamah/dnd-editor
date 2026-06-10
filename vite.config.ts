import { defineConfig } from 'vite';

export default defineConfig({
  // относительные пути в dist — нужно для загрузки через file:// в Electron
  base: './',
  define: {
    // Пробная сборка: scripts/build-trial.mjs ставит DND_TRIAL=1.
    __TRIAL__: JSON.stringify(process.env.DND_TRIAL === '1'),
  },
});
