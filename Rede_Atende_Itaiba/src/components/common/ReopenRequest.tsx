import { useState } from 'react';
import type { EducationalRequest, RequestStatus } from '../../types';
import { storageService } from '../../services/storage';
import { Modal } from './Modal';
export function ReopenRequest({
  request,
  onSaved,
}: {
  request: EducationalRequest;
  onSaved: (r: EducationalRequest) => void;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [status, setStatus] = useState<RequestStatus>('em_triagem'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (storageService.user?.role !== 'gestor' || request.status !== 'concluida') return null;
  return (
    <section className="panel border-amber-300 space-y-2">
      <h3 className="font-bold">Reabrir atendimento concluído</h3>
      <p className="text-sm text-slate-600">
        O motivo ficará no histórico público. A avaliação anterior é preservada; reabrir não permite
        uma segunda avaliação.
      </p>
      <button
        className="action"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        Reabrir solicitação
      </button>
      {open && (
        <Modal
          titleId="reopen-title"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form
            className="panel space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              try {
                const saved = await storageService.updateRequest(
                  request.id,
                  { status },
                  reason,
                  undefined,
                  undefined,
                  true,
                  { visibility: 'publica' },
                  request.updatedAt,
                );
                onSaved(saved);
                setOpen(false);
                setReason('');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 id="reopen-title" className="font-bold text-xl">
              Reabrir {request.protocol}
            </h2>
            <label className="field-label">
              Retornar para
              <select
                className="field"
                value={status}
                onChange={(e) => setStatus(e.target.value as RequestStatus)}
                disabled={busy}
              >
                <option value="em_triagem">Em triagem</option>
                <option value="em_atendimento">Em atendimento</option>
              </select>
            </label>
            <label className="field-label">
              Motivo da reabertura *
              <textarea
                className="field"
                required
                minLength={5}
                maxLength={4000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
            </label>
            {error && (
              <p role="alert" className="text-red-800">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button className="action" disabled={busy}>
                {busy ? 'Reabrindo...' : 'Confirmar reabertura'}
              </button>
              <button
                type="button"
                className="action secondary-action"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Voltar sem reabrir
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
