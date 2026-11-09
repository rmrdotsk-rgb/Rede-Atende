import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBeforeUnload, useBlocker, type BlockerFunction } from 'react-router-dom';
import { Modal } from './Modal';

type Guard = {
  setDirty: (value: boolean) => void;
  runWhenSafe: (action: () => Promise<void>) => Promise<void>;
};
const GuardContext = createContext<Guard | null>(null);

/** One guard covers router links, browser Back, reload and explicit logout. No draft is stored. */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const [actionBlocked, setActionBlocked] = useState(false);
  const decision = useRef<((allow: boolean) => void) | null>(null);
  const bypass = useRef(false);
  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        dirty.current &&
        !bypass.current &&
        currentLocation.pathname + currentLocation.search !==
          nextLocation.pathname + nextLocation.search,
      [],
    ),
  );
  useBeforeUnload(
    useCallback((event) => {
      if (!dirty.current || bypass.current) return;
      event.preventDefault();
      event.returnValue = '';
    }, []),
  );
  useEffect(
    () => () => {
      decision.current?.(false);
    },
    [],
  );

  const runWhenSafe = useCallback(async (action: () => Promise<void>) => {
    if (dirty.current) {
      if (decision.current) return;
      const allow = await new Promise<boolean>((resolve) => {
        decision.current = resolve;
        setActionBlocked(true);
      });
      if (!allow) return;
    }
    bypass.current = true;
    try {
      await action();
    } finally {
      bypass.current = false;
    }
  }, []);
  const context = useMemo(() => ({ setDirty, runWhenSafe }), [setDirty, runWhenSafe]);
  const choose = (allow: boolean) => {
    if (blocker.state === 'blocked') {
      if (allow) blocker.proceed();
      else blocker.reset();
    }
    const resolve = decision.current;
    decision.current = null;
    setActionBlocked(false);
    resolve?.(allow);
  };
  return (
    <GuardContext.Provider value={context}>
      {children}
      {(blocker.state === 'blocked' || actionBlocked) && (
        <Modal titleId="unsaved-title" onClose={() => choose(false)}>
          <section className="panel space-y-4">
            <h2 id="unsaved-title" className="text-xl font-bold text-slate-900">
              Há informações não enviadas
            </h2>
            <p className="text-sm text-slate-700">
              Continue preenchendo para manter os dados nesta página. Se sair, o preenchimento ou
              anexo pendente será descartado.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="action" onClick={() => choose(false)}>
                Continuar preenchendo
              </button>
              <button
                type="button"
                className="action secondary-action"
                onClick={() => choose(true)}
              >
                Descartar e sair
              </button>
            </div>
          </section>
        </Modal>
      )}
    </GuardContext.Provider>
  );
}

export function useUnsavedChanges(when: boolean) {
  const guard = useContext(GuardContext);
  const setDirty = guard?.setDirty;
  useLayoutEffect(() => {
    setDirty?.(when);
    return () => setDirty?.(false);
  }, [when, setDirty]);
}
export function useSafeAction() {
  const guard = useContext(GuardContext);
  if (!guard) throw new Error('Navigation guard is missing.');
  return guard.runWhenSafe;
}
