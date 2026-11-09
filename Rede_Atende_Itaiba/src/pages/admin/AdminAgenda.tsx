import { RequestPicker } from '../../components/common/RequestPicker';
import { WorkspaceControls } from '../../components/common/WorkspaceControls';
import { ManagementForm } from '../../components/common/ManagementForm';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende 3.0 - Módulo Interativo de Agenda Técnica & Vistorias
 */

import { useSearchParams } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  PlusCircle,
  CheckCircle2,
  Filter,
  AlertCircle,
} from 'lucide-react';
import { storageService } from '../../services/storage';
import { Appointment, EducationalRequest, SchoolUnit } from '../../types';
import { Modal } from '../../components/common/Modal';
import { formatDateShort } from '../../utils/helpers';

export const AdminAgenda: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const readOnly = storageService.user?.role === 'auditor';
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [schools, setSchools] = useState<SchoolUnit[]>([]);

  // Filtros
  const statusFilter = searchParams.get('situacao') ?? 'all';

  // Modal de Criação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [type, setType] = useState<string>('Vistoria Predial');
  const [technician, setTechnician] = useState<string>('Técnico de demonstração');
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('09:00');
  const [notes, setNotes] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [cancelId, setCancelId] = useState(''),
    [cancelReason, setCancelReason] = useState(''),
    [cancelError, setCancelError] = useState(''),
    [cancelBusy, setCancelBusy] = useState(false);

  const loadData = () => {
    setAppointments(storageService.getAppointments());
    setSchools(storageService.getSchools());
  };

  useEffect(() => {
    loadData();
    const unsubscribe = storageService.subscribe(() => {
      loadData();
    });
    return unsubscribe;
  }, []);

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!date || !time || !type || !technician) {
      setErrorMessage('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    try {
      let protocolRef = 'DEMANDA-GERAL';
      let schoolId = selectedSchoolId || schools[0]?.id || '';
      let schoolName = schools.find((s) => s.id === schoolId)?.name || '';

      if (selectedRequestId) {
        const req =
          storageService.getRequestById(selectedRequestId) ??
          (await storageService.request<EducationalRequest>(
            '/requests/' + encodeURIComponent(selectedRequestId),
          ));
        if (req) {
          protocolRef = req.protocol;
          schoolId = req.schoolId;
          schoolName = req.schoolName;
        }
      }

      const data = {
        requestId: selectedRequestId || undefined,
        protocolRef,
        schoolId,
        schoolName,
        type,
        technician,
        date,
        time,
        notes: notes.trim() || undefined,
      };
      if (editingId) {
        const { protocolRef: _protocol, schoolName: _school, ...updates } = data;
        await storageService.updateAppointment(editingId, updates);
      } else {
        await storageService.createAppointment({ ...data, status: 'Agendada' });
      }

      setFeedback(
        editingId
          ? 'Agendamento atualizado com sucesso!'
          : 'Atendimento técnico agendado com sucesso e gravado no servidor!',
      );
      setIsModalOpen(false);
      // Limpa formulário
      setSelectedRequestId('');
      setDate('');
      setNotes('');
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao salvar agendamento.');
    }
  };

  const handleCancel = (id: string) => {
    setCancelId(id);
    setCancelReason('');
    setCancelError('');
  };

  const handleConfirm = async (id: string) => {
    try {
      await storageService.updateAppointment(id, { status: 'Confirmada' });
      setFeedback('Status do agendamento atualizado para Confirmada.');
    } catch (err) {
      setFeedback(`Erro: ${err instanceof Error ? err.message : 'Falha ao confirmar.'}`);
    }
    setTimeout(() => setFeedback(''), 4000);
  };

  const handleMarkDone = async (id: string) => {
    try {
      await storageService.updateAppointment(id, { status: 'Realizada' });
      setFeedback('Status do agendamento marcado como Realizada.');
    } catch (err) {
      setFeedback(`Erro: ${err instanceof Error ? err.message : 'Falha ao concluir.'}`);
    }
    setTimeout(() => setFeedback(''), 4000);
  };

  const filteredAppointments = appointments.filter((a) => {
    if (statusFilter === 'all') return true;
    return a.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {cancelId && (
        <Modal
          titleId="cancel-agenda-title"
          onClose={() => {
            if (!cancelBusy) setCancelId('');
          }}
        >
          <form
            className="panel space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (cancelBusy) return;
              setCancelBusy(true);
              setCancelError('');
              try {
                await storageService.cancelAppointment(cancelId, cancelReason);
                setCancelId('');
                setFeedback('Agendamento cancelado com sucesso.');
              } catch (e) {
                setCancelError((e as Error).message);
              } finally {
                setCancelBusy(false);
              }
            }}
          >
            <h2 className="text-xl font-bold" id="cancel-agenda-title">
              Cancelar agendamento
            </h2>
            <p className="text-sm">Informe o motivo. O histórico da equipe será preservado.</p>
            <label className="field-label">
              Motivo do cancelamento *
              <textarea
                className="field mt-1"
                required
                minLength={5}
                maxLength={2000}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={cancelBusy}
              />
            </label>
            {cancelError && (
              <p role="alert" className="text-red-800">
                {cancelError}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button className="action" disabled={cancelBusy}>
                {cancelBusy ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
              <button
                type="button"
                className="action secondary-action"
                disabled={cancelBusy}
                onClick={() => setCancelId('')}
              >
                Voltar sem cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}

      <WorkspaceControls collection="appointments" searchable={false} />
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <span>Agenda e vistorias</span>
          </h2>
          <p className="text-xs text-slate-500">
            Cronograma interativo de visitas presenciais, fiscalizações de frotas e inspeções
            técnicas escolares (Rede Atende)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={(event) => {
              event.currentTarget.focus();
              setEditingId(null);
              setSelectedRequestId(searchParams.get('demandaId') || '');
              setSelectedSchoolId(schools[0]?.id || '');
              setDate('');
              setTime('09:00');
              setNotes('');
              setErrorMessage('');
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Novo Agendamento Técnico</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.startsWith('Erro:') ? 'alert' : 'status'}
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${feedback.startsWith('Erro:') ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-emerald-50 text-emerald-800 border-emerald-300'}`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Filtros e Painel de Vistorias */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Atendimentos e Vistorias Programadas
            </h3>
            <p className="text-xs text-slate-500">
              Gerencie horários, técnicos designados e a situação dos atendimentos escolares
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-600" />
            <select
              value={statusFilter}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                next.set('pagina', '1');
                e.target.value === 'all'
                  ? next.delete('situacao')
                  : next.set('situacao', e.target.value);
                setSearchParams(next);
              }}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 font-medium text-slate-700 focus:outline-hidden"
              aria-label="Filtrar agendamentos por situação"
            >
              <option value="all">Todas as Situações ({appointments.length})</option>
              <option value="Agendada">Agendadas</option>
              <option value="Confirmada">Confirmadas</option>
              <option value="Realizada">Realizadas</option>
              <option value="Cancelada">Canceladas</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredAppointments.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-600">
              Nenhum agendamento encontrado para o filtro selecionado.
            </div>
          ) : (
            filteredAppointments.map((e) => (
              <div
                key={e.id}
                role="article"
                aria-label={`Agendamento com ${e.technician} em ${e.date} às ${e.time}`}
                className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded">
                      {e.protocolRef}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded border ${
                        e.status === 'Confirmada'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : e.status === 'Realizada'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : e.status === 'Cancelada'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {e.status}
                    </span>
                    <span className="text-xs text-slate-600">Demonstrativo</span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-900">{e.type}</h4>
                  <p className="text-xs text-slate-600 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>{e.schoolName}</span>
                  </p>
                  {e.notes && (
                    <p className="text-xs text-slate-500 italic bg-white p-2 rounded border border-slate-200/60">
                      Observação: {e.notes}
                    </p>
                  )}
                  {e.cancellationReason && (
                    <p className="text-xs text-rose-800 bg-white p-2 rounded border border-rose-200">
                      Motivo do cancelamento: {e.cancellationReason}
                    </p>
                  )}
                </div>

                <div className="text-left sm:text-right text-xs text-slate-500 space-y-2 shrink-0">
                  <div className="flex items-center sm:justify-end gap-1.5 font-bold text-slate-800">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      {formatDateShort(e.date)} às {e.time}
                    </span>
                  </div>
                  <div className="flex items-center sm:justify-end gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-600" />
                    <span>{e.technician}</span>
                  </div>

                  {/* Ações interativas */}
                  <div className="flex items-center sm:justify-end gap-1.5 pt-1">
                    {e.status === 'Agendada' && (
                      <button
                        disabled={readOnly}
                        onClick={() => handleConfirm(e.id)}
                        className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold border border-emerald-200 transition-colors"
                      >
                        Confirmar
                      </button>
                    )}
                    {e.status !== 'Realizada' && e.status !== 'Cancelada' && (
                      <>
                        <button
                          className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-800 text-xs font-semibold"
                          disabled={readOnly}
                          onClick={(event) => {
                            event.currentTarget.focus();
                            setEditingId(e.id);
                            setSelectedRequestId(e.requestId || '');
                            setSelectedSchoolId(e.schoolId);
                            setType(e.type);
                            setTechnician(e.technician);
                            setDate(e.date);
                            setTime(e.time);
                            setNotes(e.notes || '');
                            setErrorMessage('');
                            setIsModalOpen(true);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          disabled={readOnly}
                          onClick={() => handleMarkDone(e.id)}
                          className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold border border-blue-200 transition-colors"
                        >
                          Concluir Visita
                        </button>
                        <button
                          disabled={readOnly}
                          onClick={() => handleCancel(e.id)}
                          className="px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold border border-rose-200 transition-colors"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal Interativo para Novo Agendamento */}
      {isModalOpen && (
        <Modal titleId="agenda-title" onClose={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3
                id="agenda-title"
                className="font-bold text-base text-slate-900 flex items-center gap-2"
              >
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>{editingId ? 'Editar Agendamento Técnico' : 'Novo Agendamento Técnico'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Fechar agendamento"
                className="text-slate-600 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <ManagementForm onSubmit={handleCreateAppointment} className="space-y-3 text-xs">
              <div>
                <label
                  htmlFor="adminagenda-field-1"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Vincular a uma Demanda Cadastrada (Opcional)
                </label>
                <RequestPicker
                  id="adminagenda-field-1"
                  value={selectedRequestId}
                  onChange={setSelectedRequestId}
                />
              </div>

              {!selectedRequestId && (
                <div>
                  <label
                    htmlFor="agenda-school"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Unidade escolar *
                  </label>
                  <select
                    id="agenda-school"
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={selectedSchoolId}
                    onChange={(e) => setSelectedSchoolId(e.target.value)}
                    required
                  >
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="adminagenda-field-2"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Tipo de Vistoria *
                  </label>
                  <select
                    id="adminagenda-field-2"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                  >
                    <option value="Vistoria Predial">Vistoria Predial</option>
                    <option value="Inspeção de Transporte Escolar">
                      Inspeção de Transporte Escolar
                    </option>
                    <option value="Inspeção Sanitária / Merenda">
                      Inspeção Sanitária / Merenda
                    </option>
                    <option value="Visita de Apoio Pedagógico">Visita de Apoio Pedagógico</option>
                    <option value="Auditoria de Materiais">Auditoria de Materiais</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="adminagenda-field-3"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Técnico Responsável *
                  </label>
                  <input
                    id="adminagenda-field-3"
                    type="text"
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="adminagenda-field-4"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Data *
                  </label>
                  <input
                    id="adminagenda-field-4"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="adminagenda-field-5"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Horário *
                  </label>
                  <input
                    id="adminagenda-field-5"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="adminagenda-field-6"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Observações Técnicas
                </label>
                <textarea
                  id="adminagenda-field-6"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instruções ou escopo da inspeção..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
                >
                  Salvar Agendamento
                </button>
              </div>
            </ManagementForm>
          </div>
        </Modal>
      )}
    </div>
  );
};
