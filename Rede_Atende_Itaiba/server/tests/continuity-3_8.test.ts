import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { gunzipSync, crc32 } from 'node:zlib';

const dir = await mkdtemp(join(tmpdir(), 'rede-atende-38-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'db'),
  UPLOAD_DIR: join(dir, 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
});
const password = 'Somente-Testes-38-123456';
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = password;
const { buildApp } = await import('../app');
const { seed } = await import('../db/seed');
const { transaction, closeDatabase } = await import('../db/database');
const { DEPARTMENTS } = await import('../../src/domain/serviceCatalog');
const app = await buildApp({ serveFrontend: true });
type Actor = { cookie: string; csrf: string; id: string };
let citizen: Actor, manager: Actor, operator: Actor, auditor: Actor, other: Actor;
async function call(
  actor: Actor | undefined,
  method: string,
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: method as 'GET',
    url: '/api/v1' + path,
    headers: {
      'X-Requested-With': 'RedeAtende',
      ...(actor ? { cookie: actor.cookie, 'X-CSRF-Token': actor.csrf } : {}),
      ...headers,
    },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}
async function login(role: string) {
  const r = await call(undefined, 'POST', '/auth/login', {
    email: `${role}@redeatende.invalid`,
    password,
  });
  assert.equal(r.statusCode, 200, r.body);
  return { id: r.json().user.id, csrf: r.json().csrf, cookie: `ra_session=${r.cookies[0].value}` };
}
const body = () => ({
  category: 'infraestrutura',
  schoolId: 'esc-001',
  subject: 'Solicitação fictícia de regressão',
  description: 'Situação inteiramente fictícia para verificar a continuidade do atendimento.',
  locationDetails: 'Sala fictícia 38',
  applicantName: 'Cidadão Fictício',
  applicantRole: 'comunidade',
  privacyAcknowledged: true,
  categoryDetails: { natureza: 'Hidráulico' },
});
async function create() {
  const r = await call(citizen, 'POST', '/requests', body(), { 'Idempotency-Key': randomUUID() });
  assert.equal(r.statusCode, 201, r.body);
  return r.json();
}
async function triage() {
  const r = await create();
  const patch = await call(manager, 'PATCH', `/requests/${r.id}`, {
    updates: { status: 'em_triagem' },
    note: 'Análise fictícia do atendimento.',
  });
  assert.equal(patch.statusCode, 200, patch.body);
  return patch.json();
}
const orderInput = (id: string) => ({
  requestId: id,
  title: 'Atividade fictícia de regressão',
  department: DEPARTMENTS[0],
  technician: 'Equipe Fictícia',
  required: true,
});
async function upload(id: string, bytes: Buffer, name = 'ensaio.png', mime = 'image/png') {
  const boundary = 'upload-' + randomUUID(),
    payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
  return app.inject({
    method: 'POST',
    url: `/api/v1/requests/${id}/attachments`,
    headers: {
      cookie: citizen.cookie,
      'X-CSRF-Token': citizen.csrf,
      'X-Requested-With': 'RedeAtende',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Idempotency-Key': randomUUID(),
    },
    payload,
  });
}
before(async () => {
  await seed();
  citizen = await login('cidadao');
  manager = await login('gestor');
  operator = await login('operador');
  auditor = await login('auditor');
  const r = await call(undefined, 'POST', '/auth/register', {
    name: 'Outra Conta Fictícia',
    email: 'outra-38@teste.invalid',
    password,
    academicAcknowledged: true,
  });
  other = { id: r.json().user.id, csrf: r.json().csrf, cookie: `ra_session=${r.cookies[0].value}` };
});
after(async () => {
  await app.close();
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
});

test('notas técnicas de OS novas e legadas não escapam por nenhum canal do titular', async () => {
  const request = await triage(),
    order = (
      await call(manager, 'POST', '/work-orders', orderInput(request.id), {
        'Idempotency-Key': randomUUID(),
      })
    ).json();
  for (const status of ['em_execucao', 'pendente', 'em_execucao', 'concluida']) {
    const marker = 'INTERNO-38-' + status;
    const changed = await call(manager, 'PATCH', `/work-orders/${order.id}`, {
      status,
      note: marker,
    });
    assert.equal(changed.statusCode, 200, changed.body);
    const staff = await call(manager, 'GET', `/requests/${request.id}`);
    assert.ok(staff.body.includes(marker));
    assert.ok((await call(manager, 'GET', `/work-orders/${order.id}`)).body.includes(marker));
    for (const path of [
      '/state',
      '/requests',
      '/requests/search',
      `/requests/${request.id}`,
      `/protocols/${request.protocol}`,
      '/notifications',
      '/work-orders',
      `/work-orders/${order.id}`,
      '/bootstrap',
    ]) {
      const r = await call(citizen, 'GET', path);
      assert.equal(r.statusCode, 200, r.body);
      assert.ok(!r.body.includes(marker), path + ' expôs nota interna');
    }
  }
  // Forma exata dos eventos persistidos pela 3.7, sem reescrever auditoria imutável.
  const marker = 'LEGADO-PRIVADO-38';
  await transaction(async (sql) => {
    const r = await sql.query<{ data: Record<string, unknown> }>(
      'SELECT data FROM requests WHERE id=$1',
      [request.id],
    );
    const data = r.rows[0].data as any;
    data.history.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      status: data.status,
      author: 'Equipe antiga',
      role: 'gestor_escolar',
      note: `${order.number} — Cancelada: ${marker}`,
    });
    await sql.query('UPDATE requests SET data=$1 WHERE id=$2', [JSON.stringify(data), request.id]);
  });
  for (const path of [
    '/state',
    '/requests',
    '/requests/search',
    `/requests/${request.id}`,
    `/protocols/${request.protocol}`,
  ])
    assert.ok(!(await call(citizen, 'GET', path)).body.includes(marker), path);
  const cancelOrder = (
    await call(manager, 'POST', '/work-orders', orderInput(request.id), {
      'Idempotency-Key': randomUUID(),
    })
  ).json();
  assert.equal(
    (
      await call(manager, 'PATCH', `/work-orders/${cancelOrder.id}`, {
        status: 'cancelada',
        note: 'CANCELAMENTO-INTERNO-38',
      })
    ).statusCode,
    200,
  );
  const key = (
    await transaction((sql) =>
      sql.query<{ key: string }>('SELECT key FROM idempotency_keys WHERE request_id=$1', [
        request.id,
      ]),
    )
  ).rows[0].key;
  const replay = await call(citizen, 'POST', '/requests', body(), { 'Idempotency-Key': key });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.ok(!/LEGADO-PRIVADO-38|CANCELAMENTO-INTERNO-38|INTERNO-38-/.test(replay.body));
  assert.ok((await call(manager, 'GET', `/requests/${request.id}`)).body.includes(marker));
  assert.equal((await call(other, 'GET', `/requests/${request.id}`)).statusCode, 404);
});

