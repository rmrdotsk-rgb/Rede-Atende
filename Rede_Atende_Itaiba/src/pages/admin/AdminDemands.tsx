/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - Gestão Geral de Demandas
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, RotateCcw } from 'lucide-react';
import { storageService } from '../../services/storage';
import { EducationalRequest, SchoolUnit } from '../../types';
import { StatusBadge, PriorityBadge } from '../../components/common/Badge';
import { StatusTimeline } from '../../components/common/StatusTimeline';
import { CATEGORY_LABELS, formatDatePtBr, formatDateShort } from '../../utils/helpers';
import { Modal } from '../../components/common/Modal';
import { DEPARTMENTS } from '../../domain/serviceCatalog';
import { useDemandFilters } from '../../hooks/useDemandFilters';
import { suggestPriority } from '../../domain/governance';
import { RequestDetails } from '../../components/common/RequestDetails';
import { DemandCard } from '../../components/admin/DemandCard';
import { DemandActions } from '../../components/admin/DemandActions';
import { useDemandDetails } from '../../hooks/useDemandDetails';

export const AdminDemands: React.FC = () => {
  const [requests, setRequests] = useState<EducationalRequest[]>([]);
  const [schools, setSchools] = useState<SchoolUnit[]>([]);

  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    departmentFilter,
    setDepartmentFilter,
    schoolFilter,
    setSchoolFilter,
    zoneFilter,
    setZoneFilter,
    slaFilter,
    setSlaFilter,
    technicianFilter,
    setTechnicianFilter,
    fromFilter,
    setFromFilter,
    toFilter,
    setToFilter,
    priorityFilter,
    setPriorityFilter,
    sort,
    setSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    clearFilters,
  } = useDemandFilters();

  const [total, setTotal] = useState(0),
    [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const { selectedRequest, loadingId, openDetails, closeDetails } = useDemandDetails(setError);
  const canEdit = storageService.user?.role !== 'auditor';
  useEffect(() => {
    setSchools(storageService.getSchools());
    return storageService.subscribe(() => {
      if (!storageService.connectionError) {
        setSchools(storageService.getSchools());
        setRefreshToken((n) => n + 1);
      }
    });
  }, []);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const selected = (value: string) => (value === 'all' ? undefined : value);
    const timer = setTimeout(() => {
      storageService
        .searchRequests(
          {
            page,
            pageSize,
            sort,
            priority: selected(priorityFilter),
            search: searchTerm,
            status: selected(statusFilter),
            category: selected(categoryFilter),
            department: selected(departmentFilter),
            schoolId: selected(schoolFilter),
            zone: selected(zoneFilter),
            sla: selected(slaFilter),
            technician: technicianFilter || undefined,
            from: fromFilter || undefined,
            to: toFilter || undefined,
          },
          controller.signal,
        )
        .then((result) => {
          if (cancelled) return;
          setRequests(result.items);
          setTotal(result.total);
          setPages(result.pages);
          if (result.page !== page) setPage(result.page);
        })
        .catch((err) => {
          if (!cancelled) setError((err as Error).message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    page,
    pageSize,
    searchTerm,
    statusFilter,
    categoryFilter,
    departmentFilter,
    schoolFilter,
    zoneFilter,
    slaFilter,
    technicianFilter,
    fromFilter,
    toFilter,
    priorityFilter,
    sort,
    refreshToken,
    setPage,
  ]);
  const filteredRequests = requests;

  return (
    <div className="space-y-6">
      {/* Topo com Título e Estatísticas Rápidas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Demandas registradas</h2>
          <p className="text-xs text-slate-500">
            Demandas demonstrativas com referências a escolas de Itaíba.
          </p>
        </div>

        <div
          role="status"
          className="text-xs font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs"
        >
          {loading ? (
            'Consultando demandas...'
          ) : (
            <>
              Mostrando <strong className="text-blue-700">{filteredRequests.length}</strong> de{' '}
              {total} demandas
            </>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Busca textual */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-600 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por protocolo, assunto..."
              aria-label="Buscar demandas por protocolo, assunto, solicitante ou escola"
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Filtro de Status */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
              aria-label="Filtrar por status"
            >
              <option value="all">Todos os Status</option>
              <option value="recebida">Recebida</option>
              <option value="em_triagem">Em Triagem</option>
              <option value="encaminhada">Encaminhada</option>
              <option value="em_atendimento">Em Atendimento</option>
              <option value="concluida">Concluída</option>
              <option value="aguardando_informacoes">Aguardando Informações</option>
            </select>
          </div>

          {/* Filtro de Categoria */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
              aria-label="Filtrar por categoria"
            >
              <option value="all">Todas as Categorias</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro de Escola */}
          <div>
            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
              aria-label="Filtrar por escola"
            >
              <option value="all">Todas as Escolas</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <details
          className="border-t border-slate-200 pt-3"
          open={
            departmentFilter !== 'all' ||
            zoneFilter !== 'all' ||
            slaFilter !== 'all' ||
            !!technicianFilter ||
            !!fromFilter ||
            !!toFilter ||
            priorityFilter !== 'all' ||
            sort !== 'newest' ||
            undefined
          }
        >
          <summary className="min-h-11 flex items-center font-semibold text-blue-900 cursor-pointer">
            Filtros adicionais · setor, prazo e prioridade
          </summary>
          <div className="space-y-3 pt-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="zone-filter" className="field-label">
                  Zona da unidade
                </label>
                <select
                  id="zone-filter"
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  className="field"
                >
                  <option value="all">Urbana e rural</option>
                  <option value="urbana">Zona urbana</option>
                  <option value="rural">Zona rural</option>
                </select>
              </div>
              <div>
                <label htmlFor="sla-filter" className="field-label">
                  Prazo estimado
                </label>
                <select
                  id="sla-filter"
                  value={slaFilter}
                  onChange={(e) => setSlaFilter(e.target.value)}
                  className="field"
                >
                  <option value="all">Todos os prazos</option>
                  <option value="overdue">Somente prazos vencidos</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="demands-department" className="field-label">
                Filtrar por setor
              </label>
              <select
                id="demands-department"
                className="field"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="all">Todos os setores</option>
                <option value="unassigned">Aguardando definição</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="field-label" htmlFor="technician-filter">
                  Responsável
                </label>
                <input
                  id="technician-filter"
                  className="field"
                  value={technicianFilter}
                  maxLength={120}
                  onChange={(e) => setTechnicianFilter(e.target.value)}
                  placeholder="Nome ou equipe"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="from-filter">
                  Registradas desde
                </label>
                <input
                  id="from-filter"
                  className="field"
                  type="date"
                  value={fromFilter}
                  onChange={(e) => setFromFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="to-filter">
                  Registradas até
                </label>
                <input
                  id="to-filter"
                  className="field"
                  type="date"
                  value={toFilter}
                  onChange={(e) => setToFilter(e.target.value)}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 panel">
              <label className="field-label">
                Filtrar por prioridade
                <select
                  className="field mt-1"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <option value="all">Todas as prioridades</option>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </label>
              <label className="field-label">
                Ordenar demandas
                <select
                  className="field mt-1"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">Mais recentes primeiro</option>
                  <option value="oldest">Mais antigas primeiro</option>
                </select>
              </label>
            </div>
          </div>
        </details>
        {(searchTerm ||
          departmentFilter !== 'all' ||
          statusFilter !== 'all' ||
          categoryFilter !== 'all' ||
          schoolFilter !== 'all' ||
          zoneFilter !== 'all' ||
          slaFilter !== 'all' ||
          technicianFilter ||
          fromFilter ||
          toFilter ||
          priorityFilter !== 'all' ||
          sort !== 'newest') && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>
              Filtros ativos:{' '}
              {
                [
                  searchTerm,
                  departmentFilter !== 'all',
                  statusFilter !== 'all',
                  categoryFilter !== 'all',
                  schoolFilter !== 'all',
                  zoneFilter !== 'all',
                  slaFilter !== 'all',
                  technicianFilter,
                  fromFilter,
                  toFilter,
                  priorityFilter !== 'all',
                  sort !== 'newest',
                ].filter(Boolean).length
              }
            </span>
            <button
              onClick={clearFilters}
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar todos os filtros</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="panel text-rose-800">
          <p>{error}</p>
          <button
            type="button"
            className="mt-2 underline"
            onClick={() => setRefreshToken((n) => n + 1)}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!loading && !error && filteredRequests.length === 0 && (
        <p role="status" className="panel text-sm text-slate-600">
          Nenhuma demanda encontrada com os critérios informados.
        </p>
      )}
      <section
        className={
          'xl:hidden grid gap-4 sm:grid-cols-2 ' +
          (loading && requests.length === 0 ? 'min-h-[100svh]' : '')
        }
        aria-label="Lista de demandas"
        aria-busy={loading}
      >
        {filteredRequests.map((request) => (
          <DemandCard
            key={request.id}
            request={request}
            canEdit={canEdit}
            loading={loadingId === request.id}
            onDetails={openDetails}
          />
        ))}
      </section>
      {/* Tabela no desktop, com os mesmos dados e ações dos cartões. */}
      <div
        className={
          'hidden xl:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden ' +
          (loading && requests.length === 0 ? 'min-h-[100svh]' : '')
        }
        aria-busy={loading}
      >
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Resultados das demandas; tabela com rolagem horizontal"
        >
          <table
            aria-label="Demandas registradas"
            className="w-full min-w-[960px] text-left text-xs"
          >
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200 tracking-wider [&_th]:whitespace-nowrap">
              <tr>
                <th className="py-3 px-4">Protocolo</th>
                <th className="py-3 px-4">Escola / Unidade</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Assunto</th>
                <th className="py-3 px-4">Prioridade</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Prazo</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                    {r.protocol}
                  </td>
                  <td
                    className="py-3 px-4 font-semibold text-slate-900 max-w-[200px] truncate"
                    title={r.schoolName}
                  >
                    {r.schoolName}
                  </td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                    {CATEGORY_LABELS[r.category]}
                  </td>
                  <td className="py-3 px-4 text-slate-800 max-w-[240px] truncate" title={r.subject}>
                    {r.subject}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <PriorityBadge priority={r.priority} size="sm" />
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusBadge status={r.status} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                    {formatDateShort(r.deadline)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-center">
                    <DemandActions
                      request={r}
                      canEdit={canEdit}
                      loading={loadingId === r.id}
                      onDetails={openDetails}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <nav
        aria-label="Paginação de demandas"
        className="panel flex flex-wrap items-center justify-between gap-3 text-sm"
      >
        <label className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          Por página
          <select
            aria-label="Demandas por página"
            className="field w-auto"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {[10, 20, 50].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <span role="status">
          Página {page} de {pages} · {total} demandas
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={loading || page <= 1}
            onClick={() => setPage((n) => n - 1)}
          >
            Página anterior
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={loading || page >= pages}
            onClick={() => setPage((n) => n + 1)}
          >
            Próxima página
          </button>
        </div>
      </nav>

      {/* Modal / Drawer de Detalhes da Solicitação Selecionada */}
      {selectedRequest && (
        <Modal titleId="demand-title" onClose={closeDetails}>
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-extrabold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                  {selectedRequest.protocol}
                </span>
                <StatusBadge status={selectedRequest.status} />
                <PriorityBadge priority={selectedRequest.priority} />
              </div>
              <button
                onClick={closeDetails}
                className="p-2 text-slate-600 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h3 id="demand-title" className="text-lg font-bold text-slate-900">
                  {selectedRequest.subject}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registrado em {formatDatePtBr(selectedRequest.createdAt)} por{' '}
                  {selectedRequest.applicantName} ({selectedRequest.applicantRole})
                </p>
              </div>

              {/* Status Timeline */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <StatusTimeline
                  currentStatus={selectedRequest.status}
                  history={selectedRequest.history}
                />
              </div>

              {/* Descrição e Detalhes */}
              <div className="text-xs space-y-3">
                <RequestDetails request={selectedRequest} />
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-950">
                  <strong>
                    Sugestão para triagem: {suggestPriority(selectedRequest).priority.toUpperCase()}
                  </strong>
                  <p>{suggestPriority(selectedRequest).reason}</p>
                  <p className="mt-1 text-xs">
                    Orientação acadêmica. A prioridade só muda por despacho com justificativa.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <span className="text-slate-600 block font-medium">Unidade Escolar:</span>
                    <span className="font-bold text-slate-800">{selectedRequest.schoolName}</span>
                    <span className="text-xs text-slate-500 block">
                      Local: {selectedRequest.locationDetails || 'Geral'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <span className="text-slate-600 block font-medium">Setor Atribuído:</span>
                    <span className="font-bold text-slate-800">
                      {selectedRequest.assignedDepartment || 'Pendente de triagem'}
                    </span>
                    <span className="text-xs text-slate-500 block">
                      Responsável: {selectedRequest.assignedTechnician || 'Não designado'}
                    </span>
                  </div>
                </div>

                {selectedRequest.seiProcessNumber && (
                  <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50 flex items-center justify-between">
                    <div>
                      <span className="text-indigo-900 font-bold block">
                        Autuado no SEI (Simulado)
                      </span>
                      <span className="font-mono text-indigo-700 text-xs">
                        {selectedRequest.seiProcessNumber}
                      </span>
                    </div>
                    <span className="text-xs text-indigo-600 bg-white px-2 py-0.5 rounded border border-indigo-200 font-semibold">
                      Ambiente Acadêmico
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={closeDetails}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
              <Link
                to={`/admin/triagem?demandaId=${selectedRequest.id}`}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
              >
                {canEdit ? 'Abrir na Mesa de Triagem' : 'Consultar triagem'}
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
