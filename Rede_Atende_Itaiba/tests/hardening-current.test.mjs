import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('iniciador Windows rejeita versões de Node incompatíveis com Babel 8', () => {
  const cmd = read('INICIAR_REDE_ATENDE.cmd');
  const script = cmd.match(/node -e "([^"]+)"/i)?.[1];
  assert.ok(script, 'não foi encontrada uma verificação Node executável');
  const accepts = (node) => {
    let result;
    runInNewContext(script, {
      process: {
        versions: { node },
        exit: (code) => {
          result = code;
        },
      },
    });
    return result === 0;
  };
  for (const version of ['20.19.0', '22.16.0', '22.17.9', '23.0.0', '24.10.0'])
    assert.equal(accepts(version), false, version);
  for (const version of ['22.18.0', '22.19.1', '24.11.0', '24.13.0', '25.0.0'])
    assert.equal(accepts(version), true, version);
  assert.match(cmd, /npm\.cmd ls --depth=0/);
  assert.match(cmd, /npm\.cmd ci/);
});

test('migrações 001 a 003 permanecem aditivas e registram versões atomicamente', () => {
  const runner = read('server/db/migrate.ts');
  assert.match(runner, /if \(installed\.has\(version\)\) continue/);
  assert.match(runner, /await executeMigration/);
  assert.match(runner, /schema_migrations/);
  assert.doesNotMatch(runner, /DROP TABLE|TRUNCATE|DELETE FROM schema_migrations/i);
  for (const version of [1, 2, 3]) {
    const name = [
      '001_initial.sql',
      '002_upload_idempotency_and_reads.sql',
      '003_operations_and_scoped_reads.sql',
    ][version - 1];
    const sql = read('server/db/migrations/' + name);
    assert.match(
      sql,
      new RegExp(`INSERT INTO schema_migrations\\(version\\) VALUES\\(${version}\\)`, 'i'),
    );
  }
});

test('download privado verifica tamanho/hash antes de confirmar o envio', () => {
  const api = read('server/app.ts');
  const route = api
    .split("app.get('/api/v1/attachments/:id'")[1]
    ?.split("app.get('/api/v1/openapi.json'")[0];
  assert.ok(route, 'rota de download ausente');
  assert.match(route, /await requireUser\(req\)/);
  assert.match(route, /await allowed\(sql, user, rows\.rows\[0\]\.request_id\)/);
  assert.match(route, /bytes\.length !== file\.size \|\| digest\(bytes\) !== file\.sha256/);
  assert.ok(route.indexOf('digest(bytes)') < route.indexOf("'attachment.download'"));
  assert.match(route, /Content-Disposition/);
});

test('interface não promete envio de demanda real à Prefeitura', () => {
  const form = read('src/pages/community/NewRequest.tsx');
  assert.match(form, /Não haverá envio à Prefeitura/);
  const info = read('src/pages/community/InformationItaiba.tsx');
  assert.match(info, /Rua Manoel Martins/);
  assert.match(info, /Confirme/);
});

test('setup --embedded não invade configuração PostgreSQL existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rede-atende-setup-guard-'));
  try {
    const original =
      'DB_MODE=postgres\nDATABASE_URL=postgresql://teste:senha@localhost:5432/privado\n';
    writeFileSync(join(dir, '.env'), original);
    const call = spawnSync(process.execPath, [resolve('scripts/setup.mjs'), '--embedded'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, DB_MODE: '' },
    });
    assert.equal(call.status, 1);
    assert.match(call.stderr, /Nenhum dado foi alterado/);
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
