import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const dir = await mkdtemp(join(tmpdir(), 'rede-atende-test-'));
process.env.DB_MODE = process.env.TEST_DATABASE_URL ? 'postgres' : 'embedded';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.SEED_ACCESS_FILE = join(dir, 'access.txt');
process.env.DATA_DIR = join(dir, 'pg');
process.env.UPLOAD_DIR = join(dir, 'uploads');
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = 'SomenteTeste-123456789';
const { buildApp } = await import('../app');
const { seed } = await import('../db/seed');
const { transaction, closeDatabase } = await import('../db/database');
const { DEPARTMENTS } = await import('../../src/domain/serviceCatalog');
const { loadState } = await import('../db/repository');
const app = await buildApp();
interface Actor {
  cookie: string;
  csrf: string;
  id: string;
}
let citizen: Actor, other: Actor, manager: Actor, operator: Actor, auditor: Actor;
let requestId = '',
  protocol = '',
  orderId = '',
  attachmentId = '',
  informationId = '';
const persistedAttachments: { id: string; bytes: Buffer; mime: string }[] = [];
const requestBody = (subject = 'Vazamento em sala fictícia') => ({
  category: 'infraestrutura',
  schoolId: 'esc-001',
  subject,
  description: 'Descrição sintética de teste, sem informações pessoais.',
  locationDetails: 'Sala fictícia 01',
  applicantName: 'Pessoa Fictícia',
  applicantRole: 'comunidade',
  priority: 'media',
  privacyAcknowledged: true,
  categoryDetails: { natureza: 'Hidráulico' },
});
async function call(
  actor: Actor | undefined,
  method: string,
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: method as 'GET',
    url: '/api/v1' + url,
    headers: {
      'X-Requested-With': 'RedeAtende',
      ...(actor ? { cookie: actor.cookie, 'X-CSRF-Token': actor.csrf } : {}),
      ...headers,
    },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  });
}
async function login(email: string) {
  const res = await call(undefined, 'POST', '/auth/login', {
    email,
    password: 'SomenteTeste-123456789',
  });
  assert.equal(res.statusCode, 200, res.body);
  const data = res.json();
  return {
    cookie: `ra_session=${res.cookies.find((c) => c.name === 'ra_session')!.value}`,
    csrf: data.csrf,
    id: data.user.id,
  };
}
async function create(actor = citizen, subject?: string, key = randomUUID()) {
  const result = await call(actor, 'POST', '/requests', requestBody(subject), {
    'Idempotency-Key': key,
  });
  assert.equal(result.statusCode, 201, result.body);
  return result.json();
}
async function upload(actor: Actor, buffer: Buffer, name: string, mime: string, targetId: string) {
  const boundary = 'TEST' + randomUUID();
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: `/api/v1/requests/${targetId}/attachments`,
    headers: {
      cookie: actor.cookie,
      'X-CSRF-Token': actor.csrf,
      'X-Requested-With': 'RedeAtende',
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
}
async function dispatch(
  status: string,
  note = 'Parecer sintético de atendimento.',
  extra: Record<string, unknown> = {},
) {
  const res = await call(manager, 'PATCH', `/requests/${requestId}`, {
    updates: {
      status,
      assignedDepartment: DEPARTMENTS[0],
      assignedTechnician: 'Equipe Fictícia',
      ...extra,
    },
    note,
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}
before(async () => {
  await seed();
  manager = await login('gestor@redeatende.invalid');
  operator = await login('operador@redeatende.invalid');
  auditor = await login('auditor@redeatende.invalid');
  citizen = await login('cidadao@redeatende.invalid');
  const registered = await call(undefined, 'POST', '/auth/register', {
    email: 'outro@teste.invalid',
    password: 'SomenteTeste-123456789',
    name: 'Outra Pessoa Fictícia',
    academicAcknowledged: true,
  });
  assert.equal(registered.statusCode, 201, registered.body);
  const data = registered.json();
  other = {
    cookie: `ra_session=${registered.cookies[0].value}`,
    csrf: data.csrf,
    id: data.user.id,
  };
});
after(async () => {
  await app.close();
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
});
test('saúde e snapshot anônimo não expõem solicitações, usuários nem anexos', async () => {
  const health = await call(undefined, 'GET', '/health');
  assert.equal(health.statusCode, 200);
  const state = (await call(undefined, 'GET', '/state')).json();
  assert.equal(state.requests.length, 0);
  assert.equal(state.attachments.length, 0);
  assert.ok(state.schools.length > 2);
  assert.ok(!JSON.stringify(state).includes('password_hash'));
});
test('cadastro público rejeita tentativa de assumir papel de gestor', async () => {
  const result = await call(undefined, 'POST', '/auth/register', {
    email: 'escalacao@teste.invalid',
    password: 'SomenteTeste-123456789',
    name: 'Conta Fictícia',
    academicAcknowledged: true,
    role: 'gestor',
  });
  assert.equal(result.statusCode, 400, result.body);
  const saved = await transaction((sql) =>
    sql.query('SELECT id FROM users WHERE email=$1', ['escalacao@teste.invalid']),
  );
  assert.equal(saved.rows.length, 0);
  assert.equal((await call(other, 'GET', '/auth/me')).json().user.role, 'cidadao');
});
test('sete categorias validam campos específicos e persistem no mesmo banco', async () => {
  const { SERVICE_CATALOG } = await import('../../src/domain/serviceCatalog');
  const protocols = new Set<string>();
  for (const [category, service] of Object.entries(SERVICE_CATALOG)) {
    const categoryDetails = Object.fromEntries(
      service.fields.map((f) => [
        f.key,
        f.options?.[0] ?? (f.type === 'date' ? '2027-11-05' : 'Detalhe fictício'),
      ]),
    );
    const body = { ...requestBody(`Categoria fictícia ${category}`), category, categoryDetails };
    const invalid = await call(
      citizen,
      'POST',
      '/requests',
      { ...body, categoryDetails: {} },
      { 'Idempotency-Key': randomUUID() },
    );
    assert.equal(invalid.statusCode, 400, category);
    const result = await call(citizen, 'POST', '/requests', body, {
      'Idempotency-Key': randomUUID(),
    });
    assert.equal(result.statusCode, 201, result.body);
    protocols.add(result.json().protocol);
    const id = result.json().id;
    assert.equal((await call(manager, 'GET', `/requests/${id}`)).json().category, category);
    assert.equal(
      (await call(citizen, 'GET', `/protocols/${result.json().protocol}`)).json().id,
      id,
    );
  }
  assert.equal(protocols.size, 7);
});
test('reenvio idempotente não revela parecer interno nem responsável privado', async () => {
  const key = randomUUID(),
    created = await create(citizen, 'Reenvio com parecer privado', key);
  const privateNote = 'PARECER_INTERNO_REENVIO_35',
    privateResponsible = 'RESPONSAVEL_PRIVADO_35';
  const internal = await call(manager, 'PATCH', `/requests/${created.id}`, {
    updates: { assignedTechnician: privateResponsible },
    note: privateNote,
    options: { visibility: 'interna', publicResponsible: false },
  });
  assert.equal(internal.statusCode, 200, internal.body);
  const repeated = await call(
    citizen,
    'POST',
    '/requests',
    requestBody('Reenvio com parecer privado'),
    { 'Idempotency-Key': key },
  );
  assert.equal(repeated.statusCode, 201, repeated.body);
  assert.equal(repeated.json().id, created.id);
  assert.ok(!repeated.body.includes(privateNote));
  assert.ok(!repeated.body.includes(privateResponsible));
  assert.ok((await call(manager, 'GET', `/requests/${created.id}`)).body.includes(privateNote));
});
test('resposta ao complemento retorna somente histórico público ao cidadão', async () => {
  const created = await create(citizen, 'Complemento com parecer privado'),
    privateNote = 'PARECER_INTERNO_COMPLEMENTO_35';
  assert.equal(
    (
      await call(manager, 'PATCH', `/requests/${created.id}`, {
        updates: {},
        note: privateNote,
        options: { visibility: 'interna' },
      })
    ).statusCode,
    200,
  );
  const pending = await call(manager, 'PATCH', `/requests/${created.id}`, {
    updates: { status: 'aguardando_informacoes' },
    note: 'Confirme o local fictício para atendimento.',
  });
  assert.equal(pending.statusCode, 200, pending.body);
  const reply = await call(citizen, 'POST', `/requests/${created.id}/replies`, {
    informationId: pending.json().informationRequests.at(-1).id,
    response: 'Sala fictícia do laboratório.',
  });
  assert.equal(reply.statusCode, 200, reply.body);
  assert.equal(reply.json().status, 'em_triagem');
  assert.ok(!reply.body.includes(privateNote));
  const publicEvent = reply.json().history.at(-1);
  assert.equal(publicEvent.author, 'Cidadao de demonstração');
  const internal = (await call(manager, 'GET', `/requests/${created.id}`)).json();
  assert.ok(JSON.stringify(internal).includes(privateNote));
  assert.equal(internal.history.at(-1).author, 'Cidadao de demonstração');
});
test('projeção pública oculta motivo interno de prazo sem apagar registro da equipe', async () => {
  const created = await create(citizen, 'Privacidade do prazo fictício'),
    marker = 'MOTIVO_INTERNO_PRAZO_36';
  const updated = await call(manager, 'PATCH', `/requests/${created.id}`, {
    updates: { deadline: new Date(Date.now() + 30 * 86400000).toISOString() },
    note: 'Parecer de prazo interno.',
    options: { visibility: 'interna', deadlineReason: marker },
  });
  assert.equal(updated.statusCode, 200, updated.body);
  const owner = await call(citizen, 'GET', `/requests/${created.id}`);
  assert.equal(owner.statusCode, 200);
  assert.ok(!owner.body.includes(marker));
  assert.ok((await call(manager, 'GET', `/requests/${created.id}`)).body.includes(marker));
});
test('projeção pública oculta observação e responsável privados da agenda no histórico e avisos', async () => {
  const created = await create(citizen, 'Privacidade da agenda fictícia'),
    marker = 'OBSERVACAO_INTERNA_AGENDA_36',
    technician = 'RESPONSAVEL_PRIVADO_AGENDA_36',
    type = 'TIPO_INTERNO_AGENDA_36';
  const appointment = await call(manager, 'POST', '/appointments', {
    requestId: created.id,
    protocolRef: created.protocol,
    schoolId: 'esc-001',
    schoolName: 'Validada no servidor',
    type,
    technician,
    date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    time: '10:00',
    status: 'Agendada',
    notes: marker,
  });
  assert.equal(appointment.statusCode, 200, appointment.body);
  const owner = await call(citizen, 'GET', '/state');
  for (const value of [marker, technician, type]) assert.ok(!owner.body.includes(value), value);
  const internal = await call(manager, 'GET', '/state');
  for (const value of [marker, technician, type]) assert.ok(internal.body.includes(value), value);
});
test('negado: /admin API sem sessão, cidadão e auditor não podem despachar', async () => {
  assert.equal((await call(undefined, 'GET', '/requests')).statusCode, 401);
  assert.equal((await call(citizen, 'PATCH', '/requests/x', {})).statusCode, 403);
  assert.equal((await call(auditor, 'PATCH', '/requests/x', {})).statusCode, 403);
  assert.equal((await call(operator, 'PUT', '/deadline-rules', {})).statusCode, 403);
});
test('criação grava protocolo único e ciência de privacidade é validada no servidor', async () => {
  const invalid = await call(
    citizen,
    'POST',
    '/requests',
    { ...requestBody(), privacyAcknowledged: false },
    { 'Idempotency-Key': randomUUID() },
  );
  assert.equal(invalid.statusCode, 400);
  const created = await create();
  requestId = created.id;
  protocol = created.protocol;
  assert.match(protocol, /^EDU-\d{4}-\d{6}$/);
  const saved = await transaction((sql) =>
    sql.query('SELECT protocol,owner_id FROM requests WHERE id=$1', [requestId]),
  );
  assert.equal(saved.rows[0].owner_id, citizen.id);
});
test('idempotência concorrente evita duplicação; conteúdo divergente é recusado', async () => {
  const key = randomUUID(),
    body = requestBody('Duplicidade de envio fictícia');
  const results = await Promise.all(
    [1, 2, 3].map(() => call(citizen, 'POST', '/requests', body, { 'Idempotency-Key': key })),
  );
  for (const result of results) assert.equal(result.statusCode, 201, result.body);
  assert.equal(new Set(results.map((r) => r.json().id)).size, 1);
  assert.equal(
    (
      await call(
        citizen,
        'POST',
        '/requests',
        { ...body, subject: 'Outro conteúdo de teste' },
        { 'Idempotency-Key': key },
      )
    ).statusCode,
    409,
  );
});
test('dez envios simultâneos geram dez protocolos distintos', async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => create(citizen, `Concorrência fictícia ${i}`)),
  );
  assert.equal(new Set(results.map((r) => r.protocol)).size, 10);
});
test('IDOR: outra conta não consulta protocolo, snapshot, resposta, avaliação ou anexo', async () => {
  assert.equal((await call(other, 'GET', `/requests/${requestId}`)).statusCode, 404);
  assert.equal((await call(other, 'GET', `/protocols/${protocol}`)).statusCode, 404);
  assert.equal(
    (
      await call(other, 'POST', `/requests/${requestId}/replies`, {
        informationId: 'x',
        response: 'Tentativa indevida',
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (await call(other, 'POST', `/requests/${requestId}/rating`, { rating: 5 })).statusCode,
    404,
  );
  const state = (await call(other, 'GET', '/state')).json();
  assert.equal(state.requests.length, 0);
});
test('CSRF e origem externa bloqueados, mesmo com sessão válida', async () => {
  const csrf = await call(
    citizen,
    'POST',
    `/requests/${requestId}/rating`,
    { rating: 5 },
    { 'X-CSRF-Token': 'incorreto' },
  );
  assert.equal(csrf.statusCode, 403);
  const origin = await call(
    citizen,
    'POST',
    `/requests/${requestId}/rating`,
    { rating: 5 },
    { origin: 'https://outro.example' },
  );
  assert.equal(origin.statusCode, 403);
});
test('transição inválida e alteração de campos protegidos são recusadas', async () => {
  assert.equal(
    (
      await call(manager, 'PATCH', `/requests/${requestId}`, {
        updates: { status: 'concluida' },
        note: 'Inválido antes de triagem',
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (
      await call(manager, 'PATCH', `/requests/${requestId}`, {
        updates: { protocol: 'EDU-2026-999999' },
      })
    ).statusCode,
    400,
  );
  await dispatch('em_triagem');
});
test('parecer interno não aparece na projeção do cidadão; autor é autenticado', async () => {
  const res = await call(manager, 'PATCH', `/requests/${requestId}`, {
    updates: {},
    note: 'PARECER_INTERNO_TESTE',
    options: { visibility: 'interna' },
  });
  assert.equal(res.statusCode, 200, res.body);
  const owner = (await call(citizen, 'GET', `/requests/${requestId}`)).json();
  assert.ok(!JSON.stringify(owner).includes('PARECER_INTERNO_TESTE'));
  const state = await transaction((sql) => loadState(sql));
  const event = state.requests.find((r) => r.id === requestId)!.history.at(-1)!;
  assert.equal(event.author, 'Gestor de demonstração');
});
test('pedido de informação e resposta do titular persistem e retornam à triagem', async () => {
  const request = await dispatch(
    'aguardando_informacoes',
    'Confirme o local fictício do vazamento.',
  );
  informationId = request.informationRequests.at(-1).id;
  assert.equal(
    (
      await call(manager, 'POST', `/requests/${requestId}/replies`, {
        informationId,
        response: 'Gestor não pode responder por cidadão',
      })
    ).statusCode,
    403,
  );
  const reply = await call(citizen, 'POST', `/requests/${requestId}/replies`, {
    informationId,
    response: 'Ocorre no bebedouro fictício da sala.',
  });
  assert.equal(reply.statusCode, 200, reply.body);
  assert.equal(reply.json().status, 'em_triagem');
  assert.equal(
    (
      await call(citizen, 'POST', `/requests/${requestId}/replies`, {
        informationId,
        response: 'Resposta duplicada fictícia',
      })
    ).statusCode,
    422,
  );
});
test('OS obrigatória impede conclusão até execução e conclusão da atividade', async () => {
  const res = await call(operator, 'POST', '/work-orders', {
    requestId,
    title: 'Corrigir vazamento fictício',
    department: DEPARTMENTS[0],
    technician: 'Técnico Fictício',
    required: true,
  });
  assert.equal(res.statusCode, 200, res.body);
  orderId = res.json().id;
  await dispatch('encaminhada');
  await dispatch('em_atendimento');
  const blocked = await call(manager, 'PATCH', `/requests/${requestId}`, {
    updates: { status: 'concluida' },
    note: 'Tentativa com atividade pendente.',
  });
  assert.equal(blocked.statusCode, 422);
  assert.match(blocked.json().error, /ordens/);
  for (const status of ['em_execucao', 'concluida'])
    assert.equal(
      (
        await call(operator, 'PATCH', `/work-orders/${orderId}`, {
          status,
          note: 'Atividade de ensaio executada e verificada.',
        })
      ).statusCode,
      200,
    );
});
test('agenda detecta sobreposição de 60 min e bloqueia conclusão da solicitação', async () => {
  const body = {
    requestId,
    schoolId: 'esc-001',
    schoolName: 'Será validada no servidor',
    protocolRef: protocol,
    type: 'Vistoria fictícia',
    technician: 'Equipe Agenda Fictícia',
    date: '2027-11-05',
    time: '09:00',
    status: 'Agendada',
  };
  const first = await call(operator, 'POST', '/appointments', body);
  assert.equal(first.statusCode, 200, first.body);
  const conflict = await call(operator, 'POST', '/appointments', { ...body, time: '09:30' });
  assert.equal(conflict.statusCode, 422, conflict.body);
  assert.equal(
    (
      await call(manager, 'PATCH', `/requests/${requestId}`, {
        updates: { status: 'concluida' },
        note: 'Agendamento ainda pendente.',
      })
    ).statusCode,
    422,
  );
  const invalid = await call(operator, 'PATCH', `/appointments/${first.json().id}`, {
    status: 'Cancelada',
  });
  assert.equal(invalid.statusCode, 422);
  const done = await call(operator, 'PATCH', `/appointments/${first.json().id}`, {
    status: 'Realizada',
  });
  assert.equal(done.statusCode, 200, done.body);
});
test('upload real PNG e download privado mantêm bytes; disfarce e PDF ativo rejeitados', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64',
  );
  const valid = await upload(citizen, png, 'teste.png', 'image/png', requestId);
  assert.equal(valid.statusCode, 201, valid.body);
  attachmentId = valid.json().id;
  const download = await call(citizen, 'GET', `/attachments/${attachmentId}`);
  assert.equal(download.statusCode, 200);
  assert.deepEqual(download.rawPayload, png);
  assert.match(download.headers['content-disposition'] as string, /attachment/);
  assert.equal((await call(other, 'GET', `/attachments/${attachmentId}`)).statusCode, 404);
  assert.equal(
    (await upload(citizen, Buffer.from('not png'), 'falso.png', 'image/png', requestId)).statusCode,
    400,
  );
  assert.equal(
    (
      await upload(
        citizen,
        Buffer.from('%PDF-1.4 /JavaScript'),
        'ativo.pdf',
        'application/pdf',
        requestId,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (await upload(citizen, Buffer.alloc(5242881), 'grande.png', 'image/png', requestId)).statusCode,
    413,
  );
});
test('upload recusa nomes PDF ativos escapados sem gravar anexos ou alterar o pedido', async () => {
  const before = (await call(manager, 'GET', `/requests/${requestId}`)).json();
  const count = async () =>
    (
      await transaction((sql) =>
        sql.query<{ total: string }>(
          'SELECT count(*)::text AS total FROM attachments WHERE request_id=$1',
          [requestId],
        ),
      )
    ).rows[0].total;
  const originalCount = await count();
  for (const name of [
    'J#61vaScript',
    '#4a#53',
    'Open#41ction',
    'Embedded#46ile',
    '#52ichMedia',
    'X#46A',
    'L#61unch',
  ]) {
    const bytes = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /${name} (ensaio inerte) >>\nendobj\n%%EOF\n`);
    const denied = await upload(citizen, bytes, 'politica.pdf', 'application/pdf', requestId);
    assert.equal(denied.statusCode, 400, `${name}: ${denied.body}`);
    assert.match(denied.json().error, /conteúdo ativo/);
  }
  assert.equal(await count(), originalCount);
  assert.deepEqual((await call(manager, 'GET', `/requests/${requestId}`)).json(), before);
});

test('JPEG, PNG e PDF permitidos têm upload real, download privado e limite de cinco anexos', async () => {
  for (const [name, mime] of [
    ['imagem-ficticia.jpg', 'image/jpeg'],
    ['imagem-ficticia.png', 'image/png'],
    ['documento-ficticio.pdf', 'application/pdf'],
  ]) {
    const bytes = await readFile(new URL(`./fixtures/${name}`, import.meta.url));
    const created = await upload(citizen, bytes, name, mime, requestId);
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().id;
    persistedAttachments.push({ id, bytes, mime });
    const downloaded = await call(citizen, 'GET', `/attachments/${id}`);
    assert.equal(downloaded.statusCode, 200);
    assert.deepEqual(downloaded.rawPayload, bytes);
    assert.equal(downloaded.headers['content-type'], mime);
    assert.equal((await call(other, 'GET', `/attachments/${id}`)).statusCode, 404);
    assert.equal((await call(undefined, 'GET', `/attachments/${id}`)).statusCode, 401);
  }
  const png = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url));
  assert.equal((await upload(auditor, png, 'auditor.png', 'image/png', requestId)).statusCode, 403);
  assert.equal(
    (await upload(other, png, 'outra-conta.png', 'image/png', requestId)).statusCode,
    404,
  );
  assert.equal((await upload(citizen, png, 'quinto.png', 'image/png', requestId)).statusCode, 201);
  assert.equal((await upload(citizen, png, 'sexto.png', 'image/png', requestId)).statusCode, 422);
});
test('conclusão com providência final habilita avaliação única do titular', async () => {
  assert.equal(
    (await call(citizen, 'POST', `/requests/${requestId}/rating`, { rating: 5 })).statusCode,
    422,
  );
  const concluded = await dispatch(
    'concluida',
    'Vazamento fictício corrigido e atividade verificada.',
  );
  assert.equal(concluded.status, 'concluida');
  assert.equal(
    (
      await call(citizen, 'POST', `/requests/${requestId}/rating`, {
        rating: 5,
        comment: 'Teste sintético de satisfação.',
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await call(citizen, 'POST', `/requests/${requestId}/rating`, { rating: 4 })).statusCode,
    422,
  );
});
test('notificações persistem, leitura é individual e não cruza contas', async () => {
  const notes = (await call(citizen, 'GET', '/notifications')).json();
  const note = notes.find((n: { requestId: string }) => n.requestId === requestId);
  assert.ok(note);
  assert.equal((await call(other, 'POST', `/notifications/${note.id}/read`, {})).statusCode, 404);
  assert.equal((await call(citizen, 'POST', `/notifications/${note.id}/read`, {})).statusCode, 200);
  assert.ok(
    (await call(citizen, 'GET', '/notifications'))
      .json()
      .find((n: { id: string }) => n.id === note.id).readAt,
  );
});
test('relatórios e CSV correspondem aos registros gravados e neutralizam fórmulas', async () => {
  await create(citizen, '=HYPERLINK("ficticio")');
  const result = await call(auditor, 'GET', '/reports');
  assert.equal(result.statusCode, 200, result.body);
  const count = await transaction((sql) =>
    sql.query<{ total: string }>('SELECT count(*)::text AS total FROM requests'),
  );
  assert.equal(result.json().metrics.total, Number(count.rows[0].total));
  const csv = await call(manager, 'GET', '/reports.csv');
  assert.equal(csv.statusCode, 200);
  assert.ok(csv.body.includes(protocol));
  assert.ok(csv.body.includes("'=HYPERLINK"));
  assert.ok(!csv.body.includes('Pessoa Fictícia'));
  assert.ok(!csv.body.includes('Descrição sintética'));
});
test('cenários aditivos, feriados configuráveis e auditoria somente de acréscimo', async () => {
  const before = await transaction((sql) => loadState(sql));
  const result = await call(manager, 'POST', '/admin/scenarios', { kind: 'transporte' });
  assert.equal(result.statusCode, 200, result.body);
  const after = await transaction((sql) => loadState(sql));
  assert.equal(after.requests.length, before.requests.length + 1);
  assert.ok(after.requests.some((r) => r.id === requestId));
  assert.equal(
    (
      await call(manager, 'PUT', '/holidays', {
        dates: ['2026-12-25'],
        reason: 'Feriado sintético para ensaio.',
      })
    ).statusCode,
    200,
  );
  const audit = await call(auditor, 'GET', '/audit');
  assert.equal(audit.statusCode, 200);
  assert.ok(audit.json().some((r: { action: string }) => r.action === 'request.create'));
  await assert.rejects(
    transaction((sql) => sql.query('DELETE FROM audit_log')),
    /somente acréscimo/,
  );
});
test('importação legada preserva protocolo e falha inteira diante de conflito', async () => {
  const legacy = (await call(manager, 'GET', '/admin/backup')).json();
  const r = legacy.requests.find((v: { id: string }) => v.id === requestId);
  r.subject = 'Tentativa de sobrescrita';
  const result = await call(manager, 'POST', '/admin/import', legacy);
  assert.equal(result.statusCode, 409, result.body);
  assert.notEqual(
    (await call(manager, 'GET', `/requests/${requestId}`)).json().subject,
    'Tentativa de sobrescrita',
  );
});
test('importação válida conserva protocolo histórico e rejeita protocolo inválido sem gravar', async () => {
  const state = (await call(manager, 'GET', '/admin/backup')).json();
  const request = structuredClone(state.requests.find((r: { id: string }) => r.id === requestId));
  request.id = 'req-legado-' + randomUUID();
  request.protocol = 'EDU-1842';
  request.history = [];
  request.informationRequests = [];
  delete request.satisfaction;
  const input = {
    ...state,
    requests: [request],
    appointments: [],
    workOrders: [],
    notifications: [],
    seiLogs: [],
  };
  const imported = await call(manager, 'POST', '/admin/import', input);
  assert.equal(imported.statusCode, 200, imported.body);
  assert.equal(imported.json().imported, 1);
  assert.equal((await call(manager, 'GET', `/requests/${request.id}`)).json().protocol, 'EDU-1842');
  request.id = 'invalid-' + randomUUID();
  request.protocol = 'PROTOCOLO-INVALIDO';
  assert.equal(
    (await call(manager, 'POST', '/admin/import', { ...input, requests: [request] })).statusCode,
    422,
  );
  assert.equal((await call(manager, 'GET', `/requests/${request.id}`)).statusCode, 404);
});
test('migração reaplicada preserva registros e índices de unicidade', async () => {
  const { migrate } = await import('../db/migrate');
  const before = await transaction((sql) => loadState(sql));
  await migrate();
  const after = await transaction((sql) => loadState(sql));
  assert.deepEqual(after, before);
  await assert.rejects(
    transaction((sql) => sql.query('INSERT INTO requests SELECT * FROM requests LIMIT 1')),
    /duplicate key/,
  );
});
test('logout revoga sessão no banco; sessão expirada e usuário inativo são negados', async () => {
  const disposable = await login('operador@redeatende.invalid');
  assert.equal((await call(disposable, 'POST', '/auth/logout', {})).statusCode, 200);
  assert.equal((await call(disposable, 'GET', '/requests')).statusCode, 401);
  await transaction((sql) => sql.query('UPDATE users SET active=false WHERE id=$1', [operator.id]));
  assert.equal((await call(operator, 'GET', '/requests')).statusCode, 401);
  await transaction((sql) => sql.query('UPDATE users SET active=true WHERE id=$1', [operator.id]));
  await transaction((sql) =>
    sql.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [
      other.id,
    ]),
  );
  assert.equal((await call(other, 'GET', '/requests')).statusCode, 401);
});
test('limitação de tentativas persiste no banco', async () => {
  for (let i = 0; i < 5; i++) {
    const res = await call(undefined, 'POST', '/auth/login', {
      email: 'inexistente@teste.invalid',
      password: 'SenhaErrada-123456789',
    });
    assert.equal(res.statusCode, 401);
  }
  const blocked = await call(undefined, 'POST', '/auth/login', {
    email: 'inexistente@teste.invalid',
    password: 'SenhaErrada-123456789',
  });
  assert.equal(blocked.statusCode, 429);
});
test('persistência após fechar e reabrir a conexão conserva solicitação, anexo e sessão', async () => {
  await closeDatabase();
  if (!process.env.TEST_DATABASE_URL) {
    const code =
      "import {transaction,closeDatabase} from './server/db/database.ts';const r=await transaction(sql=>sql.query('SELECT count(*)::text AS total FROM requests'));console.log(r.rows[0].total);await closeDatabase();";
    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', code],
      { env: process.env, encoding: 'utf8' },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.ok(Number(child.stdout.trim()) > 0);
  }
  const state = (await call(citizen, 'GET', '/state')).json();
  assert.ok(state.requests.some((r: { id: string }) => r.id === requestId));
  assert.ok(state.attachments.some((a: { id: string }) => a.id === attachmentId));
  assert.equal((await call(citizen, 'GET', `/attachments/${attachmentId}`)).statusCode, 200);
  for (const file of persistedAttachments) {
    const response = await call(citizen, 'GET', `/attachments/${file.id}`);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.rawPayload, file.bytes);
    assert.equal(response.headers['content-type'], file.mime);
  }
});

// Regressões acrescentadas nesta revisão. Sempre usam o diretório descartável deste arquivo.
test('migração repetida preserva a identidade dos gatilhos de auditoria', async () => {
  const { migrate } = await import('../db/migrate');
  const triggerIds = async () =>
    (
      await transaction((sql) =>
        sql.query<{ tgname: string; oid: string }>(
          "SELECT tgname,oid::text AS oid FROM pg_trigger WHERE tgname IN ('audit_immutable','history_immutable') ORDER BY tgname",
        ),
      )
    ).rows;
  const before = await triggerIds();
  assert.equal(before.length, 2);
  await migrate();
  assert.deepEqual(await triggerIds(), before, 'reaplicar migrations derrubou gatilhos existentes');
  const versions = await transaction((sql) =>
    sql.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version'),
  );
  assert.deepEqual(
    versions.rows.map((r) => Number(r.version)),
    [1, 2, 3],
  );
});

test('download recusa arquivo alterado, sem auditar como download concluído', async () => {
  const created = await create(citizen, 'Ensaio de integridade do anexo');
  const bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url));
  const posted = await upload(citizen, bytes, 'integridade.png', 'image/png', created.id);
  assert.equal(posted.statusCode, 201, posted.body);
  const id: string = posted.json().id;
  const saved = await transaction((sql) =>
    sql.query<{ storage_name: string }>('SELECT storage_name FROM attachments WHERE id=$1', [id]),
  );
  const storedPath = join(dir, 'uploads', saved.rows[0].storage_name);
  const audits = async () =>
    Number(
      (
        await transaction((sql) =>
          sql.query<{ total: string }>(
            "SELECT count(*)::text AS total FROM audit_log WHERE action='attachment.download' AND entity_id=$1",
            [id],
          ),
        )
      ).rows[0].total,
    );
  const initialAudits = await audits();
  try {
    await writeFile(storedPath, Buffer.from('bytes deliberadamente corrompidos no teste'));
    const denied = await call(citizen, 'GET', '/attachments/' + id);
    assert.equal(denied.statusCode, 503, denied.body);
    assert.equal(await audits(), initialAudits);
  } finally {
    await writeFile(storedPath, bytes);
  }
  const downloaded = await call(citizen, 'GET', '/attachments/' + id);
  assert.equal(downloaded.statusCode, 200, downloaded.body);
  assert.deepEqual(downloaded.rawPayload, bytes);
  assert.equal(await audits(), initialAudits + 1);
});

test('reclassificação valida categoria/campos/motivo, versão e permissões antes de gravar', async () => {
  const original = await create(citizen, 'Reclassificação recusada preserva registro');
  const before = (await call(manager, 'GET', '/requests/' + original.id)).json();
  const content = {
    updates: { category: 'material_didatico', categoryDetails: { material: 'Livro fictício' } },
    expectedUpdatedAt: original.updatedAt,
    options: { categoryReason: 'Ajuste de classificação fictícia.' },
  };
  const activeOther = await login('outro@teste.invalid');
  for (const actor of [citizen, activeOther, auditor]) {
    const denied = await call(actor, 'PATCH', '/requests/' + original.id, content);
    assert.equal(denied.statusCode, 403, denied.body);
  }
  assert.equal(
    (
      await call(manager, 'PATCH', '/requests/' + original.id, {
        ...content,
        expectedUpdatedAt: undefined,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await call(manager, 'PATCH', '/requests/' + original.id, { ...content, options: {} }))
      .statusCode,
    422,
  );
  assert.equal(
    (
      await call(manager, 'PATCH', '/requests/' + original.id, {
        ...content,
        updates: { category: 'material_didatico', categoryDetails: {} },
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (
      await call(manager, 'PATCH', '/requests/' + original.id, {
        ...content,
        updates: {
          category: 'alimentacao_merenda',
          categoryDetails: { natureza: 'Disponibilidade', turno: 'Manhã', data: '2026-02-30' },
        },
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (
      await call(manager, 'PATCH', '/requests/' + original.id, {
        ...content,
        updates: { category: 'categoria_inventada' },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call(manager, 'PATCH', '/requests/' + original.id, {
        ...content,
        expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
      })
    ).statusCode,
    409,
  );
  const after = await call(manager, 'GET', '/requests/' + original.id);
  assert.deepEqual(after.json(), before);
});

test('Outros → Infraestrutura preserva identidade/anexo, sincroniza SQL, comunica ao titular e mantém motivo interno', async () => {
  const response = await call(
    citizen,
    'POST',
    '/requests',
    {
      ...requestBody('Pedido Outros para reclassificação'),
      category: 'outros',
      categoryDetails: { natureza: 'Necessidade antiga fictícia' },
    },
    { 'Idempotency-Key': randomUUID() },
  );
  assert.equal(response.statusCode, 201, response.body);
  const original = response.json();
  const bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url));
  const posted = await upload(citizen, bytes, 'categoria.png', 'image/png', original.id);
  assert.equal(posted.statusCode, 201, posted.body);
  const latest = (await call(manager, 'GET', '/requests/' + original.id)).json();
  const counters = (await call(manager, 'GET', '/bootstrap?view=dashboard')).json().metrics
    .byCategory;
  const changed = await call(operator, 'PATCH', '/requests/' + original.id, {
    updates: {
      category: 'infraestrutura',
      categoryDetails: {
        natureza: 'Hidráulico',
        condicao: 'Vazamento fictício',
        rota: 'campo antigo não deve persistir',
      },
    },
    expectedUpdatedAt: latest.updatedAt,
    options: { categoryReason: 'Motivo reservado da correção fictícia.' },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const saved = changed.json();
  for (const field of [
    'id',
    'protocol',
    'schoolId',
    'description',
    'applicantName',
    'deadline',
    'assignedDepartment',
    'assignedTechnician',
  ])
    assert.equal(saved[field], latest[field], field);
  assert.deepEqual(saved.categoryDetails, {
    natureza: 'Hidráulico',
    condicao: 'Vazamento fictício',
  });
  const internal = saved.history.find((h: any) => h.action === 'category.internal');
  assert.equal(internal.visibility, 'interna');
  assert.equal(internal.changes.category.before, 'outros');
  assert.equal(internal.changes.category.after, 'infraestrutura');
  assert.equal(
    JSON.parse(internal.changes.categoryDetails.before).natureza,
    'Necessidade antiga fictícia',
  );
  assert.equal(internal.author, 'Operador de demonstração');
  const sqlRow = (
    await transaction((sql) =>
      sql.query('SELECT category,owner_id,data FROM requests WHERE id=$1', [original.id]),
    )
  ).rows[0];
  assert.equal(sqlRow.category, 'infraestrutura');
  assert.equal((sqlRow.data as any).category, 'infraestrutura');
  assert.equal(sqlRow.owner_id, citizen.id);
  const own = await call(citizen, 'GET', '/requests/' + original.id);
  assert.equal(own.json().category, 'infraestrutura');
  assert.ok(own.json().history.some((h: any) => h.action === 'category.public'));
  assert.ok(!own.body.includes('Motivo reservado'));
  assert.ok(!own.body.includes('Necessidade antiga fictícia'));
  const download = await call(citizen, 'GET', '/attachments/' + posted.json().id);
  assert.equal(download.statusCode, 200);
  assert.deepEqual(download.rawPayload, bytes);
  const filtered = await call(
    manager,
    'GET',
    '/requests/search?category=infraestrutura&search=' + original.protocol,
  );
  assert.equal(filtered.json().total, 1);
  const after = (await call(manager, 'GET', '/bootstrap?view=dashboard')).json().metrics.byCategory;
  assert.equal(after.infraestrutura, counters.infraestrutura + 1);
  assert.equal(after.outros, counters.outros - 1);
  assert.equal(
    (
      await call(manager, 'PATCH', '/requests/' + original.id, {
        updates: { category: 'outros', categoryDetails: { natureza: 'Novo cenário' } },
        expectedUpdatedAt: latest.updatedAt,
        options: { categoryReason: 'Versão antiga deve ser recusada' },
      })
    ).statusCode,
    409,
  );
});

test('média de triagem agregada pelo histórico relacional coincide com o domínio', async () => {
  const { calculateMetrics } = await import('../../src/utils/helpers');
  const domain = calculateMetrics((await transaction(loadState)).requests);
  const dashboard = await call(manager, 'GET', '/bootstrap?view=dashboard');
  assert.equal(dashboard.statusCode, 200, dashboard.body);
  assert.ok(
    Math.abs(dashboard.json().metrics.averageTriageHours - domain.averageTriageHours) < 0.00001,
  );
});
