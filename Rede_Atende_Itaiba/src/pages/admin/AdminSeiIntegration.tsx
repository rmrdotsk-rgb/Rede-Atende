/** Rede Atende — SEI demonstrativo. No connection to government services. */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldAlert, Send, CheckCircle2, Clock, Share2 } from 'lucide-react';
import { storageService } from '../../services/storage';
import { WorkspaceControls } from '../../components/common/WorkspaceControls';
import { StatusBadge, PriorityBadge } from '../../components/common/Badge';
import { formatDatePtBr } from '../../utils/helpers';

export function AdminSeiIntegration() {
  const [, render] = useState(0),
    [params] = useSearchParams();
  const [processingId, setProcessingId] = useState<string | null>(null),
    [feedback, setFeedback] = useState({ message: '', error: false });
  const sending = useRef(false);
  useEffect(() => storageService.subscribe(() => render((n) => n + 1)), []);
  const eligible = storageService.getRequests(),
    integrated = storageService.getIntegratedRequests(),
    logs = storageService.getSeiLogs(),
    totals = storageService.getIntegrationTotals();
  const filtered = !!params.get('busca');
  const simulate = async (id: string) => {
    if (sending.current) return;
    sending.current = true;
    setProcessingId(id);
    setFeedback({ message: '', error: false });
    try {
      const result = await storageService.simulateSeiDispatch(id);
      setFeedback({
        message: `Processo fictício ${result.seiNumber} gerado com sucesso. Nenhum processo oficial foi criado.`,
        error: false,
      });
    } catch (error) {
      setFeedback({ message: (error as Error).message, error: true });
    } finally {
      sending.current = false;
      setProcessingId(null);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Integração SEI simulada</h1>
        <p className="text-sm text-slate-600 mt-2">
          Localize uma demanda triada, simule a autuação e acompanhe o registro administrativo.
        </p>
      </div>
      <div
        className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"
        role="note"
      >
        <ShieldAlert className="w-6 h-6 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-bold">Integração simulada — ambiente acadêmico</p>
          <p className="text-sm mt-1">
            Os processos são fictícios e ficam neste sistema. Nenhum dado é enviado ao SEI, à
            Prefeitura ou a outro serviço governamental.
          </p>
        </div>
      </div>
      <dl className="grid sm:grid-cols-3 gap-4" aria-label="Totais de toda a base">
        {[
          ['Pendentes elegíveis', totals.eligible],
          ['Processos vinculados', totals.integrated],
          ['Operações registradas', totals.logs],
        ].map(([name, total]) => (
          <div className="panel" key={name}>
            <dt className="text-sm text-slate-600">{name}</dt>
            <dd className="text-3xl font-bold text-slate-900 mt-2" data-testid={String(name)}>
              {total}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-slate-600">
        Totais de toda a base. A busca abaixo filtra as três listas; cada uma mantém sua própria
        página.
      </p>
      {feedback.message && (
        <div
          role={feedback.error ? 'alert' : 'status'}
          className={`panel ${feedback.error ? 'text-red-800 border-red-300' : 'text-emerald-800 border-emerald-300'}`}
        >
          {feedback.message}
        </div>
      )}
      <div className="panel">
        <WorkspaceControls
          collection="eligibleRequests"
          searchable
          pageParam="pendentesPagina"
          label="Paginação das demandas elegíveis"
        />
      </div>
      <div className="grid xl:grid-cols-2 gap-6">
        <section className="panel space-y-4" aria-labelledby="sei-pending-title">
          <h2 id="sei-pending-title" className="font-bold text-lg flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-700" aria-hidden="true" />
            Demandas elegíveis
          </h2>
          <p className="text-sm text-slate-600">
            Em triagem, encaminhadas ou em atendimento, sem processo simulado anterior.
          </p>
          {!eligible.length && (
            <p className="empty-state">
              {filtered
                ? 'Nenhuma demanda elegível corresponde à busca. Revise o termo para consultar outras pendências.'
                : totals.eligible
                  ? 'Atualize a lista para consultar as pendências disponíveis.'
                  : 'Não há demandas elegíveis no momento. As solicitações recebidas ou aguardando informações precisam passar pela triagem.'}
            </p>
          )}
          {eligible.map((r) => (
            <article className="request-summary" key={r.id} aria-label={'Demanda ' + r.protocol}>
              <div className="flex flex-wrap justify-between gap-2">
                <Link
                  className="font-mono text-sm font-bold text-blue-700 underline"
                  to={'/admin/triagem?demandaId=' + r.id}
                >
                  {r.protocol}
                </Link>
                <PriorityBadge priority={r.priority} size="sm" />
              </div>
              <h3 className="font-semibold mt-3">{r.subject}</h3>
              <p className="text-sm text-slate-600 mt-1">{r.schoolName}</p>
              <p className="text-sm text-slate-600">
                Setor: {r.assignedDepartment || 'Em triagem'}
              </p>
              <button
                className="action mt-4"
                onClick={() => simulate(r.id)}
                disabled={
                  storageService.user?.role === 'auditor' ||
                  processingId !== null ||
                  !storageService.workspaceReady()
                }
                aria-label={'Simular autuação de ' + r.protocol}
              >
                <Share2 className="w-4 h-4" aria-hidden="true" />
                {processingId === r.id ? 'Autuando processo fictício...' : 'Simular autuação'}
              </button>
            </article>
          ))}
        </section>
        <section className="panel space-y-4" aria-labelledby="sei-integrated-title">
          <h2 id="sei-integrated-title" className="font-bold text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-800" aria-hidden="true" />
            Processos SEI vinculados
          </h2>
          <WorkspaceControls
            collection="integratedRequests"
            pageParam="integradosPagina"
            label="Paginação dos processos vinculados"
          />
          {!integrated.length && (
            <p className="empty-state">
              {filtered
                ? 'Nenhum processo corresponde à busca.'
                : 'Nenhum processo fictício gerado. Comece por uma demanda elegível.'}
            </p>
          )}
          {integrated.map((r) => (
            <article
              key={r.id}
              className="request-summary"
              aria-label={'Processo de ' + r.protocol}
            >
              <Link
                className="font-mono font-bold text-blue-700 underline text-sm"
                to={'/admin/triagem?demandaId=' + r.id}
              >
                {r.protocol}
              </Link>
              <p className="font-mono text-sm text-emerald-800 mt-2">{r.seiProcessNumber}</p>
              <h3 className="font-semibold mt-2">{r.subject}</h3>
              <p className="text-sm text-slate-600 my-2">{r.schoolName}</p>
              <StatusBadge status={r.status} size="sm" />
            </article>
          ))}
        </section>
      </div>
      <section className="panel space-y-4" aria-labelledby="sei-log-title">
        <h2 id="sei-log-title" className="font-bold text-lg flex gap-2 items-center">
          <Clock className="w-5 h-5" aria-hidden="true" />
          Histórico das operações simuladas
        </h2>
        <WorkspaceControls
          collection="seiLogs"
          pageParam="historicoPagina"
          label="Paginação do histórico SEI"
        />
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Tabela do histórico SEI, role lateralmente para consultar as colunas"
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Operações locais; números fictícios sem validade oficial
            </caption>
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                {[
                  'Data/hora (Recife)',
                  'Protocolo',
                  'Processo fictício',
                  'Destino demonstrativo',
                  'Resultado',
                ].map((name) => (
                  <th key={name} scope="col" className="p-3">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="p-3 whitespace-nowrap">{formatDatePtBr(log.timestamp)}</td>
                  <td className="p-3 font-mono">{log.protocol}</td>
                  <td className="p-3 font-mono">{log.seiNumber}</td>
                  <td className="p-3">{log.organ}</td>
                  <td className="p-3 text-emerald-800">{log.statusText}</td>
                </tr>
              ))}
              {!logs.length && (
                <tr>
                  <td colSpan={5} className="p-5 text-slate-600">
                    {filtered
                      ? 'Nenhuma operação corresponde à busca.'
                      : 'Não há operações simuladas registradas.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
