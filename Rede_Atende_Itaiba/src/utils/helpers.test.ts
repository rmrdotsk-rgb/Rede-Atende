import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatProtocolNumber,
  parseProtocolNumber,
  isDeadlineNear,
  isDeadlineOverdue,
  CATEGORY_LABELS,
  STATUS_CONFIG,
  calculateMetrics,
  calculateAverageTriageTime,
  generateRequestsCsv,
  escapeCsvValue,
  isValidStatusTransition,
  isRequestEligibleForSei,
  MAX_PROTOCOL_SEQUENCE,
} from './helpers';
import { EducationalRequest } from '../types';

// ====================================================
// GRUPO A: Formatação, Limites e Validação de Protocolo
// ====================================================

test('01. formatProtocolNumber formata sequência no padrão EDU-YYYY-XXXXXX com 6 dígitos', () => {
  assert.equal(formatProtocolNumber(1, 2026), 'EDU-2026-000001');
  assert.equal(formatProtocolNumber(42, 2026), 'EDU-2026-000042');
  assert.equal(formatProtocolNumber(1024, 2026), 'EDU-2026-001024');
  assert.equal(formatProtocolNumber(999999, 2026), 'EDU-2026-999999');
});

test('02. formatProtocolNumber rejeita sequência acima do limite máximo de 6 dígitos', () => {
  assert.throws(
    () => formatProtocolNumber(MAX_PROTOCOL_SEQUENCE + 1, 2026),
    /limite máximo suportado/,
  );
});

test('03. parseProtocolNumber valida e extrai corretamente ano e sequência numérica', () => {
  const valid = parseProtocolNumber('EDU-2026-000042');
  assert.equal(valid.valid, true);
  assert.equal(valid.year, 2026);
  assert.equal(valid.seq, 42);

  const validMax = parseProtocolNumber('EDU-2026-999999');
  assert.equal(validMax.valid, true);
  assert.equal(validMax.seq, 999999);
});

test('04. parseProtocolNumber rejeita strings malformadas ou vazias', () => {
  assert.equal(parseProtocolNumber('INVALID-PROTO-123').valid, false);
  assert.equal(parseProtocolNumber('EDU-26-001').valid, false);
  assert.equal(parseProtocolNumber('').valid, false);
  assert.equal(parseProtocolNumber(null as any).valid, false);
});

// ====================================================
// GRUPO B: Prazos e Vencimentos (Deadlines)
// ====================================================

test('05. isDeadlineNear detecta próximos 3 dias e separa prazos vencidos', () => {
  const past = new Date(Date.now() - 3600000).toISOString();
  assert.equal(isDeadlineNear(past), false);

  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  assert.equal(isDeadlineNear(tomorrow), true);

  const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  assert.equal(isDeadlineNear(farFuture), false);
});

test('06. isDeadlineOverdue detecta estritamente datas já expiradas', () => {
  const past = new Date(Date.now() - 3600000).toISOString();
  assert.equal(isDeadlineOverdue(past), true);

  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  assert.equal(isDeadlineOverdue(tomorrow), false);
  assert.equal(isDeadlineOverdue(undefined), false);
  assert.equal(isDeadlineOverdue('data-invalida'), false);
});

// ====================================================
// GRUPO C: State Machine e Transições de Status
// ====================================================

test('07. isValidStatusTransition permite progressão canônica do fluxo educacional', () => {
  assert.equal(isValidStatusTransition('recebida', 'em_triagem'), true);
  assert.equal(isValidStatusTransition('em_triagem', 'encaminhada'), true);
  assert.equal(isValidStatusTransition('encaminhada', 'em_atendimento'), true);
  assert.equal(isValidStatusTransition('em_atendimento', 'concluida'), true);
});

test('08. isValidStatusTransition permite desvio e retorno para aguardando_informacoes', () => {
  assert.equal(isValidStatusTransition('recebida', 'aguardando_informacoes'), true);
  assert.equal(isValidStatusTransition('em_triagem', 'aguardando_informacoes'), true);
  assert.equal(isValidStatusTransition('aguardando_informacoes', 'em_triagem'), true);
});

test('09. isValidStatusTransition bloqueia saltos arbitrários inválidos', () => {
  // Não pode saltar diretamente de recebida para concluida sem atendimento
  assert.equal(isValidStatusTransition('recebida', 'concluida'), false);
  // Não pode saltar de recebida para em_atendimento sem triagem
  assert.equal(isValidStatusTransition('recebida', 'em_atendimento'), false);
});

test('10. isValidStatusTransition protege status concluida contra alteração acidental sem reabertura', () => {
  assert.equal(isValidStatusTransition('concluida', 'recebida', false), false);
  assert.equal(isValidStatusTransition('concluida', 'em_atendimento', false), false);
  // Reabertura explícita autoriza retorno para em_atendimento
  assert.equal(isValidStatusTransition('concluida', 'em_atendimento', true), true);
});

// ====================================================
// GRUPO D: Elegibilidade da Simulação SEI
// ====================================================

