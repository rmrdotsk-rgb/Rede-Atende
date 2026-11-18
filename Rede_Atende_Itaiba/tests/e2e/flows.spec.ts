/** Regressão do fluxo atual (Fastify/PGlite). Os cenários legados de localStorage
 * foram substituídos por verificações reais de sessão, isolamento e protocolo.
 * Dados e contas são exclusivamente sintéticos na base .local/e2e. */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const api = '/api/v1';
const password = 'SomenteTeste-123456789';
async function signIn(
  browser: Browser,
  role: string,
): Promise<{ context: BrowserContext; page: Page; csrf: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/entrar');
  await page.getByLabel('E-mail de acesso').fill(role);
  await page.getByLabel('Senha (mínimo 12 caracteres)').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/entrar(?:\?|$)/);
  const me = await page.request.get(`${api}/auth/me`);
  expect(me.status()).toBe(200);
  return { context, page, csrf: (await me.json()).csrf };
}
const writeHeaders = (csrf: string, key?: string) => ({
  'X-Requested-With': 'RedeAtende',
  'X-CSRF-Token': csrf,
  ...(key ? { 'Idempotency-Key': key } : {}),
});
const requestBody = (subject: string) => ({
  category: 'infraestrutura',
  schoolId: 'esc-001',
  subject,
  description: 'Relato inteiramente fictício criado no teste de isolamento.',
  locationDetails: 'Sala fictícia 1',
  applicantName: 'Pessoa Fictícia',
  applicantRole: 'comunidade',
  privacyAcknowledged: true,
  categoryDetails: { natureza: 'Hidráulico' },
});

test('API atual: cidadão A registra uma vez e cidadão B não acessa dados ou anexos', async ({
  browser,
}) => {
  const a = await signIn(browser, 'cidadao');
  const b = await browser.newContext();
  try {
    const key = randomUUID();
    const subject = `Isolamento fictício ${randomUUID()}`;
    const payload = requestBody(subject);
    const first = await a.page.request.post(`${api}/requests`, {
      headers: writeHeaders(a.csrf, key),
      data: payload,
    });
    expect(first.status(), await first.text()).toBe(201);
    const created = await first.json();
    expect(created.protocol).toMatch(/^EDU-\d{4}-\d{6}$/);
    const repeated = await a.page.request.post(`${api}/requests`, {
      headers: writeHeaders(a.csrf, key),
      data: payload,
    });
    expect(repeated.status(), await repeated.text()).toBe(201);
    expect((await repeated.json()).id).toBe(created.id);
    const own = await a.page.request.get(`${api}/requests/${created.id}`);
    expect(own.status()).toBe(200);
    const uploaded = await a.page.request.post(`${api}/requests/${created.id}/attachments`, {
      headers: writeHeaders(a.csrf, randomUUID()),
      multipart: {
        file: {
          name: 'foto-sintetica.png',
          mimeType: 'image/png',
          buffer: await readFile(
            new URL('../../server/tests/fixtures/imagem-ficticia.png', import.meta.url),
          ),
        },
      },
    });
    expect(uploaded.status(), await uploaded.text()).toBe(201);
    const attachmentId = (await uploaded.json()).id;
    const invalid = await a.page.request.post(`${api}/requests/${created.id}/attachments`, {
      headers: writeHeaders(a.csrf, randomUUID()),
      multipart: {
        file: {
          name: 'corrompida.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
            'base64',
          ),
        },
      },
    });
    expect(invalid.status()).toBe(400);

    const register = await b.request.post(`${api}/auth/register`, {
      headers: { 'X-Requested-With': 'RedeAtende' },
      data: {
        name: 'Outra Pessoa Fictícia',
        email: `outro-${randomUUID()}@teste.invalid`,
        password,
        academicAcknowledged: true,
      },
    });
    expect(register.status(), await register.text()).toBe(201);
    const other = await b.request.get(`${api}/requests/${created.id}`);
    expect(other.status()).toBe(404);
    const protocol = await b.request.get(`${api}/protocols/${created.protocol}`);
    expect(protocol.status()).toBe(404);
    const unauthorizedDownload = await b.request.get(`${api}/attachments/${attachmentId}`);
    expect(unauthorizedDownload.status()).toBe(404);
    const list = await b.request.get(`${api}/requests/search?page=1&pageSize=20`);
    expect(list.status()).toBe(200);
    expect((await list.json()).items.some((r: { id: string }) => r.id === created.id)).toBe(false);
    const denied = await b.request.patch(`${api}/requests/${created.id}`, {
      headers: writeHeaders((await register.json()).csrf),
      data: { updates: { status: 'concluida' }, note: 'Tentativa sem permissão' },
    });
    expect(denied.status()).toBe(403);
  } finally {
    await a.context.close();
    await b.close();
  }
});

test('API atual: somente gestor altera demanda; cidadão vê a mudança persistida', async ({
  browser,
}) => {
  const citizen = await signIn(browser, 'cidadao');
  const manager = await signIn(browser, 'gestor');
  const auditor = await signIn(browser, 'auditor');
  try {
    const createdResponse = await citizen.page.request.post(`${api}/requests`, {
      headers: writeHeaders(citizen.csrf, randomUUID()),
      data: requestBody(`Fluxo gestor sintético ${randomUUID()}`),
    });
    expect(createdResponse.status(), await createdResponse.text()).toBe(201);
    const created = await createdResponse.json();
    const forbidden = await auditor.page.request.patch(`${api}/requests/${created.id}`, {
      headers: writeHeaders(auditor.csrf),
      data: { updates: { status: 'em_triagem' }, note: 'Alteração vedada' },
    });
    expect(forbidden.status()).toBe(403);
    const updated = await manager.page.request.patch(`${api}/requests/${created.id}`, {
      headers: writeHeaders(manager.csrf),
      data: {
        updates: { status: 'em_triagem' },
        note: 'Solicitação fictícia em análise pela equipe.',
      },
    });
    expect(updated.status(), await updated.text()).toBe(200);
    const after = await citizen.page.request.get(`${api}/requests/${created.id}`);
    expect(after.status()).toBe(200);
    expect((await after.json()).status).toBe('em_triagem');
  } finally {
    await citizen.context.close();
    await manager.context.close();
    await auditor.context.close();
  }
});
