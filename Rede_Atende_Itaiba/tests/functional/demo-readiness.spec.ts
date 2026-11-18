import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir } from 'node:fs/promises';

async function actor(context: BrowserContext, role: 'gestor' | 'cidadao') {
  const actors = JSON.parse(await readFile(process.env.E2E_AUTH_FILE!, 'utf8'));
  await context.addCookies(actors[role].cookies);
}
async function options(page: Page) {
  const button = page.getByRole('button', {
    name: 'Abrir opções de acessibilidade e notificações',
  });
  if (await button.isVisible()) await button.click();
}

test('cidadão encontra navegação e saída da área da equipe; falha de logout mantém a sessão', async ({
  page,
  context,
}) => {
  await actor(context, 'cidadao');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Acesso restrito à equipe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Rede Atende — início' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar à comunidade' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Área restrita da equipe' })).toHaveCount(0);
  await page.reload();
  await page.route('**/api/v1/auth/logout', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Falha temporária de teste. Tente novamente.' }),
    }),
  );
  await page.getByRole('button', { name: 'Trocar para uma conta da equipe' }).click();
  await expect(page.getByRole('alert')).toContainText('Falha temporária');
  expect((await context.request.get('/api/v1/auth/me')).ok()).toBe(true);
  expect((await (await context.request.get('/api/v1/auth/me')).json()).user.role).toBe('cidadao');
  await page.getByRole('link', { name: 'Voltar à comunidade' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('troca de conta encerra a sessão no servidor e retorna à gestão após login pela interface', async ({
  page,
  context,
}) => {
  // Sessão própria para não invalidar a conta preparada para outras verificações.
  const login = await context.request.post('/api/v1/auth/login', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: { email: 'cidadao@redeatende.invalid', password: 'SomenteTeste-123456789' },
  });
  expect(login.status()).toBe(200);
  const old = (await context.cookies()).find((cookie) => cookie.name === 'ra_session')!;
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Trocar para uma conta da equipe' }).click();
  await expect(page).toHaveURL(/\/entrar\?voltar=%2Fadmin$/);
  const previous = await context.request.get('/api/v1/auth/me', {
    headers: { Cookie: `ra_session=${old.value}` },
  });
  expect((await previous.json()).user).toBeNull();
  await page.getByLabel('E-mail de acesso').fill('gestor@redeatende.invalid');
  await page.getByLabel('Senha (mínimo 12 caracteres)').fill('SomenteTeste-123456789');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Resumo dos atendimentos' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Resumo dos atendimentos' })).toBeVisible();
});

for (const width of [360, 390, 768, 1366])
  for (const theme of ['light', 'dark', 'high-contrast'])
    test(`tema ${theme}, cidadão e gestor em ${width}px`, async ({ browser }) => {
      for (const role of ['cidadao', 'gestor'] as const) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          locale: 'pt-BR',
        });
        await actor(context, role);
        await context.addInitScript((value) => {
          try {
            localStorage.setItem('redeatende_color_theme', value);
          } catch {
            /* Páginas auxiliares de auditoria não têm armazenamento. */
          }
        }, theme);
        const page = await context.newPage();
        const routes =
          role === 'cidadao'
            ? ['/solicitar', '/acompanhar', '/entrar', '/admin']
            : ['/admin', '/admin/triagem', '/admin/demandas'];
        for (const route of routes) {
          await page.goto(route);
          await expect(page.locator('.app-header')).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            route,
          ).toBe(true);
          const accessibility = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze();
          expect(accessibility.violations, `${role} ${route} ${theme} ${width}`).toEqual([]);
        }
        await mkdir('test-results/demonstracao', { recursive: true });
        await page.screenshot({
          path: `test-results/demonstracao/${theme}-${role}-${width}.png`,
          fullPage: true,
        });
        await context.close();
      }
    });

test('tema e fonte persistem ao navegar, trocar de conta e reabrir o navegador', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await actor(context, 'cidadao');
  const page = await context.newPage();
  await page.goto('/acompanhar');
  await options(page);
  await page.getByLabel('Tema de cores').selectOption('dark');
  await page.getByRole('button', { name: 'Aumentar fonte, ou restaurar após 125%' }).click();
  await page.goto('/admin');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await actor(context, 'gestor');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Resumo dos atendimentos' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('style', /112.5%/);
  const saved = await context.storageState();
  await context.close();
  const reopened = await browser.newContext({ storageState: saved });
  const next = await reopened.newPage();
  await next.goto('/admin/demandas');
  await expect(next.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(next.locator('html')).toHaveAttribute('style', /112.5%/);
  await reopened.close();
});
