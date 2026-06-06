/**
 * Настройки приложения: тема (тёмная/светлая/космос), язык, папка экспорта,
 * блок об организации/авторе (в стиле остальных no harm org приложений).
 * Хранение — localStorage. Тема красит и системный заголовок окна (IPC).
 */
import { getLang, setLang, t, type Lang } from './i18n';

export type ThemeName = 'dark' | 'light' | 'space';

export interface AppSettings {
  theme: ThemeName;
  exportDir: string | null;
}

const KEY = 'dnd-editor-settings';

const THEMES: Array<{ name: ThemeName; labelKey: string; sw: [string, string, string] }> = [
  { name: 'dark', labelKey: 'themeDark', sw: ['#181a21', '#2fa37c', '#e7e9ee'] },
  { name: 'light', labelKey: 'themeLight', sw: ['#ffffff', '#1c9e6f', '#1d2128'] },
  { name: 'space', labelKey: 'themeSpace', sw: ['#13132e', '#a877ff', '#e8e5ff'] },
];

export function loadSettings(): AppSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const theme: ThemeName = ['dark', 'light', 'space'].includes(parsed.theme)
      ? parsed.theme
      : 'dark';
    return { theme, exportDir: parsed.exportDir ?? null };
  } catch {
    return { theme: 'dark', exportDir: null };
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function applyTheme(theme: ThemeName): void {
  document.body.dataset.theme = theme;
  // системный заголовок окна — под цвет темы (убирает белую полоску сверху)
  void native.setWindowTheme(theme === 'light' ? 'light' : 'dark');
}

/** Пересобрать содержимое модалки настроек (зовётся при каждом открытии). */
export function buildSettingsModal(
  root: HTMLElement,
  settings: AppSettings,
  onChanged: () => void,
): void {
  root.replaceChildren();

  const field = (label: string): HTMLElement => {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.textContent = label;
    root.append(wrap);
    return wrap;
  };

  // ── тема: кнопки со свотчами ──
  const themeWrap = field(t('theme'));
  const picker = document.createElement('div');
  picker.className = 'theme-picker';
  for (const th of THEMES) {
    const b = document.createElement('button');
    b.className = `theme-btn ${settings.theme === th.name ? 'active' : ''}`;
    b.innerHTML =
      `<span class="sw">${th.sw.map((c) => `<span style="background:${c}"></span>`).join('')}</span>` +
      `<span>${t(th.labelKey)}</span>`;
    b.onclick = () => {
      settings.theme = th.name;
      applyTheme(th.name);
      saveSettings(settings);
      for (const x of picker.querySelectorAll('.theme-btn')) x.classList.remove('active');
      b.classList.add('active');
    };
    picker.append(b);
  }
  themeWrap.append(picker);

  // ── язык ──
  const langWrap = field(t('language'));
  const langSel = document.createElement('select');
  langSel.append(new Option('Русский', 'ru', false, getLang() === 'ru'));
  langSel.append(new Option('English', 'en', false, getLang() === 'en'));
  langSel.onchange = () => {
    setLang(langSel.value as Lang);
    onChanged();
    buildSettingsModal(root, settings, onChanged);
  };
  langWrap.append(langSel);

  // ── папка экспорта ──
  const dirWrap = field(t('defaultExportDir'));
  const dirLabel = document.createElement('span');
  dirLabel.className = 'dir-label';
  dirLabel.textContent = settings.exportDir ?? t('notSet');
  const dirRow = document.createElement('div');
  dirRow.className = 'dir-row';
  const pick = document.createElement('button');
  pick.textContent = t('choose');
  pick.onclick = async () => {
    const dir = await native.pickDirDialog(t('defaultExportDir'));
    if (dir) {
      settings.exportDir = dir;
      dirLabel.textContent = dir;
      saveSettings(settings);
    }
  };
  const clear = document.createElement('button');
  clear.textContent = t('clear');
  clear.onclick = () => {
    settings.exportDir = null;
    dirLabel.textContent = t('notSet');
    saveSettings(settings);
  };
  dirRow.append(pick, clear);
  dirWrap.append(dirLabel, dirRow);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = t('defaultExportDirHint');
  root.append(hint);

  // ── об организации и авторе (как в остальных приложениях no harm org) ──
  const about = document.createElement('div');
  about.className = 'about-block';
  about.title = '© 2026 Kirkamah · no harm org — All rights reserved.';
  about.innerHTML = `
    <div class="about-mark">☮</div>
    <div class="about-org">no harm org</div>
    <div class="about-app">DnD Editor — ${t('aboutText').split('\n')[0]}</div>
    <div class="about-author">${t('author')}: <b>Kirkamah</b></div>
    <div class="about-copy">${t('rights')}</div>`;
  root.append(about);
}
