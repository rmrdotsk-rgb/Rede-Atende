import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const find = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? find(join(dir, e.name))
      : e.name.endsWith('.test.ts')
        ? [join(dir, e.name)]
        : [],
  );
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=2', ...find('src')],
  { stdio: 'inherit' },
);
if (result.error) console.error(result.error);
if (result.signal) console.error('Processo de testes encerrado por sinal:', result.signal);
process.exit(result.status ?? 1);