test('11. isRequestEligibleForSei aprova demanda triada e sem processo prévio', () => {
  const req: EducationalRequest = {
    id: 'req-test-1',
    protocol: 'EDU-2026-000001',
    category: 'infraestrutura',
    schoolId: 'esc-1',
    schoolName: 'Escola 1',
    subject: 'Goteiras',
    description: 'Relato teste',
    applicantName: 'Emerson',
    applicantRole: 'aluno',
    status: 'encaminhada',
    priority: 'alta',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [],
  };

  const check = isRequestEligibleForSei(req);
  assert.equal(check.eligible, true);
  assert.equal(check.reason, undefined);
});

test('12. isRequestEligibleForSei rejeita demanda ainda em estado recebida pura', () => {
  const req: EducationalRequest = {
    id: 'req-test-2',
    protocol: 'EDU-2026-000002',
    category: 'infraestrutura',
    schoolId: 'esc-1',
    schoolName: 'Escola 1',
    subject: 'Teste',
    description: 'Relato teste',
    applicantName: 'Emerson',
    applicantRole: 'aluno',
    status: 'recebida',
    priority: 'media',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [],
  };

  const check = isRequestEligibleForSei(req);
  assert.equal(check.eligible, false);
  assert.ok(check.reason?.includes('Recebida'));
});

test('13. isRequestEligibleForSei rejeita demanda já integrada previamente (idempotência)', () => {
  const req: EducationalRequest = {
    id: 'req-test-3',
    protocol: 'EDU-2026-000003',
    category: 'infraestrutura',
    schoolId: 'esc-1',
    schoolName: 'Escola 1',
    subject: 'Teste',
    description: 'Relato teste',
    applicantName: 'Emerson',
    applicantRole: 'aluno',
    status: 'em_atendimento',
    priority: 'alta',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [],
    seiIntegrated: true,
    seiProcessNumber: 'SIM-SEI-23000.001234/2026-99',
  };

  const check = isRequestEligibleForSei(req);
  assert.equal(check.eligible, false);
  assert.ok(check.reason?.includes('já possui processo'));
});

// ====================================================
// GRUPO E: Indicadores e Métricas Dinâmicas
// ====================================================

test('14. calculateMetrics calcula demandas abertas estritamente como total - concluídas', () => {
  const sampleRequests: EducationalRequest[] = [
    {
      id: '1',
      protocol: 'EDU-2026-000001',
      category: 'infraestrutura',
      schoolId: 'esc-1',
      schoolName: 'Escola 1',
      subject: 'Goteiras',
      description: 'Teste',
      applicantName: 'Emerson',
      applicantRole: 'aluno',
      status: 'recebida',
      priority: 'alta',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
    },
    {
      id: '2',
      protocol: 'EDU-2026-000002',
      category: 'transporte_escolar',
      schoolId: 'esc-1',
      schoolName: 'Escola 1',
      subject: 'Ônibus',
      description: 'Teste',
      applicantName: 'Emerson',
      applicantRole: 'aluno',
      status: 'em_triagem',
      priority: 'urgente',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
    },
    {
      id: '3',
      protocol: 'EDU-2026-000003',
      category: 'alimentacao_merenda',
      schoolId: 'esc-1',
      schoolName: 'Escola 1',
      subject: 'Merenda',
      description: 'Teste',
      applicantName: 'Emerson',
      applicantRole: 'aluno',
      status: 'concluida',
      priority: 'baixa',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
    },
    {
      id: '4',
      protocol: 'EDU-2026-000004',
      category: 'material_didatico',
      schoolId: 'esc-1',
      schoolName: 'Escola 1',
      subject: 'Livros',
      description: 'Teste',
      applicantName: 'Emerson',
      applicantRole: 'aluno',
      status: 'aguardando_informacoes',
      priority: 'media',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
    },
  ];

  const metrics = calculateMetrics(sampleRequests);
  assert.equal(metrics.total, 4);
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.open, 3);
  assert.equal(metrics.inTriage, 1);
  assert.equal(metrics.waitingInfo, 1);
});

test('15. calculateAverageTriageTime calcula tempo médio real a partir dos eventos de histórico', () => {
  const reqWithHistory: EducationalRequest[] = [
    {
      id: '1',
      protocol: 'EDU-2026-000001',
      category: 'infraestrutura',
      schoolId: 'esc-1',
      schoolName: 'Escola 1',
      subject: 'Teste',
      description: 'Teste',
      applicantName: 'Emerson',
      applicantRole: 'aluno',
      status: 'em_triagem',
      priority: 'alta',
      createdAt: '2026-10-15T08:00:00.000Z',
      updatedAt: '2026-10-15T18:00:00.000Z',
      history: [
        {
          id: 'h1',
          timestamp: '2026-10-15T08:00:00.000Z',
          status: 'recebida',
          author: 'Emerson',
          role: 'cidadao',
          note: 'Criada',
        },
        {
          id: 'h2',
          timestamp: '2026-10-15T18:00:00.000Z', // 10 horas depois
          status: 'em_triagem',
          author: 'SEDUC',
          role: 'triagem_seduc',
          note: 'Triada',
        },
      ],
    },
  ];

  const result = calculateAverageTriageTime(reqWithHistory);
  assert.equal(result.hasData, true);
  assert.equal(result.formatted, '10h');
});

