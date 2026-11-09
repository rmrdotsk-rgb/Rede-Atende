import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const dir = await mkdtemp(join(tmpdir(), 'rede-atende-39-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'db'),
  UPLOAD_DIR: join(dir, 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
});
const password = 'Somente-Testes-39-123456';
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = password;
const { buildApp } = await import('../app');
const { seed } = await import('../db/seed');
const { transaction, closeDatabase } = await import('../db/database');
const { isRequestEligibleForSei } = await import('../../src/utils/helpers');
const app = await buildApp();
type Actor = { cookie: string; csrf: string };
let manager: Actor, citizen: Actor, auditor: Actor;
let seedTotals = { eligible: 0, integrated: 0, logs: 0 };
const input = {
  category: 'infraestrutura',
  schoolId: 'esc-001',
  subject: 'Demanda antiga de teste 39',
  description: 'Situação fictícia para verificar as listas de atendimento.',
  locationDetails: 'Sala fictícia',
  applicantName: 'Conta Fictícia',
  applicantRole: 'comunidade',
  privacyAcknowledged: true,
  categoryDetails: { natureza: 'Hidráulico' },
};
async function call(actor: Actor | undefined, method: string, path: string, payload?: unknown) {
  return app.inject({
    method: method as 'GET',
    url: '/api/v1' + path,
    headers: {
      'X-Requested-With': 'RedeAtende',
      ...(actor ? { cookie: actor.cookie, 'X-CSRF-Token': actor.csrf } : {}),
      ...(method === 'POST' && path === '/requests' ? { 'Idempotency-Key': randomUUID() } : {}),
    },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}
async function login(role: string) {
  const r = await call(undefined, 'POST', '/auth/login', {
    email: role + '@redeatende.invalid',
    password,
  });
  assert.equal(r.statusCode, 200, r.body);
  return { cookie: 'ra_session=' + r.cookies[0].value, csrf: r.json().csrf };
}
before(async () => {
  await seed();
  manager = await login('gestor');
  citizen = await login('cidadao');
  auditor = await login('auditor');
  const original = (await call(manager, 'GET', '/state')).json();
  seedTotals = {
    eligible: original.requests.filter((r: any) => isRequestEligibleForSei(r).eligible).length,
    integrated: original.requests.filter((r: any) => r.seiIntegrated || r.seiProcessNumber).length,
    logs: original.seiLogs.length,
  };
  const r = await call(citizen, 'POST', '/requests', input);
  assert.equal(r.statusCode, 201, r.body);
  const base = r.json();
  // Fixtures sintéticas em banco descartável: 61 elegíveis antigas, 45 integradas e 25 recebidas recentes.
  await transaction(async (sql) => {
    for (let n = 0; n < 131; n++) {
      const eligible = n < 61,
        integrated = n >= 61 && n < 106,
        status = eligible ? 'em_triagem' : integrated ? 'em_atendimento' : 'recebida';
      const createdAt = new Date(Date.UTC(2026, 0, 1) + n * 60000).toISOString();
      const item = {
        ...base,
        id: 'fixture-39-' + n,
        protocol: 'EDU-2026-' + String(900000 + n),
        subject: (eligible ? 'Elegível' : integrated ? 'Integrada' : 'Recebida') + ' fictícia ' + n,
        status,
        createdAt,
        updatedAt: createdAt,
        seiIntegrated: integrated,
        ...(integrated ? { seiProcessNumber: 'SIM-SEI-2026-' + String(900000 + n) } : {}),
        history: [],
      };
      await sql.query(
        'INSERT INTO requests(id,protocol,school_id,category,status,priority,created_at,updated_at,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          item.id,
          item.protocol,
          item.schoolId,
          item.category,
          status,
          item.priority,
          createdAt,
          createdAt,
          JSON.stringify(item),
        ],
      );
      if (integrated) {
        const log = {
          id: 'sei-39-' + n,
          timestamp: createdAt,
          protocol: item.protocol,
          action: 'processo_criado',
          seiNumber: item.seiProcessNumber,
          organ: 'DEMONSTRAÇÃO',
          statusText: 'Processo fictício criado localmente.',
        };
        await sql.query('INSERT INTO sei_simulations(id,request_id,data) VALUES($1,$2,$3)', [
          log.id,
          item.id,
          JSON.stringify(log),
        ]);
      }
    }
  });
});
after(async () => {
  await app.close();
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
});

test('SEI consulta todas as elegíveis no SQL e pagina pendentes, integradas e histórico independentemente', async () => {
  const result = await call(
    manager,
    'GET',
    '/bootstrap?view=integrations&eligiblePage=2&integratedPage=3&logPage=2',
  );
  assert.equal(result.statusCode, 200, result.body);
  const b = result.json();
  assert.equal(b.lists.eligibleRequests.total, 61 + seedTotals.eligible);
  assert.equal(b.lists.eligibleRequests.page, 2);
  assert.equal(b.requests.length, 20);
  assert.ok(b.requests.every((r: any) => isRequestEligibleForSei(r).eligible));
  assert.equal(b.lists.integratedRequests.total, 45 + seedTotals.integrated);
  assert.equal(b.lists.integratedRequests.page, 3);
  assert.equal(b.integratedRequests.length, 5 + seedTotals.integrated);
  assert.equal(b.lists.seiLogs.total, 45 + seedTotals.logs);
  assert.equal(b.lists.seiLogs.page, 2);
  assert.equal(b.seiLogs.length, 20);
  assert.ok(result.rawPayload.length < 70000, 'Não deve carregar todos os registros');
  const first = (await call(manager, 'GET', '/bootstrap?view=integrations')).json();
  assert.notEqual(first.requests[0].id, b.requests[0].id);
  const last = (await call(manager, 'GET', '/bootstrap?view=integrations&eligiblePage=999')).json();
  assert.equal(last.lists.eligibleRequests.page, 4);
  assert.equal(last.requests.length, 1 + seedTotals.eligible);
});

test('filtro SEI conserva totais globais e aplica busca coerente às três listas', async () => {
  const r = await call(manager, 'GET', '/bootstrap?view=integrations&search=EDU-2026-900000');
  assert.equal(r.statusCode, 200, r.body);
  const b = r.json();
  assert.equal(b.lists.eligibleRequests.total, 1);
  assert.equal(b.lists.integratedRequests.total, 0);
  assert.equal(b.lists.seiLogs.total, 0);
  assert.equal(b.integrationTotals.eligible, 61 + seedTotals.eligible);
  assert.equal(b.integrationTotals.integrated, 45 + seedTotals.integrated);
  const empty = (
    await call(manager, 'GET', '/bootstrap?view=integrations&search=inexistente-ficticio')
  ).json();
  assert.equal(empty.lists.eligibleRequests.total, 0);
  assert.equal(empty.integrationTotals.eligible, 61 + seedTotals.eligible);
});

test('ordem mostra protocolo, escola e prioridade de demanda ausente na página de resumos', async () => {
  const created = await call(manager, 'POST', '/work-orders', {
    requestId: 'fixture-39-0',
    title: 'Vistoriar atividade fictícia antiga',
    department: 'Setor de Engenharia e Manutenção Predial',
    technician: 'Equipe Fictícia 39',
    required: true,
  });
  assert.equal(created.statusCode, 200, created.body);
  const b = (await call(manager, 'GET', '/bootstrap?view=orders')).json();
  assert.ok(!b.requests.some((r: any) => r.id === 'fixture-39-0'));
  const order = b.workOrders.find((o: any) => o.id === created.json().id);
  assert.equal(order.requestProtocol, 'EDU-2026-900000');
  assert.equal(
    order.requestSchoolName,
    (await call(manager, 'GET', '/requests/fixture-39-0')).json().schoolName,
  );
  assert.equal(order.requestPriority, 'media');
  const detail = (await call(manager, 'GET', '/work-orders/' + order.id)).json();
  assert.equal(detail.requestProtocol, order.requestProtocol);
  assert.equal(detail.requestSchoolName, order.requestSchoolName);
});

test('busca de vínculos filtra situação antes de paginar e não vaza dados para cidadão', async () => {
  const r = await call(
    manager,
    'GET',
    '/requests/search?view=summary&statuses=em_triagem,encaminhada,em_atendimento&page=4&pageSize=20',
  );
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().total, 106 + seedTotals.eligible + seedTotals.integrated);
  assert.ok(
    r
      .json()
      .items.every((r: any) => ['em_triagem', 'encaminhada', 'em_atendimento'].includes(r.status)),
  );
  assert.equal((await call(citizen, 'GET', '/requests/search?sei=eligible')).statusCode, 403);
  assert.equal((await call(citizen, 'GET', '/bootstrap?view=integrations')).statusCode, 403);
  assert.equal((await call(undefined, 'GET', '/bootstrap?view=integrations')).statusCode, 401);
  assert.equal((await call(auditor, 'GET', '/bootstrap?view=integrations')).statusCode, 200);
  assert.equal(
    (await call(auditor, 'POST', '/requests/fixture-39-0/sei-simulation', {})).statusCode,
    403,
  );
});

test('SEI atualizado remove a pendência, incrementa total e recusa envio duplicado', async () => {
  const r = await call(manager, 'POST', '/requests/fixture-39-0/sei-simulation', {});
  assert.equal(r.statusCode, 200, r.body);
  const again = await call(manager, 'POST', '/requests/fixture-39-0/sei-simulation', {});
  assert.equal(again.statusCode, 422, again.body);
  const b = (await call(manager, 'GET', '/bootstrap?view=integrations')).json();
  assert.equal(b.lists.eligibleRequests.total, 60 + seedTotals.eligible);
  assert.equal(b.lists.integratedRequests.total, 46 + seedTotals.integrated);
  assert.equal(b.lists.seiLogs.total, 46 + seedTotals.logs);
  await closeDatabase();
  const restarted = (await call(manager, 'GET', '/bootstrap?view=integrations')).json();
  assert.equal(restarted.integrationTotals.eligible, 60 + seedTotals.eligible);
  assert.equal(restarted.integrationTotals.integrated, 46 + seedTotals.integrated);
});

test('cadastro continua disponível após SEI e ordens de serviço em base paginada', async () => {
  const result = await call(citizen, 'POST', '/requests', {
    ...input,
    subject: 'Cadastro após atividades administrativas',
  });
  assert.equal(result.statusCode, 201, result.body);
});
