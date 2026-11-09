/** Medição sintética isolada: build servido pelo Fastify e Vite medidos separadamente.
 * Uso: node --import tsx ARQUIVO PROJETO SAIDA [DIRETORIO_LIGHTHOUSE]
 * O banco e os cookies deste ensaio são descartáveis. Nenhuma credencial é salva no relatório. */
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const project = resolve(process.argv[2]),
  output = resolve(process.argv[3]),
  lhRoot = process.argv[4] ? resolve(process.argv[4]) : undefined;
process.chdir(project);
const dir = await mkdtemp(join(tmpdir(), 'rede-browser-benchmark-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'data'),
  UPLOAD_DIR: join(dir, 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
  COOKIE_SECURE: 'false',
});
const { seed } = await import(pathToFileURL(join(project, 'server/db/seed.ts')).href);
const { closeDatabase } = await import(pathToFileURL(join(project, 'server/db/database.ts')).href);
const { buildApp } = await import(pathToFileURL(join(project, 'server/app.ts')).href);
const { chromium } = await import(
  pathToFileURL(join(project, 'node_modules/playwright/index.mjs')).href
);
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
await seed();
const app = await buildApp({ serveFrontend: true });
const root = await app.listen({ host: '127.0.0.1', port: 0 });
const apiPort = String(new URL(root).port);
let vite: any;
const runs: any[] = [];
const version = JSON.parse(await readFile(join(project, 'package.json'), 'utf8')).version;
async function freePort(): Promise<number> {
  return new Promise((r) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => r(typeof a === 'object' && a ? a.port : 0));
    });
  });
}
try {
  const browser = await chromium.launch({
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    for (const mode of ['production', 'development']) {
      let base = root;
      if (mode === 'development') {
        const port = await freePort();
        base = 'http://127.0.0.1:' + port;
        vite = spawn(
          process.execPath,
          [
            join(project, 'node_modules/vite/bin/vite.js'),
            '--host',
            '127.0.0.1',
            '--port',
            String(port),
            '--strictPort',
          ],
          { cwd: project, env: { ...process.env, API_PORT: apiPort }, stdio: 'ignore' },
        );
        let ready = false;
        for (let i = 0; i < 100; i++) {
          try {
            if ((await fetch(base)).ok) {
              ready = true;
              break;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.ok(ready, 'Vite não iniciou');
      }
      const samples: any[] = [];
      for (const route of ['/', '/entrar'])
        for (let n = 0; n < 3; n++) {
          const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 1,
            isMobile: true,
            hasTouch: true,
            serviceWorkers: 'block',
          });
          const page = await context.newPage();
          const errors: string[] = [];
          page.on('pageerror', (e: any) => errors.push(e.message));
          await page.addInitScript(() => {
            (window as any).__bench = { lcp: 0, cls: 0 };
            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) (window as any).__bench.lcp = e.startTime;
            }).observe({ type: 'largest-contentful-paint', buffered: true });
            new PerformanceObserver((list) => {
              for (const e of list.getEntries() as any)
                if (!e.hadRecentInput) (window as any).__bench.cls += e.value;
            }).observe({ type: 'layout-shift', buffered: true });
          });
          const cdp = await context.newCDPSession(page);
          await cdp.send('Network.enable');
          await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
          // Slow 4G aproximado, 1,6 Mbps de descida, 750 Kbps subida, 150 ms; CPU 4x.
          if (mode === 'production')
            await cdp.send('Network.emulateNetworkConditions', {
              offline: false,
              latency: 150,
              downloadThroughput: 1_600_000 / 8,
              uploadThroughput: 750_000 / 8,
            });
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          await page.goto(base + route, { waitUntil: 'load' });
          await page
            .getByRole('heading', {
              name:
                route === '/'
                  ? 'Solicitações escolares, do registro ao acompanhamento.'
                  : 'Entrar no atendimento',
              exact: true,
            })
            .waitFor();
          await page.waitForLoadState('networkidle');
          const metric = await page.evaluate(() => ({
            ...(window as any).__bench,
            resources: performance.getEntriesByType('resource').map((r: any) => ({
              url: new URL(r.name).pathname,
              transferSize: r.transferSize,
              encodedBodySize: r.encodedBodySize,
              decodedBodySize: r.decodedBodySize,
              duration: r.duration,
              initiatorType: r.initiatorType,
            })),
          }));
          assert.deepEqual(errors, []);
          samples.push({ route, iteration: n + 1, ...metric });
          await context.close();
        }
      runs.push({ mode, samples });
      await writeFile(
        output,
        JSON.stringify(
          {
            version,
            node: process.version,
            method:
              'Em andamento: produção com rede móvel, desenvolvimento em loopback, CPU 4x; amostras laboratoriais.',
            runs,
          },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({
          mode,
          version,
          samples: samples.map((s) => ({
            route: s.route,
            lcp: s.lcp,
            cls: s.cls,
            jsBytes: s.resources
              .filter(
                (r: any) =>
                  r.url.endsWith('.js') || r.url.endsWith('.tsx') || r.url.endsWith('.ts'),
              )
              .reduce((v: number, r: any) => v + r.decodedBodySize, 0),
          })),
        }),
      );
    }
  } finally {
    await browser.close();
  }
  if (lhRoot) {
    const { default: lighthouse } = await import(
      pathToFileURL(join(lhRoot, 'node_modules/lighthouse/core/index.js')).href
    );
    const { launch } = await import(
      pathToFileURL(join(lhRoot, 'node_modules/chrome-launcher/dist/index.js')).href
    );
    const chrome = await launch({
      chromePath,
      chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const lighthouseRuns = [];
      for (const route of ['/', '/entrar'])
        for (let n = 0; n < 3; n++) {
          const result = await lighthouse(root + route, {
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
          const summary = {
            route,
            iteration: n + 1,
            lighthouseVersion: lhr.lighthouseVersion,
            requestedUrl: lhr.requestedUrl,
            finalDisplayedUrl: lhr.finalDisplayedUrl,
            fetchTime: lhr.fetchTime,
            userAgent: lhr.userAgent,
            environment: lhr.environment,
            configSettings: lhr.configSettings,
            categories: Object.fromEntries(
              Object.entries(lhr.categories).map(([k, v]: any) => [k, { score: v.score }]),
            ),
            audits: Object.fromEntries(
              Object.entries(lhr.audits).filter(([k]) =>
                [
                  'largest-contentful-paint',
                  'cumulative-layout-shift',
                  'total-blocking-time',
                  'first-contentful-paint',
                  'speed-index',
                  'total-byte-weight',
                  'network-requests',
                  'unused-javascript',
                  'render-blocking-insight',
                  'errors-in-console',
                  'button-name',
                ].includes(k),
              ),
            ),
            runtimeError: lhr.runtimeError ?? null,
            runWarnings: lhr.runWarnings,
          };
          lighthouseRuns.push(summary);
          console.log(
            JSON.stringify({
              lighthouse: route,
              iteration: n + 1,
              performance: summary.categories.performance.score,
              runtimeError: summary.runtimeError,
            }),
          );
        }
      runs.push({ mode: 'lighthouse-production', samples: lighthouseRuns });
    } finally {
      await chrome.kill();
    }
  }
  await writeFile(
    output,
    JSON.stringify(
      {
        version,
        node: process.version,
        method:
          'Três navegações frias por rota/modo; Chromium, viewport 390×844, SW bloqueado na medição Playwright, CPU 4x; produção com rede 1,6 Mbps/750 Kbps/150 ms, desenvolvimento em loopback sem limitação de rede. Lighthouse usa simulação móvel padrão e mede apenas produção. LCP/CLS laboratoriais, sem INP de campo. Seed e banco descartáveis.',
        runs,
      },
      null,
      2,
    ),
  );
} finally {
  if (vite) {
    const exited = new Promise((r) => vite.once('exit', r));
    vite.kill('SIGTERM');
    await exited;
  }
  await app.close();
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
}
