import { CategoryReclassification } from '../../components/common/CategoryReclassification';
import { ReopenRequest } from '../../components/common/ReopenRequest';
import { WorkspaceControls } from '../../components/common/WorkspaceControls';
import { ManagementForm } from '../../components/common/ManagementForm';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - Triagem e encaminhamento
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckSquare, CheckCircle2, Save } from 'lucide-react';
import { AdminAttachments } from '../../components/common/AdminDataTools';
import { RequestDetails } from '../../components/common/RequestDetails';
import { HistoryList } from '../../components/common/HistoryList';
import { DEPARTMENTS } from '../../domain/serviceCatalog';
import { Link } from 'react-router-dom';
import { storageService } from '../../services/storage';
import { EducationalRequest, RequestPriority, RequestStatus } from '../../types';
import { StatusBadge, PriorityBadge } from '../../components/common/Badge';
import { StatusTimeline } from '../../components/common/StatusTimeline';
import { CATEGORY_LABELS, STATUS_CONFIG, isValidStatusTransition } from '../../utils/helpers';

export const AdminTriage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const demandaIdParam = searchParams.get('demandaId');

  const [requests, setRequests] = useState<EducationalRequest[]>(() =>
    storageService.getRequests(),
  );
  const initialRequest = requests.find((r) => r.id === demandaIdParam) ?? requests[0];
  const [selectedId, setSelectedId] = useState<string>(initialRequest?.id ?? '');

  // Estados do formulário de triagem
  const [targetStatus, setTargetStatus] = useState<RequestStatus>(
    initialRequest?.status ?? 'em_triagem',
  );
  const [targetPriority, setTargetPriority] = useState<RequestPriority>(
    initialRequest?.priority ?? 'media',
  );
  const [targetDepartment, setTargetDepartment] = useState<string>(
    initialRequest?.assignedDepartment ?? DEPARTMENTS[0],
  );
  const [targetTechnician, setTargetTechnician] = useState<string>(
    initialRequest?.assignedTechnician ?? '',
  );
  const [observationNote, setObservationNote] = useState<string>('');
  const [estimatedDeadline, setEstimatedDeadline] = useState<string>(() =>
    initialRequest?.deadline
      ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(
          new Date(initialRequest.deadline),
        )
      : '',
  );
  const [visibility, setVisibility] = useState<'publica' | 'interna'>('publica');
  const [priorityReason, setPriorityReason] = useState('');
  const [deadlineReason, setDeadlineReason] = useState('');
  const [publicResponsible, setPublicResponsible] = useState(!!initialRequest?.publicResponsible);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [editingVersion, setEditingVersion] = useState<string>(initialRequest?.updatedAt);

  const populateForm = (req: EducationalRequest) => {
    setEditingVersion(req.updatedAt);
    setTargetStatus(req.status);
    setTargetPriority(req.priority);
    setTargetDepartment(req.assignedDepartment || DEPARTMENTS[0]);
    setTargetTechnician(req.assignedTechnician || '');
    setEstimatedDeadline(
      req.deadline
        ? new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Sao_Paulo',
          }).format(new Date(req.deadline))
        : '',
    );
    setObservationNote('');
    setPriorityReason('');
    setDeadlineReason('');
    setVisibility('publica');
    setPublicResponsible(!!req.publicResponsible);
    setFeedbackMessage('');
  };

  useEffect(() => {
    const list = storageService.getRequests();
    setRequests(list);

    // Define demanda selecionada
    if (list.length > 0) {
      const match = list.find((r) => r.id === demandaIdParam);
      const chosen = match || list[0];
      setSelectedId(chosen.id);
      populateForm(chosen);
    }

    const unsubscribe = storageService.subscribe(() => {
      const list = storageService.getRequests();
      setRequests(list);
    });
    return unsubscribe;
  }, [demandaIdParam, searchParams, setSearchParams]);

  const currentRequest = requests.find((r) => r.id === selectedId);

  const handleSelectRequest = (id: string) => {
    setSelectedId(id);
    setSearchParams({ demandaId: id });
    const req = requests.find((r) => r.id === id);
    if (req) populateForm(req);
  };

  const handleApplyDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRequest || busy) return;
    setBusy(true);
    try {
      const noteToSave =
        observationNote.trim() ||
        (['concluida', 'aguardando_informacoes'].includes(targetStatus) &&
        targetStatus !== currentRequest.status
          ? ''
          : `Despacho de triagem: status atualizado para ${STATUS_CONFIG[targetStatus]?.label || targetStatus}. Setor: ${targetDepartment}.`);

      const currentDate = currentRequest.deadline
        ? new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Sao_Paulo',
          }).format(new Date(currentRequest.deadline))
        : '';
      const deadlineIso =
        estimatedDeadline === currentDate
          ? currentRequest.deadline
          : estimatedDeadline
            ? new Date(`${estimatedDeadline}T23:59:59-03:00`).toISOString()
            : undefined;

      const updated = await storageService.updateRequest(
        currentRequest.id,
        {
          status: targetStatus,
          priority: targetPriority,
          assignedDepartment: targetDepartment,
          assignedTechnician: targetTechnician.trim() || undefined,
          deadline: deadlineIso,
        },
        noteToSave,
        'Equipe de Triagem SEDUC Itaíba',
        'triagem_seduc',
        false,
        { visibility, priorityReason, deadlineReason, publicResponsible },
        editingVersion,
      );
      populateForm(updated);

      setFeedbackMessage('Despacho aplicado com sucesso! Histórico e status sincronizados.');
      setTimeout(() => setFeedbackMessage(''), 4000);
    } catch (err) {
      setFeedbackMessage(
        `Erro: ${err instanceof Error ? err.message : 'Falha ao aplicar despacho.'}`,
      );
    } finally {
      setBusy(false);
    }
  };

  // Atalhos rápidos de fluxo (Recebida -> Triar -> Encaminhar -> Concluir)
  const auditor = storageService.user?.role === 'auditor';
  const handleQuickAdvance = async (newStatus: RequestStatus, note: string) => {
    if (!currentRequest || busy) return;
    setBusy(true);
    try {
      if (newStatus === 'concluida' && observationNote.trim().length < 5)
        throw new Error('Registre a providência final no campo de parecer antes de concluir.');
      await storageService.updateRequest(
        currentRequest.id,
        {
          status: newStatus,
          assignedDepartment: targetDepartment,
          assignedTechnician: targetTechnician.trim() || 'Equipe Técnica (Demonstração)',
        },
        newStatus === 'concluida' ? observationNote.trim() : note,
        'Gestão de Triagem SEDUC',
        'triagem_seduc',
        false,
        {},
        editingVersion,
      );
      const saved = storageService.getRequestById(currentRequest.id);
      if (saved) populateForm(saved);
      setTargetStatus(newStatus);
      setFeedbackMessage(`Ação rápida executada: ${STATUS_CONFIG[newStatus].label}!`);
    } catch (error) {
      setFeedbackMessage(`Erro: ${error instanceof Error ? error.message : 'Falha ao atualizar.'}`);
    }
    setBusy(false);
    setTimeout(() => setFeedbackMessage(''), 4000);
  };

  return (
    <div className="space-y-6">
      <WorkspaceControls collection="requests" searchable={true} />
      {/* Título */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-blue-600" />
          <span>Triagem e encaminhamento</span>
        </h2>
        <p className="text-xs text-slate-500">
          Analise o chamado, atribua responsabilidades, determine prazos e atualize o status da
          solicitação
        </p>
      </div>

      {currentRequest && (
        <button
          type="button"
          className="text-sm text-blue-800 underline"
          onClick={async () => {
            try {
              await storageService.refresh();
              const fresh = storageService.getRequestById(currentRequest.id);
              if (fresh) populateForm(fresh);
            } catch (error) {
              setFeedbackMessage(`Erro: ${(error as Error).message}`);
            }
          }}
        >
          Atualizar dados da solicitação
        </button>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Painel Esquerdo: Lista de Demandas para Selecionar */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Fila de Demandas ({requests.length})
            </span>
            <span className="text-xs text-slate-600">Clique para triar</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {requests.map((r) => {
              const isSelected = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  onClick={() => handleSelectRequest(r.id)}
                  className={`w-full text-left p-3.5 transition-all text-xs flex flex-col gap-1.5 ${
                    isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold text-blue-700">{r.protocol}</span>
                    <StatusBadge status={r.status} size="sm" />
                  </div>
                  <p className="font-semibold text-slate-800 line-clamp-1">{r.subject}</p>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="truncate max-w-[150px]">{r.schoolName}</span>
                    <PriorityBadge priority={r.priority} size="sm" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel Direito: Workbench de Triagem e Despacho */}
        <div className="lg:col-span-8 space-y-6">
          {currentRequest ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
              {/* Feedback de Ação */}
              {feedbackMessage && (
                <div
                  className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${feedbackMessage.startsWith('Erro:') ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-emerald-50 text-emerald-800 border-emerald-300'}`}
                  role={feedbackMessage.startsWith('Erro:') ? 'alert' : 'status'}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{feedbackMessage}</span>
                </div>
              )}

              {/* Cabeçalho da Demanda Ativa */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-extrabold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                      {currentRequest.protocol}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {CATEGORY_LABELS[currentRequest.category]}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">
                    {currentRequest.subject}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {currentRequest.schoolName} • Solicitante: {currentRequest.applicantName} (
                    {currentRequest.applicantRole})
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={currentRequest.status} />
                  <PriorityBadge priority={currentRequest.priority} />
                </div>
              </div>

              <ReopenRequest request={currentRequest} onSaved={populateForm} />
              <RequestDetails request={currentRequest} />
              <AdminAttachments requestId={currentRequest.id} />
              {/* Status Timeline */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <StatusTimeline
                  currentStatus={currentRequest.status}
                  history={currentRequest.history}
                />
              </div>

              {/* Ações Rápidas de Transição */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2">
                <span className="text-xs font-bold text-blue-900 uppercase tracking-wide block">
                  Ações Rápidas de Fluxo
                </span>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickAdvance(
                        'em_triagem',
                        'Demanda colocada em triagem técnica pela SEDUC.',
                      )
                    }
                    disabled={
                      busy ||
                      auditor ||
                      currentRequest.status === 'em_triagem' ||
                      !isValidStatusTransition(currentRequest.status, 'em_triagem')
                    }
                    title="Disponível apenas em uma transição permitida para triagem."
                    className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-semibold shadow-2xs transition-colors"
                  >
                    Mover para "Em Triagem"
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickAdvance(
                        'encaminhada',
                        `Demanda validada e encaminhada ao setor: ${targetDepartment}.`,
                      )
                    }
                    disabled={
                      busy ||
                      auditor ||
                      currentRequest.status === 'encaminhada' ||
                      !isValidStatusTransition(currentRequest.status, 'encaminhada')
                    }
                    title="Requer uma etapa anterior compatível."
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-2xs transition-colors"
                  >
                    Mover para "Encaminhada"
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickAdvance(
                        'em_atendimento',
                        'Atendimento iniciado pelo setor responsável.',
                      )
                    }
                    disabled={
                      busy ||
                      auditor ||
                      currentRequest.status === 'em_atendimento' ||
                      !isValidStatusTransition(currentRequest.status, 'em_atendimento')
                    }
                    title="Requer encaminhamento anterior."
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-2xs transition-colors"
                  >
                    Mover para "Em Atendimento"
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickAdvance(
                        'concluida',
                        'Serviço finalizado e vistoriado com sucesso.',
                      )
                    }
                    disabled={
                      busy ||
                      auditor ||
                      !isValidStatusTransition(currentRequest.status, 'concluida') ||
                      currentRequest.status === 'concluida'
                    }
                    title="Disponível após a etapa Em Atendimento."
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold shadow-2xs transition-colors"
                  >
                    Finalizar como "Concluída"
                  </button>
                </div>
              </div>

              {/* Formulário Detalhado de Triagem */}
              <ManagementForm onSubmit={handleApplyDispatch} className="space-y-4 pt-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Configuração de Despacho & Atribuição de Competência
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Status Alvo */}
                  <div>
                    <label
                      htmlFor="admintriage-field-1"
                      className="block text-xs font-bold text-slate-700 uppercase mb-1"
                    >
                      Status da Solicitação *
                    </label>
                    <select
                      id="admintriage-field-1"
                      value={targetStatus}
                      onChange={(e) => setTargetStatus(e.target.value as RequestStatus)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-blue-100"
                    >
                      {Object.entries(STATUS_CONFIG)
                        .filter(([status]) =>
                          isValidStatusTransition(currentRequest.status, status as RequestStatus),
                        )
                        .map(([status, config]) => (
                          <option key={status} value={status}>
                            {config.label}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Prioridade */}
                  <div>
                    <label
                      htmlFor="admintriage-field-2"
                      className="block text-xs font-bold text-slate-700 uppercase mb-1"
                    >
                      Classificação de Prioridade *
                    </label>
                    <select
                      id="admintriage-field-2"
                      value={targetPriority}
                      onChange={(e) => setTargetPriority(e.target.value as RequestPriority)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="baixa">Baixa (Rotina habitual)</option>
                      <option value="media">Média (Atenção programada)</option>
                      <option value="alta">Alta (Impacto pedagógico direto)</option>
                      <option value="urgente">Urgente (Risco estrutural ou transporte)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Setor */}
                  <div>
                    <label
                      htmlFor="admintriage-field-3"
                      className="block text-xs font-bold text-slate-700 uppercase mb-1"
                    >
                      Setor Responsável na SEDUC *
                    </label>
                    <select
                      id="admintriage-field-3"
                      value={targetDepartment}
                      onChange={(e) => setTargetDepartment(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-blue-100"
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Técnico / Servidor */}
                  <div>
                    <label
                      htmlFor="admintriage-field-4"
                      className="block text-xs font-bold text-slate-700 uppercase mb-1"
                    >
                      Servidor Técnico Designado
                    </label>
                    <input
                      id="admintriage-field-4"
                      type="text"
                      value={targetTechnician}
                      onChange={(e) => setTargetTechnician(e.target.value)}
                      placeholder="Ex: Técnico de demonstração"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                {targetPriority !== currentRequest.priority && (
                  <div>
                    <label htmlFor="priority-reason" className="field-label">
                      Justificativa da prioridade *
                    </label>
                    <textarea
                      id="priority-reason"
                      className="field"
                      value={priorityReason}
                      onChange={(e) => setPriorityReason(e.target.value)}
                      minLength={5}
                      maxLength={2000}
                      placeholder="Descreva o impacto e as informações que justificam a prioridade."
                      required
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={publicResponsible}
                    onChange={(e) => setPublicResponsible(e.target.checked)}
                  />
                  Divulgar o responsável demonstrativo no acompanhamento
                </label>
                {/* Prazo Estimado */}
                <div>
                  <label
                    htmlFor="admintriage-field-5"
                    className="block text-xs font-bold text-slate-700 uppercase mb-1"
                  >
                    Prazo Demonstrativo de Resolução
                  </label>
                  <input
                    id="admintriage-field-5"
                    type="date"
                    value={estimatedDeadline}
                    onChange={(e) => setEstimatedDeadline(e.target.value)}
                    className="w-full sm:w-64 px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <p className="text-xs text-slate-600">
                  Previsões internas em dias corridos. Não são prazos legais oficiais. Alterações de
                  data e prioridade exigem justificativa.
                </p>
                <div>
                  <label htmlFor="deadline-reason" className="field-label">
                    Motivo de reavaliação do prazo
                  </label>
                  <textarea
                    id="deadline-reason"
                    className="field"
                    value={deadlineReason}
                    onChange={(e) => setDeadlineReason(e.target.value)}
                    maxLength={2000}
                    placeholder="Informe o motivo se alterar ou remover a previsão."
                  />
                </div>
                <div>
                  <label htmlFor="dispatch-visibility" className="field-label">
                    Visibilidade da resposta
                  </label>
                  <select
                    id="dispatch-visibility"
                    className="field"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'publica' | 'interna')}
                  >
                    <option value="publica">Resposta pública ao cidadão</option>
                    <option value="interna">Nota interna da equipe</option>
                  </select>
                  <p className="text-xs text-slate-600 mt-2">
                    Mudanças de situação e pedidos de informação são sempre públicos.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <Link
                    className="text-blue-800 underline"
                    to={`/admin/ordens?demandaId=${currentRequest.id}`}
                  >
                    Criar ou consultar ordem de serviço
                  </Link>
                  <Link
                    className="text-blue-800 underline"
                    to={`/admin/agenda?demandaId=${currentRequest.id}`}
                  >
                    Agendar atendimento ou vistoria
                  </Link>
                </div>
                {/* Parecer / Nota de Histórico */}
                <div>
                  <label
                    htmlFor="admintriage-field-6"
                    className="block text-xs font-bold text-slate-700 uppercase mb-1"
                  >
                    Nota de Parecer Técnico / Despacho Institucional
                  </label>
                  <textarea
                    id="admintriage-field-6"
                    rows={3}
                    value={observationNote}
                    onChange={(e) => setObservationNote(e.target.value)}
                    maxLength={4000}
                    placeholder="Registre a providência, a resposta pública, a nota interna ou quais informações o cidadão precisa enviar. Para concluir, descreva o resultado final."
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* Botão de Gravação */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salvar Alterações & Registrar Histórico</span>
                  </button>
                </div>
              </ManagementForm>
              <CategoryReclassification
                key={currentRequest.id + '-' + editingVersion}
                request={currentRequest}
                onSaved={(saved) => {
                  populateForm(saved);
                  setFeedbackMessage(
                    'Categoria corrigida com sucesso. Protocolo, prazo e encaminhamento preservados.',
                  );
                }}
              />

              <section className="pt-4 border-t border-slate-200 space-y-3">
                <h4 className="font-bold text-sm">Histórico de atendimento</h4>
                <HistoryList history={currentRequest.history} />
              </section>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-600">
              Selecione uma solicitação na lista lateral para abrir a mesa de triagem.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
