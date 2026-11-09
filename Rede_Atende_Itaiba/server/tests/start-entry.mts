import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = await mkdtemp(join(tmpdir(), 'rede-atende-start-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(dir, 'data'),
  UPLOAD_DIR: join(dir, 'uploads'),
  SEED_ACCESS_FILE: join(dir, 'access.txt'),
  PORT: '32478',
  HOST: '127.0.0.1',
});
const { seed } = await import('../db/seed'),
  { closeDatabase } = await import('../db/database');
try {
  await seed();
  await closeDatabase();
  const version = JSON.parse(await readFile('package.json', 'utf8')).version;
  const code = `import assert from 'node:assert/strict';await import('./scripts/start.mjs');try{const root='http://127.0.0.1:32478';const health=await fetch(root+'/api/v1/health');assert.equal(health.status,200);assert.equal((await health.json()).version,${JSON.stringify(version)});const html=await fetch(root);assert.equal(html.status,200);assert.match(await html.text(),/assets\\/index-/);const auth=await fetch(root+'/api/v1/auth/me');assert.deepEqual((await auth.json()).user,null);console.log('START_ENTRY_OK: health, build e sessão anônima por HTTP real.');process.emit('SIGTERM');}catch(error){console.error(error);process.exit(1);}`;
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', code],
    { env: process.env, encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(child.status, 0, child.stderr + '\n' + child.stdout);
  assert.match(child.stdout, /START_ENTRY_OK/);
  console.log(
    'OK: entrypoint de npm start serve build e API em HTTP, usando banco temporário e loopback.',
  );
} finally {
  await closeDatabase();
  await rm(dir, { recursive: true, force: true });
}
