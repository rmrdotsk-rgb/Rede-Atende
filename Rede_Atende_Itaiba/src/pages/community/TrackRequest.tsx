import { WorkspaceControls } from '../../components/common/WorkspaceControls';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende 3.0 - Consulta de Protocolo e Linha do Tempo
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, School, Building2, Paperclip, AlertCircle, Calendar } from 'lucide-react';
import { RequestDetails } from '../../components/common/RequestDetails';
import { HistoryList } from '../../components/common/HistoryList';
import { ReceiptActions } from '../../components/common/ReceiptActions';
import { InstitutionalMark } from '../../components/common/InstitutionalMark';
import { ReceiptSeal } from '../../components/common/ReceiptSeal';
import { AttachmentLinks } from '../../components/common/AttachmentLinks';
import { RequestFollowUp } from './RequestFollowUp';
import { useSafeAction } from '../../components/common/NavigationGuard';
import { storageService } from '../../services/storage';
import { EducationalRequest, Appointment } from '../../types';
import { StatusBadge, PriorityBadge } from '../../components/common/Badge';
import { StatusTimeline } from '../../components/common/StatusTimeline';
import { SlaIndicator } from '../../components/common/SlaIndicator';
import { formatDatePtBr, formatDateShort, CATEGORY_LABELS } from '../../utils/helpers';

function publicAppointments(request: EducationalRequest | undefined): Appointment[] {
  if (!request) return [];
  return storageService
    .getAppointments()
    .filter((a) => a.requestId === request.id || a.protocolRef === request.protocol)
    .map((a) => ({
      ...a,
      notes: undefined,
      technician: 'Equipe de atendimento',
      type: 'Atendimento programado',
    }));
}

