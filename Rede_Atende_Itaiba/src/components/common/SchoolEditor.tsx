import { useState } from 'react';
import type { SchoolUnit } from '../../types';
import { storageService } from '../../services/storage';
export function SchoolEditor({ school }: { school: SchoolUnit }) {
  const [name, setName] = useState(school.name);
  const [locality, setLocality] = useState(school.locality ?? ''),
    [sourceUrl, setSourceUrl] = useState(school.sourceUrl ?? ''),
    [evidenceUrl, setEvidenceUrl] = useState(school.evidenceUrl ?? ''),
    [feedback, setFeedback] = useState('');
  if (storageService.user?.role !== 'gestor') return null;
  return (
    <details className="mt-2">
      <summary className="text-xs font-semibold text-blue-800">
        Editar referência de demonstração
      </summary>
      <form
        className="space-y-3 mt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await storageService.updateSchool({
              ...school,
              name,
              locality,
              sourceUrl: sourceUrl || undefined,
              evidenceUrl: evidenceUrl || undefined,
            });
            setFeedback('Referência salva no servidor. Alteração registrada na auditoria.');
          } catch (e) {
            setFeedback((e as Error).message);
          }
        }}
      >
        <label className="field-label">
          Nome da escola
          <input
            className="field"
            value={name}
            required
            minLength={1}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field-label">
          Localidade
          <input
            className="field"
            value={locality}
            maxLength={250}
            onChange={(e) => setLocality(e.target.value)}
          />
        </label>
        <label className="field-label">
          Fonte municipal (URL)
          <input
            className="field"
            type="url"
            value={sourceUrl}
            maxLength={1000}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </label>
        <label className="field-label">
          Evidência complementar (URL)
          <input
            className="field"
            type="url"
            value={evidenceUrl}
            maxLength={1000}
            onChange={(e) => setEvidenceUrl(e.target.value)}
          />
        </label>
        <button className="action">Salvar referência</button>
        {feedback && (
          <p role="status" className="text-xs">
            {feedback}
          </p>
        )}
      </form>
    </details>
  );
}
