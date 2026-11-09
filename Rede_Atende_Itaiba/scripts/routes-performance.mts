/** Production-only mobile laboratory. Never writes a user's database or saves authentication. */
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const project = resolve(process.argv[2]),
  output = resolve(process.argv[3]);
const lighthouseRoot = process.argv[4] ? resolve(process.argv[4]) : undefined;
process.chdir(project);
const temporary = await mkdtemp(join(tmpdir(), 'rede-routes-performance-'));
const password = 'Ficticio-Benchmark-123456';
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(temporary, 'db'),
  UPLOAD_DIR: join(temporary, 'uploads'),
  SEED_ACCESS_FILE: join(temporary, 'access.txt'),
  COOKIE_SECURE: 'false',
});
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = password;
const { seed } = await import(pathToFileURL(join(project, 'server/db/seed.ts')).href);
const { closeDatabase } = await import(pathToFileURL(join(project, 'server/db/database.ts')).href);
const { buildApp } = await import(pathToFileURL(join(project, 'server/app.ts')).href);
const { chromium } = await import(
  pathToFileURL(join(project, 'node_modules/playwright/index.mjs')).href
);
const version = JSON.parse(await readFile(join(project, 'package.json'), 'utf8')).version;
await seed();
const app = await buildApp({ serveFrontend: true });
const base = await app.listen({ host: '127.0.0.1', port: 0 });
const rows: any[] = [],
  lighthouse: any[] = [];
