import type { EducationalRequest } from '../../types';
import { SERVICE_CATALOG } from '../../domain/serviceCatalog';
export function RequestDetails({ request }: { request: EducationalRequest }) {
  const fields = SERVICE_CATALOG[request.category].fields.filter(
    (field) => request.categoryDetails?.[field.key],
  );
  return (
    <section className="rounded-xl border border-slate-200 p-4 space-y-3">
      <h3 className="text-sm font-bold">Dados informados na solicitação</h3>
      <p className="text-sm whitespace-pre-wrap text-slate-700">{request.description}</p>
      <p className="text-xs text-slate-600">
        Localização: {request.locationDetails || 'Não informada'}
      </p>
      {fields.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {fields.map((field) => (
            <div key={field.key}>
              <dt className="text-slate-600">{field.label}</dt>
              <dd className="font-semibold mt-1">{request.categoryDetails?.[field.key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
