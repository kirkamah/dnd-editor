<p align="center">
  <img src="brand/logo.svg" alt="no harm org" width="96" height="96">
</p>

<h1 align="center">dnd-editor</h1>

<p align="center">
  <b>a no harm org project</b> · by <b>Kirkamah</b> ☮<br>
  <sub>© 2026 Kirkamah · no harm org — All rights reserved.</sub>
</p>

---

Десктоп-редактор формата **`.dndsession`** (спека — [FORMAT.md](FORMAT.md), v1.1).
Третий проект серии: бот-рекордер (`dnd-recorder`) → плеер (`dnd-player`) → **редактор + экспорт**.
Рендер-движок (`src/core/`) переиспользован из плеера.

## Возможности

- **Таймлайн**: ключи сцены (прозрачность кирпичей, смена фона), своя музыка,
  свои картинки-overlay, реплики каждого участника. Блоки таскаются мышью,
  за края — ретайминг; точные значения — в инспекторе справа.
- **Дорожки**: громкость и мьют каждого участника (клик по имени слева).
- **Арты**: замена idle/speaking-артов персонажей.
- **Сохранение** обратно в `.dndsession` (formatVersion 1.1, файлы без перекодирования).
- **Экспорт** (нужен ffmpeg в PATH):
  - *Финальное видео* — `session.mp4` (1920×1080, 30 fps, H.264 + AAC, сведённый звук);
  - *Проект под After Effects* — AE не открывает `.dndsession`, поэтому сцена
    раскладывается на стандартные ассеты:
    - `audio/` — каждый участник отдельным WAV (48 кГц, выровнены от 0:00) + музыка WAV;
    - `layers/` — фоны/кирпичи/рамка PNG (статичные), `portraits.mov` и
      `overlays.mov` — ProRes 4444 **с альфа-каналом**;
    - `README-export.txt` — fps/разрешение/длительность, громкости, тайминги
      музыки и ключей сцены — что куда импортировать.

## Запуск

Готовый exe: `release\win-unpacked\DnD Editor.exe` (ярлык «DnD Editor» на рабочем
столе) или портативный `release\DnD-Editor-<версия>.exe`.

```bash
npm install
npm run app      # сборка + запуск
npm run dist     # пересобрать exe (release/)
npm run verify   # автопроверка полного цикла на реальном бандле
```

`npm run verify` прогоняет: открытие бандла → правки → сохранение →
`validate-bundle` из dnd-recorder → экспорт mp4 + AE → проверки ffprobe.

## Структура

```
electron/main.cjs      # окно + IPC: диалоги, fs, ffmpeg (стриминг кадров в stdin)
electron/preload.cjs   # contextBridge -> window.native
src/
├── core/              # из dnd-player, расширено: overlays, режим слоёв, rawFiles
│   ├── types.ts           # манифест v1.1 (+ edit)
│   ├── bundle-loader.ts   # zip -> сцена (+ сырые байты для сохранения)
│   ├── scene-state.ts     # манифест + t -> состояние (+ активные overlays)
│   └── scene-renderer.ts  # Canvas-кадр; layers/transparent для AE-экспорта
├── audio-engine.ts    # воспроизведение с gain/mute/музыкой + офлайн-сведение в WAV
├── editor-state.ts    # ВСЕ мутации сцены + сохранение бандла (zipSync, store)
├── timeline.ts        # canvas-таймлайн: ряды, drag/resize, плейхед
├── inspector.ts       # панель свойств выбранного элемента
├── export.ts          # mp4 + AE-ассеты: кадры 30fps -> ffmpeg pipe
└── main.ts            # обвязка UI + хуки автотестов (window.__test)
```

---

<p align="center">
  ☮ <b>no harm org</b> · made by <b>Kirkamah</b><br>
  <sub>© 2026 Kirkamah · no harm org — All rights reserved. See <a href="LICENSE">LICENSE</a>.</sub>
</p>
