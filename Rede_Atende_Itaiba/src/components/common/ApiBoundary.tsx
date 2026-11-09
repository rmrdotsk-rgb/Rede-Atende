import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { storageService } from '../../services/storage';
export function ApiBoundary({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [, render] = useState(0);
  const load = () => {
    setError('');
    storageService
      .init()
      .then(() => setReady(true))
      .catch((e) => setError((e as Error).message));
  };
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      controller: AbortController | undefined,
      failures = 0,
      running = false;
    const unsubscribe = storageService.subscribe(() => render((n) => n + 1));
    const schedule = () => {
      if (!stopped && document.visibilityState === 'visible' && navigator.onLine)
        timer = setTimeout(poll, Math.min(60000, 5000 * 2 ** failures));
    };
    const poll = async () => {
      if (running || stopped) return;
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      running = true;
      controller = new AbortController();
      try {
        await storageService.refresh(controller.signal);
        failures = 0;
      } catch (error) {
        if ((error as Error).name !== 'AbortError') failures = Math.min(failures + 1, 4);
      } finally {
        running = false;
        schedule();
      }
    };
    const resume = () => {
      clearTimeout(timer);
      if (document.visibilityState !== 'visible') {
        controller?.abort();
        return;
      }
      if (!running) void poll();
    };
    storageService
      .init()
      .then(() => {
        if (!stopped) setReady(true);
      })
      .catch((e) => {
        if (!stopped) setError((e as Error).message);
      })
      .finally(schedule);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      unsubscribe();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, []);
  if (!ready)
    return (
      <main className="max-w-lg mx-auto p-6 space-y-4" aria-busy={!error}>
        <h1 className="text-2xl font-bold">Rede Atende</h1>
        <p role={error ? 'alert' : 'status'}>{error || 'Conectando ao atendimento...'}</p>
        {error && (
          <button className="action" onClick={load}>
            Tentar conexão novamente
          </button>
        )}
      </main>
    );
  return (
    <>
      {storageService.connectionError && (
        <div role="alert" className="p-3 bg-amber-100 text-amber-950 text-sm">
          {storageService.connectionError}
          <button className="ml-3 underline" onClick={load}>
            Reconectar
          </button>
        </div>
      )}
      <Fragment key={storageService.user?.id ?? 'anon'}>{children}</Fragment>
    </>
  );
}
