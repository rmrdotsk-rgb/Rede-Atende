import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const password = 'SomenteTeste-123456789';
const routes = [
  '/',
  '/entrar',
  '/solicitar',
  '/acompanhar',
  '/admin',
  '/admin/demandas',
  '/admin/triagem',
  '/admin/unidades',
  '/admin/agenda',
  '/admin/ordens',
  '/admin/prazos',
  '/admin/relatorios',
  '/admin/integracoes',
];
async function login(page: Page, role = 'gestor', next = '/admin') {
  await page.goto(`/entrar?voltar=${encodeURIComponent(next)}`);
  await page.getByLabel('E-mail de acesso').fill(`${role}@redeatende.invalid`);
  await page.getByLabel('Senha (mínimo 12 caracteres)').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[?]/g, '\\?') + '$'));
}
test('cidadão móvel → servidor → gestor desktop → informação → OS → conclusão → avaliação', async ({
  browser,
}) => {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const citizen = await mobile.newPage();
  const errors: string[] = [];
  citizen.on('pageerror', (e) => errors.push(e.message));
  await login(citizen, 'cidadao', '/solicitar');
  await citizen.getByLabel('Unidade Escolar').selectOption('esc-001');
  await citizen.getByLabel('Tipo de problema').selectOption('Hidráulico');
  const subject = `Bebedouro fictício ${Date.now()}`;
  await citizen.getByLabel('Assunto Resumido').fill(subject);
  await citizen
    .getByLabel('Descrição Completa')
    .fill('Vazamento fictício no bebedouro da sala demonstrativa.');
  await citizen.getByLabel('Localização Exata').fill('Sala fictícia 04');
  await citizen.locator('input[type=file]').setInputFiles({
    name: 'foto-teste.png',
    mimeType: 'image/png',
    buffer: await readFile(
      new URL('../../server/tests/fixtures/imagem-ficticia.png', import.meta.url),
    ),
  });
  await citizen.locator('input[name=privacyAcknowledged]').check();
  await citizen.getByRole('button', { name: 'Enviar Solicitação', exact: true }).dblclick();
  await expect(
    citizen.getByRole('heading', { name: 'Solicitação Registrada com Sucesso!' }),
  ).toBeVisible();
  const protocol = await citizen.getByText(/^EDU-\d{4}-\d{6}$/).innerText();
  await citizen.getByRole('button', { name: 'Acompanhar Linha do Tempo do Protocolo' }).click();
  await expect(citizen.getByRole('link', { name: /Baixar foto-teste/ })).toBeVisible();
  await citizen.reload();
  await expect(citizen.getByRole('heading', { name: subject })).toBeVisible();
  expect(await citizen.evaluate(() => localStorage.getItem('redeatende_state_v4'))).toBeNull();
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const manager = await desktop.newPage();
  manager.on('pageerror', (e) => errors.push(e.message));
  await login(manager);
  await manager.goto('/admin/demandas');
  await manager.getByRole('textbox', { name: 'Buscar demandas' }).fill(protocol);
  await manager
    .getByRole('row')
    .filter({ hasText: protocol })
    .getByRole('link', { name: 'Despachar', exact: true })
    .click();
  const id = new URL(manager.url()).searchParams.get('demandaId')!;
  await manager.getByLabel('Status da Solicitação').selectOption('aguardando_informacoes');
  await manager.getByLabel('Servidor Técnico Designado').fill('Técnico de demonstração');
  await manager
    .getByLabel('Nota de Parecer')
    .fill('Confirme qual sala fictícia apresenta vazamento.');
  await manager.getByRole('button', { name: 'Salvar Alterações' }).click();
  await expect(
    manager.getByRole('status').filter({ hasText: 'Despacho aplicado com sucesso' }),
  ).toBeVisible();
  await citizen.reload();
  await citizen.getByLabel('Sua resposta').fill('O bebedouro fictício fica na sala quatro.');
  await citizen.getByRole('button', { name: 'Enviar informações complementares' }).click();
  await expect(
    citizen.getByRole('status').filter({ hasText: 'Informações enviadas' }),
  ).toBeVisible();
  await manager.goto(`/admin/ordens?demandaId=${id}`);
  await manager.getByLabel('Solicitação vinculada').selectOption(id);
  await manager.getByLabel('Atividade a executar').fill('Corrigir vazamento fictício do bebedouro');
  await manager.getByLabel('Responsável demonstrativo').fill('Equipe Fictícia');
  await manager.getByRole('button', { name: 'Criar ordem', exact: true }).click();
  await expect(manager.getByRole('status').filter({ hasText: /Ordem .* criada/ })).toBeVisible();
  const order = manager
    .getByRole('article')
    .filter({ hasText: 'Corrigir vazamento fictício do bebedouro' });
  await order.getByLabel('Nova situação da ordem').selectOption('em_execucao');
  await order.locator('textarea').fill('Serviço iniciado em cenário fictício.');
  await order.getByRole('button', { name: 'Atualizar ordem', exact: true }).click();
  await expect(order.getByText('Em execução', { exact: true })).toBeVisible();
  await order.getByLabel('Nova situação da ordem').selectOption('concluida');
  await order.locator('textarea').fill('Vazamento fictício corrigido e verificado.');
  await order.getByRole('button', { name: 'Atualizar ordem', exact: true }).click();
  await expect(order.getByText('Concluída', { exact: true })).toBeVisible();
  await manager.goto(`/admin/triagem?demandaId=${id}`);
  await manager.getByRole('button', { name: 'Mover para "Encaminhada"' }).click();
  await expect(manager.getByLabel('Status da Solicitação')).toHaveValue('encaminhada');
  await manager.getByRole('button', { name: 'Mover para "Em Atendimento"' }).click();
  await expect(manager.getByLabel('Status da Solicitação')).toHaveValue('em_atendimento');
  await manager.getByLabel('Nota de Parecer').fill('Serviço fictício finalizado e validado.');
  await manager.getByRole('button', { name: 'Finalizar como "Concluída"' }).click();
  await expect(manager.getByLabel('Status da Solicitação')).toHaveValue('concluida');
  await citizen.reload();
  await expect(citizen.getByRole('heading', { name: 'Providência final' })).toBeVisible();
  await citizen.getByLabel('Como você avalia o atendimento?').selectOption('5');
  await citizen.getByRole('button', { name: 'Enviar avaliação' }).click();
  await expect(
    citizen.getByText('Obrigado! Sua avaliação foi registrada:', { exact: false }),
  ).toBeVisible();
  const state = await mobile.storageState();
  await mobile.close();
  const restarted = await browser.newContext({
    storageState: state,
    viewport: { width: 390, height: 844 },
  });
  const reopened = await restarted.newPage();
  await reopened.goto(`/acompanhar?protocolo=${protocol}`);
  await expect(reopened.getByRole('heading', { name: subject })).toBeVisible();
  await expect(reopened.getByRole('link', { name: /Baixar foto-teste/ })).toBeVisible();
  expect(errors).toEqual([]);
  await restarted.close();
  await desktop.close();
});
for (const width of [320, 375, 390, 430, 768, 1024, 1366, 1440])
  for (const audience of ['comunidade', 'gestao'] as const)
    test(`matriz de rotas da ${audience} em ${width}px sem overflow`, async ({ page, context }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const management = audience === 'gestao';
      if (process.env.E2E_AUTH_FILE) {
        const actors = JSON.parse(await readFile(process.env.E2E_AUTH_FILE, 'utf8'));
        await context.addCookies(actors[management ? 'gestor' : 'cidadao'].cookies);
      } else {
        await login(page, management ? 'gestor' : 'cidadao', management ? '/admin' : '/solicitar');
      }
      const titles: Record<string, string> = {
        '/': 'Solicitações escolares, do registro ao acompanhamento.',
        '/entrar': 'Entrar no atendimento',
        '/informacoes': 'Como usar o Rede Atende',
        '/solicitar': 'Registrar Nova Solicitação Educacional',
        '/acompanhar': 'Acompanhamento de Solicitações Educacionais',
        '/admin': 'Resumo dos atendimentos',
        '/admin/demandas': 'Demandas registradas',
        '/admin/triagem': 'Triagem e encaminhamento',
        '/admin/unidades': 'Unidades escolares de Itaíba',
        '/admin/ordens': 'Ordens de serviço',
        '/admin/prazos': 'Prazos e prioridades',
        '/admin/agenda': 'Agenda e vistorias',
        '/admin/relatorios': 'Relatórios e indicadores de atendimento',
        '/admin/integracoes': 'Integração SEI simulada',
        '/endereco-inexistente': 'Este endereço não existe.',
      };
      await page.setViewportSize({ width, height: 900 });
      for (const [route, title] of Object.entries(titles)) {
        if (route.startsWith('/admin') !== management) continue;
        const current = page;
        await current.goto(route);
        await expect(current.getByRole('heading', { name: title, exact: true })).toBeVisible();
        await expect(current.getByText('Carregando módulo...')).toHaveCount(0);
        await expect(current.getByText('Carregando atendimento...')).toHaveCount(0);
        if (route === '/admin/demandas')
          await expect(
            current.getByRole('status').filter({ hasText: 'Consultando demandas...' }),
          ).toHaveCount(0);
        // Os seletores de demandas em outras telas também consultam após montar.
        // Conclua esses carregamentos antes de descartar o documento no próximo goto.
        await current.waitForLoadState('networkidle');
        expect(
          await current.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          `${width}px ${route}`,
        ).toBe(false);
      }
      expect(errors).toEqual([]);
    });
