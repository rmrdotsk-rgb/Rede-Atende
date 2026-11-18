import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ALargeSmall } from 'lucide-react';
import {
  applyTheme,
  readTheme,
  readFontScale,
  saveAppearance,
  THEME_KEY,
  FONT_KEY,
  type ColorTheme,
} from '../../utils/appearance';

export function AccessibilityToolbar() {
  const [theme, setTheme] = useState(readTheme);
  const [scale, setScale] = useState(readFontScale);
  const navigate = useNavigate();
  useEffect(() => {
    applyTheme(theme);
    saveAppearance(THEME_KEY, theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${scale}%`;
    saveAppearance(FONT_KEY, String(scale));
  }, [scale]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) setTheme(readTheme());
      if (event.key === FONT_KEY || event.key === null) setScale(readFontScale());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return;
      if (e.key === '1') {
        e.preventDefault();
        document.getElementById('main-content')?.focus();
      } else if (e.key === '2') {
        e.preventDefault();
        navigate('/solicitar');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
  return (
    <div
      className="access-toolbar no-print flex items-center gap-1"
      role="group"
      aria-label="Ferramentas de acessibilidade"
    >
      <select
        aria-label="Tema de cores"
        className="theme-select field"
        value={theme}
        onChange={(event) => setTheme(event.target.value as ColorTheme)}
      >
        <option value="light">Claro</option>
        <option value="dark">Escuro</option>
        <option value="high-contrast">Alto contraste</option>
      </select>
      <button
        type="button"
        onClick={() => setScale((x) => (x >= 125 ? 100 : x + 12.5))}
        className="access-tool-button text-blue-900"
        aria-label="Aumentar fonte, ou restaurar após 125%"
      >
        <ALargeSmall className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Fonte {scale}%</span>
      </button>
    </div>
  );
}
