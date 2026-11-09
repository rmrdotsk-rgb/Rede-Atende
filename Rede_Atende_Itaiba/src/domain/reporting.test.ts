import test from 'node:test';
import assert from 'node:assert/strict';
import type { EducationalRequest } from '../types';
import { managementReport } from './reporting';
const request = (createdAt: string, status: 'recebida' | 'concluida', end?: string) =>
  ({
    id: createdAt,
    createdAt,
    status,
    schoolName: 'Escola sintética',
    category: 'infraestrutura',
    assignedDepartment: 'Setor fictício',
    updatedAt: end ?? createdAt,
    history: end ? [{ status: 'concluida', previousStatus: 'em_atendimento', timestamp: end }] : [],
  }) as EducationalRequest;
test('coorte mensal usa Recife, não UTC; TMA inclui apenas conclusões efetivas no mês', () => {
  const result = managementReport(
    [
      request('2026-11-01T01:30:00Z', 'concluida', '2026-11-02T01:30:00Z'),
      request('2026-11-01T12:00:00Z', 'recebida'),
      request('2026-11-02T12:00:00Z', 'concluida', '2026-11-03T12:00:00Z'),
    ],
    new Date('2026-11-05T12:00:00Z'),
  );
  assert.equal(result.cohortTotal, 2);
  assert.equal(result.cohortCompleted, 1);
  assert.equal(result.cohortResolutionRate, 50);
  assert.equal(result.departmentTma[0].tma, 24);
  assert.equal(result.departmentTma[0].count, 2);
});
