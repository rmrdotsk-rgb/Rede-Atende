import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCategoryDeadline as deadline } from './governance';
test('sexta 23h30 Recife + cinco dias úteis mantém sexta 23h30, sem antecipação UTC', () => {
  assert.equal(
    deadline(new Date('2026-10-23T23:30:00-03:00'), 'infraestrutura', { natureza: 'Elétrico' }),
    '2026-10-31T02:30:00.000Z',
  );
});
test('dias úteis com feriado configurado atravessam mês', () => {
  assert.equal(
    deadline(new Date('2026-10-23T23:30:00-03:00'), 'infraestrutura', { natureza: 'Elétrico' }, [
      '2026-10-30',
    ]),
    '2026-11-03T02:30:00.000Z',
  );
});
test('virada de ano e horas corridas independem do calendário de feriados', () => {
  assert.equal(
    deadline(new Date('2026-12-25T23:30:00-03:00'), 'infraestrutura', { natureza: 'Elétrico' }, [
      '2027-01-01',
    ]),
    '2027-01-05T02:30:00.000Z',
  );
  assert.equal(
    deadline(new Date('2026-12-31T23:30:00-03:00'), 'alimentacao_merenda', {}, ['2027-01-01']),
    '2027-01-02T02:30:00.000Z',
  );
});
test('fim de semana e milissegundos preservados', () => {
  assert.equal(
    deadline(new Date('2026-10-24T00:15:32.123-03:00'), 'infraestrutura', { natureza: 'Elétrico' }),
    '2026-10-30T03:15:32.123Z',
  );
});
