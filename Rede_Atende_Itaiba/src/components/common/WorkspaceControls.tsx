import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { storageService } from '../../services/storage';

export function WorkspaceControls({
  collection = 'requests',
  searchable = false,
  pageParam = 'pagina',
  label = 'Navegação da lista',
}: {
  collection?: string;
  searchable?: boolean;
  pageParam?: string;
  label?: string;
}) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('busca') ?? '');
  const savedSearch = params.get('busca') ?? '';
  useEffect(() => setSearch(savedSearch), [savedSearch]);
  const page = storageService.getPage(collection),
    busy = !storageService.workspaceReady();
  const go = (n: number) => {
    const next = new URLSearchParams(params);
    next.set(pageParam, String(n));
    setParams(next);
  };
  return (
    <section className="workspace-controls no-print space-y-3" aria-label={label} aria-busy={busy}>
      {searchable && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const next = new URLSearchParams(params);
            for (const name of ['pagina', 'pendentesPagina', 'integradosPagina', 'historicoPagina'])
              next.delete(name);
            search.trim() ? next.set('busca', search.trim()) : next.delete('busca');
            next.delete('demandaId');
            next.delete('protocolo');
            setParams(next);
          }}
        >
          <label className="flex-1 field-label">
            Buscar protocolo, assunto ou escola
            <input
              className="field mt-1"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={150}
            />
          </label>
          <button className="action self-end" disabled={busy}>
            Filtrar lista
          </button>
        </form>
      )}
      <nav className="flex flex-wrap items-center gap-3 text-sm" aria-label={'Páginas: ' + label}>
        <button
          type="button"
          className="action secondary-action"
          disabled={busy || page.page <= 1}
          onClick={() => go(page.page - 1)}
        >
          Anterior
        </button>
        <span aria-live="polite">
          Página {page.page} de {page.pages} · {page.total} registros
        </span>
        <button
          type="button"
          className="action secondary-action"
          disabled={busy || page.page >= page.pages}
          onClick={() => go(page.page + 1)}
        >
          Próxima
        </button>
      </nav>
    </section>
  );
}
