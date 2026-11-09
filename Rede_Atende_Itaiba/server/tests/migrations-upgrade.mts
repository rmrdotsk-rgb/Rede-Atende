/** Upgrade real 001/002 → 003, com dados preservados e reaplicação do runner. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'rede-migrations-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'data'),
  UPLOAD_DIR: join(dir, 'uploads'),
});
const { executeMigration, transaction, closeDatabase } = await import('../db/database');
const { migrate } = await import('../db/migrate');
try {
  for (const file of ['001_initial.sql', '002_upload_idempotency_and_reads.sql'])
    await executeMigration(
      await readFile(new URL('../db/migrations/' + file, import.meta.url), 'utf8'),
    );
  const timestamp = '2026-11-07T12:00:00.000Z';
  const request = {
    id: 'upgrade-request',
    protocol: 'EDU-2026-000010',
    category: 'outros',
    schoolId: 'upgrade-school',
    schoolName: 'Unidade de teste',
    subject: 'Pedido preservado no upgrade',
    description: 'Relato sintético para migração',
    applicantName: 'Pessoa de teste',
    applicantRole: 'comunidade',
    status: 'recebida',
    priority: 'media',
    createdAt: timestamp,
    updatedAt: timestamp,
    history: [],
  };
  await transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,email,name,password_hash,role) VALUES('upgrade-user','upgrade@teste.invalid','Pessoa fictícia','hash-preservado','cidadao')",
    );
    await sql.query("INSERT INTO schools(id,data) VALUES('upgrade-school',$1)", [
      JSON.stringify({ id: 'upgrade-school', name: 'Unidade de teste' }),
    ]);
    await sql.query(
      'INSERT INTO requests(id,protocol,owner_id,school_id,category,status,priority,created_at,updated_at,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)',
      [
        request.id,
        request.protocol,
        'upgrade-user',
        request.schoolId,
        request.category,
        request.status,
        request.priority,
        timestamp,
        JSON.stringify(request),
      ],
    );
  });
  const snapshot = () =>
    transaction(async (sql) => ({
      requests: (await sql.query('SELECT * FROM requests ORDER BY id')).rows,
      users: (await sql.query('SELECT * FROM users ORDER BY id')).rows,
      triggers: (
        await sql.query(
          "SELECT oid::text FROM pg_trigger WHERE tgname IN ('audit_immutable','history_immutable') ORDER BY tgname",
        )
      ).rows,
    }));
  const before = await snapshot();
  await migrate();
  await migrate();
  assert.deepEqual(await snapshot(), before);
  const versions = await transaction((sql) =>
    sql.query('SELECT version FROM schema_migrations ORDER BY version'),
  );
  assert.deepEqual(
    versions.rows.map((r) => Number(r.version)),
    [1, 2, 3],
  );
  await closeDatabase();
  assert.deepEqual(await snapshot(), before);
  console.log(
    'PASSOU: upgrade 001/002 → 003 com usuário/hash, titular, protocolo e relato preservados; runner repetido mantém gatilhos e dados; reabertura do banco conserva o resultado.',
  );
} finally {
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
}
