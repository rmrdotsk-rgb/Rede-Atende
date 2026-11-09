import type { EducationalRequest } from '../../types';
import { getSlaProgress, getSlaRule } from '../../domain/governance';

export function SlaIndicator({ request }: { request: EducationalRequest }) {
  const result = getSlaProgress(request);
  const rule = getSlaRule(request.category, request.categoryDetails);
  if (!result) return <p className="text-sm text-slate-600">Previsão em definição.</p>;
  return (
    <section
      aria-label="Acompanhamento do prazo estimado"
      className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2"
    >
      <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold">
        <span>Prazo orientativo por categoria</span>
        <span className={result.overdue ? 'text-rose-800' : 'text-emerald-800'}>
          {result.label}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Percentual consumido do prazo estimado"
        aria-valuenow={result.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-3 bg-slate-200 rounded-full overflow-hidden"
      >
        <div
          className={`h-full ${result.overdue ? 'bg-rose-600' : 'bg-blue-700'}`}
          style={{ width: `${result.progress}%` }}
        />
      </div>
      <p className="text-xs text-slate-600">
        Regra inicial simulada: {rule.amount}{' '}
        {rule.unit === 'hours' ? 'horas corridas' : 'dias úteis (calendário configurável)'}. O prazo
        pode ter sido ajustado no painel. Não equivale a SLA oficial nem há alerta externo
        automático.
      </p>
    </section>
  );
}
