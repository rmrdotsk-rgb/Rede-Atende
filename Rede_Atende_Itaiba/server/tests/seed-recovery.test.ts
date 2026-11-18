import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, chmod, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'rede-atende-demo-access-'));
const accessFile = join(directory, 'access.txt');
const originalPassword = randomBytes(24).toString('base64url');
const newPassword = randomBytes(24).toString('base64url');
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(directory, 'data'),
  UPLOAD_DIR: join(directory, 'uploads'),
  SEED_ACCESS_FILE: accessFile,
});
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = originalPassword;
const { seed } = await import('../db/seed');
const { transaction, closeDatabase } = await import('../db/database');
const { verifyPassword } = await import('../auth');
const { recordDemoAccess } = await import('../db/demoAccess');
const { buildApp } = await import('../app');
const accounts = () =>
  transaction((sql) =>
    sql.query<{ id: string; email: string; role: string; password_hash: string }>(
      'SELECT id,email,role,password_hash FROM users ORDER BY email',
    ),
  );
before(seed);
after(async () => {
  await closeDatabase();
  await rm(directory, { recursive: true, force: true });
});

test('senha inválida na instalação inicial não deixa contas parcialmente criadas', () => {
  const code = `
    const { seed } = await import('./server/db/seed.ts');
    const { transaction, closeDatabase } = await import('./server/db/database.ts');
    let rejected = false;
    try { await seed(); } catch { rejected = true; }
    const result = await transaction(sql => sql.query('SELECT count(*)::int AS total FROM users'));
    await closeDatabase();
    if (!rejected || result.rows[0].total !== 0) process.exit(1);
  `;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', code],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        DATA_DIR: join(directory, 'invalid-data'),
        SEED_ACCESS_FILE: join(directory, 'invalid-access.txt'),
        SEED_AUDITOR_PASSWORD: 'curta',
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
});

test('setup repetido preserva IDs, hashes e o arquivo das senhas realmente cadastradas', async () => {
  const before = (await accounts()).rows;
  const file = await readFile(accessFile, 'utf8');
  process.env.SEED_GESTOR_PASSWORD = newPassword;
  await seed();
  assert.deepEqual((await accounts()).rows, before);
  assert.equal(await readFile(accessFile, 'utf8'), file);
  assert.equal(
    await verifyPassword(
      originalPassword,
      before.find((user) => user.role === 'gestor')!.password_hash,
    ),
    true,
  );
  assert.equal(
    await verifyPassword(newPassword, before.find((user) => user.role === 'gestor')!.password_hash),
    false,
  );
});

test('arquivo privado limita permissões e não inventa acessos se a cópia local for perdida', async () => {
  await chmod(accessFile, 0o644);
  await recordDemoAccess([{ role: 'cidadao', password: originalPassword }]);
  if (process.platform !== 'win32') assert.equal((await stat(accessFile)).mode & 0o777, 0o600);
  const saved = await readFile(accessFile, 'utf8');
  assert.equal(saved.match(/cidadao: cidadao@/g)?.length, 1);
  await rm(accessFile);
  await seed();
  await assert.rejects(stat(accessFile), { code: 'ENOENT' });
});

test('reset exige confirmação explícita e se limita às contas locais de demonstração', async () => {
  const before = (await accounts()).rows;
  for (const args of [
    ['--email', 'gestor@redeatende.invalid'],
    ['--email', 'pessoa@exemplo.invalid', '--confirm'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/reset-demo-password.mts', ...args],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.ok(!(result.stdout + result.stderr).includes(newPassword));
  }
  assert.deepEqual((await accounts()).rows, before);
});

test('reset com banco ocupado é recusado antes de alterar a senha', async () => {
  const before = (await accounts()).rows;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/reset-demo-password.mts',
      '--email',
      'gestor@redeatende.invalid',
      '--confirm',
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Pare a API/);
  assert.deepEqual((await accounts()).rows, before);
});

test('reset faz backup, revoga somente a sessão alvo e preserva solicitações, IDs e perfis', async () => {
  const app = await buildApp();
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'X-Requested-With': 'RedeAtende' },
    payload: { email: 'gestor@redeatende.invalid', password: originalPassword },
  });
  assert.equal(login.statusCode, 200);
  const oldCookie = `ra_session=${login.cookies[0].value}`;
  const before = (await accounts()).rows;
  const requestsBefore = await transaction((sql) =>
    sql.query('SELECT id,data FROM requests ORDER BY id'),
  );
  await app.close();
  await closeDatabase();
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/reset-demo-password.mts',
      '--email',
      'gestor@redeatende.invalid',
      '--confirm',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!(result.stdout + result.stderr).includes(newPassword));
  const after = (await accounts()).rows;
  assert.deepEqual(
    after.map(({ id, email, role }) => ({ id, email, role })),
    before.map(({ id, email, role }) => ({ id, email, role })),
  );
  for (const user of after)
    assert.equal(
      await verifyPassword(
        user.role === 'gestor' ? newPassword : originalPassword,
        user.password_hash,
      ),
      true,
    );
  assert.deepEqual(
    await transaction((sql) => sql.query('SELECT id,data FROM requests ORDER BY id')),
    requestsBefore,
  );
  const audit = await transaction((sql) =>
    sql.query<{ data: { backup: string } }>(
      "SELECT data FROM audit_log WHERE action='demo.password.reset'",
    ),
  );
  assert.equal(audit.rows.length, 1);
  const backup = audit.rows[0].data.backup;
  assert.ok((await readdir(backup)).includes('manifest.sha256.json'));
  assert.ok(!(await readFile(join(backup, 'database.json'), 'utf8')).includes(newPassword));
  const restarted = await buildApp();
  try {
    const session = await restarted.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: oldCookie },
    });
    assert.equal(session.json().user, null);
    const fresh = await restarted.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'X-Requested-With': 'RedeAtende' },
      payload: { email: 'gestor@redeatende.invalid', password: newPassword },
    });
    assert.equal(fresh.statusCode, 200);
    assert.equal(fresh.json().user.role, 'gestor');
    assert.ok((await readFile(accessFile, 'utf8')).includes(newPassword));
  } finally {
    await restarted.close();
    await rm(backup, { recursive: true, force: true });
  }
});
