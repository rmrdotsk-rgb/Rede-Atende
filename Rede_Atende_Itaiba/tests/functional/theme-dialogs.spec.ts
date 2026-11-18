import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

for (const width of [390, 1366])
  for (const theme of ['light', 'dark', 'high-contrast'])
    test(`detalhes da demanda e guia de acesso em ${theme}, ${width}px`, async ({
      page,
      context,
    }) => {
      const actors = JSON.parse(await readFile(process.env.E2E_AUTH_FILE!, 'utf8'));
      await context.addCookies(actors.gestor.cookies);
      await context.addInitScript(
        (value) => localStorage.setItem('redeatende_color_theme', value),
        theme,
      );
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/demandas');
      await page
        .getByRole('button', { name: /Visualizar detalhes/ })
        .first()
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      let result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.goto('/entrar');
      await page.getByRole('button', { name: 'Conhecer a demonstração', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