test('escola inválida é recusada com rollback; renomeação atualiza demanda e agenda', async () => {
  const req = await triage(),
    school = (await call(manager, 'GET', '/schools')).json().find((s: any) => s.id === 'esc-001');
  const { id, activeRequestsCount, ...data } = school;
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const a = await call(
    manager,
    'POST',
    '/appointments',
    {
      requestId: req.id,
      protocolRef: req.protocol,
      schoolId: id,
      schoolName: school.name,
      type: 'Visita fictícia',
      technician: 'Equipe Renomeação',
      date,
      time: '14:00',
      status: 'Agendada',
    },
    { 'Idempotency-Key': randomUUID() },
  );
  assert.equal(a.statusCode, 200, a.body);
  try {
    for (const name of ['', '   ', 'x'.repeat(201)]) {
      const r = await call(manager, 'PATCH', `/schools/${id}`, { ...data, name });
      assert.equal(r.statusCode, 400, r.body);
      assert.equal((await call(manager, 'GET', '/state')).statusCode, 200);
      assert.equal((await call(citizen, 'GET', '/state')).statusCode, 200);
    }
    const renamed = await call(manager, 'PATCH', `/schools/${id}`, {
      ...data,
      name: '  Unidade Fictícia Renomeada  ',
    });
    assert.equal(renamed.statusCode, 200, renamed.body);
    assert.equal(
      (await call(citizen, 'GET', `/requests/${req.id}`)).json().schoolName,
      'Unidade Fictícia Renomeada',
    );
    assert.ok(
      (await call(manager, 'GET', '/appointments'))
        .json()
        .some((v: any) => v.id === a.json().id && v.schoolName === 'Unidade Fictícia Renomeada'),
    );
  } finally {
    await transaction(async (sql) => {
      await sql.query('UPDATE schools SET data=$1 WHERE id=$2', [JSON.stringify(school), id]);
      await sql.query(
        "UPDATE requests SET data=jsonb_set(data,'{schoolName}',to_jsonb($1::text)) WHERE school_id=$2",
        [school.name, id],
      );
      await sql.query(
        "UPDATE appointments SET data=jsonb_set(data,'{schoolName}',to_jsonb($1::text)) WHERE school_id=$2",
        [school.name, id],
      );
    });
  }
});

