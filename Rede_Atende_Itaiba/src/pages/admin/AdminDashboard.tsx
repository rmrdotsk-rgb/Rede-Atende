import { AuditLog } from '../../components/common/AuditLog';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - Painel de atendimento educacional
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Layers, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { AdminDataTools } from '../../components/common/AdminDataTools';
import { storageService } from '../../services/storage';
import { DashboardMetrics, EducationalRequest } from '../../types';
import { StatusBadge, PriorityBadge } from '../../components/common/Badge';
import { CATEGORY_LABELS, formatDateShort, STATUS_CONFIG } from '../../utils/helpers';

export const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [requests, setRequests] = useState<EducationalRequest[]>([]);

  const refresh = () => {
    setMetrics(storageService.getDashboardMetrics());
    setRequests(storageService.getRequests());
  };

  useEffect(() => {
    refresh();
    const unsubscribe = storageService.subscribe(() => {
      refresh();
    });
    return unsubscribe;
  }, []);

  if (!metrics) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 text-sm">
        Carregando indicadores do sistema...
      </div>
    );
  }

  const categoryChartData = Object.entries(metrics.byCategory).map(([catKey, count]) => ({
    name: CATEGORY_LABELS[catKey as keyof typeof CATEGORY_LABELS] || catKey,
    shortName: (
      {
        infraestrutura: 'Infra',
        transporte_escolar: 'Transporte',
        alimentacao_merenda: 'Merenda',
        material_didatico: 'Materiais',
        apoio_pedagogico_inclusao: 'Inclusão',
        documentacao_transferencia: 'Documentos',
        outros: 'Outros',
      } as Record<string, string>
    )[catKey],
    total: count,
  }));

  const statusPieData = [
    { name: 'Recebidas', value: metrics.byStatus.recebida, color: '#0EA5E9' },
    {
      name: 'Em Triagem',
      value: metrics.byStatus.em_triagem,
      color: '#F59E0B',
    },
    {
      name: 'Encaminhadas',
      value: metrics.byStatus.encaminhada,
      color: '#6366F1',
    },
    {
      name: 'Em Atendimento',
      value: metrics.byStatus.em_atendimento,
      color: '#3B82F6',
    },
    { name: 'Concluídas', value: metrics.byStatus.concluida, color: '#10B981' },
    {
      name: 'Aguardando Dados',
      value: metrics.byStatus.aguardando_informacoes,
      color: '#F97316',
    },
  ].filter((item) => item.value > 0);

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Resumo dos atendimentos</h2>
          <p className="text-xs text-slate-500">
            Monitoramento centralizado de demandas das escolas municipais urbanas e rurais (Rede
            Atende)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/admin/triagem"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
          >
            <span>Ir para Mesa de Triagem</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div
        className="grid grid-cols-2 lg:grid-cols-3 gap-3"
        aria-label="Indicadores do atendimento"
      >
        {[
          { label: 'Total de solicitações', count: metrics.total, to: '/admin/demandas' },
          {
            label: 'Recebidas',
            count: metrics.byStatus.recebida,
            to: '/admin/demandas?situacao=recebida',
          },
          {
            label: 'Em triagem',
            count: metrics.inTriage,
            to: '/admin/demandas?situacao=em_triagem',
          },
          {
            label: 'Aguardando informações',
            count: metrics.waitingInfo,
            to: '/admin/demandas?situacao=aguardando_informacoes',
          },
          { label: 'Atrasadas', count: metrics.overdueCount, to: '/admin/demandas?prazo=overdue' },
          {
            label: 'Concluídas',
            count: metrics.completed,
            to: '/admin/demandas?situacao=concluida',
          },
        ].map(({ label, count, to }) => (
          <Link
            key={label}
            to={to}
            data-testid={`metric-${label}`}
            className="bg-white border border-slate-200 p-4 rounded-xl hover:border-blue-600 flex flex-col items-start"
          >
            <span className="text-sm text-slate-600">{label}</span>
            <strong className="text-2xl text-slate-900">{count}</strong>
            <span className="text-xs text-blue-800 underline mt-1">Ver demandas</span>
          </Link>
        ))}
      </div>
      <p className="text-sm text-slate-600">
        Em aberto: <strong>{metrics.open}</strong> · Previsão nos próximos 3 dias:{' '}
        <strong>{metrics.nearingDeadline}</strong>
        {' · '}
        <Link to="/admin/ordens" className="text-blue-800 underline">
          Ordens em aberto: {storageService.getOperationalMetrics().ordersOpen}
        </Link>
      </p>

      {/* Gráficos Vivos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Barras: Solicitações por Categoria */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span>Solicitações por Categoria Educacional</span>
              </h3>
              <p className="text-xs text-slate-500">
                Volume de chamados abertos por área de atuação em Itaíba
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
              Total: {metrics.total}
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryChartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 40 }}
              >
                <XAxis
                  dataKey="shortName"
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--chart-tick)' }} />
                <Tooltip
                  formatter={(value: any) => [`${value} demandas`, 'Total']}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="total"
                  fill="#2563EB"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribuição por Status */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Distribuição por Status</span>
            </h3>
            <p className="text-xs text-slate-500">Estágio de tramitação dos chamados</p>
          </div>

          <div className="h-44 w-full flex items-center justify-center">
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    isAnimationActive={false}
                    data={statusPieData}
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-600">Sem dados suficientes</p>
            )}
          </div>

          {/* Legenda do Pie */}
          <div className="space-y-1.5 text-xs">
            {statusPieData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.name}</span>
                </span>
                <span className="font-bold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section
        className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4"
        aria-label="Evolução temporal"
      >
        <h3 className="text-sm font-bold text-slate-900">Evolução de registros por dia</h3>
        {metrics.evolution.length ? (
          <>
            <div className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={metrics.evolution}
                  margin={{ top: 10, left: -20, right: 15, bottom: 10 }}
                >
                  <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip labelFormatter={(value) => formatDateShort(String(value))} />
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="total"
                    name="Solicitações"
                    stroke="#2563eb"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer">Consultar os dados dos gráficos em texto</summary>
              <ul className="mt-2 space-y-1">
                {metrics.evolution.map((d) => (
                  <li key={d.date}>
                    {formatDateShort(d.date)}: {d.total} solicitações
                  </li>
                ))}
                {Object.entries(metrics.byCategory).map(([cat, total]) => (
                  <li key={cat}>
                    {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}: {total}
                  </li>
                ))}
                {Object.entries(metrics.byStatus).map(([status, total]) => (
                  <li key={status}>
                    {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].label}: {total}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Nenhuma solicitação disponível para calcular a evolução.
          </p>
        )}
      </section>

      {/* Tabela Resumida de Demandas Recentes na Visão Geral */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Demandas Recentes Registradas</h3>
            <p className="text-xs text-slate-500">
              Últimas solicitações enviadas pelas escolas municipais
            </p>
          </div>
          <Link
            to="/admin/demandas"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>Ver tabela completa</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Protocolo</th>
                <th className="py-2.5 px-3">Escola</th>
                <th className="py-2.5 px-3">Assunto</th>
                <th className="py-2.5 px-3">Prioridade</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Prazo</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.slice(0, 5).map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{r.protocol}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[180px] truncate">
                    {r.schoolName}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 max-w-[220px] truncate">{r.subject}</td>
                  <td className="py-2.5 px-3">
                    <PriorityBadge priority={r.priority} size="sm" />
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={r.status} size="sm" />
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">{formatDateShort(r.deadline)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <Link
                      to={`/admin/triagem?demandaId=${r.id}`}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-200"
                    >
                      Triar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <AdminDataTools />
      <AuditLog />
    </div>
  );
};
