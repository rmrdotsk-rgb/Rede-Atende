import { ChevronDown } from 'lucide-react';
import type { EducationalRequest } from '../../types';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { CATEGORY_LABELS, formatDateShort } from '../../utils/helpers';
import { DemandActions } from './DemandActions';
export function DemandCard({
  request,
  canEdit,
  loading,
  onDetails,
}: {
  request: EducationalRequest;
  canEdit: boolean;
  loading: boolean;
  onDetails: (request: EducationalRequest, trigger: HTMLElement) => void;
}) {
  return (
    <article
      aria-label={`Demanda ${request.protocol}`}
      data-protocol={request.protocol}
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold text-blue-800">{request.protocol}</span>
        <StatusBadge status={request.status} size="sm" />
      </div>
      <h3 className="font-semibold text-slate-900 leading-snug">{request.subject}</h3>
      <p className="text-sm text-slate-700">{request.schoolName}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <PriorityBadge priority={request.priority} size="sm" />
        <span>
          Registro: <time dateTime={request.createdAt}>{formatDateShort(request.createdAt)}</time>
        </span>
      </div>
      <details className="group border-t border-slate-200 pt-2">
        <summary className="min-h-11 flex items-center text-sm font-semibold text-blue-800">
          Mais informações{' '}
          <ChevronDown className="ml-auto h-4 w-4 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <dl className="space-y-2 text-sm text-slate-700 pb-2">
          <div>
            <dt className="text-slate-600">Categoria</dt>
            <dd>{CATEGORY_LABELS[request.category]}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Previsão</dt>
            <dd>{request.deadline ? formatDateShort(request.deadline) : 'A definir na triagem'}</dd>
          </div>
        </dl>
      </details>
      <DemandActions request={request} canEdit={canEdit} loading={loading} onDetails={onDetails} />
    </article>
  );
}
