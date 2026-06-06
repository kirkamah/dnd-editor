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
    ru: 'клик по таймлайну — плейхед · блоки можно тянуть и растягивать · Ctrl+K — разрезать выбранное · Delete — удалить',
    en: 'click timeline — playhead · drag/stretch blocks · Ctrl+K — split selected · Delete — remove',
  },

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
  removePlate: { ru: 'Убрать табличку', en: 'Remove name plate' },
  plateHint: {
    ru: 'Табличка рисуется выше рамки портретов и заменяет текстовую подпись. Таскай и растягивай её прямо на превью.',
    en: 'The plate is drawn above the portrait frame and replaces the text label. Drag and resize it right on the preview.',
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
