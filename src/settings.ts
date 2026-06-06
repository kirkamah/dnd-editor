/**
 * Настройки приложения: тема, язык, папка экспорта по умолчанию, «о программе».
 * Хранение — localStorage.
 */
import { getLang, setLang, t, type Lang } from './i18n';

export interface AppSettings {
  theme: 'dark' | 'light';
  exportDir: string | null;
}

const KEY = 'dnd-editor-settings';

export function loadSettings(): AppSettings {
  try {
    return { theme: 'dark', exportDir: null, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { theme: 'dark', exportDir: null };
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function applyTheme(theme: 'dark' | 'light'): void {
  document.body.classList.toggle('light', theme === 'light');
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

  // тема
  const themeWrap = field(t('theme'));
  const themeSel = document.createElement('select');
  themeSel.append(new Option(t('themeDark'), 'dark', false, settings.theme === 'dark'));
  themeSel.append(new Option(t('themeLight'), 'light', false, settings.theme === 'light'));
  themeSel.onchange = () => {
    settings.theme = themeSel.value as AppSettings['theme'];
    applyTheme(settings.theme);
    saveSettings(settings);
  };
  themeWrap.append(themeSel);

  // язык
  const langWrap = field(t('language'));
  const langSel = document.createElement('select');
  langSel.append(new Option('Русский', 'ru', false, getLang() === 'ru'));
  langSel.append(new Option('English', 'en', false, getLang() === 'en'));
  langSel.onchange = () => {
    setLang(langSel.value as Lang);
    onChanged();
    buildSettingsModal(root, settings, onChanged); // перерисовать саму модалку
  };
  langWrap.append(langSel);

  // папка экспорта
  const dirWrap = field(t('defaultExportDir'));
  const dirRow = document.createElement('div');
  dirRow.className = 'dir-row';
  const dirLabel = document.createElement('span');
  dirLabel.className = 'dir-label';
  dirLabel.textContent = settings.exportDir ?? t('notSet');
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

  // о программе
  const about = document.createElement('div');
  about.className = 'about';
  about.innerHTML = `
    <hr>
    <h3>${t('about')}</h3>
    <div class="about-row">
      <img src="${new URL('../brand/logo.svg', import.meta.url).href}" width="48" height="48" alt="no harm org">
      <div>
        <b>DnD Editor</b> · ☮ <b>no harm org</b> · Kirkamah<br>
        <span class="hint">${t('aboutText').replace('\n', '<br>')}</span><br>
        <span class="hint">© 2026 Kirkamah · no harm org — All rights reserved.</span>
      </div>
    </div>`;
  root.append(about);
}
