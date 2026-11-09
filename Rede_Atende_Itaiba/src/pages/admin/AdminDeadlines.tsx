import { WorkspaceControls } from '../../components/common/WorkspaceControls';
import { ManagementForm } from '../../components/common/ManagementForm';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HolidaySettings } from '../../components/common/HolidaySettings';
import { storageService } from '../../services/storage';
import {
  formatDatePtBr,
  isDeadlineNear,
  isDeadlineOverdue,
  PRIORITY_CONFIG,
} from '../../utils/helpers';
import type { RequestPriority } from '../../types';
export function AdminDeadlines() {
  const [rules, setRules] = useState(() => storageService.getDeadlineRules());
  const [requests, setRequests] = useState(() => storageService.getRequests());
  const [history, setHistory] = useState(() => storageService.getRuleHistory());
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  useEffect(
    () =>
      storageService.subscribe(() => {
        setRequests(storageService.getRequests());
        setHistory(storageService.getRuleHistory());
      }),
    [],
  );
  return (
    <div className="space-y-6">
      <WorkspaceControls collection="requests" searchable={true} />
      <div>
        <h1 className="text-xl font-bold">Prazos e prioridades</h1>
        <p className="mt-1 text-sm text-slate-600">
          Previsões orientativas por categoria, com possibilidade de substituir os prazos para novos
          registros por regras administrativas em dias corridos. Sem caráter legal oficial.
        </p>
      </div>
      <ManagementForm
        className="panel space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await storageService.configureDeadlineRules(rules, reason);
            setReason('');
            setFeedback(
              'Regras salvas. Valem para novos registros; previsões existentes são reavaliadas individualmente na triagem.',
            );
          } catch (err) {
            setFeedback((err as Error).message);
          }
        }}
      >
        <h2 className="font-bold">Configurar previsão para novos registros</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(Object.keys(PRIORITY_CONFIG) as RequestPriority[]).map((priority) => (
            <div key={priority}>
              <label htmlFor={`rule-${priority}`} className="field-label">
                {PRIORITY_CONFIG[priority].label} (dias)
              </label>
              <input
                id={`rule-${priority}`}
                type="number"
                className="field"
                min={1}
                max={90}
                required
                value={rules[priority]}
                onChange={(e) => setRules({ ...rules, [priority]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <label htmlFor="rule-reason" className="field-label">
          Motivo da configuração *
        </label>
        <textarea
          id="rule-reason"
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={5}
          maxLength={2000}
        />
        <p className="text-xs text-slate-600">
          Registros começam com prioridade média; a triagem justifica qualquer alteração. A
          categoria não define prioridade crítica automaticamente.
        </p>
        <button disabled={storageService.user?.role !== 'gestor'} className="action">
          Salvar regras de prazo
        </button>
        {feedback && (
          <p role="status" className="text-sm">
            {feedback}
          </p>
        )}
      </ManagementForm>
      <HolidaySettings />
      <section className="panel space-y-3">
        <h2 className="font-bold">Demandas próximas do prazo ou atrasadas</h2>
        <p className="text-xs text-slate-600">
          Próximas do prazo: até três dias corridos. Solicitações concluídas ficam fora desta lista.
        </p>
        {requests
          .filter(
            (r) =>
              r.status !== 'concluida' &&
              (isDeadlineNear(r.deadline) || isDeadlineOverdue(r.deadline)),
          )
          .map((r) => (
            <div key={r.id} className="border-t border-slate-200 py-3 text-sm">
              <Link
                to={`/admin/triagem?demandaId=${r.id}`}
                className="text-blue-800 font-semibold underline"
              >
                {r.protocol} · {r.subject}
              </Link>
              <p className="text-xs mt-1">
                {isDeadlineOverdue(r.deadline) ? 'Atrasada' : 'Próxima do prazo'} ·{' '}
                {formatDatePtBr(r.deadline)}
              </p>
            </div>
          ))}
        {!requests.some(
          (r) =>
            r.status !== 'concluida' &&
            (isDeadlineNear(r.deadline) || isDeadlineOverdue(r.deadline)),
        ) && (
          <p className="text-sm text-slate-600">Nenhuma demanda próxima do prazo ou atrasada.</p>
        )}
      </section>
      <section className="panel space-y-3">
        <h2 className="font-bold">Histórico das regras</h2>
        {history.length === 0 && (
          <p className="text-sm text-slate-600">Nenhuma configuração alterada.</p>
        )}
        {history.map((h, i) => (
          <div key={`${h.timestamp}-${i}`} className="text-xs border-t border-slate-200 pt-3">
            <p>
              {formatDatePtBr(h.timestamp)} · {h.reason}
            </p>
            <p className="mt-1">
              {(Object.keys(PRIORITY_CONFIG) as RequestPriority[])
                .map((p) => `${PRIORITY_CONFIG[p].label}: ${h.before[p]} → ${h.after[p]} dias`)
                .join(' · ')}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
