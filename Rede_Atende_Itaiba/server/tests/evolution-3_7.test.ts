import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const dir = await mkdtemp(join(tmpdir(), 'rede-atende-37-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'db'),
  UPLOAD_DIR: join(dir, 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
});
const password = 'SomenteTeste-37-123456789';
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = password;
const { buildApp } = await import('../app');
const { seed } = await import('../db/seed');
const { transaction, closeDatabase } = await import('../db/database');
const { DEPARTMENTS } = await import('../../src/domain/serviceCatalog');
const app = await buildApp();
type Actor = { cookie: string; csrf: string; id: string };
let citizen: Actor, other: Actor, manager: Actor, operator: Actor, auditor: Actor;
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
const body = (subject = 'Solicitação fictícia 3.7') => ({
  category: 'infraestrutura',
  schoolId: 'esc-001',
  subject,
  description: 'Relato sintético para verificar a versão 3.7, sem dados pessoais.',
  locationDetails: 'Sala fictícia 37',
  applicantName: 'Cidadão Fictício',
  applicantRole: 'comunidade',
  priority: 'media',
  privacyAcknowledged: true,
  categoryDetails: { natureza: 'Hidráulico' },
});
async function create(subject?: string, actor = citizen) {
  const r = await call(actor, 'POST', '/requests', body(subject), {
    'Idempotency-Key': randomUUID(),
  });
  assert.equal(r.statusCode, 201, r.body);
  return r.json();
}
async function upload(
  actor: Actor,
  id: string,
  bytes: Buffer,
  name = 'ensaio.png',
  mime = 'image/png',
  key?: string,
) {
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
      cookie: actor.cookie,
      'X-CSRF-Token': actor.csrf,
      'X-Requested-With': 'RedeAtende',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      ...(key ? { 'Idempotency-Key': key } : {}),
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
    name: 'Outra Pessoa Fictícia',
    email: 'outra-37@teste.invalid',
    password,
    academicAcknowledged: true,
  });
  assert.equal(r.statusCode, 201);
  other = { id: r.json().user.id, csrf: r.json().csrf, cookie: `ra_session=${r.cookies[0].value}` };
});
after(async () => {
  await app.close();
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
});

test('prioridade inicial e campos de controle não podem ser escolhidos pelo cidadão', async () => {
  const data = {
    ...body('Prioridade controlada 3.7'),
    priority: 'urgente',
    status: 'concluida',
    owner_id: other.id,
    protocol: 'EDU-2026-999999',
    deadline: '2099-01-01T00:00:00Z',
  };
  assert.equal(
    (await call(undefined, 'POST', '/requests', data, { 'Idempotency-Key': randomUUID() }))
      .statusCode,
    401,
  );
  const r = await call(citizen, 'POST', '/requests', data, { 'Idempotency-Key': randomUUID() });
  assert.equal(r.statusCode, 201, r.body);
  const saved = r.json();
  assert.equal(saved.priority, 'media');
  assert.equal(saved.status, 'recebida');
  assert.notEqual(saved.protocol, data.protocol);
  assert.notEqual(saved.deadline, data.deadline);
  const owner = await transaction((sql) =>
    sql.query('SELECT owner_id FROM requests WHERE id=$1', [saved.id]),
  );
  assert.equal(owner.rows[0].owner_id, citizen.id);
  assert.equal(
    (
      await call(citizen, 'PATCH', `/requests/${saved.id}`, {
        updates: { priority: 'urgente' },
        note: 'Tentativa indevida do cidadão.',
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call(auditor, 'PATCH', `/requests/${saved.id}`, {
        updates: { priority: 'urgente' },
        note: 'Auditor não pode alterar.',
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call(manager, 'PATCH', `/requests/${saved.id}`, {
        updates: { priority: 'urgente' },
        note: '',
      })
    ).statusCode,
    422,
  );
  const changed = await call(manager, 'PATCH', `/requests/${saved.id}`, {
    updates: { priority: 'urgente' },
    note: 'Risco fictício confirmado durante triagem.',
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().priority, 'urgente');
  const history = await transaction((sql) =>
    sql.query<{
      actor_id: string;
      data: { changes: { priority: { before: string; after: string } } };
    }>('SELECT actor_id,data FROM request_history WHERE request_id=$1 ORDER BY occurred_at DESC', [
      saved.id,
    ]),
  );
  assert.equal(history.rows[0].actor_id, manager.id);
  assert.deepEqual(history.rows[0].data.changes.priority, { before: 'media', after: 'urgente' });
});

test('reenvio e concorrência com a mesma chave de upload gravam um único arquivo', async () => {
  const request = await create('Upload idempotente fictício 3.7'),
    bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url)),
    key = randomUUID();
  const results = await Promise.all(
    [1, 2, 3].map(() => upload(citizen, request.id, bytes, 'ensaio.png', 'image/png', key)),
  );
  for (const result of results) assert.equal(result.statusCode, 201, result.body);
  assert.equal(new Set(results.map((r) => r.json().id)).size, 1);
  const count = await transaction((sql) =>
    sql.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM attachments WHERE request_id=$1',
      [request.id],
    ),
  );
  assert.equal(Number(count.rows[0].total), 1);
});

test('mesma chave com conteúdo diferente falha; mesmo nome não mistura arquivos distintos', async () => {
  const request = await create('Arquivos distintos com mesmo nome'),
    bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url)),
    second = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64',
    ),
    key = randomUUID();
  const first = await upload(citizen, request.id, bytes, 'mesmo.png', 'image/png', key);
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(
    (await upload(citizen, request.id, second, 'mesmo.png', 'image/png', key)).statusCode,
    409,
  );
  const different = await upload(
    citizen,
    request.id,
    second,
    'mesmo.png',
    'image/png',
    randomUUID(),
  );
  assert.equal(different.statusCode, 201, different.body);
  assert.notEqual(different.json().id, first.json().id);
  assert.equal(
    (await upload(other, request.id, bytes, 'mesmo.png', 'image/png', key)).statusCode,
    404,
  );
  assert.equal((await call(other, 'GET', `/attachments/${first.json().id}`)).statusCode, 404);
  const stored = await call(citizen, 'GET', `/attachments/${first.json().id}`);
  assert.deepEqual(stored.rawPayload, bytes);
});

