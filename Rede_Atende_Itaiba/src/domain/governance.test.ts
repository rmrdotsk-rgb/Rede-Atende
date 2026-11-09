import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCategoryDeadline,
  getSlaProgress,
  getSlaRule,
  maskApplicantName,
  maskPhone,
  suggestPriority,
} from './governance';
const start = new Date('2026-10-23T12:00:00.000Z'); // sexta-feira

test('SLA: merenda 24h e transporte 48h em tempo corrido', () => {
  assert.equal(calculateCategoryDeadline(start, 'alimentacao_merenda'), '2026-10-24T12:00:00.000Z');
  assert.equal(calculateCategoryDeadline(start, 'transporte_escolar'), '2026-10-25T12:00:00.000Z');
});
test('SLA: dias úteis pulam sábado e domingo', () => {
  assert.equal(
    calculateCategoryDeadline(start, 'infraestrutura', { natureza: 'Elétrico' }),
    '2026-10-30T12:00:00.000Z',
  );
  assert.equal(calculateCategoryDeadline(start, 'material_didatico'), '2026-11-13T12:00:00.000Z');
  assert.equal(getSlaRule('infraestrutura', { natureza: 'Hidráulico' }).amount, 10);
});
test('SLA: progresso sinaliza atraso, mas concluído não fica vencido', () => {
  const base = { createdAt: '2026-10-21T12:00:00Z', deadline: '2026-10-22T12:00:00Z' };
  assert.equal(
    getSlaProgress({ ...base, status: 'recebida' }, Date.parse('2026-10-23T12:00:00Z'))?.overdue,
    true,
  );
  assert.equal(
    getSlaProgress({ ...base, status: 'concluida' }, Date.parse('2026-10-23T12:00:00Z'))?.overdue,
    false,
  );
});
test('Privacidade: nome e telefone são parcialmente mascarados', () => {
  assert.equal(maskApplicantName('José Silva Filho'), 'J*** S***');
  assert.equal(maskPhone('87999991234'), '(87) 9****-1234');
});
test('Prioridade: suspeita de falta de merenda recebe indicação urgente', () => {
  assert.equal(
    suggestPriority({
      category: 'alimentacao_merenda',
      subject: 'Alimentação',
      description: 'Falta de merenda',
      categoryDetails: {},
    }).priority,
    'urgente',
  );
});
