import { useState } from 'react';
import { storageService } from '../../services/storage';
export function HolidaySettings() {
  const [dates, setDates] = useState(storageService.getHolidays().join('\n')),
    [reason, setReason] = useState(''),
    [feedback, setFeedback] = useState('');
  if (storageService.user?.role !== 'gestor')
    return (
      <p className="panel text-sm">
        Calendário de feriados configurado:{' '}
        {storageService.getHolidays().join(', ') || 'nenhuma data'}. Alterações são restritas ao
        gestor.
      </p>
    );
  return (
    <form
      className="panel space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await storageService.configureHolidays(
            dates
              .split(/[\n,]+/)
              .map((s) => s.trim())
              .filter(Boolean),
            reason,
          );
          setFeedback('Calendário salvo para novos prazos. Registros existentes preservados.');
          setReason('');
        } catch (e) {
          setFeedback((e as Error).message);
        }
      }}
    >
      <h2 className="font-bold">Feriados de demonstração</h2>
      <p className="text-xs text-slate-600">
        Aplicados somente aos dias úteis por categoria. Datas configuráveis para ensaio; sem caráter
        legal oficial.
      </p>
      <label className="field-label" htmlFor="holiday-dates">
        Datas (AAAA-MM-DD, uma por linha)
      </label>
      <textarea
        id="holiday-dates"
        className="field"
        value={dates}
        onChange={(e) => setDates(e.target.value)}
        rows={3}
      />
      <label className="field-label" htmlFor="holiday-reason">
        Justificativa do calendário
      </label>
      <input
        className="field"
        id="holiday-reason"
        required
        minLength={5}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button className="action">Salvar calendário</button>
      {feedback && <p role="status">{feedback}</p>}
    </form>
  );
}