test('16. calculateAverageTriageTime exibe fallback gracioso quando histórico for insuficiente', () => {
  const reqNoTriage: EducationalRequest[] = [
    {
      id: '1',
      protocol: 'EDU-2026-000001',
      category: 'infraestrutura',
      schoolId: 'esc-1',
      schoolName: 'Escola 1',
      subject: 'Teste',
      description: 'Teste',
      applicantName: 'Emerson',
      applicantRole: 'aluno',
      status: 'recebida',
      priority: 'alta',
      createdAt: '2026-10-15T08:00:00.000Z',
      updatedAt: '2026-10-15T08:00:00.000Z',
      history: [
        {
          id: 'h1',
          timestamp: '2026-10-15T08:00:00.000Z',
          status: 'recebida',
          author: 'Emerson',
          role: 'cidadao',
          note: 'Criada',
        },
      ],
    },
  ];

  const result = calculateAverageTriageTime(reqNoTriage);
  assert.equal(result.hasData, false);
  assert.equal(result.formatted, 'Dados insuficientes para calcular');
});

// ====================================================
// GRUPO F: Sanitização e Exportação CSV (Anti-Formula Injection)
// ====================================================

test('17. escapeCsvValue sanitiza caracteres de fórmula (=, +, -, @) para impedir CSV Injection', () => {
  // Previne execução maliciosa em planilhas Excel / Calc
  assert.equal(escapeCsvValue('=SUM(1+1)'), '"\'=SUM(1+1)"');
  assert.equal(escapeCsvValue('+cmd|...'), '"\'+cmd|..."');
  assert.equal(escapeCsvValue('-10'), '"\'-10"');
  assert.equal(escapeCsvValue('@macro'), '"\'@macro"');
});

test('18. escapeCsvValue escapa aspas duplas internas de acordo com RFC 4180', () => {
  assert.equal(escapeCsvValue('Texto "com aspas"'), '"Texto ""com aspas"""');
  assert.equal(escapeCsvValue(null), '""');
  assert.equal(escapeCsvValue(undefined), '""');
});

test('19. generateRequestsCsv injeta Byte Order Mark UTF-8 e gera cabeçalhos padronizados', () => {
  const sampleRequests: EducationalRequest[] = [
    {
      id: '1',
      protocol: 'EDU-2026-000001',
      category: 'infraestrutura',
      schoolId: 'esc-1',
      schoolName: 'Escola Municipal Dulce de Souza Barros',
      subject: 'Goteiras na Sala 04',
      description: 'Descrição de teste',
      applicantName: 'José Emerson Alves Saturno Barboza',
      applicantRole: 'aluno',
      status: 'em_atendimento',
      priority: 'alta',
      createdAt: '2026-10-15T08:30:00.000Z',
      updatedAt: '2026-10-18T14:20:00.000Z',
      history: [],
    },
  ];

  const csv = generateRequestsCsv(sampleRequests);
  assert.ok(csv.startsWith('\uFEFF'), 'CSV deve iniciar com BOM UTF-8');
  assert.ok(csv.includes('"Protocolo";"Escola";"Categoria";"Assunto"'));
  assert.ok(csv.includes('EDU-2026-000001'));
  assert.ok(
    !csv.includes('José Emerson Alves Saturno Barboza'),
    'Relatório gerencial não deve incluir o nome do solicitante.',
  );
});

// ====================================================
// GRUPO G: Rótulos e Configurações de Domínio
// ====================================================

test('20. CATEGORY_LABELS contempla todas as 7 categorias educacionais do desafio', () => {
  assert.ok(CATEGORY_LABELS.infraestrutura);
  assert.ok(CATEGORY_LABELS.transporte_escolar);
  assert.ok(CATEGORY_LABELS.alimentacao_merenda);
  assert.ok(CATEGORY_LABELS.material_didatico);
  assert.ok(CATEGORY_LABELS.apoio_pedagogico_inclusao);
  assert.ok(CATEGORY_LABELS.documentacao_transferencia);
  assert.ok(CATEGORY_LABELS.outros);
});

test('21. STATUS_CONFIG abrange todas as 6 etapas do ciclo de atendimento com metadados visuais', () => {
  const statuses = [
    'recebida',
    'em_triagem',
    'encaminhada',
    'em_atendimento',
    'concluida',
    'aguardando_informacoes',
  ] as const;
  statuses.forEach((s) => {
    assert.ok(STATUS_CONFIG[s], `Status ${s} deve estar configurado`);
    assert.ok(STATUS_CONFIG[s].label);
    assert.ok(STATUS_CONFIG[s].description);
  });
});
