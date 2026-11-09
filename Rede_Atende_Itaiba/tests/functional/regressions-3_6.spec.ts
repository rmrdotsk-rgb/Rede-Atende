import { test, expect, type Page } from '@playwright/test';
import { SERVICE_CATALOG } from '../../src/domain/serviceCatalog';
import { fileURLToPath } from 'node:url';

async function registerCitizen(page: Page) {
  await page.goto('/entrar');
  await page.getByRole('button', { name: 'Criar conta fictícia de cidadão' }).click();
  await page.getByLabel('Nome fictício').fill('Cidadão Fictício Navegador');
  await page.getByLabel('E-mail de acesso').fill(`navegador-${Date.now()}@teste.invalid`);
  await page.getByLabel('Senha (mínimo 12 caracteres)').fill('SomenteNavegador-123456789');
  await page.getByLabel('Confirmar senha').fill('SomenteNavegador-123456789');
  await page.getByRole('checkbox', { name: /Entendo que este é um projeto acadêmico/ }).check();
  await page.getByRole('button', { name: 'Cadastrar e entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/acompanhar$/);
}

test('nova conta tem estado vazio e sete categorias funcionam no formulário móvel e na API', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await registerCitizen(page);
  await expect(page.getByRole('heading', { name: 'Nenhuma solicitação cadastrada' })).toBeVisible();
  await page.screenshot({ path: 'test-results/3.8/cidadao-vazio-390.png', fullPage: true });
  const protocols = new Set<string>();
  for (const [category, service] of Object.entries(SERVICE_CATALOG)) {
    await page.goto(`/solicitar?categoria=${category}`);
    await page.getByLabel('Unidade Escolar').selectOption('esc-003');
    for (const field of service.fields) {
      const input = page.getByLabel(field.label, { exact: false });
      if (field.options) await input.selectOption(field.options[0]);
      else await input.fill(field.type === 'date' ? '2026-11-06' : 'Detalhe fictício da categoria');
    }
    const subject = `Pedido móvel fictício ${category}`;
    await page.getByLabel('Assunto Resumido').fill(subject);
    await page
      .getByLabel('Descrição Completa')
      .fill('Relato de teste acadêmico, sem dados pessoais ou informações de crianças.');
    await page.getByLabel('Localização Exata').fill('Sala fictícia 03');
    if (category === 'outros') {
      await page
        .locator('input[type=file]')
        .setInputFiles(
          fileURLToPath(
            new URL('../../server/tests/fixtures/documento-ficticio.pdf', import.meta.url),
          ),
        );
      await expect(page.locator('iframe')).toHaveCount(0);
      await expect(
        page.getByText('Pré-visualização de PDF indisponível. O arquivo será validado no envio.'),
      ).toBeVisible();
    }
    await page.locator('input[name=privacyAcknowledged]').check();
    await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Solicitação Registrada com Sucesso!' }),
    ).toBeVisible();
    const protocol = await page.getByText(/^EDU-\d{4}-\d{6}$/).innerText();
    protocols.add(protocol);
    await page.getByRole('button', { name: 'Acompanhar Linha do Tempo do Protocolo' }).click();
    await expect(page.getByRole('heading', { name: subject })).toBeVisible();
    if (category === 'outros')
      await expect(page.getByRole('link', { name: /Baixar documento-ficticio.pdf/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false,
    );
  }
  expect(protocols.size).toBe(7);
  const response = await page.request.get('/api/v1/requests');
  expect(response.status()).toBe(200);
  const saved = await response.json();
  expect(saved).toHaveLength(7);
  expect(new Set(saved.map((r: { category: string }) => r.category)).size).toBe(7);
  await page.screenshot({ path: 'test-results/3.8/acompanhamento-390.png', fullPage: true });
});

test('erro corrigível conserva campos e permite reenviar com a mesma chave', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await registerCitizen(page);
  await page.goto('/solicitar');
  await page.getByLabel('Unidade Escolar').selectOption('esc-003');
  await page.getByLabel('Tipo de problema').selectOption('Hidráulico');
  await page.getByLabel('Assunto Resumido').fill('Relato preservado após falha');
  await page
    .getByLabel('Descrição Completa')
    .fill('Descrição fictícia que precisa permanecer após falha corrigível.');
  await page.getByLabel('Localização Exata').fill('Pátio fictício');
  await page.locator('input[name=privacyAcknowledged]').check();
  const keys: string[] = [];
  let fail = true;
  await page.route('**/api/v1/requests', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    keys.push(route.request().headers()['idempotency-key']);
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Indisponibilidade de ensaio. Tente novamente.' }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /Indisponibilidade de ensaio/ }),
  ).toBeVisible();
  expect(keys).toHaveLength(1);
  await expect(page.getByLabel('Assunto Resumido')).toHaveValue('Relato preservado após falha');
  await expect(page.getByLabel('Localização Exata')).toHaveValue('Pátio fictício');
  await expect(page.getByRole('button', { name: 'Enviar Solicitação', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Solicitação Registrada com Sucesso!' }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false,
  );
});
