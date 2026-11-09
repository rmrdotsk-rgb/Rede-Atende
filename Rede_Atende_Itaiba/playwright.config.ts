import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
process.env.E2E_AUTH_FILE ??= join(tmpdir(), 'rede-atende-auth-' + randomUUID() + '.json');
const port = process.env.PLAYWRIGHT_PORT ?? '3100';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 45000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  outputDir: process.env.E2E_OUTPUT_DIR ?? 'test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.E2E_RESULTS_FILE ?? 'test-results/3.9/e2e-results.json' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    timezoneId: 'America/Recife',
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webkit',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit', launchOptions: { args: [] } },
    },
  ],
  webServer: [
    {
      command: 'node --import tsx server/tests/browser-server.ts',
      url: 'http://127.0.0.1:3101/api/v1/health',
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: `npm run dev:web -- --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`,
      env: { API_PORT: '3101' },
      timeout: 30000,
      reuseExistingServer: false,
    },
  ],
});
