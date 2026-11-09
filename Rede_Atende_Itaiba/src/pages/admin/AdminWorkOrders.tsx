import { RequestPicker } from '../../components/common/RequestPicker';
import { WorkspaceControls } from '../../components/common/WorkspaceControls';
import { ManagementForm } from '../../components/common/ManagementForm';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WorkOrderCard } from '../../components/admin/WorkOrderCard';
import { storageService } from '../../services/storage';
import { DEPARTMENTS } from '../../domain/serviceCatalog';
export function AdminWorkOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState(() => storageService.getWorkOrders());
  const [requestId, setRequestId] = useState(searchParams.get('demandaId') || '');
  const filter = searchParams.get('demandaId') || '';
  useEffect(() => {
    const id = searchParams.get('demandaId');
    if (id) setRequestId(id);
  }, [searchParams]);
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [technician, setTechnician] = useState('');
  const [required, setRequired] = useState(true);
  const [inspection, setInspection] = useState('');
  const [feedback, setFeedback] = useState('');
  useEffect(
    () =>
      storageService.subscribe(() => {
        setOrders(storageService.getWorkOrders());
      }),
    [],
  );
  return (
    <div className="space-y-6">
      <WorkspaceControls collection="workOrders" searchable={false} />
      <div>
        <h1 className="text-xl font-bold text-slate-900">Ordens de serviço</h1>
        <p className="text-sm text-slate-600 mt-1">
          Planeje a execução, registre pendências e acompanhe as providências ligadas ao protocolo.
        </p>
      </div>
      <ManagementForm
        className="panel space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const [date, time] = inspection.split('T');
            const order = await storageService.createWorkOrder({
              requestId,
              title,
              department,
              technician,
              required,
              inspectionDate: date || undefined,
              inspectionTime: time || undefined,
            });
            setTitle('');
            setInspection('');
            setFeedback(`Ordem ${order.number} criada com sucesso.`);
          } catch (err) {
            setFeedback((err as Error).message);
          }
        }}
      >
        <h2 className="font-bold">Criar ordem de serviço</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="os-request" className="field-label">
              Solicitação vinculada *
            </label>
            <RequestPicker
              id="os-request"
              value={requestId}
              onChange={setRequestId}
              required
              eligible={['em_triagem', 'encaminhada', 'em_atendimento']}
            />
          </div>
          <div>
            <label htmlFor="os-title" className="field-label">
              Atividade a executar *
            </label>
            <input
              id="os-title"
              className="field"
              required
              minLength={5}
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: vistoriar o bebedouro e reparar vazamento"
            />
          </div>
          <div>
            <label htmlFor="os-department" className="field-label">
              Setor executor *
            </label>
            <select
              id="os-department"
              className="field"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="os-technician" className="field-label">
              Responsável demonstrativo *
            </label>
            <input
              id="os-technician"
              className="field"
              required
              minLength={3}
              maxLength={120}
              value={technician}
              onChange={(e) => setTechnician(e.target.value)}
              placeholder="Ex.: equipe de manutenção (demonstração)"
            />
          </div>
          <div>
            <label htmlFor="os-inspection" className="field-label">
              Agendar vistoria (opcional)
            </label>
            <input
              id="os-inspection"
              type="datetime-local"
              className="field"
              value={inspection}
              onChange={(e) => setInspection(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Atividade obrigatória para concluir a solicitação
          </label>
        </div>
        <p className="text-xs text-slate-600">
          Setores e responsáveis são demonstrativos. Vistorias serão vinculadas à agenda. Atividades
          obrigatórias devem ser concluídas ou canceladas com justificativa.
        </p>
        <button className="action">Criar ordem</button>
        {feedback && (
          <p role="status" className="text-sm">
            {feedback}
          </p>
        )}
      </ManagementForm>
      <section className="space-y-4">
        <div>
          <label htmlFor="os-filter" className="field-label">
            Filtrar ordens por protocolo
          </label>
          <RequestPicker
            id="os-filter"
            value={filter}
            searchLabel="Buscar protocolo para filtrar ordens"
            onChange={(value) => {
              const next = new URLSearchParams(searchParams);
              next.set('pagina', '1');
              value ? next.set('demandaId', value) : next.delete('demandaId');
              setSearchParams(next);
            }}
          />
          {filter && (
            <button
              type="button"
              className="action secondary-action mt-2"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('demandaId');
                next.set('pagina', '1');
                setSearchParams(next);
              }}
            >
              Mostrar todos os protocolos
            </button>
          )}
        </div>
        {orders
          .filter((w) => !filter || w.requestId === filter)
          .map((order) => (
            <WorkOrderCard key={order.id} order={order} />
          ))}
        {!orders.some((w) => !filter || w.requestId === filter) && (
          <p className="panel text-sm text-slate-600">Nenhuma ordem de serviço neste filtro.</p>
        )}
      </section>
    </div>
  );
}
