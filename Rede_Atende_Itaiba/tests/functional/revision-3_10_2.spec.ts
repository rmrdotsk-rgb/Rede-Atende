import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const password = 'SomenteTeste-123456789';
async function login(context: BrowserContext, role: string) {
  const result = await context.request.post('/api/v1/auth/login', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: { email: role + '@redeatende.invalid', password },
  });
  expect(result.status(), await result.text()).toBe(200);
  return (await result.json()).csrf as string;
}
const headers = (csrf: string) => ({
  'X-Requested-With': 'RedeAtende',
  'X-CSRF-Token': csrf,
  'Idempotency-Key': randomUUID(),
});
test('corrigir Outros pela triagem mantém protocolo e mostra a nova categoria ao titular', async ({
  browser,
}) => {
  const citizen = await browser.newContext(),
    manager = await browser.newContext();
  try {
    const csrf = await login(citizen, 'cidadao');
    await login(manager, 'gestor');
    const result = await citizen.request.post('/api/v1/requests', {
      headers: headers(csrf),
      data: {
        category: 'outros',
        schoolId: 'esc-001',
        subject: 'Categoria corrigida na demonstração',
        description: 'Relato fictício de manutenção para triagem de classificação.',
        locationDetails: 'Sala fictícia',
        applicantName: 'Pessoa de teste',
        applicantRole: 'comunidade',
        privacyAcknowledged: true,
        categoryDetails: { natureza: 'Não sei a categoria' },
      },
    });
    expect(result.status(), await result.text()).toBe(201);
    const original = await result.json(),
      page = await manager.newPage();
    await page.goto('/admin/triagem?demandaId=' + original.id);
    await expect(page.getByRole('heading', { name: original.subject, exact: true })).toBeVisible();
    await page.getByText('Corrigir categoria', { exact: true }).click();
    await page.getByLabel('Categoria correta').selectOption('infraestrutura');
    await page.getByLabel('Tipo de problema').selectOption('Hidráulico');
    await page
      .getByLabel('Motivo da correção (interno)')
      .fill('Classificação inicial revista pela equipe fictícia.');
    await page.getByRole('button', { name: 'Salvar categoria', exact: true }).click();
    await expect(page.getByText(/Categoria corrigida com sucesso/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: original.subject, exact: true })).toBeVisible();
    const updated = await citizen.request.get('/api/v1/requests/' + original.id);
    expect((await updated.json()).category).toBe('infraestrutura');
    expect(await updated.text()).not.toContain('Classificação inicial revista');
    const own = await citizen.newPage();
    await own.goto('/acompanhar?protocolo=' + original.protocol);
    await expect(own.getByRole('heading', { name: original.subject, exact: true })).toBeVisible();
    await expect(own.getByText(/Categoria corrigida: Outros/)).toBeVisible();
  } finally {
    await citizen.close();
    await manager.close();
  }
});

test('cabeçalho compacto, menu único e filtros secundários liberam a lista móvel', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Solicitações escolares, do registro ao acompanhamento.' }),
  ).toBeVisible();
  const anonymous = await page
    .locator('header')
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(anonymous).toBeLessThan(180);
  await mkdir('test-results/3.10.2', { recursive: true });
  await page.screenshot({ path: 'test-results/3.10.2/home-after-375.png', fullPage: true });
  await login(context, 'gestor');
  await page.goto('/admin/demandas');
  await expect(page.getByRole('heading', { name: 'Demandas registradas' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Consultando demandas...' })).toHaveCount(
    0,
  );
  await expect(page.getByLabel('Filtrar por setor')).not.toBeVisible();
  await page.getByText('Filtros adicionais · setor, prazo e prioridade', { exact: true }).click();
  await page.getByLabel('Filtrar por prioridade').selectOption('alta');
  await expect(page.getByText('Filtros ativos: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar todos os filtros' }).click();
  await expect(page.getByLabel('Filtrar por prioridade')).toHaveValue('all');
  const menu = page.getByRole('button', { name: 'Abrir menu lateral', exact: true });
  await expect(menu).toHaveCount(1);
  await menu.click();
  await expect(page.getByRole('dialog', { name: 'Módulos de gestão' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  const authenticated = await page
    .locator('header')
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(authenticated).toBeLessThan(180);
  await expect(page.getByRole('status').filter({ hasText: 'Consultando demandas...' })).toHaveCount(
    0,
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.screenshot({ path: 'test-results/3.10.2/demands-after-375.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/3.10.2/demands-after-1440.png', fullPage: true });
  await writeFile(
    'test-results/3.10.2/ux-measurements.json',
    JSON.stringify(
      {
        width: 375,
        height: 900,
        anonymousHeaderPx: anonymous,
        authenticatedHeaderPx: authenticated,
      },
      null,
      2,
    ),
  );
});

test('pedido confirmado com resposta perdida é recuperado no retry sem duplicação', async ({
  page,
  context,
}) => {
  const register = await context.request.post('/api/v1/auth/register', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: {
      name: 'Titular fictício de retry',
      email: 'retry-' + randomUUID() + '@teste.invalid',
      password,
      academicAcknowledged: true,
    },
  });
  expect(register.status(), await register.text()).toBe(201);
  await page.goto('/solicitar');
  await page.getByLabel('Unidade Escolar').selectOption('esc-001');
  await page.getByLabel('Tipo de problema').selectOption('Hidráulico');
  const subject = 'Resposta perdida ' + randomUUID().slice(0, 8);
  await page.getByLabel('Assunto Resumido').fill(subject);
  await page
    .getByLabel('Descrição Completa')
    .fill('Relato fictício cuja gravação será confirmada antes da falha de resposta.');
  await page.getByLabel('Localização Exata').fill('Sala de teste');
  await page.locator('input[name=privacyAcknowledged]').check();
  const keys: string[] = [];
  let lose = true;
  let savedId = '';
  await page.route('**/api/v1/requests', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    if (lose) {
      lose = false;
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(201);
      savedId = (await response.json()).id;
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  expect(keys).toHaveLength(1);
  expect(savedId).not.toBe('');
  await expect(page.getByLabel('Assunto Resumido')).toHaveValue(subject);
  await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Solicitação Registrada com Sucesso!' }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const list = await context.request.get('/api/v1/requests');
  expect(list.status()).toBe(200);
  const items = (await list.json()).filter((item: { subject: string }) => item.subject === subject);
  expect(items).toHaveLength(1);
  expect(items[0].id).toBe(savedId);
});
