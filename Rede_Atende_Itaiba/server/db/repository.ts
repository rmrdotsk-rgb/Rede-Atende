import { StorageService } from '../../src/domain/RequestEngine';
import { stateSchema, type StoredState } from '../../src/domain/schemas';
import { DEFAULT_DEADLINE_RULES } from '../../src/domain/serviceCatalog';
import type { Sql } from './database';
import { audit, HttpError, type User } from '../auth';
import { parseHistoricalProtocol } from '../../src/utils/helpers';
import { recifeDateKey } from '../../src/domain/governance';
export const emptyState = (): StoredState => ({
  schemaVersion: 4,
  catalogRevision: 1,
  requests: [],
  schools: [],
  appointments: [],
  workOrders: [],
  seiLogs: [],
  notifications: [],
  deadlineRules: DEFAULT_DEADLINE_RULES,
  ruleHistory: [],
  nextSequenceByYear: {},
  submissions: {},
});
const json = (value: unknown) => JSON.stringify(value);
export async function loadState(sql: Sql): Promise<StoredState> {
  const state = emptyState();
  for (const [table, key] of [
    ['requests', 'requests'],
    ['schools', 'schools'],
    ['appointments', 'appointments'],
    ['work_orders', 'workOrders'],
    ['notifications', 'notifications'],
    ['sei_simulations', 'seiLogs'],
  ] as const) {
    const result = await sql.query<{ data: never }>(`SELECT data FROM ${table} ORDER BY id`);
    (state[key] as unknown[]) = result.rows.map((r) => r.data);
  }
  state.requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const settings = await sql.query<{ data: Partial<StoredState> }>(
    "SELECT data FROM settings WHERE id='domain'",
  );
  if (settings.rows[0]) Object.assign(state, settings.rows[0].data);
  const sequences = await sql.query<{ year: number; next_value: number }>(
    'SELECT year,next_value FROM protocol_sequences',
  );
  state.nextSequenceByYear = Object.fromEntries(
    sequences.rows.map((r) => [String(r.year), r.next_value]),
  );
  try {
    return stateSchema.parse(state);
  } catch {
    throw new HttpError(
      503,
      'Dados persistidos inconsistentes. A equipe deve verificar a integridade da base antes de continuar. Os registros foram preservados.',
    );
  }
}
export function engineFor(state: StoredState, holidays: string[] = [], nextOrderNumber?: number) {
  let raw = json(state);
  const storage: Storage = {
    length: 1,
    clear() {
      throw new Error('Limpeza proibida.');
    },
    getItem() {
      return raw;
    },
    key() {
      return 'redeatende_state_v4';
    },
    removeItem() {
      throw new Error('Remoção proibida.');
    },
    setItem(_key, value) {
      raw = value;
    },
  };
  return {
    engine: new StorageService(storage, () => new Date(), holidays, nextOrderNumber),
    snapshot: () => stateSchema.parse(JSON.parse(raw)),
  };
}
export async function saveState(
  sql: Sql,
  state: StoredState,
  before: StoredState,
  actor?: User,
  ownerId?: string,
) {
  stateSchema.parse(state); // Valida o conjunto alterado antes da primeira gravação; SQL mantém os vínculos globais.
  const index = <T extends { id: string }>(items: T[]) =>
    new Map(items.map((item) => [item.id, item]));
  const oldRequests = index(before.requests),
    newRequests = index(state.requests),
    oldSchools = index(before.schools),
    oldOrders = index(before.workOrders),
    oldAppointments = index(before.appointments),
    oldNotifications = index(before.notifications),
    oldLogs = index(before.seiLogs);
  if (before.requests.some((r) => !newRequests.has(r.id)))
    throw new Error('Remoção de solicitações não permitida.');
  const changed = (a: unknown, b: unknown) => json(a) !== json(b);
  for (const s of state.schools)
    if (changed(s, oldSchools.get(s.id)))
      await sql.query(
        'INSERT INTO schools(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        [s.id, json(s)],
      );
  for (const r of state.requests) {
    const prior = oldRequests.get(r.id);
    if (!changed(r, prior)) continue;
    if (prior && prior.history.some((h, i) => json(h) !== json(r.history[i])))
      throw new Error('Histórico é somente por acréscimo.');
    if (!prior) {
      const p = parseHistoricalProtocol(r.protocol, Number(recifeDateKey(r.createdAt).slice(0, 4)));
      if (p.valid && p.year && p.seq)
        state.nextSequenceByYear[String(p.year)] = Math.max(
          state.nextSequenceByYear[String(p.year)] ?? 1,
          p.seq + 1,
        );
    }
    const oldIds = new Set(prior?.history.map((h) => h.id));
    for (const h of r.history)
      if (!oldIds.has(h.id) && actor) {
        h.author = actor.name;
        h.role =
          actor.role === 'cidadao'
            ? 'cidadao'
            : actor.role === 'gestor'
              ? 'secretario_educacao'
              : 'triagem_seduc';
      }
    await sql.query(
      `INSERT INTO requests(id,protocol,owner_id,school_id,department_id,category,status,priority,created_at,updated_at,deadline,data) VALUES($1,$2,$3,$4,(SELECT id FROM departments WHERE name=$5),$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET category=excluded.category,department_id=excluded.department_id,status=excluded.status,priority=excluded.priority,updated_at=excluded.updated_at,deadline=excluded.deadline,data=excluded.data`,
      [
        r.id,
        r.protocol,
        ownerId ?? null,
        r.schoolId,
        r.assignedDepartment ?? null,
        r.category,
        r.status,
        r.priority,
        r.createdAt,
        r.updatedAt,
        r.deadline ?? null,
        json(r),
      ],
    );
    for (const h of r.history)
      if (!oldIds.has(h.id))
        await sql.query(
          'INSERT INTO request_history(id,request_id,actor_id,occurred_at,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
          [h.id, r.id, actor?.id ?? null, h.timestamp, json(h)],
        );
    for (const i of r.informationRequests ?? [])
      await sql.query(
        'INSERT INTO information_requests(id,request_id,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        [i.id, r.id, json(i)],
      );
    if (r.satisfaction)
      await sql.query(
        'INSERT INTO ratings(request_id,rating,data) VALUES($1,$2,$3) ON CONFLICT(request_id) DO NOTHING',
        [r.id, r.satisfaction.rating, json(r.satisfaction)],
      );
  }
  for (const w of state.workOrders)
    if (changed(w, oldOrders.get(w.id)))
      await sql.query(
        'INSERT INTO work_orders(id,number,request_id,required,status,data) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data',
        [w.id, w.number, w.requestId, w.required, w.status, json(w)],
      );
  for (const a of state.appointments)
    if (changed(a, oldAppointments.get(a.id)))
      await sql.query(
        'INSERT INTO appointments(id,request_id,school_id,work_order_id,technician,day,time,status,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET request_id=excluded.request_id,school_id=excluded.school_id,technician=excluded.technician,day=excluded.day,time=excluded.time,status=excluded.status,data=excluded.data',
        [
          a.id,
          a.requestId ?? null,
          a.schoolId,
          a.workOrderId ?? null,
          a.technician,
          a.date,
          a.time,
          a.status,
          json(a),
        ],
      );
  for (const n of state.notifications)
    if (changed(n, oldNotifications.get(n.id)))
      await sql.query(
        'INSERT INTO notifications(id,request_id,audience,data) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        [n.id, n.requestId, n.audience, json(n)],
      );
  const requestsByProtocol = new Map(state.requests.map((r) => [r.protocol, r]));
  for (const l of state.seiLogs)
    if (!oldLogs.has(l.id)) {
      const request = requestsByProtocol.get(l.protocol);
      if (request)
        await sql.query('INSERT INTO sei_simulations(id,request_id,data) VALUES($1,$2,$3)', [
          l.id,
          request.id,
          json(l),
        ]);
    }
  for (const [year, seq] of Object.entries(state.nextSequenceByYear))
    await sql.query(
      'INSERT INTO protocol_sequences(year,next_value) VALUES($1,$2) ON CONFLICT(year) DO UPDATE SET next_value=GREATEST(protocol_sequences.next_value,excluded.next_value)',
      [Number(year), seq],
    );
  if (changed(state.ruleHistory, before.ruleHistory))
    for (const h of state.ruleHistory.slice(
      0,
      state.ruleHistory.length - before.ruleHistory.length,
    ))
      await sql.query('INSERT INTO deadline_rule_history(id,actor_id,data) VALUES($1,$2,$3)', [
        crypto.randomUUID(),
        actor?.id ?? null,
        json(h),
      ]);
  if (
    changed(state.deadlineRules, before.deadlineRules) ||
    changed(state.ruleHistory, before.ruleHistory)
  )
    await sql.query(
      "INSERT INTO settings(id,data) VALUES('domain',$1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      [json({ deadlineRules: state.deadlineRules, ruleHistory: state.ruleHistory })],
    );
}
export async function holidays(sql: Sql) {
  const r = await sql.query<{ data: string[] }>("SELECT data FROM settings WHERE id='holidays'");
  return r.rows[0]?.data ?? [];
}
export interface MutationScope {
  requestId?: string;
  appointmentId?: string;
  orderId?: string;
  technician?: string;
  date?: string;
  newOrder?: boolean;
}
/** Carrega a entidade e seus bloqueios. Conflitos de agenda são consultados só na janela relevante. */
export async function loadScope(sql: Sql, scope: MutationScope): Promise<StoredState> {
  const s = emptyState();
  s.schools = (
    await sql.query<{ data: StoredState['schools'][number] }>(
      'SELECT data FROM schools ORDER BY id',
    )
  ).rows.map((r) => r.data);
  const settings = await sql.query<{ data: Partial<StoredState> }>(
    "SELECT data FROM settings WHERE id='domain'",
  );
  if (settings.rows[0]) Object.assign(s, settings.rows[0].data);
  const sequences = await sql.query<{ year: number; next_value: number }>(
    'SELECT year,next_value FROM protocol_sequences',
  );
  s.nextSequenceByYear = Object.fromEntries(
    sequences.rows.map((r) => [String(r.year), r.next_value]),
  );
  let requestId = scope.requestId,
    technician = scope.technician,
    date = scope.date;
  if (scope.orderId) {
    const found = await sql.query<{ request_id: string }>(
      'SELECT request_id FROM work_orders WHERE id=$1',
      [scope.orderId],
    );
    requestId = found.rows[0]?.request_id;
  }
  if (scope.appointmentId) {
    const found = await sql.query<{
      request_id: string;
      data: StoredState['appointments'][number];
    }>('SELECT request_id,data FROM appointments WHERE id=$1', [scope.appointmentId]);
    requestId = found.rows[0]?.request_id;
    technician ??= found.rows[0]?.data.technician;
    date ??= found.rows[0]?.data.date;
  }
  s.appointments = (
    await sql.query<{ data: StoredState['appointments'][number] }>(
      `SELECT data FROM appointments WHERE request_id=$1 OR id=$2 OR (lower(trim(technician))=lower(trim($3)) AND day BETWEEN ($4::date-1) AND ($4::date+1) AND status IN ('Agendada','Confirmada'))`,
      [requestId ?? null, scope.appointmentId ?? null, technician ?? null, date ?? null],
    )
  ).rows.map((r) => r.data);
  const ids = [
    ...new Set(
      [requestId, scope.requestId, ...s.appointments.map((a) => a.requestId)].filter(
        (v): v is string => !!v,
      ),
    ),
  ];
  s.requests = (
    await sql.query<{ data: StoredState['requests'][number] }>(
      'SELECT data FROM requests WHERE id=ANY($1::text[])',
      [ids],
    )
  ).rows.map((r) => r.data);
  s.workOrders = (
    await sql.query<{ data: StoredState['workOrders'][number] }>(
      'SELECT data FROM work_orders WHERE request_id=ANY($1::text[])',
      [ids],
    )
  ).rows.map((r) => r.data);
  return stateSchema.parse(s);
}
export async function mutate<T>(
  sql: Sql,
  actor: User,
  action: string,
  fn: (engine: StorageService) => T,
  ownerId?: string,
  scope?: MutationScope,
) {
  const before = scope ? await loadScope(sql, scope) : await loadState(sql);
  let nextOrderNumber: number | undefined;
  if (scope?.newOrder) {
    const counter = await sql.query<{ next_value: string }>(
      "UPDATE operational_sequences SET next_value=next_value+1 WHERE id='work-order' RETURNING (next_value-1)::text AS next_value",
    );
    nextOrderNumber = Number(counter.rows[0].next_value);
  }
  const { engine, snapshot } = engineFor(before, await holidays(sql), nextOrderNumber);
  const value = fn(engine);
  const after = snapshot();
  await saveState(sql, after, before, actor, ownerId);
  await audit(sql, actor, action, scope?.requestId ?? scope?.appointmentId ?? scope?.orderId, {
    changedRequests: after.requests.filter(
      (r) => json(r) !== json(before.requests.find((p) => p.id === r.id)),
    ).length,
  });
  return value;
}
