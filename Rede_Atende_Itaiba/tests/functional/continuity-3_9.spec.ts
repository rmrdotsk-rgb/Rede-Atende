import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
let cookies: Awaited<ReturnType<BrowserContext['storageState']>>['cookies'];
let headers: Record<string, string>, totals: { eligible: number; integrated: number; logs: number };
let requests: { id: string; protocol: string; subject: string; schoolName: string }[] = [];
const department = 'Setor de Engenharia e Manutenção Predial';

// Exercise real APIs for fixtures, then interact with the rendered UI.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL as string });
  const api = context.request;
  const login = await api.post('/api/v1/auth/login', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: { email: 'gestor-39@redeatende.invalid', password: 'SomenteTeste-123456789' },
  });
  expect(login.status()).toBe(200);
  headers = { 'X-Requested-With': 'RedeAtende', 'X-CSRF-Token': (await login.json()).csrf };
  const before = (await (await api.get('/api/v1/bootstrap?view=integrations')).json())
    .integrationTotals;
  for (let i = 0; i < 55; i++) {
    const scenario = await api.post('/api/v1/admin/scenarios', {
      headers,
      data: { kind: 'merenda' },
    });
    expect(scenario.status()).toBe(200);
    const protocol = (await scenario.json()).protocol;
    requests.push(await (await api.get('/api/v1/protocols/' + protocol)).json());
  }
  for (const r of requests.slice(0, 25)) {
    const result = await api.post('/api/v1/requests/' + r.id + '/sei-simulation', {
      headers,
      data: {},
    });
    expect(result.status()).toBe(200);
  }
  totals = {
    eligible: before.eligible + 30,
    integrated: before.integrated + 25,
    logs: before.logs + 25,
  };
  for (const r of [...requests.slice(26, 46), requests[25]]) {
    const result = await api.post('/api/v1/work-orders', {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: {
        requestId: r.id,
        title: 'Atividade fictícia 39 ' + r.protocol,
        department,
        technician: 'Equipe Fictícia 39',
        required: true,
      },
    });
    expect(result.status()).toBe(200);
  }
  cookies = (await context.storageState()).cookies;
  await context.close();
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

