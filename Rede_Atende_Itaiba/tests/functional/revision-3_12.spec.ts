import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const password = 'SomenteTeste-123456789';
const sessions: Record<string, Awaited<ReturnType<BrowserContext['storageState']>>> = {};
async function authenticate(context: BrowserContext, role = 'cidadao', fresh = false) {
  if (process.env.E2E_AUTH_FILE) {
    const prepared = JSON.parse(await readFile(process.env.E2E_AUTH_FILE, 'utf8'));
    await context.addCookies(prepared[fresh ? 'logout' : role].cookies);
    return;
  }

  if (sessions[role] && !fresh) {
    await context.addCookies(sessions[role].cookies);
    return;
  }
  const response = await context.request.post('/api/v1/auth/login', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: { email: role + '@redeatende.invalid', password },
  });
  expect(response.status(), await response.text()).toBe(200);
  if (!fresh) sessions[role] = await context.storageState();
}
const warning = 'Há informações não enviadas';
async function openNewRequest(page: Page) {
  await page.locator('.app-header').waitFor();
  const menu = page.getByRole('button', { name: 'Abrir menu de navegação', exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    await page
      .getByRole('navigation', { name: 'Navegação da comunidade' })
      .getByRole('link', { name: 'Nova solicitação', exact: true })
      .click();
  } else {
    await page.getByRole('link', { name: 'Nova solicitação', exact: true }).first().click();
  }
}
test('carregamento inicial da lista reserva espaço e não desloca a paginação visível', async ({
  page,
  context,
}) => {
  await authenticate(context, 'gestor');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    (window as unknown as { listCLS: number }).listCLS = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        hadRecentInput: boolean;
        value: number;
      }[])
        if (!entry.hadRecentInput)
          (window as unknown as { listCLS: number }).listCLS += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/requests/search?**', async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto('/admin/demandas');
  await expect(
    page.getByRole('status').filter({ hasText: 'Consultando demandas...' }),
  ).toBeVisible();
  const pagination = await page
    .getByRole('navigation', { name: 'Paginação de demandas' })
    .boundingBox();
  expect(pagination!.y).toBeGreaterThanOrEqual(844);
  release();
  await expect(page.getByRole('article').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(
    await page.evaluate(() => (window as unknown as { listCLS: number }).listCLS),
  ).toBeLessThanOrEqual(0.1);
});
test('atalho de conteúdo preserva foco e histórico compatível com a proteção do rascunho', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.goto('/informacoes');
  await page.getByRole('link', { name: 'Pular para o conteúdo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page).toHaveURL(/\/informacoes$/);
  await openNewRequest(page);
  await page.getByLabel('Assunto Resumido').fill('Conteúdo fictício protegido depois do atalho');
  await page.evaluate(() => history.back());
  await expect(page.getByRole('dialog', { name: warning })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar preenchendo' }).click();
  await expect(page.getByLabel('Assunto Resumido')).toHaveValue(
    'Conteúdo fictício protegido depois do atalho',
  );
});

test('menu da gestão e navegação da comunidade mantêm destinos independentes', async ({
  page,
  context,
}) => {
  await authenticate(context, 'gestor');
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Abrir menu lateral' }).click();
  const management = page.getByRole('dialog', { name: 'Módulos de gestão' });
  await expect(management.getByRole('link', { name: 'Demandas', exact: true })).toBeVisible();
  await expect(
    management.getByRole('link', { name: 'Triagem e encaminhamento', exact: true }),
  ).toBeVisible();
  await expect(management.getByRole('link', { name: 'Nova solicitação', exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Abrir opções de acessibilidade e notificações' }).click();
  await page.getByRole('link', { name: 'Visão da comunidade', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir menu de navegação' }).click();
  const community = page.getByRole('navigation', { name: 'Navegação da comunidade' });
  await expect(
    community.getByRole('link', { name: 'Nova solicitação', exact: true }),
  ).toBeVisible();
  await expect(community.getByRole('link', { name: 'Demandas', exact: true })).toHaveCount(0);
});
test('acompanhamento inicial usa uma projeção e mantém protocolo explícito ao buscar', async ({
  page,
  context,
}) => {
  await authenticate(context);
  let reads = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/v1/bootstrap') reads++;
  });
  await page.goto('/acompanhar');
  await expect(
    page.getByRole('heading', { name: 'Acompanhamento de Solicitações Educacionais' }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(reads).toBe(1);
  await expect(page).toHaveURL(/\/acompanhar$/);
  const query = page.getByRole('textbox', { name: 'Número de protocolo para consulta' });
  const protocol = await query.inputValue();
  expect(protocol).toMatch(/^EDU-/);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('protocolo=' + protocol));
});
test('rascunho avisa ao navegar, mantém campos ao cancelar e permite descarte explícito', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.goto('/informacoes');
  await openNewRequest(page);
  await page.getByLabel('Assunto Resumido').fill('Preenchimento fictício não enviado');
  await page.getByRole('link', { name: 'Rede Atende — início' }).click();
  const dialog = page.getByRole('dialog', { name: warning });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continuar preenchendo' })).toBeFocused();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Assunto Resumido')).toHaveValue(
    'Preenchimento fictício não enviado',
  );
  await page.evaluate(() => history.back());
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar preenchendo' }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL(/\/$/);
  await openNewRequest(page);
  await expect(page.getByLabel('Assunto Resumido')).toBeEmpty();
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((v) => v.includes('Preenchimento fictício')),
    ),
  ).toBe(false);
});
test('sair da conta exige escolha antes de revogar a sessão de um formulário alterado', async ({
  page,
  context,
}) => {
  await authenticate(context, 'cidadao', true);
  await page.goto('/solicitar');
  await page.getByLabel('Assunto Resumido').fill('Rascunho fictício antes de sair');
  let logouts = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/auth/logout')) logouts++;
  });
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: warning });
  await expect(dialog).toBeVisible();
  expect(logouts).toBe(0);
  await dialog.getByRole('button', { name: 'Continuar preenchendo' }).click();
  await expect(page.getByLabel('Assunto Resumido')).toHaveValue('Rascunho fictício antes de sair');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await dialog.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect(logouts).toBe(1);
  const response = await context.request.get('/api/v1/auth/me');
  expect(response.status()).toBe(200);
  expect((await response.json()).user).toBeNull();
});
test('proteção de recarga solicita cancelamento somente com formulário alterado', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.goto('/solicitar');
  await expect(page.getByLabel('Assunto Resumido')).toBeVisible();
  const preventsUnload = () =>
    page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await preventsUnload()).toBe(false);
  await page.getByLabel('Assunto Resumido').fill('Preenchimento fictício ainda não enviado');
  await expect.poll(preventsUnload).toBe(true);
});

