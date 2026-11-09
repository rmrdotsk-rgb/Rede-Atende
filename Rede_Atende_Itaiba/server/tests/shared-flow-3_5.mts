// Ensaio HTTP com duas contas e banco descartável. Não utiliza a base da apresentação.
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const dir = await mkdtemp(join(tmpdir(), 'rede-atende-flow-35-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'data'),
  UPLOAD_DIR: join(dir, 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
  COOKIE_SECURE: 'false',
});
const password = 'SomenteEnsaioHttp-123456789';
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = password;
const { seed } = await import('../db/seed.ts');
const { buildApp } = await import('../app.ts');
const { transaction, closeDatabase } = await import('../db/database.ts');
const { DEPARTMENTS } = await import('../../src/domain/serviceCatalog.ts');
type Actor = { cookie: string; csrf: string };
const citizen: Actor = { cookie: '', csrf: '' },
  manager: Actor = { cookie: '', csrf: '' },
  other: Actor = { cookie: '', csrf: '' };
let app: Awaited<ReturnType<typeof buildApp>> | undefined,
  base = '';
const results: string[] = [];
async function start() {
  app = await buildApp({ serveFrontend: true });
  base = await app.listen({ host: '127.0.0.1', port: 0 });
}
async function call(
  actor: Actor,
  method: string,
  path: string,
  data?: unknown,
  expected = 200,
  extra: Record<string, string> = {},
) {
  const response = await fetch(base + '/api/v1' + path, {
    method,
    headers: {
      'X-Requested-With': 'RedeAtende',
      Origin: base,
      ...(actor.cookie ? { Cookie: actor.cookie, 'X-CSRF-Token': actor.csrf } : {}),
      ...(data === undefined || data instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...extra,
    },
    body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  const cookie = response.headers.get('set-cookie');
  if (cookie) {
    if (path !== '/auth/logout') {
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
    }
    actor.cookie = cookie.split(';')[0];
  }
  const body = JSON.parse(text);
  if (body.csrf) actor.csrf = body.csrf;
  return body;
}
try {
  await seed();
  await start();
  const routes = [
    '/',
    '/entrar',
    '/solicitar',
    '/acompanhar',
    '/admin',
    '/admin/demandas',
    '/admin/triagem',
    '/admin/unidades',
    '/admin/ordens',
    '/admin/prazos',
    '/admin/agenda',
    '/admin/relatorios',
    '/admin/integracoes',
  ];
  for (const route of routes) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await response.text(), /src="\/assets\//);
  }
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/api/v1/requests')).status, 401);
  results.push(
    '13 rotas servem o frontend compilado; .env e API privada protegidos (sem renderização de navegador).',
  );
  await call(
    citizen,
    'POST',
    '/auth/register',
    {
      name: 'Cidadão Fictício HTTP',
      email: 'cidadao-http@teste.invalid',
      password,
      academicAcknowledged: true,
    },
    201,
  );
  await call(
    other,
    'POST',
    '/auth/register',
    {
      name: 'Outra Conta Fictícia HTTP',
      email: 'outro-http@teste.invalid',
      password,
      academicAcknowledged: true,
    },
    201,
  );
  await call(manager, 'POST', '/auth/login', { email: 'gestor@redeatende.invalid', password });
  await call(citizen, 'PATCH', '/requests/inexistente', { updates: {} }, 403);
  const data = {
    category: 'infraestrutura',
    schoolId: 'esc-001',
    subject: 'Bebedouro fictício HTTP 3.5',
    description: 'Vazamento fictício para demonstração integrada, sem dados pessoais.',
    locationDetails: 'Sala fictícia 04',
    applicantName: 'Cidadão Fictício HTTP',
    applicantRole: 'comunidade',
    priority: 'media',
    privacyAcknowledged: true,
    categoryDetails: { natureza: 'Hidráulico' },
  };
  const key = randomUUID();
  const created = await call(citizen, 'POST', '/requests', data, 201, { 'Idempotency-Key': key }),
    id = created.id,
    protocol = created.protocol;
  assert.equal(
    (await call(citizen, 'POST', '/requests', data, 201, { 'Idempotency-Key': key })).id,
    id,
  );
  assert.equal((await call(manager, 'GET', `/protocols/${protocol}`)).id, id);
  await call(other, 'GET', `/protocols/${protocol}`, undefined, 404);
  await call(citizen, 'POST', `/requests/${id}/rating`, { rating: 5 }, 403, {
    'X-CSRF-Token': 'invalido',
  });
  results.push(
    'Cadastro cidadão, login gestor, cookie HttpOnly/SameSite, protocolo compartilhado, idempotência, IDOR e CSRF.',
  );
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64',
  );
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'ficticio.png');
  const attachment = await call(citizen, 'POST', `/requests/${id}/attachments`, form, 201);
  await call(other, 'GET', `/attachments/${attachment.id}`, undefined, 404);
  await call(manager, 'PATCH', `/requests/${id}`, {
    updates: {
      status: 'em_triagem',
      assignedDepartment: DEPARTMENTS[0],
      assignedTechnician: 'Equipe Fictícia HTTP',
    },
    note: 'Triagem fictícia registrada.',
  });
  await call(manager, 'PATCH', `/requests/${id}`, {
    updates: {},
    note: 'NOTA_INTERNA_HTTP_35',
    options: { visibility: 'interna' },
  });
  const pending = await call(manager, 'PATCH', `/requests/${id}`, {
    updates: { status: 'aguardando_informacoes' },
    note: 'Confirme o local fictício do bebedouro.',
  });
  const reply = await call(citizen, 'POST', `/requests/${id}/replies`, {
    informationId: pending.informationRequests.at(-1).id,
    response: 'Bebedouro da sala fictícia quatro.',
  });
  assert.equal(reply.status, 'em_triagem');
  assert.ok(!JSON.stringify(reply).includes('NOTA_INTERNA_HTTP_35'));
  assert.ok(
    (await call(citizen, 'GET', '/notifications')).some(
      (n: { requestId: string }) => n.requestId === id,
    ),
  );
  const order = await call(manager, 'POST', '/work-orders', {
    requestId: id,
    title: 'Reparo do bebedouro fictício',
    department: DEPARTMENTS[0],
    technician: 'Equipe Fictícia HTTP',
    required: true,
  });
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const appointment = await call(manager, 'POST', '/appointments', {
    requestId: id,
    schoolId: 'esc-001',
    schoolName: 'Validado no servidor',
    protocolRef: protocol,
    type: 'Vistoria fictícia HTTP',
    technician: 'Equipe Fictícia HTTP',
    date: day,
    time: '09:00',
    status: 'Agendada',
  });
  for (const status of ['encaminhada', 'em_atendimento'])
    await call(manager, 'PATCH', `/requests/${id}`, {
      updates: { status },
      note: 'Atendimento fictício em execução.',
    });
  await call(
    manager,
    'PATCH',
    `/requests/${id}`,
    { updates: { status: 'concluida' }, note: 'Tentativa com obrigações pendentes.' },
    422,
  );
  for (const status of ['em_execucao', 'concluida'])
    await call(manager, 'PATCH', `/work-orders/${order.id}`, {
      status,
      note: 'Reparo fictício executado e verificado.',
    });
  await call(
    manager,
    'PATCH',
    `/requests/${id}`,
    { updates: { status: 'concluida' }, note: 'Tentativa com vistoria pendente.' },
    422,
  );
  await call(manager, 'PATCH', `/appointments/${appointment.id}`, { status: 'Realizada' });
  await call(
    manager,
    'PATCH',
    `/requests/${id}`,
    { updates: { status: 'concluida' }, note: '' },
    422,
  );
  await call(manager, 'PATCH', `/requests/${id}`, {
    updates: { status: 'concluida' },
    note: 'Vazamento fictício corrigido e vistoria realizada.',
  });
  await call(citizen, 'POST', `/requests/${id}/rating`, {
    rating: 5,
    comment: 'Avaliação acadêmica fictícia.',
  });
  await call(citizen, 'POST', `/requests/${id}/rating`, { rating: 4 }, 422);
  const reports = await call(manager, 'GET', '/reports');
  const rows = await transaction((sql) =>
    sql.query<{ total: string }>('SELECT count(*)::text AS total FROM requests'),
  );
  assert.equal(reports.metrics.total, Number(rows.rows[0].total));
  results.push(
    'Anexo PNG real e privado; complemento com histórico público; OS, agenda, bloqueios, providência final, avaliação única e métricas do banco.',
  );
  await app!.close();
  app = undefined;
  await closeDatabase();
  await start();
  const persisted = await call(citizen, 'GET', `/protocols/${protocol}`);
  assert.equal(persisted.status, 'concluida');
  assert.equal(persisted.satisfaction.rating, 5);
  const download = await fetch(base + `/api/v1/attachments/${attachment.id}`, {
    headers: { Cookie: citizen.cookie },
  });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  await call(citizen, 'POST', '/auth/logout', {});
  await call(citizen, 'GET', '/requests', undefined, 401);
  results.push(
    'Reabertura do servidor/banco conserva protocolo, avaliação, sessão e bytes do anexo; logout revoga o acesso.',
  );
  console.log(
    JSON.stringify(
      {
        version: JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
          .version,
        status: 'FUNCIONAL',
        transport: 'HTTP local',
        database: 'PGlite em disco temporário',
        physicalDeviceTested: false,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  if (app) await app.close();
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
}