test('acessibilidade axe, foco de teclado e navegação em formulários e gestão', async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page, 'cidadao', '/solicitar');
  for (const route of ['/', '/solicitar', '/acompanhar', '/entrar']) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, route).toEqual([]);
  }
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await page.getByRole('link', { name: 'Pular para o conteúdo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await login(page);
  for (const route of routes.filter((r) => r.startsWith('/admin'))) {
    await page.goto(route);
    await expect(page.locator('main h1, main h2').first()).toBeVisible();
    await expect(page.getByText('Carregando módulo...')).toHaveCount(0);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, route).toEqual([]);
  }
});
test('conta distinta não vê dados de terceiros; /admin exige autenticação', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Entrar no atendimento' })).toBeVisible();
  await login(page, 'cidadao', '/');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Acesso restrito à equipe' })).toBeVisible();
  const denied = await page.request.patch('/api/v1/requests/x', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: { updates: { status: 'concluida' } },
  });
  expect(denied.status()).toBe(403);
});
test('offline informa falha e não confirma novo envio', async ({ page, context }) => {
  await login(page, 'cidadao', '/solicitar');
  await page.getByLabel('Unidade Escolar').selectOption('esc-001');
  await context.setOffline(true);
  await page.getByLabel('Tipo de problema').selectOption('Hidráulico');
  await page.getByLabel('Assunto Resumido').fill('Envio fictício offline');
  await page
    .getByLabel('Descrição Completa')
    .fill('Descrição de teste para verificar a indisponibilidade de rede.');
  await page.getByLabel('Localização Exata').fill('Sala fictícia');
  await page.locator('input[name=privacyAcknowledged]').check();
  await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
  await expect(page.getByText('Solicitação Registrada com Sucesso!')).toHaveCount(0);
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /conexão/ })
      .first(),
  ).toBeVisible();
  await context.setOffline(false);
});
