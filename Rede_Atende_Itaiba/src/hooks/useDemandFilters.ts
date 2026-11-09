import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
const pageNumber = (raw: string | null) => Math.max(1, Math.min(1000000, Number(raw) || 1));
/** Keep keystrokes synchronous while router transitions publish a debounced URL. */
function useTextParam(
  name: string,
  saved: string,
  update: (key: string, value: string | number) => void,
  navigationType: string,
  drafts: { current: Record<string, string> },
) {
  const [value, setValue] = useState(saved);
  const published = useRef<string | null>(null);
  useEffect(() => {
    if (navigationType !== 'POP' && published.current === saved) {
      published.current = null;
      return;
    }
    published.current = null;
    drafts.current[name] = saved;
    setValue(saved);
  }, [saved, navigationType, name, drafts]);
  useEffect(() => {
    if (value === saved) return;
    const locationKey = window.history.state?.key;
    const timer = setTimeout(() => {
      // Outra navegação já publicou os rascunhos ou restaurou o histórico.
      // Um callback do render antigo não deve sobrescrever a URL mais recente.
      if (window.history.state?.key !== locationKey || drafts.current[name] !== value) return;
      published.current = value;
      update(name, value);
    }, 180);
    return () => clearTimeout(timer);
  }, [name, value, saved, update, drafts]);
  const setDraft = useCallback(
    (next: string) => {
      drafts.current[name] = next;
      setValue(next);
    },
    [drafts, name],
  );
  return [value, setDraft] as const;
}
/** URL-backed filters survive details, reload and browser Back/Forward. */
export function useDemandFilters() {
  const [defaultPageSize] = useState(() =>
    window.matchMedia('(min-width: 1280px)').matches ? 20 : 10,
  );
  const [params, setParams] = useSearchParams();
  const pathname = useLocation().pathname;
  const drafts = useRef<Record<string, string>>({});
  const update = useCallback(
    (key: string, value: string | number) => {
      if (window.location.pathname !== pathname) return;
      // O setter do router captura os parâmetros do render. Um timer pode vencer
      // depois que a URL mudou, antes do novo render; leia a URL neste instante.
      const next = new URLSearchParams(window.location.search);
      // Um filtro selecionado antes do debounce conserva os textos já digitados.
      for (const [name, draft] of Object.entries(drafts.current)) {
        if (draft) next.set(name, draft);
        else next.delete(name);
      }
      next.delete('pagina');
      if (value === '' || value === 'all') next.delete(key);
      else next.set(key, String(value));
      setParams(next, { replace: true });
    },
    [setParams, pathname],
  );
  const navigationType = useNavigationType();
  const [searchTerm, setSearchTerm] = useTextParam(
    'busca',
    params.get('busca') ?? '',
    update,
    navigationType,
    drafts,
  );
  const [technicianFilter, setTechnicianFilter] = useTextParam(
    'responsavel',
    params.get('responsavel') ?? '',
    update,
    navigationType,
    drafts,
  );
  const [fromFilter, setFromFilter] = useTextParam(
    'desde',
    params.get('desde') ?? '',
    update,
    navigationType,
    drafts,
  );
  const [toFilter, setToFilter] = useTextParam(
    'ate',
    params.get('ate') ?? '',
    update,
    navigationType,
    drafts,
  );
  const setPage = useCallback(
    (value: number | ((current: number) => number)) => {
      if (window.location.pathname !== pathname) return;
      const next = new URLSearchParams(window.location.search),
        page = typeof value === 'function' ? value(pageNumber(next.get('pagina'))) : value;
      // O ajuste automático de uma página fora do total também deve levar o texto pendente.
      for (const [name, draft] of Object.entries(drafts.current)) {
        if (draft) next.set(name, draft);
        else next.delete(name);
      }
      page <= 1 ? next.delete('pagina') : next.set('pagina', String(page));
      setParams(next, { replace: true });
    },
    [setParams, pathname],
  );
  const limit = Number(params.get('limite'));
  return {
    searchTerm,
    setSearchTerm,
    statusFilter: params.get('situacao') ?? 'all',
    setStatusFilter: (v: string) => update('situacao', v),
    categoryFilter: params.get('categoria') ?? 'all',
    setCategoryFilter: (v: string) => update('categoria', v),
    departmentFilter: params.get('setor') ?? 'all',
    setDepartmentFilter: (v: string) => update('setor', v),
    schoolFilter: params.get('escola') ?? 'all',
    setSchoolFilter: (v: string) => update('escola', v),
    zoneFilter: params.get('zona') ?? 'all',
    setZoneFilter: (v: string) => update('zona', v),
    slaFilter: params.get('prazo') ?? 'all',
    setSlaFilter: (v: string) => update('prazo', v),
    technicianFilter,
    setTechnicianFilter,
    fromFilter,
    setFromFilter,
    toFilter,
    setToFilter,
    priorityFilter: params.get('prioridade') ?? 'all',
    setPriorityFilter: (v: string) => update('prioridade', v),
    sort: params.get('ordem') === 'oldest' ? 'oldest' : 'newest',
    setSort: (v: string) => update('ordem', v),
    page: Math.floor(pageNumber(params.get('pagina'))),
    setPage,
    pageSize: [10, 20, 50].includes(limit) ? limit : defaultPageSize,
    setPageSize: (v: number) => update('limite', v),
    clearFilters: () => {
      setSearchTerm('');
      setTechnicianFilter('');
      setFromFilter('');
      setToFilter('');
      setParams({}, { replace: true });
    },
  };
}