test('OS e agenda reconciliam retry, concorrência, conflito e reinício por chave persistida', async () => {
  const request = await triage(),
    data = orderInput(request.id),
    key = randomUUID();
  const results = await Promise.all(
    [1, 2, 3].map(() => call(manager, 'POST', '/work-orders', data, { 'Idempotency-Key': key })),
  );
  for (const r of results) assert.equal(r.statusCode, 200, r.body);
  assert.equal(new Set(results.map((r) => r.json().id)).size, 1);
  assert.equal(
    (
      await call(
        manager,
        'POST',
        '/work-orders',
        { ...data, title: 'Outra intenção fictícia' },
        { 'Idempotency-Key': key },
      )
    ).statusCode,
    409,
  );
  await closeDatabase();
  const replay = await call(manager, 'POST', '/work-orders', data, { 'Idempotency-Key': key });
  assert.equal(replay.json().id, results[0].json().id);
  assert.notEqual(
    (await call(manager, 'POST', '/work-orders', data, { 'Idempotency-Key': randomUUID() })).json()
      .id,
    replay.json().id,
  );
  const ap = {
      requestId: request.id,
      protocolRef: request.protocol,
      schoolId: request.schoolId,
      schoolName: request.schoolName,
      type: 'Vistoria fictícia',
      technician: 'Equipe Chave Fictícia',
      date: new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10),
      time: '10:00',
      status: 'Agendada',
    },
    ak = randomUUID();
  const first = await call(manager, 'POST', '/appointments', ap, { 'Idempotency-Key': ak }),
    again = await call(manager, 'POST', '/appointments', ap, { 'Idempotency-Key': ak });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(again.statusCode, 200, again.body);
  assert.equal(first.json().id, again.json().id);
});

test('Origin e datas impossíveis produzem rejeição controlada sem gravar calendário', async () => {
  for (const origin of ['null', '! inválida', 'https://outro.invalid', 'ftp://localhost']) {
    const r = await call(
      undefined,
      'POST',
      '/auth/login',
      { email: 'cidadao@redeatende.invalid', password },
      { origin, host: 'localhost' },
    );
    assert.equal(r.statusCode, 403, r.body);
  }
  const before = (await call(manager, 'GET', '/deadline-rules')).json().holidays;
  for (const date of ['2026-99-99', '2026-02-30']) {
    const r = await call(manager, 'PUT', '/holidays', {
      dates: [date],
      reason: 'Ensaio de data impossível',
    });
    assert.equal(r.statusCode, 400, r.body);
  }
  assert.deepEqual((await call(manager, 'GET', '/deadline-rules')).json().holidays, before);
});

