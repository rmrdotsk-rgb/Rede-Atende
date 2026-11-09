import { useState } from 'react';
import { storageService } from '../../services/storage';
import { formatDatePtBr } from '../../utils/helpers';
interface Entry {
  id: string;
  action: string;
  occurred_at: string;
  actor_id: string | null;
}
export function AuditLog() {
  const [entries, setEntries] = useState<Entry[]>([]),
    [error, setError] = useState('');
  if (!['gestor', 'auditor'].includes(storageService.user?.role ?? '')) return null;
  return (
    <details
      className="panel mt-6"
      onToggle={async (e) => {
        if (!e.currentTarget.open) return;
        try {
          setEntries(await storageService.request<Entry[]>('/audit'));
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <summary className="font-bold">Trilha de auditoria do servidor</summary>
      <p className="text-xs my-3 text-slate-600">
        Até 500 operações recentes. Autoria registrada pela sessão; registros não podem ser
        alterados pela API.
      </p>
      {error && <p role="alert">{error}</p>}
      <ol className="space-y-2 max-h-96 overflow-y-auto">
        {entries.map((item) => (
          <li key={item.id} className="text-xs py-2 border-t border-slate-200">
            <strong>{item.action}</strong> · {formatDatePtBr(item.occurred_at)}
            <p className="text-slate-600 break-all">
              Conta: {item.actor_id ?? 'Tentativa sem autenticação'}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}