test('recarregar exibe confirmação nativa e preserva o formulário ao cancelar', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit móvel desta execução não exibe beforeunload nativo; contrato do evento e navegação interna são testados separadamente. Ver WebKit #219102.',
  );
  await authenticate(context);
  await page.goto('/solicitar');
  await page.getByLabel('Assunto Resumido').click();
  await page.getByLabel('Assunto Resumido').fill('Conteúdo fictício para confirmar recarga');
  const notice = page.waitForEvent('dialog', { timeout: 3000 });
  // A recarga pelo documento preserva o beforeunload; o comando de automação pode ignorá-lo.
  const reload = page.evaluate(() => window.location.reload()).catch(() => null);
  const dialog = await notice;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await reload;
  await expect(page.getByLabel('Assunto Resumido')).toHaveValue(
    'Conteúdo fictício para confirmar recarga',
  );
});
test('somente selecionar anexo também protege o preenchimento contra saída silenciosa', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.goto('/solicitar');
  await page.locator('input[type=file]').setInputFiles({
    name: 'imagem-ficticia.png',
    mimeType: 'image/png',
    buffer: await readFile(resolve('server/tests/fixtures/imagem-ficticia.png')),
  });
  await page.getByRole('link', { name: 'Rede Atende — início' }).click();
  await expect(page.getByRole('dialog', { name: warning })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar preenchendo' }).click();
  const preview = page.getByRole('region', { name: 'Pré-visualização do anexo' });
  await expect(preview).toContainText('imagem-ficticia.png');
  await page.getByLabel('Unidade Escolar').selectOption('esc-001');
  await page.getByLabel('Tipo de problema').selectOption('Hidráulico');
  await page.getByLabel('Assunto Resumido').fill('Anexo fictício preservado ao cancelar saída');
  await page
    .getByLabel('Descrição Completa')
    .fill('Situação inteiramente fictícia para verificar o anexo preservado.');
  await page.getByLabel('Localização Exata').fill('Sala fictícia 312');
  await page.locator('input[name=privacyAcknowledged]').check();
  await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Solicitação Registrada com Sucesso!' }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Acompanhar Linha do Tempo do Protocolo' }).click();
  await expect(page.getByRole('link', { name: /Baixar imagem-ficticia/ })).toBeVisible();
});
test('cada página tem título próprio e rotas privadas nunca publicam protocolo no cabeçalho', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Rede Atende | Demandas escolares de Itaíba');
  await page.getByRole('link', { name: 'Como funciona', exact: true }).first().click();
  await expect(page).toHaveTitle('Como funciona | Rede Atende');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /\/informacoes$/);
  await authenticate(context);
  await page.goto('/acompanhar?protocolo=EDU-2026-000001');
  await expect(page).toHaveTitle('Meus protocolos | Rede Atende');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel=canonical]')).toHaveCount(0);
  expect(await page.locator('head').innerHTML()).not.toContain('EDU-2026-000001');
});
test('cabeçalho móvel preserva acesso e reúne opções sem cobrir o conteúdo', async ({
  page,
  context,
}) => {
  await authenticate(context);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/solicitar');
  await expect(page.getByLabel('Assunto Resumido')).toBeVisible();
  await mkdir('test-results/3.12', { recursive: true });
  await page.screenshot({ path: 'test-results/3.12/header-mobile-375.png', fullPage: false });
  const header = page.locator('.app-header');
  await expect(header).toBeVisible();
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(135);
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
  const options = page.getByRole('button', {
    name: 'Abrir opções de acessibilidade e notificações',
  });
  for (const control of [options, page.getByRole('button', { name: 'Abrir menu de navegação' })]) {
    const bounds = await control.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await options.click();
  await expect(page.getByLabel('Tema de cores')).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(options).toBeFocused();
  await page.getByRole('button', { name: 'Abrir menu de navegação' }).click();
  await page.getByRole('link', { name: 'Como funciona', exact: true }).click();
  await expect(page).toHaveURL(/\/informacoes$/);
});
test('axe cobre formulário inválido, lista vazia e detalhe; reflow a 200 e 400 por cento equivalentes', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await authenticate(context);
  await page.goto('/solicitar');
  await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
  await expect(page.getByText('Selecione uma unidade escolar.', { exact: true })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  // Invalid untouched fields do not create a draft; use a separate session for administration.
  await authenticate(context, 'gestor');
  await page.goto('/admin/demandas');
  for (const width of [720, 360]) {
    await page.setViewportSize({ width, height: 450 });
    await expect(page.getByRole('heading', { name: 'Demandas registradas' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false,
    );
  }
  const details = page
    .getByRole('article')
    .first()
    .getByRole('button', { name: /Visualizar detalhes/ });
  await details.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await page
    .getByRole('textbox', { name: /Buscar demandas/ })
    .fill('Fictício sem qualquer resultado 312');
  await expect(
    page.getByText('Nenhuma demanda encontrada com os critérios informados.', { exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});
