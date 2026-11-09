/** Optional compatibility check: pass the installed 0.3.16 package directory. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const legacyRoot = process.argv[2];
if (!legacyRoot)
  throw new Error(
    'Uso: node --import tsx server/tests/upgrade-3_8.mts DIRETORIO_DO_PACOTE_PGLITE_0.3.16',
  );
const metadata = JSON.parse(await readFile(join(legacyRoot, 'package.json'), 'utf8'));
assert.equal(metadata.version, '0.3.16', 'Use o pacote legado exato para verificar a base 3.8.');
const { PGlite: Legacy } = await import(pathToFileURL(resolve(legacyRoot, 'dist/index.js')).href);
const dir = await mkdtemp(join(tmpdir(), 'rede-upgrade-39-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'data'),
  UPLOAD_DIR: join(dir, 'uploads'),
});
let legacy: InstanceType<typeof Legacy> | undefined;
try {
  legacy = new Legacy(join(dir, 'data'));
  for (const name of [
    '001_initial.sql',
    '002_upload_idempotency_and_reads.sql',
    '003_operations_and_scoped_reads.sql',
  ])
    await legacy.exec(await readFile(new URL('../db/migrations/' + name, import.meta.url), 'utf8'));
  const timestamp = '2026-11-06T12:00:00.000Z';
  const school = {
    id: 'compat-school',
    name: 'Unidade Fictícia de Compatibilidade',
    code: 'FICTICIO',
    zone: 'urbana',
    address: 'Local fictício',
    principal: 'Equipe Fictícia',
    contactPhone: '',
    activeRequestsCount: 1,
  };
  const request = {
    id: 'compat-request',
    protocol: 'EDU-2026-000001',
    schoolId: school.id,
    schoolName: school.name,
    category: 'infraestrutura',
    subject: 'Registro fictício anterior à atualização',
    description: 'Dado sintético preservado no teste de compatibilidade.',
    applicantName: 'Pessoa Fictícia',
    applicantRole: 'comunidade',
    status: 'em_triagem',
    priority: 'media',
    createdAt: timestamp,
    updatedAt: timestamp,
    history: [
      {
        id: 'compat-history',
        timestamp,
        status: 'em_triagem',
        author: 'Equipe Fictícia',
        role: 'triagem_seduc',
        note: 'Histórico sintético que deve permanecer.',
      },
    ],
  };
  const order = {
    id: 'compat-order',
    number: 'OS-000001',
    requestId: request.id,
    title: 'Atividade fictícia preservada',
    department: 'Equipe Fictícia',
    technician: 'Responsável Fictício',
    required: true,
    status: 'aberta',
    createdAt: timestamp,
    updatedAt: timestamp,
    history: [],
  };
  await legacy.query(
    "INSERT INTO users(id,email,name,password_hash,role) VALUES('compat-user','compat@teste.invalid','Pessoa Fictícia','hash-sintetico-para-comparacao','cidadao')",
  );
  await legacy.query('INSERT INTO schools(id,data) VALUES($1,$2)', [
    school.id,
    JSON.stringify(school),
  ]);
  await legacy.query(
    'INSERT INTO requests(id,protocol,owner_id,school_id,category,status,priority,created_at,updated_at,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)',
    [
      request.id,
      request.protocol,
      'compat-user',
      school.id,
      request.category,
      request.status,
      request.priority,
      timestamp,
      JSON.stringify(request),
    ],
  );
  await legacy.query(
    'INSERT INTO request_history(id,request_id,occurred_at,data) VALUES($1,$2,$3,$4)',
    [request.history[0].id, request.id, timestamp, JSON.stringify(request.history[0])],
  );
  await legacy.query(
    'INSERT INTO work_orders(id,number,request_id,required,status,data) VALUES($1,$2,$3,true,$4,$5)',
    [order.id, order.number, request.id, order.status, JSON.stringify(order)],
  );
  await legacy.query('INSERT INTO protocol_sequences(year,next_value) VALUES(2026,2)');
  await legacy.query(
    "INSERT INTO idempotency_keys(user_id,key,request_hash,request_id) VALUES('compat-user','compat-key-preservada','hash-ficticio',$1)",
    [request.id],
  );
  const bytes = await readFile(new URL('./fixtures/imagem-ficticia.png', import.meta.url));
  await mkdir(join(dir, 'uploads'));
  await writeFile(join(dir, 'uploads', 'compat-image'), bytes);
  await legacy.query(
    "INSERT INTO attachments(id,request_id,uploader_id,storage_name,name,mime,size,sha256) VALUES('compat-attachment',$1,'compat-user','compat-image','imagem-ficticia.png','image/png',$2,'hash-ficticio')",
    [request.id, bytes.length],
  );
  await legacy.close();
  legacy = undefined;
  const { readTransaction, transaction, closeDatabase } = await import('../db/database');
  try {
    const result = await readTransaction(async (sql) => ({
      database: (await sql.query('SELECT current_database() AS name')).rows[0].name,
      user: (await sql.query("SELECT password_hash FROM users WHERE id='compat-user'")).rows[0],
      request: (await sql.query('SELECT data FROM requests WHERE id=$1', [request.id])).rows[0]
        .data,
      order: (await sql.query('SELECT data FROM work_orders WHERE id=$1', [order.id])).rows[0].data,
      keys: (await sql.query("SELECT key FROM idempotency_keys WHERE user_id='compat-user'")).rows,
    }));
    assert.equal(result.database, 'template1');
    assert.deepEqual(result.request, request);
    assert.deepEqual(result.order, order);
    assert.equal(result.user.password_hash, 'hash-sintetico-para-comparacao');
    assert.equal(result.keys[0].key, 'compat-key-preservada');
    assert.deepEqual(await readFile(join(dir, 'uploads', 'compat-image')), bytes);
    await transaction((sql) =>
      sql.query("INSERT INTO settings(id,data) VALUES('compat-confirmed','{}')"),
    );
    await closeDatabase();
    assert.equal(
      (
        await readTransaction((sql) =>
          sql.query("SELECT id FROM settings WHERE id='compat-confirmed'"),
        )
      ).rows[0].id,
      'compat-confirmed',
    );
    console.log(
      'UPGRADE_3_8_OK: banco 0.3.16 aberto pela 3.9; conta/hash, protocolo, histórico, vínculo de OS, chave, anexo e nova gravação preservados após reinício.',
    );
  } finally {
    await closeDatabase();
  }
} finally {
  await legacy?.close();
  await rm(dir, { recursive: true, force: true });
}
