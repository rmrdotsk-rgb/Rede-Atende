import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { storageService } from '../../services/storage';

/** Keep forms mounted while filters/pages change within the same route. */
export function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const location = useLocation(),
    key = location.pathname + location.search;
  const [loaded, setLoaded] = useState({ key: '', route: '' });
  const [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setError('');
    const check = () => {
      if (live && storageService.workspaceReady()) {
        setLoaded({ key, route: location.pathname });
        setError('');
      }
    };
    const unsubscribe = storageService.subscribe(check);
    if (storageService.workspaceReady()) check();
    else
      storageService
        .refresh(controller.signal)
        .then(check)
        .catch((e) => {
          if (live && (e as Error).name !== 'AbortError') setError((e as Error).message);
        });
    return () => {
      live = false;
      unsubscribe();
      controller.abort();
    };
  }, [key, retry, location.pathname]);
  if (loaded.route !== location.pathname)
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4" aria-busy={!error}>
        <p role={error ? 'alert' : 'status'}>{error || 'Carregando atendimento...'}</p>
        {error && (
          <>
            <button className="action" onClick={() => setRetry((n) => n + 1)}>
              Tentar novamente
            </button>
            <Link className="action secondary-action ml-3" to="/">
              Voltar ao início
            </Link>
          </>
        )}
      </main>
    );
  return (
    <>
      {loaded.key !== key && (
        <div className="workspace-update no-print" role={error ? 'alert' : 'status'}>
          {error || 'Atualizando lista. O formulário preenchido será preservado.'}
          {error && (
            <button className="action secondary-action ml-3" onClick={() => setRetry((n) => n + 1)}>
              Tentar novamente
            </button>
          )}
        </div>
      )}
      {children}
    </>
  );
}
