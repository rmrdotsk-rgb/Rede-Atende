/** Teste descartável: cria registros em um processo, encerra, reabre em outro,
 * repete setup e recupera a cópia física sem sobrescrever a base original. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, readdir, readFile, stat } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve('.');
const temporary = await mkdtemp(join(tmpdir(), 'rede-atende-restart-'));
const db = join(temporary, 'database');
const attachments = join(temporary, 'files');
const record = join(temporary, 'metadata.json');
const pass = randomBytes(24).toString('base64url');
const worker = resolve('server/tests/persistence-worker.mts');
function run(phase: string, dataDir = db, uploadDir = attachments) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', worker, phase, record], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    env: {
      ...process.env,
      DB_MODE: 'embedded',
      DATA_DIR: dataDir,
      UPLOAD_DIR: uploadDir,
      SEED_ACCESS_FILE: join(temporary, 'access.txt'),
      PERSIST_TEST_PASSWORD: pass,
      PERSISTENCE_TEST_ISOLATED: 'yes',
    },
  });
  assert.equal(
    result.status,
    0,
    `${phase}: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`,
  );
  process.stdout.write(result.stdout);
}
async function fileHashes(dir: string) {
  const hashes: Record<string, string> = {};
  async function walk(folder: string) {
    for (const item of await readdir(folder)) {
      const target = join(folder, item);
      if ((await stat(target)).isDirectory()) await walk(target);
      else
        hashes[relative(dir, target)] = createHash('sha256')
          .update(await readFile(target))
          .digest('hex');
    }
  }
  await walk(dir);
  return hashes;
}
try {
  run('create');
  run('verify'); // Processo e conexão PGlite completamente novos; setup repetido.
  const backupDb = join(temporary, 'restored-db');
  const backupUploads = join(temporary, 'restored-files');
  await cp(db, backupDb, { recursive: true });
  await cp(attachments, backupUploads, { recursive: true });
  assert.deepEqual(await fileHashes(backupDb), await fileHashes(db));
  assert.deepEqual(await fileHashes(backupUploads), await fileHashes(attachments));
  run('verify', backupDb, backupUploads); // Restauração física validada em diretório distinto.
  console.log(
    'Persistência entre processos, setup idempotente, integridade e restauração: APROVADO.',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
