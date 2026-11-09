/** Validação visual mínima de rotas e informações públicas no sistema autenticado.
 * A suíte anterior dependia de estado editável em localStorage e deixou de representar
 * a arquitetura com API e controle de acesso do projeto. */
import { test, expect } from '@playwright/test';

const PUBLIC_ROUTES = [
  ['/', 'Solicitações escolares, do registro ao acompanhamento.'],
  ['/entrar', 'Entrar no atendimento'],
  ['/informacoes', 'Como usar o Rede Atende'],
] as const;
const PROTECTED_ROUTES = [
  '/solicitar',
  '/acompanhar',
  '/admin',
  '/admin/demandas',
  '/admin/triagem',
  '/admin/unidades',
  '/admin/ordens',
  '/admin/prazos',
  '/admin/agenda',
  '/admin/relatorios',
  '/admin/integracoes',
];

test('rotas públicas exibem conteúdo e identidade acadêmica sem erro JavaScript', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [route, heading] of PUBLIC_ROUTES) {
    await page.goto(route);
    // A conexão inicial também usa <main>; aguarde o conteúdo real da rota.
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText('educacao@itaiba.pe.gov.br')).toBeVisible();
  await expect(page.getByText(/não encaminha solicitações reais para a Prefeitura/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('rotas existentes não dão acesso anônimo a ações protegidas', async ({ page }) => {
  for (const route of PROTECTED_ROUTES) {
    await page.goto(route);
    await expect(
      page.getByRole('heading', { name: 'Entrar no atendimento', exact: true }),
    ).toBeVisible();
  }
  const protectedApi = await page.request.get('/api/v1/requests');
  expect(protectedApi.status()).toBe(401);
  const forbiddenMutation = await page.request.post('/api/v1/work-orders', {
    headers: { 'X-Requested-With': 'RedeAtende' },
    data: { title: 'Tentativa não autenticada' },
  });
  expect(forbiddenMutation.status()).toBe(401);
});