test('retry continua funcionando na cota máxima e após reabrir o banco', async () => {
  const request = await create('Cota e persistência do upload'),
    bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url)),
    key = randomUUID();
  const first = await upload(citizen, request.id, bytes, 'primeiro.png', 'image/png', key);
  assert.equal(first.statusCode, 201, first.body);
  for (let i = 1; i < 5; i++)
    assert.equal(
      (await upload(citizen, request.id, bytes, `arquivo-${i}.png`, 'image/png', randomUUID()))
        .statusCode,
      201,
    );
  assert.equal(
    (await upload(citizen, request.id, bytes, 'sexto.png', 'image/png', randomUUID())).statusCode,
    422,
  );
  await closeDatabase();
  const replay = await upload(citizen, request.id, bytes, 'primeiro.png', 'image/png', key);
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.json().id, first.json().id);
  const legacy = await upload(citizen, request.id, bytes, 'primeiro.png', 'image/png');
  assert.equal(legacy.statusCode, 201, legacy.body);
  assert.equal(legacy.json().id, first.json().id);
  const count = await transaction((sql) =>
    sql.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM attachments WHERE request_id=$1',
      [request.id],
    ),
  );
  assert.equal(Number(count.rows[0].total), 5);
});

test('falha de metadados desfaz operação e remove apenas o novo binário confirmado como órfão', async () => {
  const request = await create('Falha parcial de upload'),
    bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url)),
    beforeFiles = (await readdir(join(dir, 'uploads'))).sort();
  await transaction(async (sql) => {
    await sql.query(
      "CREATE FUNCTION fail_upload_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='falha-planejada.png' THEN RAISE EXCEPTION 'falha técnica sintética de gravação'; END IF; RETURN NEW; END $$",
    );
    await sql.query(
      'CREATE TRIGGER fail_upload_fixture BEFORE INSERT ON attachments FOR EACH ROW EXECUTE FUNCTION fail_upload_fixture()',
    );
  });
  try {
    const result = await upload(
      citizen,
      request.id,
      bytes,
      'falha-planejada.png',
      'image/png',
      randomUUID(),
    );
    assert.equal(result.statusCode, 503, result.body);
    assert.ok(!result.body.includes('falha técnica'));
    const rows = await transaction((sql) =>
      sql.query('SELECT id FROM attachments WHERE request_id=$1', [request.id]),
    );
    assert.equal(rows.rows.length, 0);
    assert.deepEqual((await readdir(join(dir, 'uploads'))).sort(), beforeFiles);
  } finally {
    await transaction(async (sql) => {
      await sql.query('DROP TRIGGER fail_upload_fixture ON attachments');
      await sql.query('DROP FUNCTION fail_upload_fixture()');
    });
  }
});

