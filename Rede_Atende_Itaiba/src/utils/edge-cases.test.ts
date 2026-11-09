import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatProtocolNumber,
  parseProtocolNumber,
  parseHistoricalProtocol,
  calculateMetrics,
  escapeCsvValue,
  generateRequestsCsv,
  formatDateShort,
  calculateAverageTriageTime,
} from './helpers';
import { INITIAL_REQUESTS } from '../services/mockData';
for (const value of [0, -1, 1.5, NaN, Infinity])
  test(`Protocolo: rejeita sequência inválida ${value}`, () =>
    assert.throws(() => formatProtocolNumber(value, 2026)));
test('Protocolo: rejeita ano inválido e sequência zero no parser', () => {
  assert.throws(() => formatProtocolNumber(1, 999));
  assert.throws(() => formatProtocolNumber(1, NaN));
  assert.equal(parseProtocolNumber('EDU-2026-000000').valid, false);
});
test('Protocolo: reconhece ano e sequência abreviada históricos', () => {
  assert.deepEqual(parseHistoricalProtocol('EDU-2025-42', 2026), {
    valid: true,
    year: 2025,
    seq: 42,
  });
  assert.equal(parseHistoricalProtocol('EDU-0', 2026).valid, false);
});
test('Indicadores: próximo do prazo e atrasado são conjuntos distintos', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  const requests = [
    { ...INITIAL_REQUESTS[1], deadline: '2026-10-20T12:00:00Z' },
    { ...INITIAL_REQUESTS[1], id: 'future', deadline: '2026-10-22T12:00:00Z' },
    { ...INITIAL_REQUESTS[3], deadline: '2026-10-20T12:00:00Z' },
  ];
  const m = calculateMetrics(requests, now);
  assert.equal(m.overdueCount, 1);
  assert.equal(m.nearingDeadline, 1);
  assert.equal(m.total, 3);
  assert.equal(m.completed, 1);
});
test('Indicadores: base vazia, datas inválidas e evolução coerente', () => {
  const empty = calculateMetrics([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.averageTriageFormatted, 'Dados insuficientes para calcular');
  assert.deepEqual(empty.evolution, []);
  const m = calculateMetrics(INITIAL_REQUESTS);
  assert.equal(
    m.evolution.reduce((sum, d) => sum + d.total, 0),
    m.total,
  );
});
test('Triagem: histórico desordenado usa o primeiro evento cronológico e não inventa uma hora', () => {
  const req = {
    ...INITIAL_REQUESTS[0],
    createdAt: '2026-10-21T12:00:00Z',
    history: [
      { ...INITIAL_REQUESTS[0].history[1], timestamp: '2026-10-21T14:00:00Z' },
      { ...INITIAL_REQUESTS[0].history[1], timestamp: '2026-10-21T12:30:00Z' },
    ],
  };
  const avg = calculateAverageTriageTime([req]);
  assert.equal(avg.hours, 0.5);
  assert.equal(avg.formatted, '30 min');
});
for (const cell of [
  '=1+1',
  '+SUM(1)',
  '-5',
  '@SUM(1)',
  '  =HYPERLINK("x")',
  '\t=1',
  '\r=1',
  '\n=1',
  '\u0000=1',
])
  test(`CSV: neutraliza fórmula com prefixo ${JSON.stringify(cell.slice(0, 12))}`, () =>
    assert.ok(escapeCsvValue(cell).startsWith('"\'')));
test('CSV: preserva aspas, separador, quebra de linha, acentos e privacidade', () => {
  const csv = generateRequestsCsv([
    {
      ...INITIAL_REQUESTS[0],
      subject: 'Inspeção; "pátio"\nBloco B',
      applicantName: 'Nome privado',
      applicantContact: 'Contato privado',
    },
  ]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Inspeção; ""pátio""\nBloco B"'));
  assert.ok(!csv.includes('Nome privado'));
  assert.ok(!csv.includes('Contato privado'));
  assert.ok(csv.includes('\r\n'));
});
test('Datas: data simples não recua um dia no fuso local', () =>
  assert.equal(formatDateShort('2026-10-21'), '21/10/2026'));
