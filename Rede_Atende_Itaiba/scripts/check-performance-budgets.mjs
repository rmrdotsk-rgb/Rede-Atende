/** Budgets are laboratory guardrails, not certification of field Web Vitals. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const html = await readFile('dist/index.html', 'utf8');
const assets = [
  ...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])),
];
const sizes = await Promise.all(
  assets.map(async (path) => ({ path, bytes: (await stat(resolve('dist', '.' + path))).size })),
);
const js = sizes.filter((a) => a.path.endsWith('.js')).reduce((n, a) => n + a.bytes, 0);
const css = sizes.filter((a) => a.path.endsWith('.css')).reduce((n, a) => n + a.bytes, 0);
assert.ok(js <= 420000, `Initial JavaScript ${js} > 420000 bytes`);
assert.ok(css <= 60000, `Initial CSS ${css} > 60000 bytes`);
const median = (a) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
if (process.argv[2]) {
  const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
  assert.equal(new Set(report.runs.map((r) => r.route)).size, 14, 'all 14 routes required');
  assert.equal(report.runs.length, 84, '14 routes, three cold and three warm samples required');
  assert.equal(
    report.lighthouse.length,
    9,
    'three Lighthouse samples on three public pages required',
  );
  for (const route of new Set(report.runs.map((r) => r.route))) {
    const rows = report.runs.filter((r) => r.route === route && r.cache === 'cold');
    assert.equal(rows.length, 3, `${route}: three cold samples required`);
    assert.ok(median(rows.map((r) => r.cls)) <= 0.1, `${route}: CLS above 0.1`);
    assert.ok(median(rows.map((r) => r.readyMs)) <= 7000, `${route}: synthetic readiness above 7s`);
  }
  for (const run of report.lighthouse) {
    assert.equal(run.runtimeError, null);
    assert.ok(run.categories.performance >= 0.9, `${run.route}: Lighthouse performance below 90`);
    assert.ok(
      run.categories.accessibility >= 0.95,
      `${run.route}: Lighthouse accessibility below 95`,
    );
  }
}
console.log(
  JSON.stringify(
    {
      status: 'PASSOU',
      initialJavaScriptBytes: js,
      initialCssBytes: css,
      budgets: {
        initialJavaScriptBytes: 420000,
        initialCssBytes: 60000,
        medianLaboratoryCLS: 0.1,
        medianReadinessMs: 7000,
        lighthousePerformance: 90,
        lighthouseAccessibility: 95,
      },
      scope: process.argv[2]
        ? 'build and supplied production laboratory'
        : 'build only; browser metrics not checked',
    },
    null,
    2,
  ),
);