const routes = [
  ['/', null],
  ['/entrar', null],
  ['/informacoes', null],
  ['/solicitar', 'cidadao'],
  ['/acompanhar', 'cidadao'],
  ['/admin', 'gestor'],
  ['/admin/demandas', 'gestor'],
  ['/admin/triagem', 'gestor'],
  ['/admin/agenda', 'gestor'],
  ['/admin/ordens', 'gestor'],
  ['/admin/prazos', 'gestor'],
  ['/admin/unidades', 'gestor'],
  ['/admin/relatorios', 'gestor'],
  ['/admin/integracoes', 'gestor'],
] as const;
const headings: Record<string, string> = {
  '/': 'Solicitações escolares, do registro ao acompanhamento.',
  '/entrar': 'Entrar no atendimento',
  '/informacoes': 'Como usar o Rede Atende',
  '/solicitar': 'Registrar Nova Solicitação Educacional',
  '/acompanhar': 'Acompanhamento de Solicitações Educacionais',
  '/admin': 'Resumo dos atendimentos',
  '/admin/demandas': 'Demandas registradas',
  '/admin/triagem': 'Triagem e encaminhamento',
  '/admin/agenda': 'Agenda e vistorias',
  '/admin/ordens': 'Ordens de serviço',
  '/admin/prazos': 'Prazos e prioridades',
  '/admin/unidades': 'Unidades escolares de Itaíba',
  '/admin/relatorios': 'Relatórios e indicadores de atendimento',
  '/admin/integracoes': 'Integração SEI simulada',
};
const method = {
  production: true,
  browser: 'Chromium',
  viewport: { width: 390, height: 844 },
  cpuSlowdown: 4,
  network: { downBitsPerSecond: 1600000, upBitsPerSecond: 750000, latencyMs: 150 },
  cache:
    '3 fresh contexts per route; cold navigation then warm reload in each; service workers blocked; charts awaited and 700ms stabilization after network idle',
  caveats: [
    'Synthetic measurements, not field INP or field percentiles.',
    'p95 with n=3 is exploratory and is the largest sample.',
    'Long-task blocking is the sum of max(duration-50,0) up to readiness; it is not Lighthouse TBT.',
    'Authentication is prepared outside the measured navigation; no cookie or token is persisted.',
    'Backend volumes 100/1000/5000 are measured separately, without browser/network.',
  ],
};
async function save() {
  await writeFile(
    output,
    JSON.stringify(
      {
        version,
        node: process.version,
        date: new Date().toISOString(),
        method,
        runs: rows,
        lighthouse,
      },
      null,
      2,
    ) + '\n',
  );
}
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const states: Record<string, any> = {};
  for (const role of ['cidadao', 'gestor']) {
    const context = await browser.newContext();
    const response = await context.request.post(base + '/api/v1/auth/login', {
      headers: { 'X-Requested-With': 'RedeAtende' },
      data: { email: role + '@redeatende.invalid', password },
    });
    assert.equal(response.status(), 200);
    states[role] = await context.storageState();
    await context.close();
  }
  for (const [route, role] of routes) {
    for (let iteration = 1; iteration <= 3; iteration++) {
      const context = await browser.newContext({
        viewport: method.viewport,
        locale: 'pt-BR',
        timezoneId: 'America/Recife',
        serviceWorkers: 'block',
        ...(role ? { storageState: states[role] } : {}),
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e: any) => errors.push(e.message));
      await page.addInitScript(() => {
        const w = window as any;
        w.__laboratory = { lcpMs: 0, cls: 0, longTasks: [], events: [] };
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) w.__laboratory.lcpMs = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as any)
            if (!e.hadRecentInput) w.__laboratory.cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            w.__laboratory.longTasks.push({ startMs: e.startTime, durationMs: e.duration });
        }).observe({ type: 'longtask', buffered: true });
        if (PerformanceObserver.supportedEntryTypes.includes('event'))
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as any)
              if (e.interactionId)
                w.__laboratory.events.push({
                  name: e.name,
                  durationMs: e.duration,
                  interactionId: e.interactionId,
                });
          }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as any);
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: 1600000 / 8,
        uploadThroughput: 750000 / 8,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      for (const cache of ['cold', 'warm']) {
        const started = performance.now();
        if (cache === 'cold') await page.goto(base + route, { waitUntil: 'load' });
        else await page.reload({ waitUntil: 'load' });
        await page.getByRole('heading', { name: headings[route], exact: true }).waitFor();
        if (route === '/admin' || route === '/admin/relatorios')
          await page.locator('.recharts-wrapper').first().waitFor({ state: 'visible' });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(700);
        const readyMs = performance.now() - started;
        const data = await page.evaluate(() => {
          const w = window as any;
          return {
            ...w.__laboratory,
            resources: performance.getEntriesByType('resource').map((r: any) => ({
              path: new URL(r.name).pathname,
              transferBytes: r.transferSize,
              encodedBytes: r.encodedBodySize,
              decodedBytes: r.decodedBodySize,
              durationMs: r.duration,
              initiator: r.initiatorType,
            })),
          };
        });
        const js = data.resources.filter((r: any) => r.path.endsWith('.js')),
          css = data.resources.filter((r: any) => r.path.endsWith('.css'));
        rows.push({
          route,
          role,
          iteration,
          cache,
          readyMs,
          ...data,
          jsDecodedBytes: js.reduce((n: number, r: any) => n + r.decodedBytes, 0),
          jsTransferBytes: js.reduce((n: number, r: any) => n + r.transferBytes, 0),
          cssDecodedBytes: css.reduce((n: number, r: any) => n + r.decodedBytes, 0),
          blockingLongTasksMs: data.longTasks.reduce(
            (n: number, r: any) => n + Math.max(0, r.durationMs - 50),
            0,
          ),
          errors,
        });
        assert.deepEqual(errors, [], route);
      }
      if (route === '/admin/demandas') {
        const started = performance.now();
        const detail = page
          .getByRole('article')
          .first()
          .getByRole('button', { name: /Visualizar detalhes/ });
        await detail.click();
        await page.getByRole('dialog').waitFor();
        const detailReadyMs = performance.now() - started;
        await page.keyboard.press('Escape');
        const search = page.getByRole('textbox', { name: 'Buscar demandas' });
        const searchStart = performance.now();
        const response = page.waitForResponse(
          (r: any) =>
            r.url().includes('/api/v1/requests/search?') && r.request().method() === 'GET',
        );
        await search.fill('Busca fictícia sem resultados');
        await response;
        await page.waitForLoadState('networkidle');
        rows.at(-1).interactions = {
          detailReadyMs,
          searchReadyMs: performance.now() - searchStart,
          events: await page.evaluate(() => (window as any).__laboratory.events),
        };
      }
      await context.close();
      await save();
    }
    console.log(
      JSON.stringify({
        route,
        version,
        samples: rows
          .filter((r) => r.route === route)
          .map((r) => ({
            cache: r.cache,
            lcpMs: r.lcpMs,
            readyMs: Math.round(r.readyMs),
            jsDecodedBytes: r.jsDecodedBytes,
            cls: r.cls,
          })),
      }),
    );
  }
} catch (error) {
  await save();
  await app.close();
  await closeDatabase();
  await rm(temporary, { recursive: true, force: true });
  throw error;
} finally {
  await browser.close();
}
try {
  if (lighthouseRoot) {
    const { default: runLighthouse } = await import(
      pathToFileURL(join(lighthouseRoot, 'node_modules/lighthouse/core/index.js')).href
    );
    const { launch } = await import(
      pathToFileURL(join(lighthouseRoot, 'node_modules/chrome-launcher/dist/index.js')).href
    );
    const chrome = await launch({
      chromePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      for (const route of ['/', '/entrar', '/informacoes'])
        for (let iteration = 1; iteration <= 3; iteration++) {
          const result = await runLighthouse(base + route, {
            port: chrome.port,
            logLevel: 'error',
            output: 'json',
            onlyCategories: ['performance', 'accessibility', 'best-practices'],
            formFactor: 'mobile',
            screenEmulation: {
              mobile: true,
              width: 390,
              height: 844,
              deviceScaleFactor: 1,
              disabled: false,
            },
          });
          const lhr = result.lhr;
          lighthouse.push({
            route,
            iteration,
            version: lhr.lighthouseVersion,
            settings: lhr.configSettings,
            environment: lhr.environment,
            categories: Object.fromEntries(
              Object.entries(lhr.categories).map(([k, v]: any) => [k, v.score]),
            ),
            metrics: Object.fromEntries(
              [
                'largest-contentful-paint',
                'cumulative-layout-shift',
                'total-blocking-time',
                'speed-index',
              ].map((k) => [k, lhr.audits[k].numericValue]),
            ),
            failedAudits: Object.entries(lhr.audits)
              .filter(([, v]: any) => v.score === 0 && v.details?.type === 'table')
              .map(([id, v]: any) => ({ id, title: v.title })),
            warnings: lhr.runWarnings,
            runtimeError: lhr.runtimeError ?? null,
          });
          assert.equal(lhr.runtimeError, undefined);
          await save();
          console.log(
            JSON.stringify({
              lighthouse: route,
              iteration,
              performance: lhr.categories.performance.score,
              accessibility: lhr.categories.accessibility.score,
            }),
          );
        }
    } finally {
      await chrome.kill();
    }
  }
} finally {
  await save();
  await app.close();
  await closeDatabase();
  await rm(temporary, { recursive: true, force: true });
}
