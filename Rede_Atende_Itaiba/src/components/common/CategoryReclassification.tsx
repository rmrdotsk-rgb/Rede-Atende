import { useState } from 'react';
import type { EducationalRequest, RequestCategory } from '../../types';
import { SERVICE_CATALOG } from '../../domain/serviceCatalog';
import { CATEGORY_LABELS } from '../../utils/helpers';
import { storageService } from '../../services/storage';
import { ManagementForm } from './ManagementForm';

export function CategoryReclassification({
  request,
  onSaved,
}: {
  request: EducationalRequest;
  onSaved: (request: EducationalRequest) => void;
}) {
  const [category, setCategory] = useState(request.category);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  // Captura a versão exibida; uma atualização em outra sessão exige revisão.
  const [version, setVersion] = useState(request.updatedAt);
  if (storageService.user?.role === 'auditor' || request.status === 'concluida') return null;
  return (
    <details className="rounded-xl border border-slate-300 bg-white p-4">
      <summary className="font-semibold text-blue-900 min-h-11 flex items-center">
        Corrigir categoria
      </summary>
      <p className="text-sm text-slate-600 my-3">
        Corrija a classificação sem alterar o relato, o protocolo ou os anexos. O prazo, o setor e o
        responsável atuais serão mantidos; revise-os no despacho se necessário.
      </p>
      <ManagementForm
        className="space-y-3"
        onSubmit={async () => {
          setError('');
          setFeedback('');
          try {
            const saved = await storageService.updateRequest(
              request.id,
              { category, categoryDetails: details },
              undefined,
              undefined,
              undefined,
              false,
              { categoryReason: reason },
              version,
            );
            setVersion(saved.updatedAt);
            onSaved(saved);
            setFeedback(`Categoria corrigida. O protocolo ${saved.protocol} permanece o mesmo.`);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label className="field-label" htmlFor="reclass-category">
          Categoria correta
        </label>
        <select
          id="reclass-category"
          className="field"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value as RequestCategory);
            setDetails({});
            setError('');
            setFeedback('');
          }}
        >
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {category !== request.category && (
          <>
            {SERVICE_CATALOG[category].fields.map((field) => (
              <div key={field.key}>
                <label className="field-label" htmlFor={'reclass-' + field.key}>
                  {field.label}
                  {field.required ? ' *' : ''}
                </label>
                {field.options ? (
                  <select
                    id={'reclass-' + field.key}
                    className="field"
                    required={field.required}
                    value={details[field.key] ?? ''}
                    onChange={(e) => setDetails({ ...details, [field.key]: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    {field.options.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={'reclass-' + field.key}
                    className="field"
                    type={field.type ?? 'text'}
                    required={field.required}
                    maxLength={250}
                    value={details[field.key] ?? ''}
                    placeholder={field.placeholder}
                    onChange={(e) => setDetails({ ...details, [field.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
            <label className="field-label" htmlFor="reclass-reason">
              Motivo da correção (interno)
            </label>
            <textarea
              id="reclass-reason"
              className="field"
              required
              minLength={5}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-sm text-slate-600">
              O titular verá a mudança de categoria. O motivo e os campos anteriores ficam no
              histórico da equipe.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-800">
            {error}
          </p>
        )}
        {feedback && (
          <p role="status" className="text-sm text-green-800">
            {feedback}
          </p>
        )}
        <button type="submit" className="action" disabled={category === request.category}>
          Salvar categoria
        </button>
      </ManagementForm>
    </details>
  );
}
