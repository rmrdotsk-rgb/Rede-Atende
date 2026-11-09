/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - Relatórios gerenciais e exportação de CSV
 */

import React, { useState, useEffect } from 'react';
import { BarChart3, Download, CheckCircle2, Printer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { storageService } from '../../services/storage';
import { DashboardMetrics } from '../../types';
import { CATEGORY_LABELS, downloadCsvFile } from '../../utils/helpers';

export const AdminReports: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [report, setReport] = useState(() => storageService.getManagementReport());
  const [exportFeedback, setExportFeedback] = useState<string>('');

  const refreshData = () => {
    setMetrics(storageService.getDashboardMetrics());
    setReport(storageService.getManagementReport());
  };

  useEffect(() => {
    refreshData();
    const unsubscribe = storageService.subscribe(() => {
      refreshData();
    });
    return unsubscribe;
  }, []);

  const handleExportCsv = async () => {
    if (!metrics?.total) {
      setExportFeedback('Nenhuma demanda disponível para exportação.');
      return;
    }

    let csvContent: string;
    try {
      csvContent = await storageService.exportCsv();
    } catch (e) {
      setExportFeedback((e as Error).message);
      return;
    }
    const today = new Date().toISOString().substring(0, 10);
    const fileName = `rede_atende_itaiba_demandas_${today}.csv`;

    const success = downloadCsvFile(csvContent, fileName);
    if (success) {
      setExportFeedback(`Relatório gerado com sucesso: ${fileName}`);
      setTimeout(() => setExportFeedback(''), 4000);
    } else {
      setExportFeedback('Não foi possível iniciar o download. Tente novamente.');
    }
  };

  if (!metrics || !report) return <p role="status">Carregando indicadores...</p>;

  const resolutionRate =
    metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : 0;

  const operational = storageService.getOperationalMetrics();
  const monthlyCompleted = report.cohortCompleted;
  const monthlyRate = report.cohortResolutionRate;
  const schools = Object.entries(report.bySchool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, total]) => ({ name: name.replace(/^Escola Municipal /, '').slice(0, 32), total }));
  const departmentTma = report.departmentTma;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <span>Relatórios e indicadores de atendimento</span>
          </h2>
          <p className="text-xs text-slate-500">
            Dados fictícios gravados no servidor · período {report.month} · fuso America/Recife
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={!metrics?.total}
          title={
            !metrics?.total
              ? 'Cadastre uma solicitação para exportar.'
              : 'Exporta dados gerenciais sem nome, contato ou descrição pessoal.'
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>Exportar Planilha CSV (UTF-8)</span>
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="action secondary-action no-print text-xs"
        >
          <Printer className="w-4 h-4" /> Imprimir relatório
        </button>
      </div>

      {exportFeedback && (
        <div
          role={exportFeedback.startsWith('Relatório gerado') ? 'status' : 'alert'}
          className={`p-3 rounded-xl border text-sm ${exportFeedback.startsWith('Relatório gerado') ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-red-50 text-red-800 border-red-300'}`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{exportFeedback}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">
            Índice histórico de Resolução
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-700">{resolutionRate}%</span>
            <span className="text-xs text-slate-600">das demandas atendidas</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-2 rounded-full"
              style={{ width: `${resolutionRate}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Tempo Médio de Triagem</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-blue-600">
              {metrics.averageTriageFormatted}
            </span>
            <span className="text-xs text-slate-600">após envio do cidadão</span>
          </div>
          <span className="text-xs text-slate-600">
            Calculado pelo primeiro registro de triagem de cada demanda.
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase">
            Total Auditado no Sistema
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{metrics.total}</span>
            <span className="text-xs text-slate-600">chamados registrados</span>
          </div>
          <span className="text-xs text-slate-500">Base demonstrativa gravada no servidor</span>
        </div>
      </div>

      <section className="panel space-y-4" aria-label="Indicadores mensais e setores">
        <h3 className="font-bold text-base text-slate-900">
          Painel executivo ·{' '}
          {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <p className="rounded-lg border border-slate-200 p-4">
            <span className="block text-xs text-slate-600">
              Resolutividade de demandas abertas no mês
            </span>
            <strong className="text-2xl text-blue-800">{monthlyRate}%</strong>
            <span className="block text-xs">
              {monthlyCompleted} concluídas de {report.cohortTotal} abertas no mês
            </span>
          </p>
          <p className="rounded-lg border border-slate-200 p-4">
            <span className="block text-xs text-slate-600">TMA por setor</span>
            <strong className="text-2xl text-blue-800">{departmentTma.length} setor(es)</strong>
            <span className="block text-xs">Conclusões com timestamps válidos</span>
          </p>
        </div>
        <h4 className="font-semibold text-sm">Três escolas com maior volume de demandas no mês</h4>
        {schools.length > 0 ? (
          <div
            className="h-60 min-h-60"
            role="img"
            aria-label="Gráfico de barras do volume de solicitações por escola"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={schools} margin={{ top: 8, right: 12, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  angle={-12}
                  textAnchor="end"
                  height={70}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" name="Demandas" fill="#1d4ed8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Sem demandas abertas neste mês.</p>
        )}
        <h4 className="font-semibold text-sm">
          Tempo médio de atendimento por setor (horas corridas)
        </h4>
        {departmentTma.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  <th className="p-2">Setor</th>
                  <th className="p-2">Conclusões</th>
                  <th className="p-2">TMA</th>
                </tr>
              </thead>
              <tbody>
                {departmentTma.map((item) => (
                  <tr key={item.name} className="border-t border-slate-200">
                    <td className="p-2">{item.name}</td>
                    <td className="p-2">{item.count}</td>
                    <td className="p-2">{item.tma} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Sem conclusões suficientes para cálculo.</p>
        )}
        <p className="text-xs text-slate-600">
          Indicadores referentes somente aos registros fictícios gravados no servidor; cálculo não
          constitui relatório oficial.
        </p>
      </section>
      <section className="panel space-y-3">
        <h3 className="font-bold text-sm">Execução e satisfação</h3>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-600 text-xs">Ordens de serviço abertas</p>
            <strong>{operational.ordersOpen}</strong>
          </div>
          <div>
            <p className="text-slate-600 text-xs">Ordens concluídas</p>
            <strong>{operational.ordersCompleted}</strong>
          </div>
          <div>
            <p className="text-slate-600 text-xs">Satisfação média</p>
            <strong>
              {operational.satisfaction !== null
                ? operational.satisfaction.toFixed(1) + '/5'
                : 'Sem avaliações'}
            </strong>
            <p className="text-xs text-slate-600">{operational.ratings} avaliações</p>
          </div>
        </div>
        <p className="text-xs text-slate-600">
          CSV gerencial exclui nome, contato, descrição livre, mensagens internas e comentários de
          avaliação.
        </p>
      </section>
      {/* Relatório por Categoria */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Detalhamento por Área da Educação</h3>

        <div className="divide-y divide-slate-100">
          {Object.entries(metrics.byCategory).map(([key, count]) => {
            const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
            return (
              <div key={key} className="py-3 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 w-1/3">
                  {CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS]}
                </span>
                <div className="w-1/3 px-4">
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="w-1/3 text-right font-mono font-bold text-slate-700">
                  {count} demandas ({pct}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
