import { z } from 'zod';
import type { Sql } from './database';
import { emptyState, holidays } from './repository';
import { HttpError, type User } from '../auth';
import { requestForUser } from '../requestAccess';
import { findRequest, searchRequests, readSchools, requestSearchSchema } from './requestQueries';
import { readReports } from './reports';
import { SEI_ELIGIBLE_SQL, SEI_INTEGRATED_SQL } from './requestQueries';
import { WORK_ORDER_LINK_FIELDS } from './workOrderProjection';
import type {
  Appointment,
  WorkOrder,
  InternalNotification,
  SeiSimulationLog,
  EducationalRequest,
} from '../../src/types';
export const workspaceQuery = z
  .object({
    view: z
      .enum([
        'home',
        'dashboard',
        'demands',
        'triage',
        'orders',
        'agenda',
        'deadlines',
        'reports',
        'integrations',
        'schools',
        'track',
      ])
      .default('home'),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    eligiblePage: z.coerce.number().int().min(1).max(1000000).default(1),
    integratedPage: z.coerce.number().int().min(1).max(1000000).default(1),
    logPage: z.coerce.number().int().min(1).max(1000000).default(1),
    requestId: z.string().max(150).optional(),
    protocol: z.string().max(60).optional(),
    search: z.string().trim().max(150).default(''),
    status: z.string().max(60).optional(),
  })
  .strict();
const publicOrder = (w: WorkOrder): WorkOrder => ({
  ...w,
  title: 'Atividade de atendimento',
  technician: 'Equipe de atendimento',
  history: [],
  performedService: w.performedService ? 'Serviço registrado.' : undefined,
  pendingReason: undefined,
  cancellationReason: undefined,
});
const publicAppointment = (a: Appointment): Appointment => ({
  ...a,
  type: 'Atendimento programado',
  technician: 'Equipe de atendimento',
  notes: undefined,
  cancellationReason: undefined,
});
export const orderForUser = (w: WorkOrder, user: User) =>
  user.role === 'cidadao' ? publicOrder(w) : w;
export const appointmentForUser = (a: Appointment, user: User) =>
  user.role === 'cidadao' ? publicAppointment(a) : a;

