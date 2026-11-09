import { z } from 'zod';
import type { Sql } from './database';
import type { User } from '../auth';
import { HttpError } from '../auth';
import { requestForUser } from '../requestAccess';
import { categories, statuses, priorities } from '../../src/domain/schemas';
import type { EducationalRequest, RequestPage, SchoolUnit } from '../../src/types';

export const SEI_INTEGRATED_SQL =
  "(coalesce((r.data->>'seiIntegrated')::boolean,false) OR coalesce(r.data->>'seiProcessNumber','')<>'')";
export const SEI_ELIGIBLE_SQL =
  'NOT ' + SEI_INTEGRATED_SQL + " AND r.status IN ('em_triagem','encaminhada','em_atendimento')";

const date = z
  .string()
  .regex(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v + 'T00:00:00-03:00')) &&
      new Date(v + 'T00:00:00-03:00').toISOString().slice(0, 10) === v,
    'Informe uma data válida.',
  );
export const requestSearchSchema = z
  .object({
    search: z.string().trim().max(150).default(''),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    category: z.enum(categories).optional(),
    status: z.enum(statuses).optional(),
    statuses: z
      .string()
      .max(200)
      .transform((v) => v.split(','))
      .pipe(z.array(z.enum(statuses)).min(1).max(6))
      .optional(),
    sei: z.enum(['eligible', 'integrated']).optional(),
    priority: z.enum(priorities).optional(),
    schoolId: z.string().trim().min(1).max(100).optional(),
    department: z.string().trim().min(1).max(150).optional(),
    technician: z.string().trim().min(1).max(120).optional(),
    zone: z.enum(['urbana', 'rural']).optional(),
    sla: z.enum(['overdue', 'due']).optional(),
    view: z.enum(['full', 'summary']).default('full'),
    from: date.optional(),
    to: date.optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
  })
  .strict()
  .refine(
    (q) => !q.from || !q.to || q.from <= q.to,
    'O início do período deve ser anterior ao fim.',
  );

export async function readSchools(sql: Sql) {
  return (await sql.query<{ data: SchoolUnit }>('SELECT data FROM schools ORDER BY id')).rows.map(
    (r) => r.data,
  );
}

export async function findRequest(sql: Sql, user: User, value: string, kind: 'id' | 'protocol') {
  const values: unknown[] = [kind === 'protocol' ? value.trim().toUpperCase() : value];
  let where = kind === 'protocol' ? 'upper(protocol)=$1' : 'id=$1';
  if (user.role === 'cidadao') {
    values.push(user.id);
    where += ' AND owner_id=$2';
  }
  const result = await sql.query<{ data: EducationalRequest }>(
    `SELECT data FROM requests WHERE ${where} LIMIT 1`,
    values,
  );
  if (!result.rows[0]) throw new HttpError(404, 'Solicitação não encontrada para esta conta.');
  return requestForUser(result.rows[0].data, user);
}

export async function searchRequests(
  sql: Sql,
  user: User,
  q: z.infer<typeof requestSearchSchema>,
): Promise<RequestPage> {
  if (user.role === 'cidadao' && q.technician)
    throw new HttpError(403, 'O filtro de responsável está disponível apenas à equipe.');
  if (user.role === 'cidadao' && q.sei)
    throw new HttpError(403, 'O filtro SEI está disponível apenas à equipe.');
  const conditions: string[] = [],
    params: unknown[] = [];
  const value = (v: unknown) => {
    params.push(v);
    return '$' + params.length;
  };
  const literal = (v: string) => '%' + v.replace(/[\\%_]/g, '\\$&') + '%';
  if (user.role === 'cidadao') conditions.push('r.owner_id=' + value(user.id));
  for (const [filter, column] of [
    ['category', 'category'],
    ['status', 'status'],
    ['priority', 'priority'],
    ['schoolId', 'school_id'],
  ] as const)
    if (q[filter]) conditions.push(`r.${column}=${value(q[filter])}`);
  if (q.statuses) conditions.push(`r.status=ANY(${value(q.statuses)}::text[])`);
  if (q.sei) {
    conditions.push(q.sei === 'integrated' ? SEI_INTEGRATED_SQL : SEI_ELIGIBLE_SQL);
  }
  if (q.search) {
    const p = value(literal(q.search));
    conditions.push(
      `(r.protocol ILIKE ${p} OR r.data->>'subject' ILIKE ${p} OR r.data->>'applicantName' ILIKE ${p} OR r.data->>'schoolName' ILIKE ${p})`,
    );
  }
  if (q.department)
    conditions.push(
      q.department === 'unassigned'
        ? 'r.department_id IS NULL'
        : `r.department_id=(SELECT id FROM departments WHERE name=${value(q.department)})`,
    );
  if (q.technician)
    conditions.push(`r.data->>'assignedTechnician' ILIKE ${value(literal(q.technician))}`);
  if (q.zone) conditions.push(`s.data->>'zone'=${value(q.zone)}`);
  if (q.sla)
    conditions.push(
      `r.status<>'concluida' AND r.deadline<${value(new Date(Date.now() + (q.sla === 'due' ? 3 * 86400000 : 0)).toISOString())}::timestamptz`,
    );
  if (q.from) conditions.push(`r.created_at>=${value(q.from + 'T00:00:00-03:00')}::timestamptz`);
  if (q.to)
    conditions.push(
      `r.created_at<(${value(q.to + 'T00:00:00-03:00')}::timestamptz+interval '1 day')`,
    );
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '',
    from = ' FROM requests r JOIN schools s ON s.id=r.school_id';
  const count = await sql.query<{ total: string }>(
    'SELECT count(*)::text AS total' + from + where,
    params,
  );
  const total = Number(count.rows[0].total),
    pages = Math.max(1, Math.ceil(total / q.pageSize)),
    page = Math.min(q.page, pages);
  const limit = value(q.pageSize),
    offset = value((page - 1) * q.pageSize),
    order = q.sort === 'oldest' ? 'ASC' : 'DESC';
  const projection =
    q.view === 'summary'
      ? `(r.data - ARRAY['history','description','locationDetails','applicantContact','categoryDetails','informationRequests','satisfaction','priorityReason','deadlineReason','resolution']) || '{"history":[],"description":"","summary":true}'::jsonb`
      : 'r.data';
  const rows = await sql.query<{ data: EducationalRequest }>(
    `SELECT ${projection} AS data${from}${where} ORDER BY r.created_at ${order},r.id ${order} LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return {
    items: rows.rows.map((r) => requestForUser(r.data, user)),
    total,
    page,
    pageSize: q.pageSize,
    pages,
  };
}
