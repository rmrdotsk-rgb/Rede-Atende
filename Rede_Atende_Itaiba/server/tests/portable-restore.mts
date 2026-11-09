import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const dir = await mkdtemp(join(tmpdir(), 'rede-atende-restore-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'db'),
  UPLOAD_DIR: join(dir, 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
});
const password = 'Somente-Restauracao-123456';
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = password;
const { seed } = await import('../db/seed');
const { buildApp } = await import('../app');
const { transaction, closeDatabase } = await import('../db/database');
const app = await buildApp();
try {
  await seed();
  const before = await transaction((sql) =>
      sql.query('SELECT id,email,password_hash FROM users ORDER BY id'),
    ),
    access = await readFile(join(dir, 'access.txt'), 'utf8'),
    beforeRequests = await transaction((sql) => sql.query('SELECT data FROM requests ORDER BY id'));
  await seed();
  assert.deepEqual(
    (await transaction((sql) => sql.query('SELECT id,email,password_hash FROM users ORDER BY id')))
      .rows,
    before.rows,
  );
  assert.equal(await readFile(join(dir, 'access.txt'), 'utf8'), access);
  assert.deepEqual(
    (await transaction((sql) => sql.query('SELECT data FROM requests ORDER BY id'))).rows,
    beforeRequests.rows,
  );
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'X-Requested-With': 'RedeAtende' },
    payload: { email: 'cidadao@redeatende.invalid', password },
  });
  assert.equal(login.statusCode, 200, login.body);
  const headers = {
      cookie: 'ra_session=' + login.cookies[0].value,
      'X-CSRF-Token': login.json().csrf,
      'X-Requested-With': 'RedeAtende',
    },
    id = (beforeRequests.rows[0].data as any).id;
  const bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url)),
    boundary = 'Restauracao' + randomUUID(),
    payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="restauracao.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
  const uploaded = await app.inject({
    method: 'POST',
    url: `/api/v1/requests/${id}/attachments`,
    headers: {
      ...headers,
      'Idempotency-Key': randomUUID(),
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
    },
    payload,
  });
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const fileId = uploaded.json().id;
  const original = await app.inject({ method: 'GET', url: '/api/v1/state', headers });
  assert.equal(original.statusCode, 200, original.body);
  await closeDatabase();
  await cp(join(dir, 'db'), join(dir, 'backup-db'), { recursive: true });
  await cp(join(dir, 'uploads'), join(dir, 'backup-uploads'), { recursive: true });
  // Somente este diretório temporário descartável é substituído pelo ensaio.
  await rm(join(dir, 'db'), { recursive: true });
  await rm(join(dir, 'uploads'), { recursive: true });
  await cp(join(dir, 'backup-db'), join(dir, 'db'), { recursive: true });
  await cp(join(dir, 'backup-uploads'), join(dir, 'uploads'), { recursive: true });
  const restored = await app.inject({ method: 'GET', url: '/api/v1/state', headers });
  assert.equal(restored.statusCode, 200, restored.body);
  assert.deepEqual(restored.json(), original.json());
  const downloaded = await app.inject({
    method: 'GET',
    url: '/api/v1/attachments/' + fileId,
    headers,
  });
  assert.equal(downloaded.statusCode, 200);
  assert.deepEqual(downloaded.rawPayload, bytes);
  console.log(
    JSON.stringify(
      {
        status: 'OK',
        adapter: 'PGlite',
        checks: [
          'Setup repetido conserva contas, hashes de senha, acessos e solicitações.',
          'Cópia física em diretório independente, com banco fechado, restaura registros, sessão válida e bytes do anexo.',
        ],
        scope:
          'Banco temporário descartável. Não testa restauração lógica de database.json nem PostgreSQL nativo.',
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
}
