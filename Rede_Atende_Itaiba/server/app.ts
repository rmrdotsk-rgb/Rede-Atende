import { renderPageHtml } from './frontendMetadata';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from './config';
import { transaction, readTransaction, type Sql } from './db/database';
import { emptyState, loadState, mutate, holidays, saveState, engineFor } from './db/repository';
import {
  digest,
  HttpError,
  requireUser,
  currentSession,
  createSession,
  hashPassword,
  verifyPassword,
  limit,
  audit,
  staff,
  editors,
  type User,
} from './auth';
import {
  requestFormSchema,
  schoolSchema,
  stateSchema,
  appointmentSchema,
  deadlineRulesSchema,
  calendarDate,
  categories,
} from '../src/domain/schemas';
import { INITIAL_CITIZEN_PRIORITY, DEPARTMENTS } from '../src/domain/serviceCatalog';
import { calculateMetrics, generateRequestsCsv } from '../src/utils/helpers';
import { managementReport } from '../src/domain/reporting';
import { BusinessRuleError } from '../src/domain/errors';
import { assertRequestAccess as allowed, requestForUser } from './requestAccess';
import { receiveAttachment } from './attachments';
import { readWorkspace, workspaceQuery, orderForUser } from './db/workspace';
import { WORK_ORDER_LINK_FIELDS } from './db/workOrderProjection';
import { readReports } from './db/reports';
import { createOnce } from './operations';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { findRequest, searchRequests, readSchools, requestSearchSchema } from './db/requestQueries';
const text = (min = 1, max = 2000) => z.string().trim().min(min).max(max);
const credentials = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();
const demoLogins = ['gestor', 'operador', 'auditor', 'cidadao'] as const;
const loginCredentials = credentials.extend({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine(
      (value) =>
        demoLogins.some((role) => role === value) ||
        z.string().email().safeParse(value).success,
      'Informe um usuário ou e-mail válido.',
    )
    .transform((value) =>
      demoLogins.some((role) => role === value) ? `${value}@redeatende.invalid` : value,
    ),
});
const dispatch = z
  .object({
    updates: z
      .object({
        status: z
          .enum([
            'recebida',
            'em_triagem',
            'encaminhada',
            'em_atendimento',
            'concluida',
            'aguardando_informacoes',
          ])
          .optional(),
        priority: z.enum(['baixa', 'media', 'alta', 'urgente']).optional(),
        category: z.enum(categories).optional(),
        categoryDetails: z.record(z.string().max(40), z.string().trim().max(250)).optional(),
        assignedDepartment: text(3, 150).optional(),
        assignedTechnician: text(3, 120).optional(),
        deadline: z.iso.datetime().optional(),
      })
      .strict(),
    note: text(0, 4000).optional(),
    isReopening: z.boolean().optional(),
    options: z
      .object({
        visibility: z.enum(['publica', 'interna']).optional(),
        publicResponsible: z.boolean().optional(),
        priorityReason: text(0, 2000).optional(),
        categoryReason: text(5, 2000).optional(),
        deadlineReason: text(0, 2000).optional(),
      })
      .strict()
      .optional(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();
const workOrderInput = z
  .object({
    requestId: text(1, 100),
    title: text(5, 160),
    department: z.enum(DEPARTMENTS as [string, ...string[]]),
    technician: text(3, 120),
    required: z.boolean(),
    inspectionDate: calendarDate.optional(),
    inspectionTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
  })
  .strict();
const params = (req: { params: unknown }) => z.object({ id: text(1, 150) }).parse(req.params).id;
async function project(sql: Sql, user?: User) {
  if (!user) {
    const publicState = emptyState();
    publicState.schools = await readSchools(sql);
    return { ...publicState, attachments: [], holidays: [] };
  }
  const state =
    user.role === 'cidadao'
      ? await (async () => {
          const owned = emptyState();
          owned.schools = await readSchools(sql);
          owned.requests = (
            await sql.query<{ data: (typeof owned.requests)[number] }>(
              'SELECT data FROM requests WHERE owner_id=$1 ORDER BY created_at DESC',
              [user.id],
            )
          ).rows.map((r) => r.data);
          for (const [table, key] of [
            ['appointments', 'appointments'],
            ['work_orders', 'workOrders'],
            ['notifications', 'notifications'],
          ] as const) {
            const rows = await sql.query<{ data: never }>(
              `SELECT t.data FROM ${table} t JOIN requests r ON r.id=t.request_id WHERE r.owner_id=$1`,
              [user.id],
            );
            (owned[key] as unknown[]) = rows.rows.map((r) => r.data);
          }
          return owned;
        })()
      : await loadState(sql);
  const result = structuredClone(state);
  if (user.role === 'cidadao') {
    const owned = await sql.query<{ id: string }>('SELECT id FROM requests WHERE owner_id=$1', [
      user.id,
    ]);
    const ids = new Set(owned.rows.map((r) => r.id));
    result.requests = state.requests
      .filter((r) => ids.has(r.id))
      .map((r) => requestForUser(r, user));
    result.appointments = state.appointments
      .filter((a) => a.requestId && ids.has(a.requestId))
      .map((a) => ({
        ...a,
        type: 'Atendimento programado',
        technician: 'Equipe de atendimento',
        notes: undefined,
        cancellationReason: undefined,
      }));
    result.workOrders = state.workOrders
      .filter((w) => ids.has(w.requestId))
      .map((w) => ({
        ...w,
        title: 'Atividade de atendimento',
        technician: 'Equipe de atendimento',
        history: [],
        performedService: w.performedService ? 'Serviço registrado.' : undefined,
        pendingReason: undefined,
        cancellationReason: undefined,
      }));
    result.notifications = state.notifications
      .filter((n) => n.audience === 'comunidade' && ids.has(n.requestId))
      .map((n) => ({
        ...n,
        message: n.message.startsWith('Agenda atualizada:')
          ? 'Agenda atualizada. Consulte o acompanhamento para data e situação.'
          : n.message,
      }));
    result.seiLogs = [];
    result.ruleHistory = [];
    result.nextSequenceByYear = {};
    result.submissions = {};
  } else {
    result.notifications = state.notifications.filter((n) => n.audience === 'gestao');
  }
  const reads = await sql.query<{ notification_id: string; read_at: Date }>(
    'SELECT notification_id,read_at FROM notification_reads WHERE user_id=$1',
    [user.id],
  );
  const readDates = new Map(reads.rows.map((r) => [r.notification_id, r.read_at.toISOString()]));
  result.notifications = result.notifications.map((n) => ({ ...n, readAt: readDates.get(n.id) }));
  const files = await sql.query<{
    id: string;
    requestId: string;
    name: string;
    mime: string;
    size: number;
  }>(
    `SELECT a.id,a.request_id AS "requestId",a.name,a.mime,a.size FROM attachments a JOIN requests r ON r.id=a.request_id ${user.role === 'cidadao' ? 'WHERE r.owner_id=$1' : ''}`,
    user.role === 'cidadao' ? [user.id] : [],
  );
  return {
    ...result,
    attachments: files.rows,
    holidays: user.role === 'cidadao' ? [] : await holidays(sql),
  };
}
const applicationVersion = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
).version as string;

async function projectedRequest(sql: Sql, user: User, id: string) {
  return findRequest(sql, user, id, 'id');
}
export async function buildApp(options: { serveFrontend?: boolean; logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger
      ? {
          redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token'],
          serializers: { req: (r) => ({ method: r.method, url: r.url?.split('?')[0] }) },
        }
      : false,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 0, parts: 1 },
  });
  app.addHook('onRequest', async (req, reply) => {
    reply
      .header('X-Request-Id', req.id)
      .header('X-Robots-Tag', 'noindex, nofollow, noarchive')
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Frame-Options', 'DENY');
    if (!req.url.startsWith('/api/')) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['x-requested-with'] !== 'RedeAtende')
        throw new HttpError(403, 'Cabeçalho de aplicação obrigatório.');
      const origin = req.headers.origin;
      if (origin) {
        let parsed: URL;
        try {
          parsed = new URL(origin);
        } catch {
          throw new HttpError(403, 'Origem da requisição não autorizada.');
        }
        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          parsed.host !== req.headers.host ||
          parsed.origin !== origin
        )
          throw new HttpError(403, 'Origem da requisição não autorizada.');
      }
    }
  });
  app.addHook('onSend', async (req, reply, payload) => {
    if (
      !reply.getHeader('Content-Encoding') &&
      String(reply.getHeader('Content-Type') ?? '').includes('application/json') &&
      typeof payload === 'string' &&
      Buffer.byteLength(payload) > 1024
    ) {
      reply.header('Vary', 'Accept-Encoding');
      if (
        /(?:^|,)\s*gzip(?:\s*;\s*q=(?!0(?:\.0*)?(?:,|$))[0-9.]+)?\s*(?:,|$)/.test(
          String(req.headers['accept-encoding'] ?? ''),
        )
      ) {
        reply.header('Content-Encoding', 'gzip');
        reply.removeHeader('Content-Length');
        return gzipSync(payload);
      }
    }
    return payload;
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError)
      return reply.code(400).send({ error: err.issues[0]?.message ?? 'Entrada inválida.' });
    const error = err as Error & { code?: string; statusCode?: number };
    if (error.code === '23505')
      return reply.code(409).send({ error: 'Registro duplicado ou horário em conflito.' });
    if (error.code?.startsWith('23'))
      return reply.code(400).send({ error: 'Vínculo de dados inválido.' });
    if (error.code?.startsWith('FST_'))
      return reply
        .code(error.statusCode ?? 400)
        .send({ error: 'Arquivo ou corpo inválido. Verifique o limite de 5 MB.' });
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof BusinessRuleError) return reply.code(422).send({ error: error.message });
    req.log.error(
      {
        requestId: req.id,
        endpoint: req.routeOptions.url,
        category: 'internal',
        code:
          typeof error.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code)
            ? error.code
            : 'INTERNAL',
      },
      'Falha interna',
    );
    return reply.code(503).send({
      error:
        'Serviço temporariamente indisponível. Não foi possível confirmar o resultado. Consulte o acompanhamento ou repita com a mesma chave de envio.',
    });
  });
  app.get('/api/v1/health', async () =>
    readTransaction(async (sql) => {
      await sql.query('SELECT 1');
      return {
        status: 'ok',
        version: applicationVersion,
        database: config.mode === 'postgres' ? 'PostgreSQL' : 'PostgreSQL WASM (PGlite)',
        academic: true,
      };
    }),
  );
  app.get('/api/v1/auth/me', async (req) => {
    const user = await currentSession(req);
    if (!user) return { user: null, csrf: '' };
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      csrf: digest(`csrf:${req.cookies.ra_session}`),
    };
  });
  app.post('/api/v1/auth/register', async (req, reply) => {
    const body = credentials
      .extend({ name: text(3, 120), academicAcknowledged: z.literal(true) })
      .parse(req.body);
    const permitted = await transaction((sql) => limit(sql, `register:${req.ip}`, 10, 3600));
    if (!permitted) throw new HttpError(429, 'Limite de cadastros atingido. Tente mais tarde.');
    const hash = await hashPassword(body.password);
    const user: User = { id: randomUUID(), email: body.email, name: body.name, role: 'cidadao' };
    await transaction(async (sql) => {
      await sql.query(
        'INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
        [user.id, user.email, user.name, hash, user.role],
      );
      await audit(sql, user, 'user.register', user.id);
    });
    reply.code(201);
    return createSession(user, reply);
  });
  app.post('/api/v1/auth/login', async (req, reply) => {
    const body = loginCredentials.parse(req.body);
    const permitted = await transaction(async (sql) => {
      const ip = await limit(sql, `login-ip:${req.ip}`, 30);
      const account = await limit(sql, `login:${req.ip}:${body.email}`, 5);
      return ip && account;
    });
    if (!permitted)
      throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
    const rows = await transaction((sql) =>
      sql.query<User & { password_hash: string; active: boolean }>(
        'SELECT id,email,name,role,password_hash,active FROM users WHERE email=$1',
        [body.email],
      ),
    );
    const entry = rows.rows[0];
    const ok = await verifyPassword(
      body.password,
      entry?.password_hash ?? 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128),
    );
    if (!entry || !entry.active || !ok) {
      await transaction((sql) => audit(sql, undefined, 'session.denied'));
      throw new HttpError(401, 'E-mail ou senha inválidos.');
    }
    const user: User = { id: entry.id, email: entry.email, name: entry.name, role: entry.role };
    await transaction((sql) =>
      sql.query('DELETE FROM rate_limits WHERE key=$1', [digest(`login:${req.ip}:${body.email}`)]),
    );
    if (req.cookies.ra_session)
      await transaction((sql) =>
        sql.query('DELETE FROM sessions WHERE token_hash=$1', [digest(req.cookies.ra_session!)]),
      );
    return createSession(user, reply);
  });
  app.post('/api/v1/auth/logout', async (req, reply) => {
    const user = await requireUser(req, undefined, true);
    await transaction(async (sql) => {
      await sql.query('DELETE FROM sessions WHERE token_hash=$1', [
        digest(req.cookies.ra_session!),
      ]);
      await audit(sql, user, 'session.logout');
    });
    reply.clearCookie('ra_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/v1/state', async (req) => {
    const session = await currentSession(req);
    return readTransaction((sql) => project(sql, session));
  });
  app.get('/api/v1/bootstrap', async (req) => {
    const user = await currentSession(req);
    const query = workspaceQuery.parse(req.query);
    return readTransaction((sql) => readWorkspace(sql, user, query));
  });
  app.get('/api/v1/schools', async () => readTransaction(readSchools));
  app.get('/api/v1/requests', async (req) => {
    const user = await requireUser(req);
    return readTransaction(async (sql) => (await project(sql, user)).requests);
  });
  app.get('/api/v1/requests/search', async (req) => {
    const user = await requireUser(req),
      query = requestSearchSchema.parse(req.query);
    return readTransaction((sql) => searchRequests(sql, user, query));
  });
  app.get('/api/v1/requests/:id', async (req) => {
    const user = await requireUser(req),
      id = params(req);
    return readTransaction((sql) => findRequest(sql, user, id, 'id'));
  });
  app.get('/api/v1/protocols/:protocol', async (req) => {
    const user = await requireUser(req),
      protocol = z.object({ protocol: text(1, 60) }).parse(req.params).protocol;
    return readTransaction((sql) => findRequest(sql, user, protocol, 'protocol'));
  });
  app.post('/api/v1/requests', async (req, reply) => {
    const user = await requireUser(req, ['cidadao'], true);
    const body = { ...requestFormSchema.parse(req.body), priority: INITIAL_CITIZEN_PRIORITY };
    const key = z.string().min(16).max(150).parse(req.headers['idempotency-key']);
    const fingerprint = digest(JSON.stringify(body));
    const created = await transaction(async (sql) => {
      const prior = await sql.query<{ request_id: string; request_hash: string }>(
        'SELECT request_id,request_hash FROM idempotency_keys WHERE user_id=$1 AND key=$2',
        [user.id, key],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== fingerprint)
          throw new HttpError(409, 'Esta chave de envio já foi usada com outro conteúdo.');
        return projectedRequest(sql, user, prior.rows[0].request_id);
      }
      if (!(await limit(sql, `create:${user.id}`, 30, 3600))) return undefined;
      const request = await mutate(
        sql,
        user,
        'request.create',
        (engine) => engine.createRequest({ ...body, schoolName: '' }),
        user.id,
        {},
      );
      await sql.query(
        'INSERT INTO idempotency_keys(user_id,key,request_hash,request_id) VALUES($1,$2,$3,$4)',
        [user.id, key, fingerprint, request.id],
      );
      return projectedRequest(sql, user, request.id);
    });
    if (!created)
      throw new HttpError(
        429,
        'Limite de solicitações atingido. Aguarde antes de enviar novamente.',
      );
    return reply.code(201).send(created);
  });
  app.patch('/api/v1/requests/:id', async (req) => {
    const user = await requireUser(req, editors, true),
      id = params(req),
      body = dispatch.parse(req.body);
    if (body.updates.category && !body.expectedUpdatedAt)
      throw new HttpError(400, 'Atualize a solicitação antes de corrigir a categoria.');
    if (body.updates.assignedDepartment && !DEPARTMENTS.includes(body.updates.assignedDepartment))
      throw new HttpError(400, 'Selecione um setor do catálogo.');
    if (body.isReopening && user.role !== 'gestor')
      throw new HttpError(403, 'Somente o gestor pode reabrir.');
    return transaction(async (sql) => {
      await allowed(sql, user, id);
      if (body.expectedUpdatedAt) {
        const current = await sql.query<{ updated_at: string }>(
          "SELECT data->>'updatedAt' AS updated_at FROM requests WHERE id=$1",
          [id],
        );
        if (current.rows[0]?.updated_at !== body.expectedUpdatedAt)
          throw new HttpError(
            409,
            'Esta solicitação foi alterada por outra pessoa. Atualize os dados e revise antes de salvar.',
          );
      }
      return mutate(
        sql,
        user,
        'request.dispatch',
        (e) =>
          e.updateRequest(
            id,
            body.updates,
            body.note,
            user.name,
            user.role === 'gestor' ? 'secretario_educacao' : 'triagem_seduc',
            body.isReopening,
            body.options,
          ),
        undefined,
        { requestId: id },
      );
    });
  });
  app.post('/api/v1/requests/:id/replies', async (req) => {
    const user = await requireUser(req, ['cidadao'], true),
      id = params(req),
      body = z
        .object({ informationId: text(1, 100), response: text(5, 2000) })
        .strict()
        .parse(req.body);
    return transaction(async (sql) => {
      await allowed(sql, user, id, true);
      await mutate(
        sql,
        user,
        'information.reply',
        (e) => e.replyToInformation(id, body.informationId, body.response),
        undefined,
        { requestId: id },
      );
      return projectedRequest(sql, user, id);
    });
  });
  app.post('/api/v1/requests/:id/rating', async (req) => {
    const user = await requireUser(req, ['cidadao'], true),
      id = params(req),
      body = z
        .object({ rating: z.number().int().min(1).max(5), comment: text(0, 1000).default('') })
        .strict()
        .parse(req.body);
    return transaction(async (sql) => {
      await allowed(sql, user, id, true);
      await mutate(
        sql,
        user,
        'request.rate',
        (e) => e.rateRequest(id, body.rating, body.comment),
        undefined,
        { requestId: id },
      );
      return { ok: true };
    });
  });
  app.post('/api/v1/requests/:id/sei-simulation', async (req) => {
    const user = await requireUser(req, editors, true),
      id = params(req);
    return transaction(async (sql) => {
      await allowed(sql, user, id);
      return mutate(sql, user, 'sei.simulate', (e) => e.simulateSeiDispatch(id), undefined, {
        requestId: id,
      });
    });
  });
  app.get('/api/v1/work-orders', async (req) => {
    const user = await requireUser(req);
    return readTransaction(async (sql) => (await project(sql, user)).workOrders);
  });
  app.get('/api/v1/work-orders/:id', async (req) => {
    const user = await requireUser(req),
      id = params(req);
    return readTransaction(async (sql) => {
      const found = await sql.query<{
        request_id: string;
        data: Parameters<typeof orderForUser>[0];
      }>(
        `SELECT t.request_id,t.data || ${WORK_ORDER_LINK_FIELDS} AS data FROM work_orders t JOIN requests r ON r.id=t.request_id WHERE t.id=$1`,
        [id],
      );
      if (!found.rows[0]) throw new HttpError(404, 'Ordem não encontrada.');
      await allowed(sql, user, found.rows[0].request_id);
      return orderForUser(found.rows[0].data, user);
    });
  });
  app.post('/api/v1/work-orders', async (req) => {
    const user = await requireUser(req, editors, true);
    const body = workOrderInput.parse(req.body);
    return transaction((sql) =>
      createOnce(sql, user, 'work-order', req.headers['idempotency-key'], body, () =>
        mutate(sql, user, 'order.create', (e) => e.createWorkOrder(body), undefined, {
          requestId: body.requestId,
          technician: body.technician,
          date: body.inspectionDate,
          newOrder: true,
        }),
      ),
    );
  });
  app.patch('/api/v1/work-orders/:id', async (req) => {
    const user = await requireUser(req, editors, true),
      id = params(req);
    const body = z
      .object({
        status: z.enum(['aberta', 'em_execucao', 'pendente', 'concluida', 'cancelada']),
        note: text(5, 4000),
      })
      .strict()
      .parse(req.body);
    return transaction((sql) =>
      mutate(
        sql,
        user,
        'order.update',
        (e) => e.updateWorkOrder(id, body.status, body.note),
        undefined,
        { orderId: id },
      ),
    );
  });
  app.get('/api/v1/appointments', async (req) => {
    const user = await requireUser(req);
    return readTransaction(async (sql) => (await project(sql, user)).appointments);
  });
  app.post('/api/v1/appointments', async (req) => {
    const user = await requireUser(req, editors, true);
    const body = appointmentSchema
      .omit({
        id: true,
        createdAt: true,
        updatedAt: true,
        workOrderId: true,
        cancellationReason: true,
      })
      .strict()
      .parse(req.body);
    return transaction((sql) =>
      createOnce(sql, user, 'appointment', req.headers['idempotency-key'], body, () =>
        mutate(sql, user, 'appointment.create', (e) => e.createAppointment(body), undefined, {
          requestId: body.requestId,
          technician: body.technician,
          date: body.date,
        }),
      ),
    );
  });
  app.patch('/api/v1/appointments/:id', async (req) => {
    const user = await requireUser(req, editors, true),
      id = params(req);
    const parsed = appointmentSchema
      .pick({
        requestId: true,
        schoolId: true,
        type: true,
        technician: true,
        date: true,
        time: true,
        status: true,
        notes: true,
      })
      .extend({
        requestId: text(1, 100).nullable().optional(),
        notes: text(0, 2000).nullable().optional(),
        cancellationReason: text(5, 2000).optional(),
      })
      .partial()
      .strict()
      .refine(
        (body) => body.cancellationReason === undefined || Object.keys(body).length === 1,
        'Envie o motivo de cancelamento separado das demais alterações.',
      )
      .parse(req.body);
    const { requestId: linkId, notes: annotation, cancellationReason, ...fields } = parsed;
    const body = {
      ...fields,
      ...('requestId' in parsed ? { requestId: linkId ?? undefined } : {}),
      ...('notes' in parsed ? { notes: annotation ?? undefined } : {}),
    };
    return transaction((sql) =>
      mutate(
        sql,
        user,
        'appointment.update',
        (e) =>
          cancellationReason === undefined
            ? e.updateAppointment(id, body)
            : e.cancelAppointment(id, cancellationReason),
        undefined,
        {
          appointmentId: id,
          requestId: body.requestId,
          technician: body.technician,
          date: body.date,
        },
      ),
    );
  });
  app.get('/api/v1/notifications', async (req) => {
    const user = await requireUser(req);
    return readTransaction(async (sql) => (await project(sql, user)).notifications);
  });
  app.post('/api/v1/notifications/:id/read', async (req) => {
    const user = await requireUser(req, undefined, true),
      id = params(req);
    return transaction(async (sql) => {
      const rows = await sql.query(
        'SELECT n.id FROM notifications n JOIN requests r ON r.id=n.request_id WHERE n.id=$1 AND n.audience=$2 AND ($3::text IS NULL OR r.owner_id=$3)',
        [
          id,
          user.role === 'cidadao' ? 'comunidade' : 'gestao',
          user.role === 'cidadao' ? user.id : null,
        ],
      );
      if (!rows.rows.length) throw new HttpError(404, 'Notificação não encontrada.');
      await sql.query(
        'INSERT INTO notification_reads(notification_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [id, user.id],
      );
      return { ok: true };
    });
  });
  app.get('/api/v1/deadline-rules', async (req) => {
    await requireUser(req, staff);
    return transaction(async (sql) => {
      const settings = await sql.query<{ data: { deadlineRules: unknown; ruleHistory: unknown } }>(
        "SELECT data FROM settings WHERE id='domain'",
      );
      const d = settings.rows[0]?.data ?? emptyState();
      return { rules: d.deadlineRules, history: d.ruleHistory, holidays: await holidays(sql) };
    });
  });
  app.put('/api/v1/deadline-rules', async (req) => {
    const user = await requireUser(req, ['gestor'], true);
    const body = z
      .object({ rules: deadlineRulesSchema, reason: text(5, 2000) })
      .strict()
      .parse(req.body);
    return transaction(async (sql) => {
      await mutate(sql, user, 'deadlines.configure', (e) =>
        e.configureDeadlineRules(body.rules, body.reason),
      );
      return { ok: true };
    });
  });
  app.put('/api/v1/holidays', async (req) => {
    const user = await requireUser(req, ['gestor'], true);
    const body = z
      .object({ dates: z.array(calendarDate).max(200), reason: text(5, 2000) })
      .strict()
      .parse(req.body);
    return transaction(async (sql) => {
      await sql.query(
        "INSERT INTO settings(id,data) VALUES('holidays',$1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        [JSON.stringify([...new Set(body.dates)].sort())],
      );
      await audit(sql, user, 'holidays.configure', undefined, {
        dates: body.dates,
        reason: body.reason,
      });
      return { ok: true };
    });
  });
  app.patch('/api/v1/schools/:id', async (req) => {
    const user = await requireUser(req, ['gestor'], true),
      id = params(req);
    const body = schoolSchema
      .omit({ id: true, activeRequestsCount: true })
      .strict()
      .parse(req.body);
    return transaction(async (sql) => {
      const found = await sql.query('SELECT id FROM schools WHERE id=$1', [id]);
      if (!found.rows[0]) throw new HttpError(404, 'Escola inexistente.');
      const school = { ...body, id, activeRequestsCount: 0 };
      await sql.query('UPDATE schools SET data=$1 WHERE id=$2', [JSON.stringify(school), id]);
      await sql.query(
        "UPDATE requests SET updated_at=GREATEST(now(),updated_at+interval '1 millisecond'),data=jsonb_set(jsonb_set(data,'{schoolName}',to_jsonb($1::text)),'{updatedAt}',to_jsonb(to_char(GREATEST(now(),updated_at+interval '1 millisecond') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))) WHERE school_id=$2 AND data->>'schoolName' IS DISTINCT FROM $1",
        [body.name, id],
      );
      await sql.query(
        "UPDATE appointments SET data=jsonb_set(data,'{schoolName}',to_jsonb($1::text)) WHERE school_id=$2",
        [body.name, id],
      );
      await audit(sql, user, 'school.update', id);
      return school;
    });
  });
  app.get('/api/v1/reports', async (req) => {
    await requireUser(req, staff);
    return readTransaction(readReports);
  });
  app.get('/api/v1/reports.csv', async (req, reply) => {
    const user = await requireUser(req, staff);
    return transaction(async (sql) => {
      const rows = await sql.query<{ data: Parameters<typeof generateRequestsCsv>[0][number] }>(
        "SELECT (data - ARRAY['history','description','locationDetails','applicantContact','categoryDetails','informationRequests','satisfaction','priorityReason','deadlineReason','resolution']) || '{\"history\":[],\"description\":\"\"}'::jsonb AS data FROM requests ORDER BY created_at DESC,id DESC",
      );
      await audit(sql, user, 'report.export');
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="rede-atende-demonstracao.csv"');
      return generateRequestsCsv(rows.rows.map((r) => r.data));
    });
  });
  app.get('/api/v1/audit', async (req) => {
    await requireUser(req, ['gestor', 'auditor']);
    return transaction(
      async (sql) =>
        (
          await sql.query(
            'SELECT id,actor_id,action,entity_id,occurred_at,data FROM audit_log ORDER BY occurred_at DESC LIMIT 500',
          )
        ).rows,
    );
  });
  app.post('/api/v1/admin/scenarios', async (req) => {
    const user = await requireUser(req, ['gestor'], true);
    const { kind } = z
      .object({ kind: z.enum(['merenda', 'transporte']) })
      .strict()
      .parse(req.body);
    return transaction(async (sql) => ({
      protocol: await mutate(sql, user, 'scenario.append', (e) => e.loadDemoScenario(kind)),
    }));
  });
  app.get('/api/v1/admin/backup', async (req) => {
    const user = await requireUser(req, ['gestor']);
    return transaction(async (sql) => {
      await audit(sql, user, 'backup.export');
      return loadState(sql);
    });
  });
  app.post('/api/v1/admin/import', async (req) => {
    const user = await requireUser(req, ['gestor'], true);
    const input = stateSchema.parse(req.body);
    return transaction(async (sql) => {
      const s = await loadState(sql),
        before = structuredClone(s);
      let imported = 0;
      for (const school of input.schools)
        if (!s.schools.some((v) => v.id === school.id)) s.schools.push(school);
      for (const request of input.requests) {
        const prior = s.requests.find(
          (v) => v.id === request.id || v.protocol === request.protocol,
        );
        if (prior) {
          if (JSON.stringify(prior) !== JSON.stringify(request))
            throw new HttpError(
              409,
              'Conflito em protocolo ou identificador existente. Nenhum registro importado.',
            );
          continue;
        }
        s.requests.push(request);
        imported++;
      }
      for (const key of ['workOrders', 'appointments', 'notifications', 'seiLogs'] as const)
        for (const item of input[key]) {
          if (s[key].some((v) => v.id === item.id))
            throw new HttpError(409, 'Identificador operacional já existe. Importação cancelada.');
          (s[key] as unknown[]).push(item);
        }
      try {
        engineFor(s).engine.init();
      } catch {
        throw new HttpError(
          422,
          'Dados de importação inválidos ou com vínculos inconsistentes. Nenhum registro importado.',
        );
      }
      await saveState(sql, s, before, user);
      await sql.query(
        "UPDATE operational_sequences SET next_value=GREATEST(next_value,(SELECT COALESCE(max(substring(number from '[0-9]+$')::bigint),0)+1 FROM work_orders)) WHERE id='work-order'",
      );
      await audit(sql, user, 'legacy.import', undefined, { imported });
      return {
        imported,
        note: 'Legados são restritos à gestão até atribuição verificada de titularidade.',
      };
    });
  });
  app.post('/api/v1/requests/:id/attachments', async (req, reply) => {
    const user = await requireUser(req, ['cidadao', ...editors], true),
      id = params(req);
    return reply.code(201).send(await receiveAttachment(req, user, id));
  });
  app.get('/api/v1/attachments/:id', async (req, reply) => {
    const user = await requireUser(req),
      id = params(req);
    const file = await readTransaction(async (sql) => {
      const rows = await sql.query<{
        request_id: string;
        storage_name: string;
        name: string;
        mime: string;
        size: number;
        sha256: string;
      }>('SELECT request_id,storage_name,name,mime,size,sha256 FROM attachments WHERE id=$1', [id]);
      if (!rows.rows[0]) throw new HttpError(404, 'Anexo não encontrado.');
      await allowed(sql, user, rows.rows[0].request_id);
      return rows.rows[0];
    });
    // O armazenamento não é um substituto da verificação de integridade no download.
    // Recuse bytes ausentes ou alterados sem retornar conteúdo nem registrar download bem-sucedido.
    let bytes: Buffer;
    try {
      bytes = await readFile(resolve(config.uploadDir, file.storage_name));
    } catch {
      throw new HttpError(503, 'Anexo indisponível. O arquivo armazenado não pôde ser verificado.');
    }
    if (bytes.length !== file.size || digest(bytes) !== file.sha256)
      throw new HttpError(503, 'Anexo indisponível. Integridade do arquivo não confirmada.');
    await transaction((sql) => audit(sql, user, 'attachment.download', id));
    reply
      .header('Content-Type', file.mime)
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      );
    return bytes;
  });
  app.get('/api/v1/openapi.json', async () =>
    JSON.parse(await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8')),
  );
  if (options.serveFrontend) {
    const root = resolve('dist');
    await access(root);
    const assetCache = new Map<string, Buffer>();
    const publicBytes = async (path: string, encoding: string | undefined) => {
      const key = path + ':' + (encoding ?? 'identity');
      let bytes = assetCache.get(key);
      if (!bytes) {
        const raw = await readFile(path);
        bytes =
          encoding === 'br' ? brotliCompressSync(raw) : encoding === 'gzip' ? gzipSync(raw) : raw;
        assetCache.set(key, bytes);
      }
      return bytes;
    };
    const csp =
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; frame-src blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    const htmlTemplate = await readFile(resolve(root, 'index.html'), 'utf8');
    const index = async (
      req: { url: string },
      reply: { header: (a: string, b: string) => unknown },
    ) => {
      reply.header('Cache-Control', 'no-cache');
      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.header('Content-Security-Policy', csp);
      return renderPageHtml(htmlTemplate, req.url);
    };
    app.get('/', index);
    for (const [name, mime] of Object.entries({
      'manifest.webmanifest': 'application/manifest+json',
      'app-icon.svg': 'image/svg+xml',
      'app-icon-192.png': 'image/png',
      'app-icon-512.png': 'image/png',
      'apple-touch-icon.png': 'image/png',
      'offline.html': 'text/html; charset=utf-8',
      'sw.js': 'application/javascript',
      'robots.txt': 'text/plain; charset=utf-8',
    }))
      app.get('/' + name, async (_req, reply) => {
        reply
          .header('Cache-Control', 'no-cache')
          .header('Content-Type', mime)
          .header('Content-Security-Policy', csp);
        return readFile(resolve(root, name));
      });
    app.get('/assets/:file', async (req, reply) => {
      const { file } = z
        .object({ file: z.string().regex(/^[A-Za-z0-9_-]+\.(js|css|svg|woff2?|png)$/) })
        .parse(req.params);
      reply.header(
        'Content-Type',
        file.endsWith('.js')
          ? 'application/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.svg')
              ? 'image/svg+xml'
              : 'application/octet-stream',
      );
      reply
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .header('Vary', 'Accept-Encoding');
      const enc = String(req.headers['accept-encoding'] ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter((v) => !/^.*;\s*q=0(?:\.0*)?$/.test(v));
      const encoding = enc.some((v) => /^br(?:;|$)/.test(v))
        ? 'br'
        : enc.some((v) => /^gzip(?:;|$)/.test(v))
          ? 'gzip'
          : undefined;
      if (encoding) reply.header('Content-Encoding', encoding);
      try {
        return await publicBytes(resolve(root, 'assets', file), encoding);
      } catch {
        throw new HttpError(404, 'Arquivo público inexistente.');
      }
    });
    app.setNotFoundHandler(async (req, reply) => {
      if (
        req.url.startsWith('/api/') ||
        req.method !== 'GET' ||
        req.url.split('?')[0].includes('.')
      )
        return reply.code(404).send({ error: 'Recurso inexistente.' });
      return index(req, reply);
    });
  }

  return app;
}
