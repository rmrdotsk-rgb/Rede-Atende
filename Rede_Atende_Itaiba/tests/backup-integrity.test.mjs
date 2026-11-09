import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const binary = join(process.cwd(), 'scripts', 'verify-backup.mjs');
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'rede-backup-test-'));
  const bytes = Buffer.from('{"version":1,"tables":{}}');
  writeFileSync(join(dir, 'database.json'), bytes);
  writeFileSync(
    join(dir, 'manifest.sha256.json'),
    JSON.stringify({
      algorithm: 'sha256',
      files: { 'database.json': createHash('sha256').update(bytes).digest('hex') },
    }),
  );
  return dir;
}
const verify = (dir) => spawnSync(process.execPath, [binary, dir], { encoding: 'utf8' });
test('backup: manifesto e SHA-256 conferem em snapshot sintético', () => {
  const dir = fixture();
  try {
    assert.equal(verify(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('backup: adulteração do snapshot é detectada', () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, 'database.json'), '{}');
    assert.equal(verify(dir).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('backup: arquivos extras e links simbólicos não entram no conjunto validado', () => {
  const dir = fixture();
  try {
    mkdirSync(join(dir, 'uploads'));
    writeFileSync(join(dir, 'uploads', 'extra.bin'), 'x');
    assert.equal(verify(dir).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
