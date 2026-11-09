import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('trocar categoria conserva o filtro quando um debounce anterior vence antes do render', async ({
  page,
  context,
}) => {
  const sessions = JSON.parse(await readFile(process.env.E2E_AUTH_FILE!, 'utf8'));
  await context.addCookies(sessions.gestor.cookies);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/demandas');
  await expect(page.getByRole('heading', { name: 'Demandas registradas' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Consultando demandas...' })).toHaveCount(
    0,
  );
  const result = await context.request.get('/api/v1/requests/search?view=summary');
  expect(result.status()).toBe(200);
  const target = (await result.json()).items[0];
  const category = target.category === 'infraestrutura' ? 'transporte_escolar' : 'infraestrutura';

  await page.evaluate(() => {
    const schedule = window.setTimeout.bind(window);
    const cancel = window.clearTimeout.bind(window);
    const replace = window.history.replaceState.bind(window.history);
    const pending = new Map<number, () => void>();
    const state = { pending: 0, released: false };
    (window as unknown as { filterRace: typeof state }).filterRace = state;
    // Reproduz a janela observada no trace: a URL já recebeu a categoria,
    // mas um callback de debounce do render anterior vence antes do próximo commit.
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay !== 180 || typeof callback !== 'function')
        return schedule(callback, delay, ...args);
      const id = schedule(() => {}, 60000);
      pending.set(id, () => {
        cancel(id);
        callback(...args);
      });
      state.pending = pending.size;
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id !== undefined) pending.delete(id);
      state.pending = pending.size;
      cancel(id);
    }) as typeof window.clearTimeout;
    window.history.replaceState = (data, unused, url) => {
      replace(data, unused, url);
      if (state.released || !new URL(location.href).searchParams.has('categoria')) return;
      state.released = true;
      window.setTimeout = schedule;
      window.clearTimeout = cancel;
      window.history.replaceState = replace;
      const due = [...pending.values()];
      pending.clear();
      for (const run of due) run();
    };
  });
  const input = page.getByRole('textbox', { name: 'Buscar demandas' });
  await input.fill(target.protocol);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { filterRace: { pending: number } }).filterRace.pending,
      ),
    )
    .toBeGreaterThan(0);
  await page.getByLabel('Filtrar por categoria').selectOption(category);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { filterRace: { released: boolean } }).filterRace.released,
      ),
    )
    .toBe(true);
  await expect(page.getByLabel('Filtrar por categoria')).toHaveValue(category);
  await expect(input).toHaveValue(target.protocol);
  await expect.poll(() => new URL(page.url()).searchParams.get('categoria')).toBe(category);
  await expect.poll(() => new URL(page.url()).searchParams.get('busca')).toBe(target.protocol);
  await expect(
    page.getByText('Nenhuma demanda encontrada com os critérios informados.', { exact: true }),
  ).toBeVisible();
});