test('anexos truncados são recusados; imagens íntegras continuam privadas e utilizáveis', async () => {
  const request = await create(),
    bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url));
  for (const invalid of [
    bytes.subarray(0, 8),
    bytes.subarray(0, 33),
    bytes.subarray(0, bytes.length - 6),
  ])
    assert.equal((await upload(request.id, invalid)).statusCode, 400);
  const badCrc = Buffer.from(bytes);
  badCrc[29] ^= 1;
  assert.equal((await upload(request.id, badCrc)).statusCode, 400);
  const tooLarge = Buffer.from(bytes);
  tooLarge.writeUInt32BE(8193, 16);
  tooLarge.writeUInt32BE(crc32(tooLarge.subarray(12, 29)), 29);
  assert.equal((await upload(request.id, tooLarge)).statusCode, 400);
  const jpg = await readFile(new URL('./fixtures/imagem-ficticia.jpg', import.meta.url));
  assert.equal(
    (await upload(request.id, jpg.subarray(0, jpg.length - 2), 'truncado.jpg', 'image/jpeg'))
      .statusCode,
    400,
  );
  const ok = await upload(request.id, bytes);
  assert.equal(ok.statusCode, 201, ok.body);
  assert.deepEqual((await call(citizen, 'GET', `/attachments/${ok.json().id}`)).rawPayload, bytes);
  assert.equal((await call(other, 'GET', `/attachments/${ok.json().id}`)).statusCode, 404);
  assert.equal((await call(undefined, 'GET', `/attachments/${ok.json().id}`)).statusCode, 401);
});

