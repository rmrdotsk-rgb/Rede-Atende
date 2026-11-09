import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const dir = await mkdtemp(join(tmpdir(), 'rede-atende-production-'));
const env = {
  ...process.env,
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'data'),
  UPLOAD_DIR: join(dir, 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
  HOST: '127.0.0.1',
  SEED_GESTOR_PASSWORD: 'ProducaoSomenteTeste-123456',
  SEED_CIDADAO_PASSWORD: 'ProducaoSomenteTeste-123456',
};
const testPort = await new Promise<number>((resolve) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => {
    const address = s.address();
    s.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
  });
});
let child: ReturnType<typeof spawn> | undefined;
const run = (file: string, ...args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn(process.execPath, ['--import', 'tsx', file, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout?.on('data', (b) => (out += b));
    p.stderr?.on('data', (b) => (out += b));
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(out))));
  });
try {
  await run('server/db/seed.ts');
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/start.mjs'], {
    env: { ...env, PORT: String(testPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = `http://127.0.0.1:${testPort}`;
  let last = '';
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const r = await fetch(url + '/api/v1/health');
      if (r.ok) break;
      last = await r.text();
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const index = await fetch(url);
  assert.equal(index.status, 200, last);
  assert.match(index.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  const html = await index.text();
  assert.ok(html.includes('Rede Atende'));
  assert.match(html, /<title>Rede Atende \| Demandas escolares de Itaíba<\/title>/);
  assert.match(index.headers.get('x-robots-tag') ?? '', /noindex/);
  const privateHtml = await fetch(url + '/acompanhar?protocolo=EDU-2026-999999');
  const privateText = await privateHtml.text();
  assert.match(privateText, /<title>Meus protocolos \| Rede Atende<\/title>/);
  assert.ok(!privateText.includes('EDU-2026-999999'));
  const robots = await fetch(url + '/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow: \/$/m);

  const asset = html.match(/src="([^\"]+\.js)"/)!;
  assert.equal((await fetch(url + asset[1])).status, 200);
  for (const path of [
    '/admin/demandas',
    '/solicitar',
    '/manifest.webmanifest',
    '/sw.js',
    '/offline.html',
    '/app-icon-192.png',
    '/app-icon-512.png',
    '/apple-touch-icon.png',
  ])
    assert.equal((await fetch(url + path)).status, 200, path);
  assert.equal((await fetch(url + '/.env')).status, 404);
  assert.equal((await fetch(url + '/api/v1/not-found')).status, 404);
  const spec = await fetch(url + '/api/v1/openapi.json');
  assert.equal(spec.status, 200);
  assert.equal((await spec.json()).openapi, '3.1.0');
  const denied = await fetch(url + '/api/v1/requests');
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
  console.log(
    'Servidor local: start, frontend compilado, API, CSP, arquivos públicos, rotas SPA, OpenAPI e bloqueio de dados privados aprovados.',
  );
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url);
    await page
      .getByRole('heading', {
        name: 'Solicitações escolares, do registro ao acompanhamento.',
        exact: true,
      })
      .waitFor();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls: string[] = [];
      for (const name of names)
        for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
      return urls;
    });
    assert.ok(cached.some((s) => s.endsWith('/offline.html')));
    assert.ok(!cached.some((s) => s.includes('/api/')));
    await context.setOffline(true);
    await page.reload();
    assert.match(await page.locator('h1').innerText(), /Sem conexão/);
    await context.close();
    console.log(
      'PWA: service worker do build registrado, cache somente público e página offline sem confirmação de envio aprovados.',
    );
  } finally {
    await browser.close();
  }

  await new Promise<void>((resolve) => {
    child!.once('exit', () => resolve());
    child!.kill('SIGTERM');
  });
  child = undefined;
  await run('server/db/backup.ts', join(dir, 'backup'));
  console.log('Backup lógico e de anexos executado com API parada.');
} finally {
  child?.kill('SIGTERM');
  await rm(dir, { recursive: true, force: true });
}
