import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Contrast, ALargeSmall } from 'lucide-react';

export function AccessibilityToolbar() {
  const [contrast, setContrast] = useState(false);
  const [scale, setScale] = useState(100);
  const navigate = useNavigate();
  useEffect(() => {
    document.documentElement.classList.toggle('access-high-contrast', contrast);
    return () => document.documentElement.classList.remove('access-high-contrast');
  }, [contrast]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${scale}%`;
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [scale]);
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
      <button
        type="button"
        aria-pressed={contrast}
        onClick={() => setContrast((x) => !x)}
        className="access-tool-button text-blue-900"
        title="Alternar alto contraste"
      >
        <Contrast className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Contraste</span>
      </button>
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
