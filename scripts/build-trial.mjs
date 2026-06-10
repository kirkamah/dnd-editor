/**
 * Сборка ПРОБНОЙ версии DnD Editor.
 * Ставит DND_TRIAL=1 (Vite-define __TRIAL__ -> true) и собирает portable-exe
 * с отдельным appId/productName -> ставится рядом с полной версией.
 * Выход: release-trial/DnD-Editor-Trial-<version>.exe
 *
 * Запуск:  npm run dist:trial
 * NB: закрой запущенный DnD Editor перед сборкой (electron-builder не сможет
 *     переписать exe — «Access is denied»).
 */
import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DND_TRIAL: '1' },
  });
  if (r.status !== 0) {
    console.error(`\nШаг упал: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

console.log('— Сборка пробной версии DnD Editor (DND_TRIAL=1) —');
run('npm', ['run', 'build']);
run('npx', ['electron-builder', '--win', '--config', 'electron-builder.trial.json']);
console.log('\nГотово: release-trial/');
