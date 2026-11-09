// Infraestrutura isolada para Playwright: jamais usa a base local do usuário.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const managedDirectory = process.env.E2E_TEST_DIRECTORY;
const testDirectory = managedDirectory ?? (await mkdtemp(join(tmpdir(), 'rede-atende-browser-')));
process.env.SEED_ACCESS_FILE = join(testDirectory, 'access.txt');
process.env.DB_MODE = 'embedded';
process.env.DATA_DIR = join(testDirectory, 'data');
process.env.UPLOAD_DIR = join(testDirectory, 'uploads');
process.env.PORT = process.env.E2E_API_PORT ?? '3101';
process.env.HOST = '127.0.0.1';
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = 'SomenteTeste-123456789';
const { seed } = await import('../db/seed');
await seed();
// Dedicated actor for 3.9 regressions; does not consume another suite's login quota.
const { transaction } = await import('../db/database');
await transaction((sql) =>
  sql.query(
    "INSERT INTO users(id,email,name,password_hash,role) SELECT 'e2e-gestor-39','gestor-39@redeatende.invalid','Gestor Fictício 39',password_hash,role FROM users WHERE email='gestor@redeatende.invalid' ON CONFLICT DO NOTHING",
  ),
);
const { buildApp } = await import('../app');
const { closeDatabase } = await import('../db/database');
const app = await buildApp({ logger: process.env.E2E_LOG === 'true' });
// Genuine sessions issued by the normal login route from a second synthetic client.
// Keeps independent UI suites from consuming one shared IP's 30-login allowance.
let authFileCreated = false;
if (process.env.E2E_AUTH_FILE) {
  const actors: Record<string, unknown> = {};
  for (const [name, role] of [
    ['cidadao', 'cidadao'],
    ['gestor', 'gestor'],
    ['logout', 'cidadao'],
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '127.0.0.2',
      headers: { 'X-Requested-With': 'RedeAtende' },
      payload: { email: role + '@redeatende.invalid', password: 'SomenteTeste-123456789' },
    });
    if (response.statusCode !== 200) throw new Error('Unable to prepare isolated browser actor.');
    actors[name] = {
      cookies: [
        {
          name: 'ra_session',
          value: response.cookies[0].value,
          domain: '127.0.0.1',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
    };
  }
  await writeFile(process.env.E2E_AUTH_FILE, JSON.stringify(actors), { mode: 0o600, flag: 'wx' });
  authFileCreated = true;
}

if (process.env.E2E_DIAGNOSTIC === 'true')
  app.addHook('onError', async (req, _reply, error) => {
    console.error(
      'E2E_DIAGNOSTIC',
      req.routeOptions.url,
      error.name,
      error.message,
      error.stack?.split('\n').slice(1, 6),
    );
  });
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT) });
for (const s of ['SIGINT', 'SIGTERM'])
  process.on(s, async () => {
    await app.close();
    await closeDatabase();
    if (!managedDirectory) await rm(testDirectory, { recursive: true, force: true });
    if (authFileCreated) await rm(process.env.E2E_AUTH_FILE!, { force: true });
    process.exit(0);
  });
