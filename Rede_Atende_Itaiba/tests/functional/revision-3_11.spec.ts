import { test, expect, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
const password = 'SomenteTeste-123456789';
async function login(context: BrowserContext, role = 'gestor') {
  const response = await context.request.post('/api/v1/auth/login', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: { email: role + '@redeatende.invalid', password },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test('celular permite ler assunto, protocolo e abrir detalhes sem arrastar tabela', async ({
  page,
  context,
}) => {
  await login(context);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/admin/demandas');
  await expect(page.getByRole('heading', { name: 'Demandas registradas' })).toBeVisible();
  const card = page.getByRole('article', { name: /Demanda EDU-/ }).first();
  await expect(card).toBeVisible();
  await expect(page.getByRole('table')).toBeHidden();
  await expect(card.getByRole('heading')).toBeVisible();
  const protocol = await card.getAttribute('data-protocol');
  expect(protocol).toMatch(/^EDU-/);
  const trigger = card.getByRole('button', { name: /Visualizar detalhes/ });
  const rect = await trigger.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(375);
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(protocol!, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel('Demandas por página')).toHaveValue('10');
  await mkdir('test-results/3.11', { recursive: true });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'test-results/3.11/demands-mobile-375.png', fullPage: true });
});

test('auditor consulta demandas sem receber rótulo de despacho ou edição', async ({
  page,
  context,
}) => {
  await login(context, 'auditor');
  await page.goto('/admin/demandas');
  await expect(page.getByRole('heading', { name: 'Demandas registradas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Despachar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ver triagem', exact: true }).first()).toBeVisible();
});

test('detalhe lento de um pedido não substitui o pedido escolhido depois', async ({
  page,
  context,
}) => {
  await login(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/demandas');
  await expect(page.getByRole('heading', { name: 'Demandas registradas' })).toBeVisible();
  const result = await context.request.get(
    '/api/v1/requests/search?page=1&pageSize=20&view=summary',
  );
  expect(result.status()).toBe(200);
  const items = (await result.json()).items;
  const [a, b] = items;
  expect(a).toBeTruthy();
  expect(b).toBeTruthy();
  let release!: () => void, received!: () => void, finished!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    arrived = new Promise<void>((r) => {
      received = r;
    }),
    done = new Promise<void>((r) => {
      finished = r;
    });
  await page.route('**/api/v1/requests/' + a.id, async (route) => {
    const response = await route.fetch();
    received();
    await gate;
    try {
      await route.fulfill({ response });
    } catch {
      /* A versão corrigida cancela a leitura anterior. */
    } finally {
      finished();
    }
  });
  try {
    const buttons = page.getByRole('button', { name: /Visualizar detalhes/ });
    await expect(buttons).toHaveCount(items.length);
    await buttons.nth(0).click();
    await arrived;
    await buttons.nth(1).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: b.subject, exact: true }),
    ).toBeVisible();
    release();
    await done;
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: b.subject, exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
});

test('equipe recebe orientação antes de preencher formulário exclusivo de cidadão', async ({
  page,
  context,
}) => {
  await login(context, 'gestor');
  await page.goto('/solicitar');
  await expect(
    page.getByRole('heading', { name: 'Use uma conta de cidadão para solicitar' }),
  ).toBeVisible();
  await expect(page.getByLabel('Assunto Resumido')).toHaveCount(0);
  await page.getByRole('link', { name: 'Ir para a gestão', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Resumo dos atendimentos', exact: true }),
  ).toBeVisible();
});

test('cartões, detalhes e filtros preservam legibilidade em oito larguras e modo paisagem', async ({
  page,
  context,
}) => {
  await login(context);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/demandas');
    await expect(page.getByRole('heading', { name: 'Demandas registradas' })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Consultando demandas...' }),
    ).toHaveCount(0);
    if (width < 1280) {
      await expect(page.getByRole('article', { name: /Demanda EDU-/ }).first()).toBeVisible();
      await expect(page.getByRole('table')).toBeHidden();
    } else await expect(page.getByRole('table')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      String(width),
    ).toBe(false);
  }
  await mkdir('test-results/3.11', { recursive: true });
  await page.screenshot({ path: 'test-results/3.11/demands-desktop-1440.png', fullPage: true });
  await page.setViewportSize({ width: 844, height: 390 });
  await page
    .getByRole('article', { name: /Demanda EDU-/ })
    .first()
    .getByRole('button', { name: /Visualizar detalhes/ })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByRole('button', { name: 'Abrir opções de acessibilidade e notificações' }).click();
  await page.getByLabel('Tema de cores').selectOption('high-contrast');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('trocar categoria antes do debounce mantém pesquisa, URL e resultado coerentes', async ({
  page,
  context,
}) => {
  await login(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/demandas');
  await expect(page.getByRole('heading', { name: 'Demandas registradas' })).toBeVisible();
  const response = await context.request.get('/api/v1/requests/search?view=summary');
  expect(response.status()).toBe(200);
  const target = (await response.json()).items[0];
  const category = target.category === 'infraestrutura' ? 'transporte_escolar' : 'infraestrutura';
  const queries: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/requests/search?')) queries.push(request.url());
  });
  const input = page.getByRole('textbox', { name: 'Buscar demandas' });
  await input.fill(target.protocol);
  await page.getByLabel('Filtrar por categoria').selectOption(category);
  await expect(input).toHaveValue(target.protocol);
  await expect.poll(() => new URL(page.url()).searchParams.get('busca')).toBe(target.protocol);
  await expect(
    page.getByText('Nenhuma demanda encontrada com os critérios informados.', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      queries.some((value) => {
        const q = new URL(value).searchParams;
        return q.get('search') === target.protocol && q.get('category') === category;
      }),
    )
    .toBe(true);
  await page.reload();
  await expect(input).toHaveValue(target.protocol);
  await expect(page.getByLabel('Filtrar por categoria')).toHaveValue(category);
});