export async function readWorkspace(
  sql: Sql,
  user: User | undefined,
  q: z.infer<typeof workspaceQuery>,
) {
  const state = {
    ...emptyState(),
    attachments: [] as unknown[],
    holidays: [] as string[],
    lists: {} as Record<string, { page: number; pages: number; total: number; pageSize: number }>,
    unread: 0,
    integratedRequests: [] as EducationalRequest[],
    integrationTotals: { eligible: 0, integrated: 0, logs: 0 },
  };
  state.schools = await readSchools(sql);
  if (!user) {
    if (q.view !== 'home')
      throw new HttpError(401, 'Entre novamente para consultar o atendimento.');
    return state;
  }
  if (user.role === 'cidadao' && !['home', 'track'].includes(q.view))
    throw new HttpError(403, 'Esta área é exclusiva da equipe.');
  const query = requestSearchSchema.parse({
    page: q.page,
    search: q.search,
    view: 'summary',
    ...(q.view === 'deadlines' ? { sla: 'due' } : {}),
    ...(q.view === 'triage' && q.status ? { status: q.status } : {}),
  });
  const page = await searchRequests(
    sql,
    user,
    q.view === 'integrations'
      ? requestSearchSchema.parse({
          search: q.search,
          view: 'summary',
          sei: 'eligible',
          page: q.eligiblePage,
        })
      : query,
  );
  state.requests = page.items;
  state.lists.requests = {
    page: page.page,
    pages: page.pages,
    total: page.total,
    pageSize: page.pageSize,
  };
  if (q.view === 'integrations') state.lists.eligibleRequests = state.lists.requests;
  const schoolCounts = await sql.query<{ school_id: string; total: string }>(
    `SELECT school_id,count(*)::text AS total FROM requests WHERE status<>'concluida' ${user.role === 'cidadao' ? 'AND owner_id=$1' : ''} GROUP BY school_id`,
    user.role === 'cidadao' ? [user.id] : [],
  );
  const counts = new Map(schoolCounts.rows.map((r) => [r.school_id, Number(r.total)]));
  state.schools = state.schools.map((s) => ({ ...s, activeRequestsCount: counts.get(s.id) ?? 0 }));
  let detail: EducationalRequest | undefined;
  if (q.requestId) detail = await findRequest(sql, user, q.requestId, 'id');
  else if (q.protocol) {
    try {
      detail = await findRequest(sql, user, q.protocol, 'protocol');
    } catch (error) {
      if (!(error instanceof HttpError) || error.statusCode !== 404) throw error;
    }
  } else if (['triage', 'track'].includes(q.view) && page.items[0])
    detail = await findRequest(sql, user, page.items[0].id, 'id');
  if (detail) {
    const i = state.requests.findIndex((r) => r.id === detail!.id);
    if (i < 0) state.requests.unshift(detail);
    else state.requests[i] = detail;
  }
  // OS e agenda de uma demanda são consultadas por vínculo; a lista geral tem páginas de 20.
  for (const [table, key, view] of [
    ['work_orders', 'workOrders', 'orders'],
    ['appointments', 'appointments', 'agenda'],
  ] as const) {
    if (q.view !== view && !detail) continue;
    const params: unknown[] = [],
      where: string[] = [];
    if (user.role === 'cidadao') {
      params.push(user.id);
      where.push(`r.owner_id=$${params.length}`);
    }
    if (detail) {
      params.push(detail.id);
      where.push(`t.request_id=$${params.length}`);
    }
    if (q.view === view && q.status) {
      params.push(q.status);
      where.push(`t.status=$${params.length}`);
    }
    const from = ` FROM ${table} t LEFT JOIN requests r ON r.id=t.request_id${where.length ? ' WHERE ' + where.join(' AND ') : ''}`;
    const total = Number(
        (await sql.query<{ total: string }>('SELECT count(*)::text AS total' + from, params))
          .rows[0].total,
      ),
      pages = Math.max(1, Math.ceil(total / 20)),
      pageNumber = Math.min(q.page, pages);
    params.push(20, (pageNumber - 1) * 20);
    const fields =
      key === 'workOrders'
        ? `(t.data - ARRAY['history','performedService','pendingReason','cancellationReason']) || '{"history":[],"summary":true}'::jsonb || ${WORK_ORDER_LINK_FIELDS}`
        : 't.data';
    const rows = await sql.query<{ data: never }>(
      `SELECT ${fields} AS data${from} ORDER BY t.data->>'createdAt' DESC,t.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    (state[key] as unknown[]) = rows.rows.map((r) =>
      key === 'workOrders' ? orderForUser(r.data, user) : appointmentForUser(r.data, user),
    );
    state.lists[key] = { page: pageNumber, pages, total, pageSize: 20 };
  }
  const audience = user.role === 'cidadao' ? 'comunidade' : 'gestao',
    owned = user.role === 'cidadao' ? ' AND r.owner_id=$2' : '';
  const notificationFrom = ` FROM notifications n JOIN requests r ON r.id=n.request_id LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=$1 WHERE n.audience='${audience}'${owned}`;
  const notificationParams = user.role === 'cidadao' ? [user.id, user.id] : [user.id];
  const notices = await sql.query<{
    data: InternalNotification;
    read_at: Date | null;
    protocol: string;
  }>(
    `SELECT n.data,nr.read_at,r.protocol${notificationFrom} ORDER BY n.data->>'createdAt' DESC,n.id DESC LIMIT 20`,
    notificationParams,
  );
  state.notifications = notices.rows.map(({ data, read_at, protocol }) => ({
    ...data,
    protocol,
    readAt: read_at?.toISOString(),
    message:
      user.role === 'cidadao'
        ? 'Houve uma atualização no atendimento. Consulte o protocolo.'
        : data.message,
  }));
  state.unread = Number(
    (
      await sql.query<{ total: string }>(
        'SELECT count(*)::text AS total' + notificationFrom + ' AND nr.read_at IS NULL',
        notificationParams,
      )
    ).rows[0].total,
  );
  if (detail)
    state.attachments = (
      await sql.query(
        `SELECT id,request_id AS "requestId",name,mime,size FROM attachments WHERE request_id=$1`,
        [detail.id],
      )
    ).rows;
  if (user.role !== 'cidadao' && q.view === 'deadlines') {
    const settings = await sql.query<{
      data: { deadlineRules: typeof state.deadlineRules; ruleHistory: typeof state.ruleHistory };
    }>("SELECT data FROM settings WHERE id='domain'");
    if (settings.rows[0]) Object.assign(state, settings.rows[0].data);
    state.holidays = await holidays(sql);
  }
  if (user.role !== 'cidadao' && q.view === 'integrations') {
    const integrated = await searchRequests(
      sql,
      user,
      requestSearchSchema.parse({
        search: q.search,
        view: 'summary',
        sei: 'integrated',
        page: q.integratedPage,
      }),
    );
    state.integratedRequests = integrated.items;
    state.lists.integratedRequests = {
      page: integrated.page,
      pages: integrated.pages,
      total: integrated.total,
      pageSize: integrated.pageSize,
    };
    const totals = await sql.query<{ eligible: string; integrated: string; logs: string }>(
      `SELECT count(*) FILTER(WHERE ${SEI_ELIGIBLE_SQL})::text AS eligible, count(*) FILTER(WHERE ${SEI_INTEGRATED_SQL})::text AS integrated, (SELECT count(*) FROM sei_simulations)::text AS logs FROM requests r`,
    );
    state.integrationTotals = {
      eligible: Number(totals.rows[0].eligible),
      integrated: Number(totals.rows[0].integrated),
      logs: Number(totals.rows[0].logs),
    };
    const params: unknown[] = [],
      pattern = '%' + q.search.replace(/[\\%_]/g, '\\$&') + '%';
    const where = q.search
      ? " WHERE (r.protocol ILIKE $1 OR r.data->>'subject' ILIKE $1 OR r.data->>'schoolName' ILIKE $1)"
      : '';
    if (q.search) params.push(pattern);
    const from = ' FROM sei_simulations t JOIN requests r ON r.id=t.request_id' + where;
    const total = Number(
        (await sql.query<{ total: string }>('SELECT count(*)::text AS total' + from, params))
          .rows[0].total,
      ),
      pages = Math.max(1, Math.ceil(total / 20)),
      pageNumber = Math.min(q.logPage, pages);
    params.push((pageNumber - 1) * 20);
    state.seiLogs = (
      await sql.query<{ data: SeiSimulationLog }>(
        `SELECT t.data${from} ORDER BY t.data->>'timestamp' DESC,t.id DESC LIMIT 20 OFFSET $${params.length}`,
        params,
      )
    ).rows.map((r) => r.data);
    state.lists.seiLogs = { page: pageNumber, pages, total, pageSize: 20 };
  }
  return {
    ...state,
    ...(user.role !== 'cidadao' && ['dashboard', 'reports'].includes(q.view)
      ? await readReports(sql)
      : {}),
  };
}
