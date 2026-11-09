import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// Cada motor recebe API, banco, sessões e cotas novos. Os limites reais da API permanecem ativos.
const forwarded = [];
const selected = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project') selected.push(args[++i]);
  else if (args[i].startsWith('--project=')) selected.push(args[i].slice(10));
  else forwarded.push(args[i]);
}
const projects = selected.length ? [...new Set(selected)] : ['chromium', 'webkit'];
if (projects.some((project) => !['chromium', 'webkit'].includes(project))) {
  console.error('Projetos disponíveis: chromium e webkit.');
  process.exit(1);
}
const reports = [];
let status = 0;
const started = Date.now();
mkdirSync('test-results/3.9', { recursive: true });
rmSync('test-results/3.9/e2e-results.json', { force: true });
for (const project of projects) {
  const reportPath = resolve(`test-results/3.9/e2e-${project}.json`);
  const authFile = join(tmpdir(), `rede-atende-auth-${randomUUID()}.json`);
  const testDirectory = mkdtempSync(join(tmpdir(), 'rede-atende-browser-'));
  if (
    dirname(testDirectory) !== resolve(tmpdir()) ||
    !basename(testDirectory).startsWith('rede-atende-browser-')
  )
    throw new Error('Diretório temporário fora do destino esperado.');
  rmSync(reportPath, { force: true });
  console.log(`\nValidando ${project} com servidor e banco isolados...`);
  let result;
  try {
    result = spawnSync(
      process.execPath,
      ['node_modules/@playwright/test/cli.js', 'test', ...forwarded, `--project=${project}`],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          E2E_RESULTS_FILE: reportPath,
          E2E_OUTPUT_DIR: `test-results/${project}`,
          E2E_AUTH_FILE: authFile,
          E2E_TEST_DIRECTORY: testDirectory,
        },
      },
    );
  } finally {
    rmSync(authFile, { force: true });
    rmSync(testDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  if (result.error) console.error(result.error);
  if (result.status !== 0) status = 1;
  try {
    reports.push(JSON.parse(readFileSync(reportPath, 'utf8')));
  } catch {
    status = 1;
    console.error(`Não foi possível ler o resultado de ${project}.`);
  }
}
const combined = {
  config: reports[0]?.config,
  suites: reports.flatMap((report) => report.suites ?? []),
  errors: reports.flatMap((report) => report.errors ?? []),
  stats: {
    startTime: new Date(started).toISOString(),
    duration: Date.now() - started,
    expected: reports.reduce((n, report) => n + (report.stats?.expected ?? 0), 0),
    skipped: reports.reduce((n, report) => n + (report.stats?.skipped ?? 0), 0),
    unexpected: reports.reduce((n, report) => n + (report.stats?.unexpected ?? 0), 0),
    flaky: reports.reduce((n, report) => n + (report.stats?.flaky ?? 0), 0),
  },
  isolatedProjects: projects,
};
writeFileSync('test-results/3.9/e2e-results.json', JSON.stringify(combined, null, 2) + '\n');
console.log(JSON.stringify(combined.stats, null, 2));
process.exit(status);