test('consultas SQL paginadas combinam filtros sem revelar registros de outra conta', async () => {
  const created = [];
  for (let i = 0; i < 7; i++) created.push(await create(`Paginação fictícia 37 ${i}`));
  await create('Paginação fictícia 37 de outra conta', other);
  const query =
    '/requests/search?search=' + encodeURIComponent('Paginação fictícia 37') + '&pageSize=3';
  const first = await call(citizen, 'GET', query),
    second = await call(citizen, 'GET', query + '&page=2');
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().total, 7);
  assert.equal(first.json().pages, 3);
  assert.equal(first.json().items.length, 3);
  assert.equal(second.json().items.length, 3);
  assert.ok(
    !first
      .json()
      .items.some((r: { id: string }) =>
        second.json().items.some((s: { id: string }) => s.id === r.id),
      ),
  );
  const staff = await call(auditor, 'GET', query);
  assert.equal(staff.json().total, 8);
  const changed = await call(operator, 'PATCH', `/requests/${created[0].id}`, {
    updates: {
      status: 'em_triagem',
      assignedDepartment: DEPARTMENTS[0],
      assignedTechnician: 'Equipe Paginação Fictícia',
    },
    note: 'Triagem fictícia para conferir os filtros.',
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(new Date());
  const filters = new URLSearchParams({
    search: 'Paginação fictícia 37',
    category: 'infraestrutura',
    status: 'em_triagem',
    schoolId: 'esc-001',
    department: DEPARTMENTS[0],
    technician: 'Paginação',
    zone: 'urbana',
    from: day,
    to: day,
  });
  const combined = await call(manager, 'GET', '/requests/search?' + filters);
  assert.equal(combined.statusCode, 200, combined.body);
  assert.equal(combined.json().total, 1);
  assert.equal(combined.json().items[0].id, created[0].id);
  assert.equal(
    (await call(citizen, 'GET', `/protocols/${created[0].protocol.toLowerCase()}`)).json().id,
    created[0].id,
  );
  assert.equal((await call(other, 'GET', `/requests/${created[0].id}`)).statusCode, 404);
  assert.equal((await call(undefined, 'GET', query)).statusCode, 401);
  assert.equal((await call(citizen, 'GET', '/requests/search?technician=Privado')).statusCode, 403);
  assert.equal((await call(manager, 'GET', '/requests/search?pageSize=1000')).statusCode, 400);
  assert.equal(
    (await call(manager, 'GET', '/requests/search?from=2026-12-31&to=2026-01-01')).statusCode,
    400,
  );
  const injection = await call(
    manager,
    'GET',
    '/requests/search?search=' + encodeURIComponent("%'; DROP TABLE requests; --"),
  );
  assert.equal(injection.statusCode, 200, injection.body);
  assert.equal(injection.json().total, 0);
  assert.ok(Array.isArray((await call(citizen, 'GET', '/requests')).json()));
});

test('duas alterações sobre a mesma versão não sobrescrevem silenciosamente a primeira', async () => {
  const request = await create('Concorrência de triagem 37');
  const results = await Promise.all(
    [operator, manager].map((actor, i) =>
      call(actor, 'PATCH', `/requests/${request.id}`, {
        updates: { priority: i ? 'urgente' : 'alta' },
        note: 'Reclassificação fictícia com justificativa.',
        expectedUpdatedAt: request.updatedAt,
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  const fresh = (await call(manager, 'GET', `/requests/${request.id}`)).json();
  assert.equal(fresh.history.length, request.history.length + 1);
  const outdated = await call(manager, 'PATCH', `/requests/${request.id}`, {
    updates: { priority: 'baixa' },
    note: 'Tentativa com versão desatualizada.',
    expectedUpdatedAt: request.updatedAt,
  });
  assert.equal(outdated.statusCode, 409, outdated.body);
});

test('migração 002 é reaplicável, leitura é somente leitura e backup administrativo não inclui credenciais', async () => {
  const before = (await call(manager, 'GET', '/requests')).json();
  const { migrate } = await import('../db/migrate');
  await migrate();
  assert.deepEqual((await call(manager, 'GET', '/requests')).json(), before);
  const version = await transaction((sql) =>
    sql.query('SELECT version FROM schema_migrations WHERE version=2'),
  );
  assert.equal(version.rows.length, 1);
  const { readTransaction } = await import('../db/database');
  await assert.rejects(
    readTransaction((sql) =>
      sql.query("INSERT INTO settings(id,data) VALUES('readonly-test','{}')"),
    ),
    /read.only/i,
  );
  const backup = await call(manager, 'GET', '/admin/backup');
  assert.equal(backup.statusCode, 200);
  assert.doesNotMatch(backup.body, /password_hash|token_hash|csrf_hash/);
  assert.equal((await call(operator, 'GET', '/admin/backup')).statusCode, 403);
});