export const TrackRequest: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const runWhenSafe = useSafeAction();
  const initialProtocol =
    searchParams.get('protocolo') || storageService.getRequests()[0]?.protocol || '';

  const [protocolQuery, setProtocolQuery] = useState(initialProtocol);
  const [currentRequest, setCurrentRequest] = useState<EducationalRequest | undefined>(() =>
    storageService.getPublicRequestByProtocol(initialProtocol),
  );
  const [allRequests, setAllRequests] = useState<EducationalRequest[]>(() =>
    storageService.getRequests(),
  );
  const [linkedAppointments, setLinkedAppointments] = useState<Appointment[]>(() =>
    publicAppointments(storageService.getPublicRequestByProtocol(initialProtocol)),
  );

  const loadData = (proto: string) => {
    const all = storageService.getRequests();
    setAllRequests(all);
    const found = storageService.getPublicRequestByProtocol(proto);
    setCurrentRequest(found);

    setLinkedAppointments(publicAppointments(found));
  };

  useEffect(() => {
    const proto = searchParams.get('protocolo') || storageService.getRequests()[0]?.protocol || '';
    setProtocolQuery(proto);
    loadData(proto);

    const unsubscribe = storageService.subscribe(() => {
      loadData(searchParams.get('protocolo') || proto);
    });
    return unsubscribe;
  }, [searchParams, setSearchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    handleSelectSample(protocolQuery.trim().toUpperCase());
  };

  const handleSelectSample = (proto: string) => {
    const next = new URLSearchParams({ protocolo: proto });
    if (next.toString() === searchParams.toString()) return;
    void runWhenSafe(async () => {
      setSearchParams(next);
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <WorkspaceControls searchable />
      {/* Barra de Busca de Protocolo */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-600" />
              <span>Acompanhamento de Solicitações Educacionais</span>
            </h1>
            <p className="text-xs text-slate-500">
              Consulte o andamento das solicitações da sua conta, em qualquer dispositivo.
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={protocolQuery}
            onChange={(e) => setProtocolQuery(e.target.value)}
            placeholder="Digite o protocolo (ex: EDU-2026-000001)"
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:ring-3 focus:ring-blue-100 focus:border-blue-600 focus:outline-hidden"
            aria-label="Número de protocolo para consulta"
          />
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shrink-0"
          >
            Buscar
          </button>
        </form>

        {/* Atalhos para protocolos de demonstração */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-600 font-medium">Minhas solicitações:</span>
          {allRequests.slice(0, 5).map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelectSample(r.protocol)}
              className={`font-mono px-2 py-0.5 rounded border transition-colors ${
                currentRequest?.protocol === r.protocol
                  ? 'bg-blue-600 text-white border-blue-600 font-bold'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {r.protocol}
            </button>
          ))}
        </div>
      </section>

      {/* Resultado da Consulta */}
      {currentRequest ? (
        <article className="space-y-6">
          {/* Card Principal de Resumo */}
          <div
            id="protocol-receipt"
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-mono text-sm font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                    {currentRequest.protocol}
                  </span>
                  <StatusBadge status={currentRequest.status} />
                  <PriorityBadge priority={currentRequest.priority} />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-2">{currentRequest.subject}</h2>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <span className="text-xs text-slate-600 block">Registrado em</span>
                <span className="text-xs font-semibold text-slate-700">
                  {formatDatePtBr(currentRequest.createdAt)}
                </span>
              </div>
            </div>

            <div className="print-only">
              <InstitutionalMark />
            </div>
            <p className="print-only text-sm">
              Rede Atende · Comprovante demonstrativo · Itaíba–PE. Sem validade como registro
              oficial na Prefeitura.
            </p>
            <p className="text-sm text-slate-600">
              Categoria: {CATEGORY_LABELS[currentRequest.category]}
            </p>
            <ReceiptSeal />
            <ReceiptActions protocol={currentRequest.protocol} />
            {/* Linha do Tempo Visual das Etapas */}
            <div className="py-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-6">
                Progresso do Atendimento Demonstrativo
              </h3>
              <StatusTimeline
                currentStatus={currentRequest.status}
                history={currentRequest.history}
              />
            </div>

            <SlaIndicator request={currentRequest} />
            {/* Informações Estruturadas da Solicitação */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-sm">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase">
                  <School className="w-4 h-4 text-blue-600" />
                  <span>Unidade Escolar</span>
                </div>
                <p className="font-semibold text-slate-900">{currentRequest.schoolName}</p>
                <p className="text-xs text-slate-500">
                  Local exato: {currentRequest.locationDetails || 'Não especificado'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>Setor & Responsável na SEDUC</span>
                </div>
                <p className="font-semibold text-slate-900">
                  {currentRequest.assignedDepartment || 'Em definição pela equipe de triagem'}
                </p>
                <p className="text-xs text-slate-500">
                  {currentRequest.assignedTechnician
                    ? `Responsável divulgado: ${currentRequest.assignedTechnician}`
                    : 'A equipe do setor é responsável pelo acompanhamento.'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Solicitante: {currentRequest.applicantName} · Contato:{' '}
              {currentRequest.applicantContact || 'Não informado'}. Consulta autorizada pela
              titularidade da conta.
            </p>
            <RequestDetails request={currentRequest} />
            <AttachmentLinks requestId={currentRequest.id} />

            {/* Agendamentos Vinculados */}
            {linkedAppointments.length > 0 && (
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>Atendimento Presencial Agendado</span>
                </h4>
                {linkedAppointments.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between text-xs bg-white p-3 rounded-lg border border-indigo-100 gap-2"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{a.type}</span>
                      <p className="text-slate-500 text-xs">
                        Equipe:{' '}
                        {currentRequest.publicResponsible
                          ? a.technician
                          : 'Setor responsável pela visita'}
                      </p>
                      {a.notes && <p className="text-slate-600 text-xs mt-0.5">{a.notes}</p>}
                    </div>
                    <div className="text-left sm:text-right">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">
                        {a.status}
                      </span>
                      <p className="text-xs font-bold text-slate-700 mt-0.5">
                        {formatDateShort(a.date)} às {a.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Metadados Adicionais */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <span className="text-slate-600 block font-medium">
                  Prazo Estimado de Resolução:
                </span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                  {currentRequest.deadline
                    ? formatDateShort(currentRequest.deadline)
                    : 'Em definição'}
                </span>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <span className="text-slate-600 block font-medium">Anexo Comprobatório:</span>
                <span className="font-semibold text-slate-800 truncate block mt-0.5">
                  {currentRequest.attachmentName ? (
                    <span className="inline-flex items-center gap-1 text-blue-700">
                      <Paperclip className="w-3.5 h-3.5" />
                      {currentRequest.attachmentName}
                    </span>
                  ) : (
                    'Nenhum arquivo anexado'
                  )}
                </span>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 bg-white">
                <span className="text-slate-600 block font-medium">Integração SEI (Simulada):</span>
                <span className="font-semibold text-slate-800 truncate block mt-0.5">
                  {currentRequest.seiProcessNumber ? (
                    <span className="text-indigo-700 font-mono text-xs font-bold">
                      {currentRequest.seiProcessNumber}
                    </span>
                  ) : (
                    'Não autuado no SEI'
                  )}
                </span>
              </div>
            </div>
          </div>

          <RequestFollowUp key={currentRequest.id} request={currentRequest} />
          <section className="panel space-y-4">
            <h3 className="font-bold text-slate-900">Histórico de atendimento</h3>
            <HistoryList history={currentRequest.history} publicOnly />
          </section>
        </article>
      ) : (
        /* Estado não encontrado */
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {allRequests.length === 0 && !protocolQuery.trim()
                ? 'Nenhuma solicitação cadastrada'
                : 'Protocolo não encontrado'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {allRequests.length === 0 && !protocolQuery.trim() ? (
                'Sua conta ainda não tem solicitações. Registre a primeira para acompanhar o atendimento aqui.'
              ) : (
                <>
                  Não encontramos nenhuma solicitação desta conta com o protocolo{' '}
                  <strong className="font-mono text-slate-800">{protocolQuery}</strong>.
                </>
              )}
            </p>
          </div>
          <div className="pt-2">
            <Link
              to="/solicitar"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
            >
              <span>Abrir Nova Solicitação</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
