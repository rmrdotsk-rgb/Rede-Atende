/** Processo auxiliar do teste de persistência. NÃO apontar para banco de apresentação. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const [phase, recordFile] = process.argv.slice(2);
assert.ok(phase === 'create' || phase === 'verify');
assert.ok(process.env.PERSISTENCE_TEST_ISOLATED === 'yes', 'Requer diretório temporário isolado');
assert.equal(process.env.DB_MODE, 'embedded');
const password = process.env.PERSIST_TEST_PASSWORD!;
assert.ok(password.length >= 12);
const { seed } = await import('../db/seed');
const { buildApp } = await import('../app');
const { transaction, closeDatabase } = await import('../db/database');
await seed(); // Repetido deliberadamente no segundo/terceiro processo.
if (process.env.LOGICAL_RESTORE_CHECK_SESSIONS === 'yes') {
  const sessions = await transaction((sql) =>
    sql.query('SELECT count(*)::text AS total FROM sessions'),
  );
  assert.equal(
    sessions.rows[0].total,
    '0',
    'Sessões antigas não podem sobreviver à restauração lógica',
  );
}
const app = await buildApp();
const call = (
  actor: { cookie: string; csrf: string } | null,
  method: string,
  route: string,
  payload?: unknown,
  extra: Record<string, string> = {},
) =>
  app.inject({
    method: method as 'GET',
    url: '/api/v1' + route,
    headers: {
      'X-Requested-With': 'RedeAtende',
      ...(actor ? { cookie: actor.cookie, 'X-CSRF-Token': actor.csrf } : {}),
      ...extra,
    },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
try {
  let actor: { cookie: string; csrf: string };
  if (phase === 'create') {
    const registered = await call(null, 'POST', '/auth/register', {
      name: 'Titular Sintético de Persistência',
      email: 'persistencia@teste.invalid',
      password,
      academicAcknowledged: true,
    });
    assert.equal(registered.statusCode, 201, registered.body);
    actor = {
      cookie: `ra_session=${registered.cookies.find((c) => c.name === 'ra_session')!.value}`,
      csrf: registered.json().csrf,
    };
    const form = {
      category: 'outros',
      schoolId: 'esc-001',
      subject: 'Teste persistente de demonstracao',
      description: 'Registro fictício para comprovar reinicialização do servidor e banco.',
      locationDetails: 'Unidade escolar sintética',
      applicantName: 'Titular Sintético',
      applicantRole: 'comunidade',
      privacyAcknowledged: true,
      categoryDetails: { natureza: 'Ocorrência fictícia para ensaio' },
    };
    const created = await call(actor, 'POST', '/requests', form, {
      'Idempotency-Key': randomUUID(),
    });
    assert.equal(created.statusCode, 201, created.body);
    const request = created.json();
    const bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url));
    const boundary = 'Persistence' + randomUUID();
    const upload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="persistencia.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const posted = await call(actor, 'POST', `/requests/${request.id}/attachments`, upload, {
      'Idempotency-Key': randomUUID(),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    });
    assert.equal(posted.statusCode, 201, posted.body);
    await writeFile(
      recordFile,
      JSON.stringify({
        requestId: request.id,
        protocol: request.protocol,
        attachmentId: posted.json().id,
        digest: createHash('sha256').update(bytes).digest('hex'),
      }),
    );
  } else {
    const meta = JSON.parse(await readFile(recordFile, 'utf8')) as {
      requestId: string;
      protocol: string;
      attachmentId: string;
      digest: string;
    };
    const loggedIn = await call(null, 'POST', '/auth/login', {
      email: 'persistencia@teste.invalid',
      password,
    });
    assert.equal(loggedIn.statusCode, 200, loggedIn.body);
    actor = {
      cookie: `ra_session=${loggedIn.cookies.find((c) => c.name === 'ra_session')!.value}`,
      csrf: loggedIn.json().csrf,
    };
    const requested = await call(actor, 'GET', '/requests/' + meta.requestId);
    assert.equal(requested.statusCode, 200, requested.body);
    assert.equal(requested.json().protocol, meta.protocol);
    const file = await call(actor, 'GET', '/attachments/' + meta.attachmentId);
    assert.equal(file.statusCode, 200, file.body);
    assert.equal(createHash('sha256').update(file.rawPayload).digest('hex'), meta.digest);
    const counts = await transaction(async (sql) => ({
      user: (
        await sql.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM users WHERE email='persistencia@teste.invalid'",
        )
      ).rows[0].count,
      request: (
        await sql.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM requests WHERE id=$1',
          [meta.requestId],
        )
      ).rows[0].count,
      attachment: (
        await sql.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM attachments WHERE id=$1',
          [meta.attachmentId],
        )
      ).rows[0].count,
      migrations: (
        await sql.query<{ version: number }>(
          'SELECT version FROM schema_migrations ORDER BY version',
        )
      ).rows.map((r) => Number(r.version)),
    }));
    assert.equal(counts.user, '1');
    assert.equal(counts.request, '1');
    assert.equal(counts.attachment, '1');
    assert.deepEqual(counts.migrations, [1, 2, 3]);
  }
  console.log(`persistencia/${phase}: APROVADO`);
} finally {
  await app.close();
  await closeDatabase();
}
