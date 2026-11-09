import type { HistoryEvent, RequestStatus } from '../../types';
import { formatDatePtBr } from '../../utils/helpers';
import { AlertTriangle, Check } from 'lucide-react';
const STEPS: { status: RequestStatus; label: string }[] = [
  { status: 'recebida', label: 'Recebida' },
  { status: 'em_triagem', label: 'Em Triagem' },
  { status: 'encaminhada', label: 'Encaminhada' },
  { status: 'em_atendimento', label: 'Em Atendimento' },
  { status: 'concluida', label: 'Concluída' },
];
export function StatusTimeline({
  currentStatus,
  history,
}: {
  currentStatus: RequestStatus;
  history: HistoryEvent[];
}) {
  const waiting = currentStatus === 'aguardando_informacoes';
  const latest = [...history].reverse().find((h) => h.status !== 'aguardando_informacoes');
  const activeStatus = waiting ? (latest?.status ?? 'recebida') : currentStatus;
  const active = Math.max(
    0,
    STEPS.findIndex((s) => s.status === activeStatus),
  );
  return (
    <div className="w-full">
      {waiting && (
        <div
          className="mb-5 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex gap-3"
          role="status"
        >
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            <strong>Aguardando Informações Adicionais.</strong> O atendimento está pausado. Consulte
            a observação no histórico; a retomada passa pela triagem.
          </p>
        </div>
      )}
      <nav aria-label="Progresso da Solicitação">
        <ol className="flex flex-col sm:flex-row gap-4 sm:gap-2">
          {STEPS.map((step, index) => {
            const event = [...history].reverse().find((h) => h.status === step.status);
            const completed = index < active || currentStatus === 'concluida';
            const current = index === active;
            return (
              <li
                key={step.status}
                aria-current={current ? 'step' : undefined}
                className="flex-1 min-w-0 flex sm:flex-col items-start sm:items-center gap-3 sm:gap-2 sm:text-center"
              >
                <span
                  className={`w-8 h-8 rounded-full shrink-0 border-2 flex items-center justify-center text-xs font-bold ${completed ? 'bg-blue-600 border-blue-600 text-white' : current ? 'border-blue-600 text-blue-700 bg-white ring-2 ring-blue-100' : 'border-slate-300 text-slate-600 bg-white'}`}
                >
                  {completed ? <Check className="w-4 h-4" aria-hidden="true" /> : index + 1}
                </span>
                <div>
                  <p
                    className={`text-xs font-semibold ${current || completed ? 'text-slate-900' : 'text-slate-600'}`}
                  >
                    {step.label}
                    {current && waiting ? ' (pausada)' : ''}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {event ? formatDatePtBr(event.timestamp) : 'Etapa pendente'}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
