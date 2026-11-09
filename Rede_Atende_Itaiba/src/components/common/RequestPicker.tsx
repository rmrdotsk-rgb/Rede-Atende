import { useEffect, useState } from 'react';
import type { EducationalRequest } from '../../types';
import { storageService } from '../../services/storage';

interface Props {
  id: string;
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  eligible?: string[];
  searchLabel?: string;
}
/** Remote, paginated lookup with a pinned selection independent of the workspace cache. */
export function RequestPicker({
  id,
  value,
  onChange,
  required = false,
  eligible,
  searchLabel = 'Localizar solicitação',
}: Props) {
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(1);
  const [items, setItems] = useState<EducationalRequest[]>([]);
  const [selected, setSelected] = useState<EducationalRequest>();
  const [error, setError] = useState(''),
    [selectionError, setSelectionError] = useState('');
  const [busy, setBusy] = useState(true),
    [selecting, setSelecting] = useState(false),
    [retry, setRetry] = useState(0);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const statuses = eligible?.join(',');
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    const timer = setTimeout(() => {
      storageService
        .searchRequests({ search: query, page, pageSize: 20, statuses }, controller.signal)
        .then((r) => {
          if (controller.signal.aborted) return;
          setItems(r.items);
          setMeta({ page: r.page, pages: r.pages, total: r.total });
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError((e as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, page, statuses, retry]);
  useEffect(() => {
    setSelectionError('');
    if (!value) {
      setSelected(undefined);
      setSelecting(false);
      return;
    }
    const cached = storageService.getRequestById(value);
    if (cached) {
      setSelected(cached);
      setSelecting(false);
      return;
    }
    const controller = new AbortController();
    setSelecting(true);
    storageService
      .request<EducationalRequest>('/requests/' + encodeURIComponent(value), {
        signal: controller.signal,
      })
      .then((r) => {
        if (!controller.signal.aborted) setSelected(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setSelectionError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSelecting(false);
      });
    return () => controller.abort();
  }, [value, retry]);
  const pinned = selected?.id === value ? selected : undefined;
  const list = pinned && !items.some((r) => r.id === value) ? [pinned, ...items] : items;
  return (
    <div className="request-picker space-y-2">
      <label className="field-label" htmlFor={id + '-search'}>
        {searchLabel}
      </label>
      <input
        id={id + '-search'}
        className="field"
        placeholder="Protocolo, assunto ou escola"
        maxLength={150}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        aria-describedby={id + '-help'}
      />
      <select
        id={id}
        className="field"
        value={value}
        required={required}
        aria-busy={busy || selecting}
        aria-describedby={id + '-help'}
        onChange={(e) => {
          setSelected(list.find((r) => r.id === e.target.value));
          onChange(e.target.value);
        }}
      >
        <option value="">
          {required ? 'Selecione um protocolo...' : 'Sem vínculo com solicitação'}
        </option>
        {value && !list.some((r) => r.id === value) && (
          <option value={value}>
            {selecting ? 'Carregando protocolo selecionado...' : 'Protocolo selecionado: ' + value}
          </option>
        )}
        {list.map((r) => (
          <option key={r.id} value={r.id} disabled={!!eligible && !eligible.includes(r.status)}>
            {r.protocol} · {r.subject} · {r.schoolName}
            {eligible && !eligible.includes(r.status) ? ' (situação indisponível)' : ''}
          </option>
        ))}
      </select>
      <p id={id + '-help'} className="text-sm text-slate-600">
        {meta.total} resultados · página {meta.page} de {meta.pages}. A seleção é mantida ao buscar
        outro protocolo.
      </p>
      {(busy || selecting) && (
        <p role="status" className="text-sm">
          Buscando protocolos...
        </p>
      )}
      {(error || selectionError) && (
        <div role="alert" className="text-sm text-red-800">
          {error || selectionError}{' '}
          <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>
            Tentar busca novamente
          </button>
        </div>
      )}
      {!busy && !error && !items.length && (
        <p className="text-sm text-slate-600">
          Nenhum protocolo disponível nesta busca. Revise o termo ou a situação da demanda.
        </p>
      )}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={'Resultados de ' + searchLabel.toLowerCase()}
      >
        <button
          type="button"
          className="action secondary-action"
          disabled={busy || meta.page <= 1}
          onClick={() => setPage(meta.page - 1)}
        >
          Resultados anteriores
        </button>
        <button
          type="button"
          className="action secondary-action"
          disabled={busy || meta.page >= meta.pages}
          onClick={() => setPage(meta.page + 1)}
        >
          Próximos resultados
        </button>
      </div>
    </div>
  );
}
