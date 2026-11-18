/** Preferências visuais deste navegador, independentes da sessão e dos dados de atendimento. */
export type ColorTheme = 'light' | 'dark' | 'high-contrast';
export const THEME_KEY = 'redeatende_color_theme';
export const FONT_KEY = 'redeatende_font_scale';
export function readTheme(): ColorTheme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'dark' || value === 'high-contrast') return value;
  } catch {
    /* Armazenamento pode estar bloqueado pelo navegador. */
  }
  return 'light';
}
export function readFontScale() {
  try {
    const value = Number(localStorage.getItem(FONT_KEY));
    if ([100, 112.5, 125].includes(value)) return value;
  } catch {
    /* A fonte continua utilizável sem armazenamento. */
  }
  return 100;
}
export function applyTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('access-high-contrast', theme === 'high-contrast');
}
export function saveAppearance(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Mantém a preferência nesta página. */
  }
}
export function initializeAppearance() {
  applyTheme(readTheme());
  document.documentElement.style.fontSize = `${readFontScale()}%`;
}
