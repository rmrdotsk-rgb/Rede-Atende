import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import type { EducationalRequest } from '../../types';
export function DemandActions({
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
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={(event) => onDetails(request, event.currentTarget)}
        aria-label={`Visualizar detalhes de ${request.protocol}`}
        aria-busy={loading}
        className="action secondary-action inline-flex items-center justify-center gap-2"
      >
        <Eye className="w-4 h-4" aria-hidden="true" />
        {loading ? 'Abrindo...' : 'Detalhes'}
      </button>
      <Link to={`/admin/triagem?demandaId=${request.id}`} className="action secondary-action">
        {canEdit ? 'Despachar' : 'Ver triagem'}
      </Link>
    </div>
  );
}
