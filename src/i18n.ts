/**
 * i18n: RU/EN. Статичный DOM переводится по data-i18n (applyStatic),
 * динамические панели (инспектор и т.п.) зовут t() при каждой пересборке.
 */

export type Lang = 'ru' | 'en';

const dict: Record<string, { ru: string; en: string }> = {
  // topbar
  open: { ru: 'Открыть', en: 'Open' },
  save: { ru: 'Сохранить', en: 'Save' },
  saveAs: { ru: 'Сохранить как', en: 'Save as' },
  addCue: { ru: '+ Ключ', en: '+ Cue' },
  addMusic: { ru: '+ Музыка', en: '+ Music' },
  addOverlay: { ru: '+ Картинка', en: '+ Image' },
  export: { ru: 'Экспорт', en: 'Export' },
  settings: { ru: '⚙ Настройки', en: '⚙ Settings' },
  ffmpegOk: { ru: 'ffmpeg: ок', en: 'ffmpeg: ok' },
  ffmpegMissing: { ru: 'ffmpeg НЕ НАЙДЕН — экспорт не сработает', en: 'ffmpeg NOT FOUND — export will fail' },
  saved: { ru: 'Сохранено', en: 'Saved' },

  // welcome
  welcomeSub: {
    ru: 'Редактор сессий .dndsession: таймлайн, музыка, картинки,\nэкспорт в mp4 и ассеты для After Effects.',
    en: '.dndsession editor: timeline, music, images,\nmp4 export and After Effects assets.',
  },
  openSession: { ru: 'Открыть сессию', en: 'Open session' },

  // transport
  hintTimeline: {
    ru: 'клик — плейхед · блоки тянутся и растягиваются · клипы липнут к краям (Alt — выкл) · Ctrl/Alt+колесо — зум',
    en: 'click — playhead · drag/stretch blocks · clips snap to edges (Alt off) · Ctrl/Alt+wheel — zoom',
  },
  zoomFit: { ru: 'Уместить всю запись (\\)', en: 'Fit whole recording (\\)' },

  // горячие клавиши
  hotkeys: { ru: '⌨ Клавиши', en: '⌨ Shortcuts' },
  hotkeysTitle: { ru: 'Горячие клавиши', en: 'Keyboard shortcuts' },
  hkTransport: { ru: 'Воспроизведение и навигация', en: 'Playback & navigation' },
  hkEdit: { ru: 'Монтаж', en: 'Editing' },
  hkView: { ru: 'Вид', en: 'View' },
  hkFile: { ru: 'Файл', en: 'File' },
  hkPlay: { ru: 'воспроизведение / пауза', en: 'play / pause' },
  hkHomeEnd: { ru: 'в начало / в конец записи', en: 'to start / end of recording' },
  hkFrame: { ru: 'кадр назад / вперёд (1/30 с)', en: 'frame back / forward (1/30 s)' },
  hkSecond: { ru: 'на секунду назад / вперёд', en: 'one second back / forward' },
  hkMinute: { ru: 'на минуту назад / вперёд', en: 'one minute back / forward' },
  hkEditPoint: {
    ru: 'к предыдущей / следующей границе клипа',
    en: 'to previous / next clip boundary',
  },
  hkInOut: {
    ru: 'к началу / концу клипа (выбранного или фразы у плейхеда)',
    en: 'to start / end of clip (selected, or phrase at playhead)',
  },
  hkSplit: { ru: 'разрезать выбранный клип по плейхеду', en: 'split selected clip at playhead' },
  hkDelete: { ru: 'удалить выбранное', en: 'delete selected' },
  hkAlign: {
    ru: 'придвинуть клип началом / концом к плейхеду',
    en: 'move clip start / end to playhead',
  },
  hkTrim: {
    ru: 'подрезать начало / конец клипа до плейхеда',
    en: 'trim clip start / end to playhead',
  },
  hkNudge: {
    ru: 'сдвинуть клип на кадр (с Shift — на секунду)',
    en: 'nudge clip by a frame (with Shift — a second)',
  },
  hkMarker: { ru: 'ключ сцены на плейхеде', en: 'scene cue at playhead' },
  hkDeselect: { ru: 'снять выделение / закрыть окно', en: 'deselect / close dialog' },
  hkZoom: { ru: 'приблизить / отдалить таймлайн', en: 'zoom timeline in / out' },
  hkFit: { ru: 'уместить всю запись по ширине', en: 'fit whole recording to width' },
  hkWheel: {
    ru: 'зум к курсору · просто колесо — прокрутка',
    en: 'zoom at cursor · plain wheel — scroll',
  },
  hkWheelKeys: { ru: 'Ctrl/Alt+колесо', en: 'Ctrl/Alt+wheel' },
  hkSnapDrag: {
    ru: 'клипы липнут к краям и плейхеду · Alt — отключить · Shift при перетаскивании плейхеда — прилипание',
    en: 'clips snap to edges and playhead · Alt — disable · Shift while dragging playhead — snap',
  },
  hkSave: { ru: 'сохранить / сохранить как', en: 'save / save as' },
  hkOpen: { ru: 'открыть сессию', en: 'open session' },
  hkHelp: { ru: 'этот список', en: 'this list' },
  hkDrag: { ru: 'перетаскивание', en: 'dragging' },

  // ряды таймлайна
  rowScene: { ru: 'Сцена (ключи)', en: 'Scene (cues)' },
  rowImages: { ru: 'Картинки', en: 'Images' },
  rowMusic: { ru: 'Музыка', en: 'Music' },

  // экспорт
  exportTitle: { ru: 'Экспорт', en: 'Export' },
  exportVideo: { ru: 'Финальное видео (mp4)', en: 'Final video (mp4)' },
  exportAE: { ru: 'Проект под After Effects', en: 'After Effects project' },
  exportBoth: { ru: 'И то и другое', en: 'Both' },
  cancel: { ru: 'Отменить', en: 'Cancel' },
  exportDone: { ru: 'Готово', en: 'Done' },
  exportFolder: { ru: 'Папка для экспорта', en: 'Export folder' },
  mixingAudio: { ru: 'Свожу звук', en: 'Mixing audio' },
  renderingVideo: { ru: 'Рендер видео', en: 'Rendering video' },
  participantTracks: { ru: 'Дорожки участников', en: 'Participant tracks' },
  portraitsLayer: { ru: 'Слой портретов (ProRes 4444)', en: 'Portraits layer (ProRes 4444)' },
  overlaysLayer: { ru: 'Слой картинок (ProRes 4444)', en: 'Overlays layer (ProRes 4444)' },
  exportCancelled: { ru: 'Экспорт отменён', en: 'Export cancelled' },
  error: { ru: 'Ошибка', en: 'Error' },
  files: { ru: 'файлов', en: 'files' },

  // инспектор
  hintInspector: {
    ru: 'Кликни элемент на таймлайне, портрет на превью или участника слева — здесь появятся его свойства.',
    en: 'Click a timeline item, a portrait on the preview, or a participant on the left — its properties appear here.',
  },
  sceneCueAt: { ru: 'Ключ сцены', en: 'Scene cue' },
  time: { ru: 'Время', en: 'Time' },
  bricksOpacity: { ru: 'Прозрачность перекрытия', en: 'Overlay wall opacity' },
  bgFromHere: { ru: 'Фон с этого момента', en: 'Background from here' },
  deleteCue: { ru: 'Удалить ключ', en: 'Delete cue' },
  keepBg: { ru: '— не менять —', en: '— keep —' },
  addFile: { ru: 'Добавить файл', en: 'Add file' },
  image: { ru: 'Картинка', en: 'Image' },
  appear: { ru: 'Появление', en: 'Appears' },
  disappear: { ru: 'Исчезание', en: 'Disappears' },
  width: { ru: 'Ширина', en: 'Width' },
  height: { ru: 'Высота', en: 'Height' },
  opacity: { ru: 'Прозрачность', en: 'Opacity' },
  deleteImage: { ru: 'Удалить картинку', en: 'Delete image' },
  music: { ru: 'Музыка', en: 'Music' },
  durationOf: { ru: 'Длительность', en: 'Duration' },
  start: { ru: 'Старт', en: 'Start' },
  end: { ru: 'Конец', en: 'End' },
  volume: { ru: 'Громкость', en: 'Volume' },
  deleteMusic: { ru: 'Удалить музыку', en: 'Delete music' },
  phrase: { ru: 'Реплика', en: 'Phrase' },
  begin: { ru: 'Начало', en: 'Start' },
  deletePhrase: { ru: 'Удалить реплику', en: 'Delete phrase' },
  toPlayhead: { ru: '⟵ плейхед', en: '⟵ playhead' },
  charName: { ru: 'Имя персонажа', en: 'Character name' },
  trackVolume: { ru: 'Громкость дорожки', en: 'Track volume' },
  mute: { ru: 'Мьют', en: 'Mute' },
  replaceIdle: { ru: 'Заменить арт (молчит)', en: 'Replace art (idle)' },
  replaceSpeaking: { ru: 'Заменить арт (говорит)', en: 'Replace art (speaking)' },
  addPhraseAtPlayhead: { ru: '+ Реплика на плейхеде', en: '+ Phrase at playhead' },
  posX: { ru: 'X', en: 'X' },
  posY: { ru: 'Y', en: 'Y' },
  hidePortrait: { ru: 'Скрыть портрет', en: 'Hide portrait' },
  resetLayout: { ru: 'Сбросить позицию/размер', en: 'Reset position/size' },

  // сцена
  sceneProps: { ru: 'Сцена', en: 'Scene' },
  frameLayer: { ru: 'Рамка портретов (наивысший слой)', en: 'Portrait frame (topmost layer)' },
  bgLayer: { ru: 'Рамка фона (под портретами)', en: 'Background frame (under portraits)' },
  bricksLayer: { ru: 'Переключаемый фон — кирпичи (самый нижний)', en: 'Switchable wall — bricks (bottom)' },
  uploadFile: { ru: 'Загрузить', en: 'Upload' },
  removeFile: { ru: 'Убрать', en: 'Remove' },
  notSet: { ru: 'не задано', en: 'not set' },
  borderStyle: { ru: 'Обводка портретов', en: 'Portrait border' },
  borderColor: { ru: 'Цвет обводки', en: 'Border color' },
  speakingColor: { ru: 'Цвет говорящего', en: 'Speaking color' },
  borderWidth: { ru: 'Толщина обводки', en: 'Border width' },
  cornerRadius: { ru: 'Скругление углов', en: 'Corner radius' },
  bricksHint: {
    ru: 'Прозрачность кирпичей меняется по ключам сцены (+ Ключ). Кирпичи видны сквозь прозрачные места рамки фона.',
    en: 'Bricks opacity is keyframed via scene cues (+ Cue). Bricks show through transparent areas of the background frame.',
  },
  radiusHint: {
    ru: 'Большое значение скругляет портрет до полного круга.',
    en: 'Large values round the portrait into a full circle.',
  },
  lockFrame: { ru: 'Заблокировать рамку', en: 'Lock frame' },
  cueFade: { ru: 'Плавный переход, мс', en: 'Fade duration, ms' },
  fadeIn: { ru: 'Появление, мс', en: 'Fade in, ms' },
  fadeOut: { ru: 'Исчезание, мс', en: 'Fade out, ms' },
  overlayLayer: { ru: 'Слой картинки', en: 'Image layer' },
  layer_back: { ru: 'За кирпичами (самый низ)', en: 'Behind bricks (bottom)' },
  layer_scene: { ru: 'Под портретами', en: 'Below portraits' },
  layer_default: { ru: 'Над портретами', en: 'Above portraits' },
  layer_front: { ru: 'Поверх всего (выше рамки)', en: 'On top of everything' },
  moveUp: { ru: 'Выше', en: 'Raise' },
  moveDown: { ru: 'Ниже', en: 'Lower' },
  uploadPlate: { ru: 'Загрузить табличку с именем', en: 'Upload name plate' },
  plateIntro: {
    ru: 'Табличка с именем под портретом — прямоугольник с надписью или своя картинка.',
    en: 'A name plate under the portrait — a rectangle with text or your own image.',
  },
  addTextPlate: { ru: '+ Табличка с именем', en: '+ Name plate' },
  plateAsImage: { ru: 'Табличка картинкой', en: 'Name plate from image' },
  plateText: { ru: 'Текст таблички', en: 'Plate text' },
  plateBg: { ru: 'Фон таблички', en: 'Plate background' },
  plateColor: { ru: 'Цвет текста', en: 'Text color' },
  plateFontSize: { ru: 'Кегль текста', en: 'Text size' },
  removePlate: { ru: 'Убрать табличку', en: 'Remove name plate' },
  plateHint: {
    ru: 'Табличка рисуется выше рамки портретов и заменяет текстовую подпись. Таскай её и растягивай за угловую ручку прямо на превью; при переносе или ресайзе портрета она едет и масштабируется вместе с ним.',
    en: 'The plate is drawn above the portrait frame and replaces the text label. Drag it and resize by the corner handle right on the preview; it follows the portrait when you move or resize it.',
  },
  frameHint: {
    ru: 'Пока рамка не на замке, её можно таскать и растягивать прямо на превью. Заблокируй — и клики снова попадают по портретам под ней.',
    en: 'While unlocked, drag and resize the frame right on the preview. Lock it and clicks go through to portraits beneath.',
  },
  phraseVolume: { ru: 'Громкость этой фразы', en: 'This phrase volume' },
  glowEnabled: { ru: 'Свечение при речи', en: 'Glow while speaking' },
  glowColor: { ru: 'Цвет свечения', en: 'Glow color' },
  glowSize: { ru: 'Размах свечения', en: 'Glow size' },

  // настройки
  settingsTitle: { ru: 'Настройки', en: 'Settings' },
  theme: { ru: 'Тема', en: 'Theme' },
  themeDark: { ru: 'Тёмная', en: 'Dark' },
  themeLight: { ru: 'Светлая', en: 'Light' },
  themeSpace: { ru: 'Космос', en: 'Space' },
  author: { ru: 'Автор', en: 'Author' },
  rights: { ru: '© 2026 · Все права защищены', en: '© 2026 · All rights reserved' },
  language: { ru: 'Язык / Language', en: 'Language / Язык' },
  defaultExportDir: { ru: 'Папка экспорта по умолчанию', en: 'Default export folder' },
  defaultExportDirHint: {
    ru: 'Если задана — экспорт сразу складывается сюда, без вопросов.',
    en: 'When set, exports go straight here without asking.',
  },
  choose: { ru: 'Выбрать', en: 'Choose' },
  clear: { ru: 'Сбросить', en: 'Clear' },
  about: { ru: 'О программе', en: 'About' },
  aboutText: {
    ru: 'DnD Editor — редактор записей D&D-сессий формата .dndsession.\nЧасть серии: бот-рекордер → плеер → редактор.',
    en: 'DnD Editor — an editor for .dndsession D&D recordings.\nPart of the series: recorder bot → player → editor.',
  },
  close: { ru: 'Закрыть', en: 'Close' },

  // пробная версия
  trialBadge: { ru: 'Пробная версия', en: 'Trial version' },
  trialLockedFull: { ru: '🔒 Только в полной версии', en: '🔒 Full version only' },
  trialTooLong: {
    ru: 'Пробная версия открывает записи не длиннее 1 часа. Эта запись длиннее — откройте её в полной версии (Boosty).',
    en: 'The trial opens recordings up to 1 hour. This one is longer — use the full version (Boosty).',
  },
  trialBoosty: { ru: 'Полная версия на Boosty', en: 'Full version on Boosty' },
  trialAboutNote: {
    ru: 'Пробная версия: записи до 1 часа, без своей музыки, без смены громкости голоса, без плавных переходов фона и замены аватаров. Полная версия снимает ограничения.',
    en: 'Trial version: recordings up to 1 hour, no custom music, no voice volume changes, no background fades or avatar replacement. The full version removes all limits.',
  },
};

let lang: Lang = (localStorage.getItem('dnd-editor-lang') as Lang) || 'ru';

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  localStorage.setItem('dnd-editor-lang', l);
  applyStatic();
}

export function t(key: string): string {
  return dict[key]?.[lang] ?? key;
}

/** Перевести все элементы с data-i18n (textContent) и data-i18n-title. */
export function applyStatic(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n!);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle!);
  }
}
