import type { HistoryEvent } from '../../types';
import { formatDatePtBr, ROLE_LABELS, STATUS_CONFIG, STATUS_SENTENCES } from '../../utils/helpers';
export function readableHistoryNote(note: string) {
  let text = note;
  for (const [key, config] of Object.entries(STATUS_CONFIG))
    text = text.replace(new RegExp(`\\b${key}\\b`, 'g'), config.label);
  for (const [key, label] of Object.entries(ROLE_LABELS))
    text = text.replace(new RegExp(`\\b${key}\\b`, 'g'), label);
  return text;
}
export function HistoryList({
  history,
  publicOnly = false,
}: {
  history: HistoryEvent[];
  publicOnly?: boolean;
}) {
  return (
    <ol className="space-y-3">
      {history
        .filter((event) => !publicOnly || event.visibility !== 'interna')
        .map((event) => (
          <li
            key={event.id}
            className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-2"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <strong>
                {ROLE_LABELS[event.role]}
                {event.visibility === 'interna' ? ' · Nota interna' : ''}
              </strong>
              <time dateTime={event.timestamp} className="text-slate-600">
                {formatDatePtBr(event.timestamp)}
              </time>
            </div>
            <p className="font-semibold text-slate-800">{STATUS_SENTENCES[event.status]}</p>
            <p className="text-slate-700 whitespace-pre-wrap">{readableHistoryNote(event.note)}</p>
            {event.department && <p className="text-slate-600">Setor: {event.department}</p>}
          </li>
        ))}
    </ol>
  );
}
