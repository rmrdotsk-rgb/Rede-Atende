import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { EducationalRequest } from '../../src/types';

const password = 'SomenteTeste-123456789';
const warning = 'Há informações não enviadas';
let citizenState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;

async function citizen(context: BrowserContext) {
  if (citizenState) {
    await context.addCookies(citizenState.cookies);
    return;
  }
  const response = await context.request.post('/api/v1/auth/register', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: {
      name: 'Cidadão Fictício Finalização',
      email: `finalizacao-${randomUUID()}@teste.invalid`,
      password,
      academicAcknowledged: true,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  citizenState = await context.storageState();
}

async function manager(context: BrowserContext) {
  if (process.env.E2E_AUTH_FILE) {
    const prepared = JSON.parse(await readFile(process.env.E2E_AUTH_FILE, 'utf8'));
    await context.addCookies(prepared.gestor.cookies);
    return;
  }
  const response = await context.request.post('/api/v1/auth/login', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: { email: 'gestor@redeatende.invalid', password },
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function headers(context: BrowserContext) {
  const session = await (await context.request.get('/api/v1/auth/me')).json();
  return { 'X-Requested-With': 'RedeAtende', 'X-CSRF-Token': session.csrf };
}

async function requestFixture(context: BrowserContext, subject: string) {
  const response = await context.request.post('/api/v1/requests', {
    headers: { ...(await headers(context)), 'Idempotency-Key': randomUUID() },
    data: {
      category: 'outros',
      categoryDetails: { natureza: 'Orientação fictícia' },
      schoolId: 'esc-001',
      subject,
      description: 'Pedido fictício para verificar proteção de respostas e avaliações preenchidas.',
      locationDetails: 'Secretaria fictícia',
      applicantName: 'Cidadão Fictício Finalização',
      applicantRole: 'comunidade',
      privacyAcknowledged: true,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as EducationalRequest;
}

async function fillRequest(page: Page) {
  await page.getByLabel('Unidade Escolar').selectOption('esc-001');
  await page.getByLabel('Tipo de problema').selectOption('Hidráulico');
  await page.getByLabel('Assunto Resumido').fill('Anexo fictício com resposta atrasada');
  await page
    .getByLabel('Descrição Completa')
    .fill('Ensaio fictício para preservar o formulário durante a tentativa de upload.');
  await page.getByLabel('Localização Exata').fill('Sala fictícia de finalização');
  await page.locator('input[name=privacyAcknowledged]').check();
}

test('início oferece os três destinos principais também sem abrir o menu móvel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/');
  const introduction = page.locator('main section').first();
  await expect(
    introduction.getByRole('link', { name: 'Nova solicitação', exact: true }),
  ).toBeVisible();
  await expect(
    introduction.getByRole('link', { name: 'Acompanhar protocolo', exact: true }),
  ).toHaveAttribute('href', '/acompanhar');
  await introduction.getByRole('link', { name: 'Como funciona', exact: true }).click();
  await expect(page).toHaveURL(/\/informacoes$/);
});

test('upload em andamento não libera outro formulário e anexo pendente exige descarte consciente', async ({
  page,
  context,
}) => {
  await citizen(context);
  await page.goto('/solicitar');
  await fillRequest(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'imagem-ficticia.png',
    mimeType: 'image/png',
    buffer: await readFile(
      new URL('../../server/tests/fixtures/imagem-ficticia.png', import.meta.url),
    ),
  });
  let releaseUpload!: () => void;
  let uploadStarted!: () => void;
  const pending = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const started = new Promise<void>((resolve) => {
    uploadStarted = resolve;
  });
  await page.route('**/api/v1/requests/*/attachments', async (route) => {
    uploadStarted();
    await pending;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Falha de upload simulada para verificar recuperação.' }),
    });
  });
  await page.getByRole('button', { name: 'Enviar Solicitação', exact: true }).click();
  await started;
  try {
    await expect(
      page.getByRole('heading', { name: 'Solicitação Registrada com Sucesso!' }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Registrar Outra Demanda' })).toHaveCount(0);
    await expect(page.locator('button[type=submit]')).toBeDisabled();
    await expect(page.getByLabel('Assunto Resumido')).toBeDisabled();
  } finally {
    releaseUpload();
  }
  await expect(
    page.getByRole('heading', { name: 'Solicitação Registrada com Sucesso!' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Solicitação gravada, mas o anexo');
  const protocol = await page.getByText(/^EDU-\d{4}-\d{6}$/).innerText();
  await page.getByRole('button', { name: 'Registrar Outra Demanda' }).click();
  const dialog = page.getByRole('dialog', { name: warning });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar preenchendo' }).click();
  await expect(page.getByText(protocol, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar enviar anexo novamente' })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar Outra Demanda' }).click();
  await dialog.getByRole('button', { name: 'Descartar e sair' }).click();
  await expect(page.getByLabel('Unidade Escolar')).toHaveValue('');
  await expect(page.getByLabel('Assunto Resumido')).toBeEmpty();
  await expect(page.getByRole('button', { name: 'Tentar enviar anexo novamente' })).toHaveCount(0);
});

test('complemento e avaliação preservam dados ao cancelar saída e liberam navegação após salvar', async ({
  page,
  context,
  browser,
}) => {
  await citizen(context);
  const request = await requestFixture(context, 'Complemento e avaliação fictícios de finalização');
  const management = await browser.newContext();
  try {
    await manager(management);
    const dispatch = async (status: string) => {
      const result = await management.request.patch(`/api/v1/requests/${request.id}`, {
        headers: await headers(management),
        data: {
          updates: {
            status,
            assignedDepartment: 'Setor de Engenharia e Manutenção Predial',
            assignedTechnician: 'Equipe Fictícia Finalização',
          },
          note: 'Providência fictícia para verificar proteção do preenchimento.',
        },
      });
      expect(result.status(), await result.text()).toBe(200);
    };
    await dispatch('aguardando_informacoes');
    await page.goto(`/acompanhar?protocolo=${request.protocol}`);
    await page.getByLabel('Sua resposta').fill('Complemento fictício que precisa ser preservado.');
    await page.getByRole('link', { name: 'Rede Atende — início' }).click();
    const dialog = page.getByRole('dialog', { name: warning });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar preenchendo' }).click();
    await expect(page.getByLabel('Sua resposta')).toHaveValue(
      'Complemento fictício que precisa ser preservado.',
    );
    await page.getByRole('button', { name: 'Enviar informações complementares' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Informações enviadas' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Rede Atende — início' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(dialog).toHaveCount(0);

    for (const status of ['encaminhada', 'em_atendimento', 'concluida']) await dispatch(status);
    await page.goto(`/acompanhar?protocolo=${request.protocol}`);
    await page.getByLabel('Como você avalia o atendimento?').selectOption('4');
    await page.getByLabel('Comentário (opcional)').fill('Avaliação fictícia ainda não enviada.');
    await page.getByRole('link', { name: 'Rede Atende — início' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar preenchendo' }).click();
    await expect(page.getByLabel('Como você avalia o atendimento?')).toHaveValue('4');
    await expect(page.getByLabel('Comentário (opcional)')).toHaveValue(
      'Avaliação fictícia ainda não enviada.',
    );
    await page.getByRole('button', { name: 'Enviar avaliação' }).click();
    await expect(page.getByText('Obrigado! Sua avaliação foi registrada: 4/5.')).toBeVisible();
    await page.getByRole('link', { name: 'Rede Atende — início' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(dialog).toHaveCount(0);
  } finally {
    await management.close();
  }
});

test('trocar protocolo por atalho ou busca aguarda a escolha e preserva complemento ao cancelar', async ({
  page,
  context,
  browser,
}) => {
  await citizen(context);
  const current = await requestFixture(
    context,
    'Complemento fictício protegido ao trocar protocolo',
  );
  const other = await requestFixture(context, 'Outro protocolo fictício para consulta');
  const management = await browser.newContext();
  try {
    await manager(management);
    const dispatch = await management.request.patch(`/api/v1/requests/${current.id}`, {
      headers: await headers(management),
      data: {
        updates: { status: 'aguardando_informacoes' },
        note: 'Informe o complemento fictício para esta solicitação.',
      },
    });
    expect(dispatch.status(), await dispatch.text()).toBe(200);
    await page.goto(`/acompanhar?protocolo=${current.protocol}`);
    await page
      .getByLabel('Sua resposta')
      .fill('Complemento fictício permanece até decisão explícita.');
    const dialog = page.getByRole('dialog', { name: warning });
    await page.getByRole('button', { name: other.protocol, exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar preenchendo' }).click();
    await expect(page.getByRole('heading', { name: current.subject, exact: true })).toBeVisible();
    await expect(page.getByLabel('Sua resposta')).toHaveValue(
      'Complemento fictício permanece até decisão explícita.',
    );
    await page
      .getByRole('textbox', { name: 'Número de protocolo para consulta' })
      .fill(other.protocol);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar preenchendo' }).click();
    await expect(page.getByLabel('Sua resposta')).toHaveValue(
      'Complemento fictício permanece até decisão explícita.',
    );
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await dialog.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page.getByRole('heading', { name: other.subject, exact: true })).toBeVisible();
    await expect(page.getByLabel('Sua resposta')).toHaveCount(0);
    await page.getByRole('button', { name: current.protocol, exact: true }).click();
    await expect(page.getByLabel('Sua resposta')).toBeEmpty();
  } finally {
    await management.close();
  }
});

test('primeira alteração protege recarga e Voltar imediatamente sem aguardar outra interação', async ({
  page,
  context,
}) => {
  await citizen(context);
  await page.goto('/informacoes');
  await page.getByRole('link', { name: 'Pular para o conteúdo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page
    .locator('main')
    .getByRole('link', { name: 'Registrar solicitação', exact: true })
    .click();
  await page
    .getByLabel('Assunto Resumido')
    .fill('Primeira alteração fictícia protegida imediatamente');
  const reloadProtected = await page.evaluate(() => {
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    history.back();
    return unload.defaultPrevented;
  });
  expect(reloadProtected).toBe(true);
  const dialog = page.getByRole('dialog', { name: warning });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar preenchendo' }).click();
  await expect(page.getByLabel('Assunto Resumido')).toHaveValue(
    'Primeira alteração fictícia protegida imediatamente',
  );
  await expect(page).toHaveURL(/\/solicitar$/);
});
