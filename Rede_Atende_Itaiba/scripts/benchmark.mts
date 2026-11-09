/** Ensaio local descartável. Nunca aponta para .local/data da apresentação. */
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
const project = resolve(process.argv[2] ?? '.'),
  output = resolve(process.argv[3] ?? 'benchmark.json');
process.chdir(project);
const dir = await mkdtemp(join(tmpdir(), 'rede-atende-bench-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'data'),
  UPLOAD_DIR: join(dir, 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
});
const password = 'Somente-Benchmark-123456';
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = password;
const { seed } = await import(pathToFileURL(resolve(project, 'server/db/seed.ts')).href);
const { buildApp } = await import(pathToFileURL(resolve(project, 'server/app.ts')).href);
const { transaction, closeDatabase } = await import(
  pathToFileURL(resolve(project, 'server/db/database.ts')).href
);
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
await seed();
const app = await buildApp();
const call = (
  actor: any,
  method: string,
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method,
    url: '/api/v1' + path,
    headers: {
      'X-Requested-With': 'RedeAtende',
      ...(actor ? { cookie: actor.cookie, 'X-CSRF-Token': actor.csrf } : {}),
      ...headers,
    },
    ...(payload ? { payload } : {}),
  });
async function login(role: string) {
  const r = await call(null, 'POST', '/auth/login', {
    email: role + '@redeatende.invalid',
    password,
  });
  assert.equal(r.statusCode, 200, r.body);
  return { cookie: 'ra_session=' + r.cookies[0].value, csrf: r.json().csrf, id: r.json().user.id };
}
try {
  const citizen = await login('cidadao'),
    manager = await login('gestor');
  const registration = await call(null, 'POST', '/auth/register', {
    name: 'Outro Titular Fictício',
    email: 'benchmark@teste.invalid',
    password,
    academicAcknowledged: true,
  });
  assert.equal(registration.statusCode, 201);
  const otherId = registration.json().user.id;
  const data = {
    category: 'infraestrutura',
    schoolId: 'esc-001',
    subject: 'Demanda piloto de desempenho',
    description: 'Relato fictício. ' + 'a'.repeat(240),
    locationDetails: 'Sala fictícia de ensaio',
    applicantName: 'Pessoa Fictícia',
    applicantRole: 'comunidade',
    privacyAcknowledged: true,
    categoryDetails: { natureza: 'Hidráulico' },
  };
  const created = await call(citizen, 'POST', '/requests', data, {
    'Idempotency-Key': randomUUID(),
  });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id;
  const changed = await call(manager, 'PATCH', '/requests/' + id, {
    updates: { status: 'em_triagem' },
    note: 'Triagem fictícia para benchmark.',
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const base = structuredClone(changed.json());
  while (base.history.length < 4)
    base.history.push({
      ...base.history[1],
      id: randomUUID(),
      note: 'Evento fictício de tamanho constante.',
    });
  const endpoints = version.startsWith('3.7')
    ? [
        ['state', '/state', manager],
        ['search', '/requests/search?page=1&pageSize=20', manager],
      ]
    : [
        ['bootstrap', '/bootstrap?view=dashboard', manager],
        ['citizenBootstrap', '/bootstrap', citizen],
        ['search', '/requests/search?page=1&pageSize=20&view=summary', manager],
        ['detail', '/requests/' + id, manager],
      ];
  const all: any[] = [];
  let existing = 3;
  const stats = (samples: any[]) => {
    const times = samples.map((s) => s.ms).sort((a, b) => a - b);
    return {
      samples,
      medianMs: +((times[9] + times[10]) / 2).toFixed(2),
      p95Ms: +times[18].toFixed(2),
      bytes: samples.at(-1).bytes,
    };
  };
  for (const target of [100, 1000, 5000]) {
    await transaction(async (sql: any) => {
      for (let start = existing; start < target; start += 100) {
        const params: any[] = [],
          tuples: string[] = [],
          histParams: any[] = [],
          histTuples: string[] = [];
        for (let n = start; n < Math.min(start + 100, target); n++) {
          const item = {
            ...base,
            id: randomUUID(),
            protocol: `EDU-2026-${String(200000 + n).padStart(6, '0')}`,
            subject: 'Demanda sintética ' + String(n).padStart(6, '0'),
            history: base.history.map((h: any) => ({ ...h, id: randomUUID() })),
          };
          const values = [
              item.id,
              item.protocol,
              n % 20 === 0 ? citizen.id : otherId,
              item.schoolId,
              item.category,
              item.status,
              item.priority,
              item.createdAt,
              item.updatedAt,
              item.deadline,
              JSON.stringify(item),
            ],
            offset = params.length;
          params.push(...values);
          tuples.push(
            '(' + values.map((_: any, i: number) => '$' + (offset + i + 1)).join(',') + ')',
          );
          for (const h of item.history) {
            const values = [h.id, item.id, h.timestamp, JSON.stringify(h)],
              offset = histParams.length;
            histParams.push(...values);
            histTuples.push(
              '(' + values.map((_: any, i: number) => '$' + (offset + i + 1)).join(',') + ')',
            );
          }
        }
        await sql.query(
          'INSERT INTO requests(id,protocol,owner_id,school_id,category,status,priority,created_at,updated_at,deadline,data) VALUES ' +
            tuples.join(','),
          params,
        );
        await sql.query(
          'INSERT INTO request_history(id,request_id,occurred_at,data) VALUES ' +
            histTuples.join(','),
          histParams,
        );
      }
    });
    existing = target;
    const measurements: Record<string, unknown> = {};
    for (const [name, path, actor] of endpoints) {
      await call(actor, 'GET', path as string);
      const samples = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now(),
          r = await call(actor, 'GET', path as string);
        assert.equal(r.statusCode, 200, r.body);
        samples.push({ ms: +(performance.now() - start).toFixed(3), bytes: r.rawPayload.length });
      }
      measurements[name as string] = stats(samples);
    }
    const mutations = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now(),
        r = await call(manager, 'PATCH', '/requests/' + id, {
          updates: {},
          note: 'Despacho fictício para medição constante.',
        });
      assert.equal(r.statusCode, 200, r.body);
      mutations.push({ ms: +(performance.now() - start).toFixed(3), bytes: r.rawPayload.length });
    }
    measurements.dispatch = stats(mutations);
    const legacy = await call(manager, 'GET', '/state');
    assert.equal(legacy.statusCode, 200, legacy.body);
    const concurrentStart = performance.now();
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () =>
        call(manager, 'GET', version.startsWith('3.7') ? '/state' : '/bootstrap?view=dashboard'),
      ),
    );
    for (const r of concurrent) assert.equal(r.statusCode, 200, r.body);
    const row = {
      count: target,
      measurements,
      legacyStateBytes: legacy.rawPayload.length,
      concurrentReaders: 4,
      concurrentBatchMs: +(performance.now() - concurrentStart).toFixed(2),
      rssMiB: Math.round(process.memoryUsage().rss / 1048576),
    };
    all.push(row);
    console.log(
      JSON.stringify({
        count: target,
        version,
        measurements: Object.fromEntries(
          Object.entries(measurements).map(([k, v]: any) => [
            k,
            { medianMs: v.medianMs, p95Ms: v.p95Ms, bytes: v.bytes },
          ]),
        ),
      }),
    );
  }
  await writeFile(
    output,
    JSON.stringify(
      {
        version,
        node: process.version,
        adapter: 'PGlite',
        method:
          'Fastify inject, 20 amostras após aquecimento por endpoint e volume; concorrência 4 para leitura; sem rede ou renderização.',
        fixtures:
          'Histórico de 4 eventos em todos os clones, descrição de 256 caracteres; 5% dos clones pertencem ao cidadão medido, 95% a outro titular. Dois cenários de seed + um piloto. Somente o histórico do piloto cresce com os 20 despachos de cada etapa.',
        memory:
          'RSS inclui runtime WASM, banco e alocações acumuladas; não isola consumo por requisição. p95 empírico de 20 amostras, exploratório.',
        results: all,
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
}
