import { test, expect } from '@playwright/test';

test('informações municipais citam apenas as fontes externas e declaram limites', async ({
  page,
}) => {
  await page.goto('/informacoes');
  await expect(page.getByRole('heading', { name: 'Como usar o Rede Atende' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Desafio oficial de Itaíba/ })).toHaveAttribute(
    'href',
    /desafios\.pe\.gov\.br/,
  );
  await expect(page.getByText(/não encaminha solicitações reais para a Prefeitura/)).toBeVisible();
  await expect(page.getByText('educacao@itaiba.pe.gov.br')).toBeVisible();
});

test('rota inexistente explica o erro e permite voltar', async ({ page }) => {
  await page.goto('/endereco-inexistente');
  await expect(page.getByRole('heading', { name: 'Este endereço não existe.' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao início' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('formulário não seleciona escola automaticamente e mantém escolha consciente', async ({
  page,
}) => {
  await page.goto('/entrar?voltar=%2Fsolicitar');
  await page.getByLabel('E-mail de acesso').fill('cidadao@redeatende.invalid');
  await page.getByLabel('Senha (mínimo 12 caracteres)').fill('SomenteTeste-123456789');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByLabel('Unidade Escolar')).toHaveValue('');
  await page.getByLabel('Unidade Escolar').selectOption('esc-003');
  await expect(page.getByLabel('Unidade Escolar')).toHaveValue('esc-003');
});
