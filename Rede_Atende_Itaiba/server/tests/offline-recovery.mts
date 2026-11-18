/** Build real, servidor interrompido/reiniciado e banco descartável; nunca usa .local do usuário. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const temporary = await mkdtemp(join(tmpdir(), 'rede-atende-offline-'));
const password = randomBytes(24).toString('base64url');
const port = process.env.OFFLINE_TEST_PORT ?? '3001';
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(temporary, 'data'),
  UPLOAD_DIR: join(temporary, 'uploads'),
  SEED_ACCESS_FILE: join(temporary, 'access.txt'),
  PORT: port,
  HOST: '127.0.0.1',
  COOKIE_SECURE: 'false',
  NODE_ENV: 'test',
});
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = password;
const { seed } = await import('../db/seed');
const { closeDatabase } = await import('../db/database');
const { DEPARTMENTS } = await import('../../src/domain/serviceCatalog');
let server: ChildProcess | undefined;
async function start() {
  server = spawn(process.execPath, ['--import', 'tsx', 'scripts/start.mjs'], {
    env: process.env,
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error('O servidor de teste não iniciou. Verifique se a porta está livre.');
    try {
      if (
        (
          await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
            signal: AbortSignal.timeout(500),
          })
        ).ok
      )
        return;
    } catch {
      /* Inicializando. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Servidor de teste não respondeu.');
}
async function stop() {
  if (server && server.exitCode === null) {
    const finished = once(server, 'exit');
    server.kill('SIGTERM');
    await finished;
  }
  server = undefined;
}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await seed();
  await closeDatabase();
  await start();
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  for (const hostname of ['127.0.0.1', 'localhost']) {
    const root = `http://${hostname}:${port}`;
    const context = await browser.newContext({ baseURL: root });
    const manager = await browser.newContext({ baseURL: root });
    const headers = { 'X-Requested-With': 'RedeAtende' };
    const loggedIn = await context.request.post('/api/v1/auth/login', {
      headers,
      data: { email: 'cidadao@redeatende.invalid', password },
    });
    assert.equal(loggedIn.status(), 200);
    const citizenHeaders = { ...headers, 'X-CSRF-Token': (await loggedIn.json()).csrf };
    const created = await context.request.post('/api/v1/requests', {
      headers: { ...citizenHeaders, 'Idempotency-Key': randomUUID() },
      data: {
        category: 'infraestrutura',
        schoolId: 'esc-001',
        subject: 'Verificação fictícia de reconexão',
        description: 'Vazamento fictício usado para conferir retomada e persistência.',
        locationDetails: 'Sala de teste',
        applicantName: 'Pessoa Fictícia',
        applicantRole: 'comunidade',
        privacyAcknowledged: true,
        categoryDetails: { natureza: 'Hidráulico' },
      },
    });
    assert.equal(created.status(), 201, await created.text());
    const request = await created.json();
    const bytes = await readFile(new URL('./fixtures/documento-ficticio.pdf', import.meta.url));
    const uploaded = await context.request.post(`/api/v1/requests/${request.id}/attachments`, {
      headers: { ...citizenHeaders, 'Idempotency-Key': randomUUID() },
      multipart: { file: { name: 'verificacao.pdf', mimeType: 'application/pdf', buffer: bytes } },
    });
    assert.equal(uploaded.status(), 201, await uploaded.text());
    const attachment = await uploaded.json();
    const managed = await manager.request.post('/api/v1/auth/login', {
      headers,
      data: { email: 'gestor@redeatende.invalid', password },
    });
    assert.equal(managed.status(), 200);
    const updated = await manager.request.patch(`/api/v1/requests/${request.id}`, {
      headers: { ...headers, 'X-CSRF-Token': (await managed.json()).csrf },
      data: {
        updates: {
          status: 'em_triagem',
          priority: 'alta',
          assignedDepartment: DEPARTMENTS[0],
          assignedTechnician: 'Equipe Fictícia',
        },
        note: 'Registro fictício atualizado antes da interrupção.',
      },
    });
    assert.equal(updated.status(), 200, await updated.text());
    const page = await context.newPage();
    await page.goto(`/acompanhar?protocolo=${request.protocol}`);
    await page.getByRole('heading', { name: request.subject, exact: true }).waitFor();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.getByRole('heading', { name: request.subject, exact: true }).waitFor();
    await stop();
    await page.goto('/acompanhar');
    assert.equal(await page.title(), 'Sem conexão · Rede Atende');
    await start();
    await page.reload();
    await page
      .getByRole('heading', { name: 'Acompanhamento de Solicitações Educacionais', exact: true })
      .waitFor();
    assert.ok(!(await page.title()).startsWith('Sem conexão'));
    const persisted = await context.request.get(`/api/v1/requests/${request.id}`);
    assert.equal(persisted.status(), 200);
    const record = await persisted.json();
    assert.equal(record.priority, 'alta');
    assert.equal(record.status, 'em_triagem');
    assert.equal(record.assignedTechnician, undefined); // Campo interno não pertence à projeção do cidadão.
    const managementRecord = await manager.request.get(`/api/v1/requests/${request.id}`);
    assert.equal(managementRecord.status(), 200);
    const details = await managementRecord.json();
    assert.equal(details.assignedTechnician, 'Equipe Fictícia');
    assert.equal(details.assignedDepartment, DEPARTMENTS[0]);
    const downloaded = await context.request.get(`/api/v1/attachments/${attachment.id}`);
    assert.equal(downloaded.status(), 200);
    assert.deepEqual(await downloaded.body(), bytes);
    await context.close();
    await manager.close();
    console.log(
      `${hostname}:${port}: online → servidor parado → offline → reinício → título, sessão, edição e PDF preservados.`,
    );
  }
} finally {
  await browser?.close();
  await stop();
  await closeDatabase();
  await rm(temporary, { recursive: true, force: true });
}
