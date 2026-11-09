import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight, RotateCcw } from 'lucide-react';
import type { EducationalRequest } from '../../types';
import { CATEGORY_LABELS, formatDatePtBr, nextStep } from '../../utils/helpers';
import { ReceiptActions } from '../common/ReceiptActions';
import { ReceiptSeal } from '../common/ReceiptSeal';
import { InstitutionalMark } from '../common/InstitutionalMark';
export function RequestReceipt({
  createdRequest,
  uploadError,
  onAnother,
  onRetryUpload,
}: {
  createdRequest: EducationalRequest;
  uploadError: string;
  onAnother: () => void;
  onRetryUpload: () => Promise<void>;
}) {
  const navigate = useNavigate(),
    [retrying, setRetrying] = useState(false),
    retryLock = useRef(false);
  return (
    <div
      id="protocol-receipt"
      className="bg-white rounded-2xl border-2 border-emerald-500 shadow-lg p-6 sm:p-8 space-y-6 animate-in fade-in"
      role="region"
      aria-live="polite"
    >
      <div className="print-only">
        <InstitutionalMark />
      </div>
      <p className="print-only font-bold">Rede Atende · Comprovante demonstrativo · Itaíba–PE</p>
      <div className="flex items-center gap-3 text-emerald-700">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Solicitação Registrada com Sucesso!</h2>
          <p className="text-sm text-slate-500">
            Seu protocolo de demonstração foi gravado no servidor.
          </p>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <span className="text-xs uppercase font-bold text-slate-500">
            Protocolo de demonstração
          </span>
          <span className="font-mono text-xl sm:text-2xl font-extrabold text-blue-700 bg-blue-100/60 px-3 py-1 rounded-lg border border-blue-300">
            {createdRequest.protocol}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div>
            <span className="block text-slate-600">Data e horário:</span>
            <strong>{formatDatePtBr(createdRequest.createdAt)}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Unidade Escolar:</span>
            <span className="font-semibold text-slate-800">{createdRequest.schoolName}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Categoria:</span>
            <span className="font-semibold text-slate-800">
              {CATEGORY_LABELS[createdRequest.category]}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Assunto:</span>
            <span className="font-semibold text-slate-800">{createdRequest.subject}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Status Inicial:</span>
            <span className="inline-block mt-0.5 font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
              Recebida (Aguardando Triagem)
            </span>
          </div>
        </div>
      </div>

      <div className="text-sm text-slate-800 space-y-2">
        <p>
          <strong>Resumo da solicitação:</strong> {createdRequest.description}
        </p>
        <p>
          <strong>Orientação:</strong> consulte o andamento informando o protocolo em qualquer
          dispositivo, entrando na mesma conta. O documento é apenas acadêmico.
        </p>
      </div>
      <p className="text-sm">
        <strong>Próximo passo:</strong> {nextStep(createdRequest)}
      </p>
      <p className="text-xs text-slate-600">
        Previsão interna: {formatDatePtBr(createdRequest.deadline)}. Não é um prazo legal oficial.
      </p>
      <p className="text-xs text-slate-600">
        Demonstração acadêmica. Este comprovante não representa registro oficial na Prefeitura.
      </p>
      {uploadError && (
        <div className="no-print space-y-3">
          <p role="alert" className="text-rose-800 text-sm">
            {uploadError}
          </p>
          <button
            type="button"
            className="action"
            disabled={retrying}
            onClick={async () => {
              if (retryLock.current) return;
              retryLock.current = true;
              setRetrying(true);
              try {
                await onRetryUpload();
              } finally {
                retryLock.current = false;
                setRetrying(false);
              }
            }}
          >
            {retrying ? 'Enviando anexo...' : 'Tentar enviar anexo novamente'}
          </button>
        </div>
      )}
      <ReceiptSeal />
      <ReceiptActions protocol={createdRequest.protocol} />
      <div className="no-print flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate(`/acompanhar?protocolo=${createdRequest.protocol}`)}
          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-colors"
        >
          <span>Acompanhar Linha do Tempo do Protocolo</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onAnother}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Registrar Outra Demanda</span>
        </button>
      </div>
    </div>
  );
}
