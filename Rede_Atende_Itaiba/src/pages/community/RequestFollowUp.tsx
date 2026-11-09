import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { EducationalRequest } from '../../types';
import { storageService } from '../../services/storage';
import { formatDatePtBr, nextStep } from '../../utils/helpers';
import { WORK_ORDER_LABELS } from '../../domain/serviceCatalog';
import { useUnsavedChanges } from '../../components/common/NavigationGuard';
export function RequestFollowUp({ request }: { request: EducationalRequest }) {
  const [response, setResponse] = useState('');
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const citizen = storageService.user?.role === 'cidadao';
  const pending = request.informationRequests?.find((i) => !i.respondedAt);
  const orders = storageService.getWorkOrders(request.id);
  const notifications = storageService.getNotifications('comunidade', request.id);
  useUnsavedChanges(
    busy ||
      (citizen &&
        Boolean(
          (pending && request.status === 'aguardando_informacoes' && response) ||
          (request.status === 'concluida' && !request.satisfaction && (comment || rating !== '5')),
        )),
  );
  return (
    <div className="space-y-5">
      <section className="panel bg-blue-50 border-blue-200 space-y-2">
        <h3 className="font-bold text-blue-950">Próximo passo</h3>
        <p className="text-sm text-slate-800">{nextStep(request)}</p>
        <p className="text-xs text-slate-600">
          Previsão interna de demonstração:{' '}
          {request.deadline ? formatDatePtBr(request.deadline) : 'A definir na triagem'}. Os prazos
          são estimativas por categoria ou configurações internas, sem caráter legal oficial.
        </p>
      </section>
      {feedback && (
        <p role="status" className="panel text-sm text-slate-800">
          {feedback}
        </p>
      )}
      {request.resolution && (
        <section className="panel border-emerald-300 bg-emerald-50">
          <h3 className="font-bold text-emerald-950">Providência final</h3>
          <p className="mt-2 text-sm whitespace-pre-wrap">{request.resolution}</p>
        </section>
      )}
      {citizen && pending && request.status === 'aguardando_informacoes' && (
        <form
          className="panel space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              await storageService.replyToInformation(request.id, pending.id, response);
              setResponse('');
              setFeedback('Informações enviadas. O atendimento retornou à triagem.');
            } catch (err) {
              setFeedback((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="font-bold">Informações solicitadas</h3>
          <p className="text-sm">{pending.prompt}</p>
          <label htmlFor="citizen-response" className="field-label">
            Sua resposta
          </label>
          <textarea
            id="citizen-response"
            className="field"
            rows={3}
            required
            minLength={5}
            maxLength={2000}
            value={response}
            disabled={busy}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Responda somente ao que foi solicitado, sem dados pessoais reais."
          />
          <button className="action" type="submit" disabled={busy}>
            {busy ? 'Enviando informações...' : 'Enviar informações complementares'}
          </button>
        </form>
      )}
      {orders.length > 0 && (
        <section className="panel space-y-3">
          <h3 className="font-bold">Ordens de serviço e execução</h3>
          {orders.map((order) => (
            <article
              key={order.id}
              className="border border-slate-200 rounded-lg p-3 text-sm space-y-2"
            >
              <p className="font-semibold">
                {order.number} · {WORK_ORDER_LABELS[order.status]}
              </p>
              <p>Ordem registrada no ambiente demonstrativo.</p>
              <p className="text-xs text-slate-600">
                Setor: equipe técnica responsável
                {order.required ? ' · Atividade obrigatória' : ' · Atividade complementar'}
              </p>
              {order.status === 'pendente' && (
                <p>Pendência registrada; detalhes restritos à gestão.</p>
              )}
              {order.status === 'cancelada' && (
                <p>Cancelamento justificado no histórico interno.</p>
              )}
              {order.performedService && <p>Providência técnica registrada.</p>}
            </article>
          ))}
        </section>
      )}
      {citizen && request.status === 'concluida' && (
        <section className="panel">
          <h3 className="font-bold mb-3">Avaliação de satisfação</h3>
          {request.satisfaction ? (
            <p className="text-sm">
              Obrigado! Sua avaliação foi registrada: {request.satisfaction.rating}/5.
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                try {
                  await storageService.rateRequest(request.id, Number(rating), comment);
                  setRating('5');
                  setComment('');
                  setFeedback('Avaliação registrada. Obrigado pela participação.');
                } catch (err) {
                  setFeedback((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="satisfaction-rating" className="field-label">
                Como você avalia o atendimento?
              </label>
              <select
                id="satisfaction-rating"
                className="field"
                value={rating}
                disabled={busy}
                onChange={(e) => setRating(e.target.value)}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} —{' '}
                    {
                      [
                        '',
                        'Muito insatisfeito',
                        'Insatisfeito',
                        'Regular',
                        'Satisfeito',
                        'Muito satisfeito',
                      ][n]
                    }
                  </option>
                ))}
              </select>
              <label htmlFor="satisfaction-comment" className="field-label">
                Comentário (opcional)
              </label>
              <textarea
                id="satisfaction-comment"
                className="field"
                maxLength={1000}
                value={comment}
                disabled={busy}
                onChange={(e) => setComment(e.target.value)}
              />
              <button className="action" disabled={busy}>
                {busy ? 'Enviando avaliação...' : 'Enviar avaliação'}
              </button>
            </form>
          )}
        </section>
      )}
      {notifications.length > 0 && (
        <section className="panel">
          <h3 className="font-bold mb-3">Avisos deste protocolo</h3>
          <ul className="space-y-2 text-sm">
            {notifications.slice(0, 8).map((n) => (
              <li key={n.id} className="border-t border-slate-200 py-2">
                <p>Houve uma atualização neste protocolo de demonstração. Consulte o andamento.</p>
                <p className="text-xs text-slate-600 mt-1">{formatDatePtBr(n.createdAt)}</p>
                {!n.readAt && (
                  <button
                    className="text-blue-800 underline text-xs mt-2"
                    onClick={async () => {
                      try {
                        await storageService.markNotificationRead(n.id);
                      } catch (err) {
                        setFeedback((err as Error).message);
                      }
                    }}
                  >
                    Marcar aviso como lido
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link to="/solicitar" className="text-sm text-blue-800 underline">
        Registrar outra solicitação
      </Link>
    </div>
  );
}
