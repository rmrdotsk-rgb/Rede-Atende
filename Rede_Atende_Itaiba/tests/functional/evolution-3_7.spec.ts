import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const password = 'SomenteTeste-123456789';
async function login(page: Page, role: string, next = '/admin') {
  await page.goto('/entrar?voltar=' + encodeURIComponent(next));
  await page.getByLabel('E-mail de acesso').fill(`${role}@redeatende.invalid`);
  await page.getByLabel('Senha (mínimo 12 caracteres)').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(next + '$'));
}
test('resposta perdida do upload permite retry sem duplicar anexo no banco', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'cidadao', '/solicitar');
  const keys: string[] = [];
  let loseResponse = true;
  await page.route('**/api/v1/requests/*/attachments', async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    if (loseResponse) {
      loseResponse = false;
      // DevTools pode omitir bytes de arquivos multipart; o injetor conserva a fixture real.
      const boundary = 'Ensaio37' + randomUUID(),
        bytes = await readFile(
          new URL('../../server/tests/fixtures/imagem-ficticia.png', import.meta.url),
        );
      const payload = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="imagem-ficticia.png"\r\nContent-Type: image/png\r\n\r\n`,
          ),
          bytes,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
        headers = await route.request().allHeaders();
      for (const key of Object.keys(headers))
        if (['content-type', 'content-length'].includes(key.toLowerCase())) delete headers[key];
      headers['content-type'] = 'multipart/form-data; boundary=' + boundary;
      const response = await route.fetch({ headers, postData: payload });
      expect(response.status(), await response.text()).toBe(201);
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await page.getByLabel('Unidade Escolar').selectOption('esc-001');
  await page.getByLabel('Tipo de problema').selectOption('Hidráulico');
  await page.getByLabel('Assunto Resumido').fill('Upload com resposta perdida 3.7');
  await page
    .getByLabel('Descrição Completa')
    .fill('Ensaio fictício de reconciliação do envio já gravado no servidor.');
  await page.getByLabel('Localização Exata').fill('Sala fictícia 37');
  await page
    .locator('input[type=file]')
    .setInputFiles(
      fileURLToPath(new URL('../../server/tests/fixtures/imagem-ficticia.png', import.meta.url)),
    );
  await page.locator('input[name=privacyAcknowledged]').check();
  await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Solicitação Registrada com Sucesso!' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar enviar anexo novamente' })).toBeVisible();
  expect(keys).toHaveLength(1);
  const protocol = await page.getByText(/^EDU-\d{4}-\d{6}$/).innerText(),
    request = await (await page.request.get('/api/v1/protocols/' + protocol)).json();
  const before = await (await page.request.get('/api/v1/state')).json();
  expect(
    before.attachments.filter((a: { requestId: string }) => a.requestId === request.id),
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Tentar enviar anexo novamente' }).click();
  await expect(page.getByRole('button', { name: 'Tentar enviar anexo novamente' })).toHaveCount(0);
  const after = await (await page.request.get('/api/v1/state')).json();
  expect(
    after.attachments.filter((a: { requestId: string }) => a.requestId === request.id),
  ).toHaveLength(1);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.getByRole('button', { name: 'Acompanhar Linha do Tempo do Protocolo' }).click();
  await expect(page.getByRole('link', { name: /Baixar imagem-ficticia.png/ })).toBeVisible();
});

test('paginação e filtros consultam servidor; triagem recusa edição desatualizada', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const citizenContext = await browser.newContext(),
    citizen = await citizenContext.newPage();
  await login(citizen, 'cidadao', '/solicitar');
  const citizenSession = await (await citizen.request.get('/api/v1/auth/me')).json();
  let target: { id: string; protocol: string; subject: string } | undefined;
  for (let i = 0; i < 21; i++) {
    const subject = `Pedido paginado 3.7 ${i}`,
      response = await citizen.request.post('/api/v1/requests', {
        headers: {
          'X-Requested-With': 'RedeAtende',
          'X-CSRF-Token': citizenSession.csrf,
          'Idempotency-Key': randomUUID(),
        },
        data: {
          category: 'infraestrutura',
          schoolId: 'esc-001',
          subject,
          description: 'Relato sintético criado para verificar paginação, filtros e concorrência.',
          locationDetails: 'Sala fictícia 37',
          applicantName: 'Pessoa Fictícia',
          applicantRole: 'comunidade',
          priority: 'urgente',
          privacyAcknowledged: true,
          categoryDetails: { natureza: 'Hidráulico' },
        },
      });
    expect(response.status(), await response.text()).toBe(201);
    const saved = await response.json();
    expect(saved.priority).toBe('media');
    target = saved;
  }
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } }),
    page = await context.newPage();
  await login(page, 'gestor');
  const queries: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/requests/search?')) queries.push(r.url());
  });
  await page.goto('/admin/demandas');
  await page.getByLabel('Demandas por página').selectOption('10');
  await expect(page.getByRole('button', { name: 'Próxima página', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Próxima página', exact: true }).click();
  await expect(page.getByText(/Página 2 de/)).toBeVisible();
  await expect
    .poll(() => queries.some((url) => new URL(url).searchParams.get('page') === '2'))
    .toBe(true);
  await page.getByRole('textbox', { name: 'Buscar demandas' }).fill(target!.protocol);
  await expect(page.getByRole('row').filter({ hasText: target!.protocol })).toHaveCount(1);
  await expect(page.getByText(/Página 1 de 1/)).toBeVisible();
  await page.getByLabel('Filtrar por categoria').selectOption('transporte_escolar');
  await expect(
    page.getByText('Nenhuma demanda encontrada com os critérios informados.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpar todos os filtros' }).click();
  await page.getByRole('textbox', { name: 'Buscar demandas' }).fill(target!.protocol);
  await expect(page.getByRole('row').filter({ hasText: target!.protocol })).toHaveCount(1);
  await page.screenshot({ path: 'test-results/3.8/demandas-1366.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false,
  );
  await page.screenshot({ path: 'test-results/3.8/demandas-375.png', fullPage: true });
  await page
    .getByRole('article', { name: 'Demanda ' + target!.protocol })
    .getByRole('link', { name: 'Despachar', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp('demandaId=' + target!.id));
  await expect(page.getByLabel('Classificação de Prioridade')).toHaveValue('media');
  const session = await (await page.request.get('/api/v1/auth/me')).json();
  const external = await page.request.patch('/api/v1/requests/' + target!.id, {
    headers: { 'X-Requested-With': 'RedeAtende', 'X-CSRF-Token': session.csrf },
    data: {
      updates: { priority: 'alta' },
      note: 'Reclassificação fictícia realizada em outra sessão.',
    },
  });
  expect(external.status()).toBe(200);
  await page.getByLabel('Servidor Técnico Designado').fill('Equipe Fictícia 37');
  await page
    .getByLabel('Nota de Parecer')
    .fill('Edição iniciada antes da atualização de outra sessão.');
  await page.getByRole('button', { name: 'Salvar Alterações' }).click();
  await expect(page.getByText(/Esta solicitação foi alterada por outra pessoa/)).toBeVisible();
  await page.getByRole('button', { name: 'Atualizar dados da solicitação' }).click();
  await expect(page.getByLabel('Classificação de Prioridade')).toHaveValue('alta');
  await context.close();
  await citizenContext.close();
});
