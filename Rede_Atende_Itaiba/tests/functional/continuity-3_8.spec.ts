import { test, expect, type Page } from '@playwright/test';
const password = 'SomenteTeste-123456789';
async function login(page: Page, role: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail de acesso').fill(role + '@redeatende.invalid');
  await page.getByLabel('Senha (mínimo 12 caracteres)').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(role === 'cidadao' ? /\/acompanhar/ : /\/admin/);
}

test('demonstração orienta os quatro perfis; cadastro confirma senha e preserva preenchimento', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/entrar');
  await page.getByRole('button', { name: 'Conhecer a demonstração' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Conheça o Rede Atende' })).toBeVisible();
  for (const role of ['Cidadão', 'Operador', 'Gestor', 'Auditor'])
    await expect(dialog.getByRole('rowheader', { name: role, exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Voltar ao acesso' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Criar conta fictícia de cidadão' }).click();
  await page.getByLabel('Nome fictício').fill('Conta Fictícia 38');
  await page.getByLabel('E-mail de acesso').fill('cadastro-38-' + Date.now() + '@teste.invalid');
  await page.getByLabel('Senha (mínimo 12 caracteres)').fill(password);
  await page.getByLabel('Confirmar senha').fill('Senha-Diferente-123456');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Cadastrar e entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('As senhas não coincidem');
  await expect(page.getByLabel('Nome fictício')).toHaveValue('Conta Fictícia 38');
  await page.getByLabel('Confirmar senha').fill(password);
  await page.getByRole('button', { name: 'Cadastrar e entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Nenhuma solicitação cadastrada' })).toBeVisible();
});

test('gestor reabre pela tela; operador e auditor não recebem a ação', async ({ browser }) => {
  const context = await browser.newContext(),
    manager = await context.newPage();
  await login(manager, 'gestor');
  const auth = await (await manager.request.get('/api/v1/auth/me')).json(),
    headers = { 'X-Requested-With': 'RedeAtende', 'X-CSRF-Token': auth.csrf };
  // Cenário aditivo em banco exclusivo do Playwright.
  const scenario = await manager.request.post('/api/v1/admin/scenarios', {
    headers,
    data: { kind: 'merenda' },
  });
  expect(scenario.status()).toBe(200);
  const protocol = (await scenario.json()).protocol;
  const r = await (await manager.request.get('/api/v1/protocols/' + protocol)).json();
  for (const status of ['encaminhada', 'em_atendimento', 'concluida']) {
    const result = await manager.request.patch('/api/v1/requests/' + r.id, {
      headers,
      data: {
        updates: {
          status,
          assignedDepartment: 'Setor de Engenharia e Manutenção Predial',
          assignedTechnician: 'Equipe Fictícia 38',
        },
        note: 'Providência fictícia para demonstrar reabertura.',
      },
    });
    expect(result.status()).toBe(200);
  }
  for (const role of ['operador', 'auditor']) {
    const separate = await browser.newContext(),
      page = await separate.newPage();
    await login(page, role);
    await page.goto('/admin/triagem?demandaId=' + r.id);
    await expect(page.getByRole('heading', { name: r.subject })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Reabrir solicitação', exact: true }),
    ).toHaveCount(0);
    await separate.close();
  }
  await manager.goto('/admin/triagem?demandaId=' + r.id);
  await manager.getByRole('button', { name: 'Reabrir solicitação', exact: true }).click();
  await manager
    .getByLabel('Motivo da reabertura')
    .fill('Nova verificação fictícia solicitada pelo gestor.');
  await manager.getByRole('button', { name: 'Confirmar reabertura' }).click();
  await expect(manager.getByLabel('Status da Solicitação')).toHaveValue('em_triagem');
  await expect(manager.getByRole('dialog')).toHaveCount(0);
  await context.close();
});
