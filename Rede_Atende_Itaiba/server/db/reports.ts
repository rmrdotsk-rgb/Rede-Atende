import type { Sql } from './database';
import type { DashboardMetrics, HistoryEvent } from '../../src/types';
import { categories, statuses } from '../../src/domain/schemas';
import { recifeDateKey } from '../../src/domain/governance';

/** Agregações no banco: históricos não atravessam a rede para produzir gráficos. */
export async function readReports(sql: Sql) {
  const now = new Date(),
    month = recifeDateKey(now).slice(0, 7);
  const metrics: DashboardMetrics = {
    total: 0,
    open: 0,
    inTriage: 0,
    nearingDeadline: 0,
    overdueCount: 0,
    completed: 0,
    waitingInfo: 0,
    averageTriageHours: 0,
    averageTriageFormatted: 'Dados insuficientes para calcular',
    byCategory: Object.fromEntries(categories.map((k) => [k, 0])) as DashboardMetrics['byCategory'],
    byStatus: Object.fromEntries(statuses.map((k) => [k, 0])) as DashboardMetrics['byStatus'],
    recentActivity: [],
    evolution: [],
  };
  const groups = await sql.query<{
    category: (typeof categories)[number];
    status: (typeof statuses)[number];
    total: string;
  }>('SELECT category,status,count(*)::text AS total FROM requests GROUP BY category,status');
  for (const g of groups.rows) {
    const n = Number(g.total);
    metrics.total += n;
    metrics.byCategory[g.category] += n;
    metrics.byStatus[g.status] += n;
  }
  metrics.completed = metrics.byStatus.concluida;
  metrics.open = metrics.total - metrics.completed;
  metrics.inTriage = metrics.byStatus.em_triagem;
  metrics.waitingInfo = metrics.byStatus.aguardando_informacoes;
  const due = await sql.query<{ near: string; overdue: string }>(
    "SELECT count(*) FILTER(WHERE deadline >= $1::timestamptz AND deadline <= $1::timestamptz+interval '3 days')::text AS near,count(*) FILTER(WHERE deadline < $1::timestamptz)::text AS overdue FROM requests WHERE status<>'concluida'",
    [now.toISOString()],
  );
  metrics.nearingDeadline = Number(due.rows[0].near);
  metrics.overdueCount = Number(due.rows[0].overdue);
  const triage = await sql.query<{ hours: number | null }>(
    `SELECT avg(extract(epoch from (t.first_at-r.created_at))/3600)::float8 AS hours FROM requests r JOIN (SELECT h.request_id,min(h.occurred_at) AS first_at FROM request_history h JOIN requests source ON source.id=h.request_id WHERE h.data->>'status' IN ('em_triagem','encaminhada','em_atendimento') AND h.occurred_at>=source.created_at GROUP BY h.request_id) t ON t.request_id=r.id`,
  );
  if (triage.rows[0].hours !== null) {
    const h = Number(triage.rows[0].hours);
    metrics.averageTriageHours = h;
    metrics.averageTriageFormatted = h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h)}h`;
  }
  metrics.recentActivity = (
    await sql.query<{ data: HistoryEvent }>(
      'SELECT data FROM request_history ORDER BY occurred_at DESC,id DESC LIMIT 8',
    )
  ).rows.map((r) => r.data);
  metrics.evolution = (
    await sql.query<{ date: string; total: string }>(
      `SELECT to_char(created_at AT TIME ZONE 'America/Recife','YYYY-MM-DD') AS date,count(*)::text AS total FROM requests GROUP BY 1 ORDER BY 1 DESC LIMIT 90`,
    )
  ).rows
    .map((r) => ({ date: r.date, total: Number(r.total) }))
    .reverse();
  const cohortWhere = "to_char(created_at AT TIME ZONE 'America/Recife','YYYY-MM')=$1";
  const cohort = await sql.query<{ total: string; completed: string }>(
    `SELECT count(*)::text AS total,count(*) FILTER(WHERE status='concluida')::text AS completed FROM requests WHERE ${cohortWhere}`,
    [month],
  );
  const bySchool = Object.fromEntries(
    (
      await sql.query<{ name: string; total: string }>(
        `SELECT data->>'schoolName' AS name,count(*)::text AS total FROM requests WHERE ${cohortWhere} GROUP BY 1`,
        [month],
      )
    ).rows.map((r) => [r.name, Number(r.total)]),
  );
  const byCategory = Object.fromEntries(
    (
      await sql.query<{ category: string; total: string }>(
        `SELECT category,count(*)::text AS total FROM requests WHERE ${cohortWhere} GROUP BY category`,
        [month],
      )
    ).rows.map((r) => [r.category, Number(r.total)]),
  );
  const departmentTma = (
    await sql.query<{ name: string; count: string; tma: number }>(
      `WITH completed AS (SELECT coalesce(nullif(data->>'assignedDepartment',''),'Não atribuído') AS name,created_at,coalesce((SELECT (e->>'timestamp')::timestamptz FROM jsonb_array_elements(data->'history') WITH ORDINALITY h(e,n) WHERE e->>'status'='concluida' AND coalesce(e->>'previousStatus','')<>'concluida' ORDER BY n DESC LIMIT 1),updated_at) AS end_at FROM requests WHERE status='concluida') SELECT name,count(*)::text AS count,round(avg(extract(epoch from (end_at-created_at))/3600)::numeric,2)::float8 AS tma FROM completed WHERE end_at>=created_at AND to_char(end_at AT TIME ZONE 'America/Recife','YYYY-MM')=$1 GROUP BY name ORDER BY name`,
      [month],
    )
  ).rows.map((r) => ({ name: r.name, count: Number(r.count), tma: Number(r.tma) }));
  const operational = await sql.query<{
    orders_open: string;
    orders_completed: string;
    ratings: string;
    satisfaction: number | null;
  }>(
    `SELECT (SELECT count(*) FROM work_orders WHERE status NOT IN ('concluida','cancelada'))::text AS orders_open,(SELECT count(*) FROM work_orders WHERE status='concluida')::text AS orders_completed,(SELECT count(*) FROM ratings)::text AS ratings,(SELECT avg(rating)::float8 FROM ratings) AS satisfaction`,
  );
  const op = operational.rows[0],
    total = Number(cohort.rows[0].total),
    completed = Number(cohort.rows[0].completed);
  return {
    metrics,
    report: {
      month,
      timezone: 'America/Recife',
      cohortTotal: total,
      cohortCompleted: completed,
      cohortResolutionRate: total ? Math.round((100 * completed) / total) : 0,
      bySchool,
      byCategory,
      departmentTma,
    },
    operational: {
      ordersOpen: Number(op.orders_open),
      ordersCompleted: Number(op.orders_completed),
      ratings: Number(op.ratings),
      satisfaction: op.satisfaction,
    },
  };
}
