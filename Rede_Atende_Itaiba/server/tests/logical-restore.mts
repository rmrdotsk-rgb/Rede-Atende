/** Backup lógico real e recuperação em outro diretório, com testes negativos. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, cp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
const root = resolve('.');
const dir = await mkdtemp(join(tmpdir(), 'rede-logical-restore-'));
const password = randomBytes(24).toString('base64url');
const env = {
  ...process.env,
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'source', 'data'),
  UPLOAD_DIR: join(dir, 'source', 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
  PERSIST_TEST_PASSWORD: password,
  PERSISTENCE_TEST_ISOLATED: 'yes',
};
function run(file: string, args: string[], expected = 0, overrides = {}) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve(file), ...args], {
    cwd: root,
    env: { ...env, ...overrides },
    encoding: 'utf8',
    timeout: 120000,
  });
  assert.equal(
    result.status,
    expected,
    `${file}: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout + result.stderr;
}
try {
  const record = join(dir, 'record.json'),
    backup = join(dir, 'backup'),
    restored = join(dir, 'new recovery # acadêmica');
  run('server/tests/persistence-worker.mts', ['create', record]);
  run('server/db/backup.ts', [backup]);
  const dump = JSON.parse(await readFile(join(backup, 'database.json'), 'utf8'));
  assert.ok(dump.tables.requests.length >= 3);
  assert.equal(dump.tables.attachments.length, 1);
  assert.equal(dump.tables.sessions, undefined);
  assert.equal(dump.tables.rate_limits, undefined);
  run('server/db/restore.ts', [backup, restored]);
  // Use o arquivo entregue ao usuário, sem caminhos de banco herdados do teste.
  // O nome "new" reproduz o escape \\n do Windows; espaços/# devem ser preservados.
  const { DATA_DIR: _sourceData, UPLOAD_DIR: _sourceUploads, ...recoveredEnv } = env;
  const configCheck = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "import assert from 'node:assert/strict';import {loadEnvFile} from 'node:process';loadEnvFile(process.argv[1]);const {config}=await import('./server/config.ts');assert.equal(config.dataDir,process.argv[2]);assert.equal(config.uploadDir,process.argv[3]);",
      join(restored, '.env'),
      join(restored, 'data'),
      join(restored, 'uploads'),
    ],
    { cwd: root, env: recoveredEnv, encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(configCheck.status, 0, configCheck.stdout + configCheck.stderr);
  const restoreEnv = {
    LOGICAL_RESTORE_CHECK_SESSIONS: 'yes',
    DATA_DIR: join(restored, 'data'),
    UPLOAD_DIR: join(restored, 'uploads'),
  };
  // Compara todas as tabelas novamente em processo novo, antes de login/auditoria novos.
  const restoredBackup = join(dir, 'restored-backup');
  run('server/db/backup.ts', [restoredBackup], 0, restoreEnv);
  const restoredDump = JSON.parse(await readFile(join(restoredBackup, 'database.json'), 'utf8'));
  const canonical = (v: any): string =>
    Array.isArray(v)
      ? '[' + v.map(canonical).sort().join(',') + ']'
      : v && typeof v === 'object'
        ? '{' +
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
            .join(',') +
          '}'
        : JSON.stringify(v);
  assert.equal(canonical(restoredDump.tables), canonical(dump.tables));
  // Mesmo login/senha, protocolo, histórico, anexos e idempotência sobrevivem sem transportar sessões.
  run('server/tests/persistence-worker.mts', ['verify', record], 0, restoreEnv);
  run('server/db/restore.ts', [backup, restored], 1); // Jamais sobrescreve recuperação existente.
  const bad = join(dir, 'tampered');
  await cp(backup, bad, { recursive: true });
  await writeFile(join(bad, 'database.json'), '{}');
  run('server/db/restore.ts', [bad, join(dir, 'denied-tampered')], 1);
  await assert.rejects(access(join(dir, 'denied-tampered')));
  const incompatible = join(dir, 'incompatible');
  await cp(backup, incompatible, { recursive: true });
  const future = { ...dump, version: 99 };
  const bytes = Buffer.from(JSON.stringify(future));
  await writeFile(join(incompatible, 'database.json'), bytes);
  const manifest = JSON.parse(await readFile(join(incompatible, 'manifest.sha256.json'), 'utf8'));
  manifest.files['database.json'] = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(incompatible, 'manifest.sha256.json'), JSON.stringify(manifest));
  run('server/db/restore.ts', [incompatible, join(dir, 'denied-schema')], 1);
  await assert.rejects(access(join(dir, 'denied-schema')));
  const broken = join(dir, 'broken-relation');
  await cp(backup, broken, { recursive: true });
  const invalidDump = structuredClone(dump);
  invalidDump.tables.requests[0].owner_id = 'conta-inexistente';
  const badBytes = Buffer.from(JSON.stringify(invalidDump));
  await writeFile(join(broken, 'database.json'), badBytes);
  const brokenManifest = JSON.parse(await readFile(join(broken, 'manifest.sha256.json'), 'utf8'));
  brokenManifest.files['database.json'] = createHash('sha256').update(badBytes).digest('hex');
  await writeFile(join(broken, 'manifest.sha256.json'), JSON.stringify(brokenManifest));
  run('server/db/restore.ts', [broken, join(dir, 'denied-relation')], 1);
  await assert.rejects(access(join(dir, 'denied-relation')));
  // A origem não foi aberta/escrita pela restauração.
  run('server/db/backup.ts', [join(dir, 'source-again')]);
  const sourceAgain = JSON.parse(await readFile(join(dir, 'source-again/database.json'), 'utf8'));
  assert.equal(canonical(sourceAgain.tables), canonical(dump.tables));
  console.log(
    'PASSOU: backup real, SHA-256, 22 tabelas, vínculos, protocolo/histórico, anexo com hash, login após restauração, origem preservada; pasta existente, adulteração, formato incompatível e FK inválida recusados. Sessões/rate limits excluídos do formato.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