test('SEI mostra toda a base e mantém três paginações independentes com mais de 50 demandas', async ({
  page,
}) => {
  await page.goto('/admin/integracoes');
  await expect(page.getByTestId('Pendentes elegíveis')).toHaveText(String(totals.eligible));
  await expect(page.getByTestId('Processos vinculados')).toHaveText(String(totals.integrated));
  const pending = page.getByRole('region', {
    name: 'Paginação das demandas elegíveis',
    exact: true,
  });
  const integrated = page.getByRole('region', {
    name: 'Paginação dos processos vinculados',
    exact: true,
  });
  const logs = page.getByRole('region', { name: 'Paginação do histórico SEI', exact: true });
  await pending.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(pending).toContainText('Página 2 de');
  await integrated.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(integrated).toContainText('Página 2 de');
  await expect(pending).toContainText('Página 2 de');
  await logs.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(logs).toContainText('Página 2 de');
  await expect(integrated).toContainText('Página 2 de');
  await expect(pending).toContainText('Página 2 de');
  await page.getByLabel('Buscar protocolo, assunto ou escola').fill(requests[25].protocol);
  await page.getByRole('button', { name: 'Filtrar lista' }).click();
  await expect(pending).toContainText('Página 1 de 1 · 1 registros');
  await expect(
    page.getByRole('article', { name: 'Demanda ' + requests[25].protocol }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Simular autuação de ' + requests[25].protocol })
    .dblclick();
  await expect(page.getByTestId('Pendentes elegíveis')).toHaveText(String(totals.eligible - 1));
  await expect(page.getByTestId('Processos vinculados')).toHaveText(String(totals.integrated + 1));
  await expect(
    page.getByRole('article', { name: 'Processo de ' + requests[25].protocol }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Nenhuma demanda elegível corresponde à busca. Revise o termo para consultar outras pendências.',
    ),
  ).toBeVisible();
  const process = await (
    await page.request.get('/api/v1/bootstrap?view=integrations&search=' + requests[25].protocol)
  ).json();
  expect(process.lists.seiLogs.total).toBe(1);
});

test('OS identifica demanda antiga e preserva formulário, seleção e busca ao paginar', async ({
  page,
}) => {
  await page.goto('/admin/ordens');
  const target = requests[25],
    card = page
      .getByRole('article')
      .filter({ hasText: 'Atividade fictícia 39 ' + target.protocol });
  await expect(card).toContainText(target.protocol);
  await expect(card).toContainText(target.schoolName);
  await page.locator('#os-request-search').fill(target.protocol);
  await expect(page.locator('#os-request option').filter({ hasText: target.protocol })).toHaveCount(
    1,
  );
  await page.getByLabel('Solicitação vinculada').selectOption(target.id);
  await page
    .getByLabel('Atividade a executar')
    .fill('Formulário preenchido para teste de paginação');
  const nav = page.getByRole('region', { name: 'Navegação da lista', exact: true });
  await nav.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(nav).toContainText('Página 2 de');
  await expect(page.getByLabel('Atividade a executar')).toHaveValue(
    'Formulário preenchido para teste de paginação',
  );
  await expect(page.getByLabel('Solicitação vinculada')).toHaveValue(target.id);
  await expect(page.locator('#os-request-search')).toHaveValue(target.protocol);
  await page.locator('#os-request-search').fill('nenhum-protocolo-39');
  await expect(
    page
      .getByText(
        'Nenhum protocolo disponível nesta busca. Revise o termo ou a situação da demanda.',
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByLabel('Solicitação vinculada')).toHaveValue(target.id);
});

test('menu móvel devolve foco, fecha ao navegar e suporta fonte ampliada e alto contraste', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Abrir menu de navegação', exact: true });
  await trigger.click();
  const open = page.getByRole('button', { name: 'Fechar menu de navegação', exact: true });
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page
    .getByRole('navigation', { name: 'Navegação da comunidade' })
    .getByRole('link', { name: 'Meus protocolos' })
    .click();
  await expect(page.getByRole('navigation', { name: 'Navegação da comunidade' })).toHaveCount(0);
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false,
  );
  await page.getByRole('button', { name: 'Abrir opções de acessibilidade e notificações' }).click();
  await page.getByLabel('Tema de cores').selectOption('high-contrast');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.getByLabel('Tema de cores').selectOption('light');
  await page.screenshot({ path: 'test-results/3.9/menu-fonte-200-375.png', fullPage: true });
});

test('filtros, ordenação e busca de demandas persistem ao voltar de um despacho', async ({
  page,
}) => {
  await page.goto('/admin/demandas');
  await page.getByLabel('Demandas por página').selectOption('10');
  await page.getByText('Filtros adicionais · setor, prazo e prioridade', { exact: true }).click();
  await page.getByLabel('Ordenar demandas').selectOption('oldest');
  const search = page.getByRole('textbox', { name: 'Buscar demandas' });
  await search.pressSequentially(requests[26].protocol, { delay: 30 });
  await expect(search).toHaveValue(requests[26].protocol);
  await expect(search).toBeFocused();
  const demand = page
    .getByRole('row')
    .filter({ hasText: requests[26].protocol })
    .or(page.getByRole('article', { name: 'Demanda ' + requests[26].protocol, exact: true }));
  await expect(demand).toHaveCount(1);
  await demand.getByRole('link', { name: 'Despachar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: requests[26].subject, exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Buscar demandas' })).toHaveValue(
    requests[26].protocol,
  );
  await expect(page.getByLabel('Demandas por página')).toHaveValue('10');
  await expect(page.getByLabel('Ordenar demandas')).toHaveValue('oldest');
  await expect(demand).toHaveCount(1);
});
