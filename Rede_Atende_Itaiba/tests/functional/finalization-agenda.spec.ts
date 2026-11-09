import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

async function authenticate(context: BrowserContext) {
  if (process.env.E2E_AUTH_FILE) {
    const prepared = JSON.parse(await readFile(process.env.E2E_AUTH_FILE, 'utf8'));
    await context.addCookies(prepared.gestor.cookies);
  } else {
    const response = await context.request.post('/api/v1/auth/login', {
      headers: { 'X-Requested-With': 'RedeAtende' },
      data: { email: 'gestor@redeatende.invalid', password: 'SomenteTeste-123456789' },
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  const session = await (await context.request.get('/api/v1/auth/me')).json();
  return { 'X-Requested-With': 'RedeAtende', 'X-CSRF-Token': session.csrf };
}

async function waitForDemands(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Consultando demandas...' })).toHaveCount(
    0,
  );
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
}

test('Agenda cria, valida conflito, edita, conclui e cancela preservando observações e histórico', async ({
  page,
  context,
}) => {
  const headers = await authenticate(context);
  const scenario = await context.request.post('/api/v1/admin/scenarios', {
    headers,
    data: { kind: 'merenda' },
  });
  expect(scenario.status(), await scenario.text()).toBe(200);
  const protocol = (await scenario.json()).protocol;
  const request = await (await context.request.get('/api/v1/protocols/' + protocol)).json();
  const technician = 'Equipe fictícia ' + randomUUID().slice(0, 8);
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const observation = 'Escopo fictício que precisa continuar disponível após o cancelamento.';

  await page.goto('/admin/agenda?demandaId=' + request.id);
  await expect(page.getByRole('heading', { name: 'Agenda e vistorias' })).toBeVisible();
  const open = async (time: string) => {
    await page.getByRole('button', { name: 'Novo Agendamento Técnico', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo Agendamento Técnico', exact: true });
    await dialog.getByLabel('Técnico Responsável').fill(technician);
    await dialog.getByLabel('Data', { exact: false }).fill(date);
    await dialog.getByLabel('Horário').fill(time);
    await dialog.getByLabel('Observações Técnicas').fill(observation);
    return dialog;
  };
  const firstDialog = await open('09:00');
  await firstDialog.getByRole('button', { name: 'Salvar Agendamento', exact: true }).click();
  await expect(firstDialog).toHaveCount(0);
  const visit = (time: string) =>
    page.getByRole('article', {
      name: `Agendamento com ${technician} em ${date} às ${time}`,
      exact: true,
    });
  await expect(visit('09:00')).toContainText(observation);

  const conflictDialog = await open('09:30');
  await conflictDialog.getByRole('button', { name: 'Salvar Agendamento', exact: true }).click();
  await expect(conflictDialog.getByRole('alert')).toContainText(
    'intervalo conflitante de 60 minutos',
  );
  await expect(conflictDialog.getByLabel('Observações Técnicas')).toHaveValue(observation);
  await conflictDialog.getByLabel('Horário').fill('11:00');
  await conflictDialog.getByRole('button', { name: 'Salvar Agendamento', exact: true }).click();
  await expect(conflictDialog).toHaveCount(0);
  await expect(visit('11:00')).toBeVisible();

  await visit('09:00').getByRole('button', { name: 'Editar', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Editar Agendamento Técnico', exact: true });
  await edit.getByLabel('Horário').fill('08:00');
  await edit.getByRole('button', { name: 'Salvar Agendamento', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await visit('08:00').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(visit('08:00')).toContainText('Confirmada');

  const filter = page.getByLabel('Filtrar agendamentos por situação');
  const navigation = page.getByRole('region', { name: 'Navegação da lista', exact: true });
  await filter.selectOption('Agendada');
  await expect(navigation).toHaveAttribute('aria-busy', 'false');
  await expect(visit('11:00')).toBeVisible();
  await expect(visit('08:00')).toHaveCount(0);
  await filter.selectOption('Confirmada');
  await expect(navigation).toHaveAttribute('aria-busy', 'false');
  await expect(visit('08:00')).toBeVisible();
  await page.goBack();
  await expect(filter).toHaveValue('Agendada');
  await expect(navigation).toHaveAttribute('aria-busy', 'false');
  await expect(visit('11:00')).toBeVisible();
  await page.goForward();
  await expect(filter).toHaveValue('Confirmada');
  await expect(navigation).toHaveAttribute('aria-busy', 'false');
  await expect(visit('08:00')).toBeVisible();

  await filter.selectOption('all');
  await expect(navigation).toHaveAttribute('aria-busy', 'false');
  await visit('08:00').getByRole('button', { name: 'Concluir Visita', exact: true }).click();
  await expect(visit('08:00')).toContainText('Realizada');
  await visit('11:00').getByRole('button', { name: 'Cancelar', exact: true }).click();
  const cancellation = page.getByRole('dialog', { name: 'Cancelar agendamento', exact: true });
  const reason = 'Visita fictícia cancelada por ajuste da programação.';
  await cancellation.getByLabel('Motivo do cancelamento').fill(reason);
  await cancellation.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(cancellation).toHaveCount(0);
  await page.reload();
  await expect(visit('08:00')).toContainText('Realizada');
  await expect(visit('11:00')).toContainText('Cancelada');
  await expect(visit('11:00')).toContainText(observation);
  await expect(visit('11:00')).toContainText(reason);
  const persisted = await (await context.request.get('/api/v1/requests/' + request.id)).json();
  const history = persisted.history.filter(
    (event: { action: string }) => event.action === 'agenda',
  );
  expect(history.some((event: { note: string }) => event.note.includes('agendamento criado'))).toBe(
    true,
  );
  expect(history.some((event: { note: string }) => event.note.includes(reason))).toBe(true);
});

test('demandas mantêm 10/20/50 itens, página válida e filtro mais recente sob latência', async ({
  page,
  context,
}) => {
  const headers = await authenticate(context);
  const initial = await (await context.request.get('/api/v1/requests/search?view=summary')).json();
  for (let i = initial.total; i < 51; i++) {
    const response = await context.request.post('/api/v1/admin/scenarios', {
      headers,
      data: { kind: 'merenda' },
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/demandas?limite=10');
  await expect(page.getByRole('heading', { name: 'Demandas registradas' })).toBeVisible();
  await waitForDemands(page);
  const navigation = page.getByRole('navigation', { name: 'Paginação de demandas', exact: true });
  const rows = page
    .getByRole('table', { name: 'Demandas registradas', exact: true })
    .locator('tbody > tr');
  const searchResponse = (size: number, pageNumber: number) =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith('/requests/search') &&
        url.searchParams.get('pageSize') === String(size) &&
        url.searchParams.get('page') === String(pageNumber)
      );
    });
  for (const size of [10, 20, 50]) {
    if (size !== 10) {
      await Promise.all([
        searchResponse(size, 1),
        page.getByLabel('Demandas por página').selectOption(String(size)),
      ]);
      await waitForDemands(page);
    }
    await expect(rows).toHaveCount(size);
    await Promise.all([
      searchResponse(size, 2),
      navigation.getByRole('button', { name: 'Próxima página', exact: true }).click(),
    ]);
    await waitForDemands(page);
    await expect(navigation).toContainText('Página 2 de');
    await Promise.all([
      searchResponse(size, 1),
      navigation.getByRole('button', { name: 'Página anterior', exact: true }).click(),
    ]);
    await waitForDemands(page);
    await expect(navigation).toContainText('Página 1 de');
  }
  await rows.first().getByRole('link', { name: 'Despachar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Triagem e encaminhamento' })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Demandas por página')).toHaveValue('50');
  await waitForDemands(page);
  await expect(rows).toHaveCount(50);

  const target = (await (await context.request.get('/api/v1/requests/search?view=summary')).json())
    .items[0];
  const input = page.getByRole('textbox', { name: 'Buscar demandas' });
  let release: () => void = () => {};
  let finish: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let staleStarted = false;
  const pattern = '**/api/v1/requests/search?**';
  await page.route(pattern, async (route) => {
    if (new URL(route.request().url()).searchParams.get('search') === 'busca antiga fictícia') {
      const response = await route.fetch();
      staleStarted = true;
      await held;
      await route.fulfill({ response }).catch(() => {});
      finish();
    } else await route.continue();
  });
  await input.fill('busca antiga fictícia');
  await expect.poll(() => staleStarted).toBe(true);
  await input.fill(target.protocol);
  await page.getByLabel('Filtrar por categoria').selectOption(target.category);
  await waitForDemands(page);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(target.protocol);
  release();
  await finished;
  await page.unroute(pattern);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(target.protocol);
  await expect(navigation).toContainText('Página 1 de 1');
  await input.fill('protocolo fictício inexistente ' + randomUUID());
  await waitForDemands(page);
  await expect(
    page.getByText('Nenhuma demanda encontrada com os critérios informados.', { exact: true }),
  ).toBeVisible();
  await expect(navigation).toContainText('Página 1 de 1 · 0 demandas');
});
