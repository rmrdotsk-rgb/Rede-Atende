import { useState } from 'react';
import { storageService } from '../../services/storage';
import { AttachmentLinks } from './AttachmentLinks';
export function AdminDataTools() {
  const [feedback, setFeedback] = useState(''),
    [busy, setBusy] = useState(false);
  if (storageService.user?.role !== 'gestor') return null;
  return (
    <details className="panel no-print mt-6">
      <summary className="font-bold">Backup e importação de dados antigos</summary>
      <p className="text-sm my-3">
        A importação acrescenta registros, preserva protocolos e cancela a operação inteira se
        houver conflito. Registros legados ficam restritos à gestão. O backup deste botão contém
        dados de atendimento; a cópia completa com anexos usa o comando descrito no README.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className="action secondary-action"
          onClick={async () => {
            try {
              const state = await storageService.request('/admin/backup');
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'rede-atende-backup-atendimento.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setFeedback('Backup de atendimento gerado. Guarde em local privado.');
            } catch (e) {
              setFeedback((e as Error).message);
            }
          }}
        >
          Baixar backup de atendimento
        </button>
        <label className="text-sm font-semibold">
          Importar JSON legado
          <input
            aria-label="Importar JSON legado"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            className="block mt-2 max-w-full"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                setFeedback('Arquivo excede 2 MB.');
                return;
              }
              setBusy(true);
              try {
                const result = await storageService.importLegacy(JSON.parse(await file.text()));
                setFeedback(`${result.imported} solicitações importadas sem remoções.`);
              } catch (e) {
                setFeedback((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {feedback && (
        <p role="status" className="text-sm mt-3">
          {feedback}
        </p>
      )}
    </details>
  );
}
export function AdminAttachments({ requestId }: { requestId: string }) {
  return <AttachmentLinks requestId={requestId} />;
}
