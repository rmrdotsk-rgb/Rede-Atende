import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WorkOrder, WorkOrderStatus } from '../../types';
import { storageService } from '../../services/storage';
import { WORK_ORDER_TRANSITIONS, WORK_ORDER_LABELS } from '../../domain/serviceCatalog';
import { formatDatePtBr } from '../../utils/helpers';
import { PriorityBadge } from '../common/Badge';
import { ManagementForm } from '../common/ManagementForm';
export function WorkOrderCard({ order }: { order: WorkOrder }) {
  const [target, setTarget] = useState<WorkOrderStatus>(
    WORK_ORDER_TRANSITIONS[order.status][0] || order.status,
  );
  useEffect(
    () => setTarget(WORK_ORDER_TRANSITIONS[order.status][0] || order.status),
    [order.status],
  );
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false),
    [detail, setDetail] = useState<WorkOrder>(),
    [detailError, setDetailError] = useState('');
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    storageService
      .request<WorkOrder>('/work-orders/' + order.id, { signal: controller.signal })
      .then((value) => {
        setDetail(value);
        setDetailError('');
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setDetailError((e as Error).message);
      });
    return () => controller.abort();
  }, [expanded, order.id, order.updatedAt]);
  const current = detail?.updatedAt === order.updatedAt ? detail : order;
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    setTarget(WORK_ORDER_TRANSITIONS[order.status][0] || order.status);
  }, [order.status]);
  const request = storageService.getRequestById(order.requestId);
  const transitions = WORK_ORDER_TRANSITIONS[order.status];
  return (
    <article className="panel space-y-4" aria-label={`Ordem ${order.number}`}>
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-bold">{order.number}</h3>
        <span className="text-xs font-semibold px-2 py-1 bg-blue-50 rounded-lg text-blue-900">
          {WORK_ORDER_LABELS[order.status]}
        </span>
      </div>
      <p className="font-semibold text-sm">{order.title}</p>
      {order.requestPriority && <PriorityBadge priority={order.requestPriority} size="sm" />}
      <p className="text-xs text-slate-600">
        Protocolo: {order.requestProtocol || request?.protocol || 'Não disponível'} ·{' '}
        {order.requestSchoolName || request?.schoolName || 'Escola não disponível'}
      </p>
      <p className="text-xs text-slate-600">
        {order.department} · {order.technician} ·{' '}
        {order.required ? 'Atividade obrigatória' : 'Atividade complementar'}
      </p>
      {order.appointmentId && (
        <Link to="/admin/agenda" className="text-xs text-blue-800 underline">
          Consultar vistoria na agenda
        </Link>
      )}
      {current.pendingReason && (
        <p className="text-sm">Última pendência: {current.pendingReason}</p>
      )}
      {current.performedService && (
        <p className="text-sm">Serviço realizado: {current.performedService}</p>
      )}
      {current.cancellationReason && (
        <p className="text-sm">Cancelamento justificado: {current.cancellationReason}</p>
      )}
      {feedback && (
        <p role="status" className="text-sm text-slate-800">
          {feedback}
        </p>
      )}
      {transitions.length > 0 && (
        <ManagementForm
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await storageService.updateWorkOrder(order.id, target, note);
              setNote('');
              setFeedback('Ordem atualizada e histórico registrado.');
            } catch (err) {
              setFeedback((err as Error).message);
            }
          }}
        >
          <label htmlFor={`os-status-${order.id}`} className="field-label">
            Nova situação da ordem
          </label>
          <select
            id={`os-status-${order.id}`}
            className="field"
            value={target}
            onChange={(e) => setTarget(e.target.value as WorkOrderStatus)}
          >
            {transitions.map((status) => (
              <option key={status} value={status}>
                {WORK_ORDER_LABELS[status]}
              </option>
            ))}
          </select>
          <label htmlFor={`os-note-${order.id}`} className="field-label">
            {target === 'concluida'
              ? 'Serviço realizado'
              : target === 'pendente'
                ? 'Motivo da pendência'
                : target === 'cancelada'
                  ? 'Justificativa de cancelamento'
                  : 'Providência registrada'}{' '}
            *
          </label>
          <textarea
            id={`os-note-${order.id}`}
            className="field"
            rows={2}
            minLength={5}
            maxLength={4000}
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="action">Atualizar ordem</button>
        </ManagementForm>
      )}
      <details className="text-xs" onToggle={(e) => setExpanded(e.currentTarget.open)}>
        <summary className="font-semibold">Detalhes e histórico da ordem</summary>
        {detailError && (
          <p role="alert" className="text-red-800">
            {detailError}
          </p>
        )}
        {expanded && !detail && !detailError && <p role="status">Carregando histórico...</p>}
        <ol className="space-y-2 mt-3">
          {current.history.map((h) => (
            <li key={h.id} className="border-t border-slate-200 pt-2">
              <p>
                {formatDatePtBr(h.timestamp)} · {WORK_ORDER_LABELS[h.status]}
              </p>
              <p className="mt-1">{h.note}</p>
            </li>
          ))}
        </ol>
      </details>
      <Link
        className="text-xs text-blue-800 underline"
        to={`/admin/triagem?demandaId=${order.requestId}`}
      >
        Abrir demanda na triagem
      </Link>
    </article>
  );
}
