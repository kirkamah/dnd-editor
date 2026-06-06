import { defineConfig } from 'vite';

export default defineConfig({
  // относительные пути в dist — нужно для загрузки через file:// в Electron
  base: './',
});