test('assets com hash têm compressão e cache; HTML revalida e dados privados não são públicos', async () => {
  const filename = (await readdir('dist/assets')).find((n) => /^index-.*\.js$/.test(n))!;
  const response = await app.inject({
    method: 'GET',
    url: '/assets/' + filename,
    headers: { 'accept-encoding': 'gzip' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-encoding'], 'gzip');
  assert.match(String(response.headers['cache-control']), /immutable/);
  assert.match(String(response.headers.vary), /Accept-Encoding/i);
  assert.deepEqual(gunzipSync(response.rawPayload), await readFile('dist/assets/' + filename));
  const html = await app.inject({ method: 'GET', url: '/' });
  assert.match(String(html.headers['cache-control']), /no-cache/);
  assert.ok(html.headers['content-security-policy']);
  assert.equal((await call(citizen, 'GET', '/state')).headers['cache-control'], 'no-store');
  const privateCompressed = await call(citizen, 'GET', '/bootstrap', undefined, {
    'accept-encoding': 'gzip',
  });
  assert.equal(privateCompressed.headers['cache-control'], 'no-store');
  assert.equal(privateCompressed.headers['content-encoding'], 'gzip');
  assert.ok(JSON.parse(gunzipSync(privateCompressed.rawPayload).toString()).requests);
});

test('reabertura exige gestor e motivo, preserva avaliação e recusa versão antiga', async () => {
  const req = await triage();
  for (const status of ['encaminhada', 'em_atendimento', 'concluida']) {
    const r = await call(manager, 'PATCH', `/requests/${req.id}`, {
      updates: {
        status,
        assignedDepartment: DEPARTMENTS[0],
        assignedTechnician: 'Equipe Fictícia',
      },
      note: 'Providência final fictícia registrada.',
    });
    assert.equal(r.statusCode, 200, r.body);
  }
  assert.equal(
    (
      await call(citizen, 'POST', `/requests/${req.id}/rating`, {
        rating: 5,
        comment: 'Avaliação sintética original.',
      })
    ).statusCode,
    200,
  );
  const closed = (await call(manager, 'GET', `/requests/${req.id}`)).json();
  const reopen = {
    updates: { status: 'em_triagem' },
    isReopening: true,
    note: 'Nova ocorrência fictícia verificada.',
    expectedUpdatedAt: closed.updatedAt,
  };
  for (const actor of [operator, auditor, citizen])
    assert.equal((await call(actor, 'PATCH', `/requests/${req.id}`, reopen)).statusCode, 403);
  assert.equal(
    (await call(manager, 'PATCH', `/requests/${req.id}`, { ...reopen, note: '' })).statusCode,
    422,
  );
  assert.equal(
    (
      await call(manager, 'PATCH', `/requests/${req.id}`, {
        ...reopen,
        expectedUpdatedAt: req.updatedAt,
      })
    ).statusCode,
    409,
  );
  const r = await call(manager, 'PATCH', `/requests/${req.id}`, reopen);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().status, 'em_triagem');
  assert.equal(r.json().resolution, undefined);
  assert.equal(r.json().satisfaction.rating, 5);
  assert.ok(r.json().history.some((h: any) => h.note === reopen.note));
});

test('bootstrap tem resumos limitados, agregados corretos e detalhe apenas do titular', async () => {
  const req = await create();
  for (const actor of [citizen, manager, auditor]) {
    const r = await call(actor, 'GET', '/bootstrap');
    assert.equal(r.statusCode, 200, r.body);
    const b = r.json();
    assert.ok(b.requests.length <= 20);
    assert.ok(r.rawPayload.length < 100000);
    assert.ok(b.requests.every((v: any) => v.history.length === 0));
  }
  const detail = await call(citizen, 'GET', '/bootstrap?view=track&requestId=' + req.id);
  assert.equal(detail.statusCode, 200, detail.body);
  assert.ok(detail.json().requests.find((r: any) => r.id === req.id).history.length > 0);
  assert.equal(
    (await call(other, 'GET', '/bootstrap?view=track&requestId=' + req.id)).statusCode,
    404,
  );
  const fresh = await call(manager, 'GET', '/reports');
  assert.equal(fresh.statusCode, 200);
  const full = (await call(manager, 'GET', '/state')).json();
  const { calculateMetrics } = await import('../../src/utils/helpers');
  const { managementReport } = await import('../../src/domain/reporting');
  const expected = calculateMetrics(full.requests),
    actual = fresh.json().metrics;
  for (const key of [
    'total',
    'open',
    'inTriage',
    'nearingDeadline',
    'overdueCount',
    'completed',
    'waitingInfo',
    'byStatus',
    'byCategory',
  ])
    assert.deepEqual(actual[key], (expected as any)[key], key);
  assert.deepEqual(fresh.json().report, managementReport(full.requests));
});

test('edição de agenda permite remover vínculo e observação sem reutilizar valores antigos', async () => {
  const req = await triage(),
    date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const created = await call(
    manager,
    'POST',
    '/appointments',
    {
      requestId: req.id,
      protocolRef: req.protocol,
      schoolId: req.schoolId,
      schoolName: req.schoolName,
      type: 'Atendimento fictício',
      technician: 'Equipe Sem Vínculo',
      date,
      time: '15:00',
      status: 'Agendada',
      notes: 'Observação fictícia original.',
    },
    { 'Idempotency-Key': randomUUID() },
  );
  assert.equal(created.statusCode, 200, created.body);
  const changed = await call(manager, 'PATCH', '/appointments/' + created.json().id, {
    requestId: null,
    notes: null,
    schoolId: req.schoolId,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().requestId, undefined);
  assert.equal(changed.json().notes, undefined);
  assert.equal(changed.json().protocolRef, 'DEMANDA-GERAL');
  const stored = await transaction((sql) =>
    sql.query<{ request_id: string | null }>('SELECT request_id FROM appointments WHERE id=$1', [
      created.json().id,
    ]),
  );
  assert.equal(stored.rows[0].request_id, null);
});

test('gestor recupera nome escolar inválido persistido por versão antiga sem depender do snapshot', async () => {
  const school = (await call(manager, 'GET', '/schools'))
      .json()
      .find((s: any) => s.id === 'esc-001'),
    { id, activeRequestsCount, ...data } = school;
  await transaction(async (sql) => {
    await sql.query('UPDATE schools SET data=$1 WHERE id=$2', [
      JSON.stringify({ ...school, name: '' }),
      id,
    ]);
    await sql.query(
      "UPDATE requests SET data=jsonb_set(data,'{schoolName}','\"\"'::jsonb) WHERE school_id=$1",
      [id],
    );
  });
  try {
    const broken = await call(manager, 'GET', '/state');
    assert.equal(broken.statusCode, 503);
    assert.match(broken.json().error, /Dados persistidos inconsistentes/);
    assert.equal((await call(manager, 'GET', '/auth/me')).statusCode, 200);
    const repaired = await call(manager, 'PATCH', '/schools/' + id, data);
    assert.equal(repaired.statusCode, 200, repaired.body);
    assert.equal((await call(manager, 'GET', '/state')).statusCode, 200);
    assert.equal((await call(citizen, 'GET', '/state')).statusCode, 200);
  } finally {
    await transaction(async (sql) => {
      await sql.query('UPDATE schools SET data=$1 WHERE id=$2', [JSON.stringify(school), id]);
      await sql.query(
        "UPDATE requests SET data=jsonb_set(data,'{schoolName}',to_jsonb($1::text)) WHERE school_id=$2",
        [school.name, id],
      );
    });
  }
});
