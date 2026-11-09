import test from 'node:test';
import assert from 'node:assert/strict';
import { StorageService, STATE_KEY } from '../domain/RequestEngine';
import { INITIAL_REQUESTS, INITIAL_SCHOOLS } from './mockData';
import { requestFormSchema } from '../domain/schemas';
import { DEFAULT_DEADLINE_RULES } from '../domain/serviceCatalog';
import { formatBrazilianPhone, nextStep } from '../utils/helpers';
class Memory implements Storage {
  values = new Map<string, string>();
  fail = false;
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  key(i: number) {
    return [...this.values.keys()][i] || null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error('Quota');
    this.values.set(key, value);
  }
}
const now = () => new Date('2026-10-21T12:00:00Z');
const setup = () => {
  const memory = new Memory();
  const service = new StorageService(memory, now);
  service.init();
  const state = JSON.parse(memory.getItem(STATE_KEY)!);
  state.appointments = [];
  memory.setItem(STATE_KEY, JSON.stringify(state));
  return { service, memory };
};
const input = {
  category: 'infraestrutura' as const,
  schoolId: 'esc-001',
  schoolName: '',
  subject: 'Reparo demonstrativo',
  description: 'Situação fictícia para validar o fluxo completo de atendimento.',
  locationDetails: 'Sala 02',
  applicantName: 'Pessoa fictícia',
  applicantContact: '',
  applicantRole: 'comunidade' as const,
  priority: 'media' as const,
  privacyAcknowledged: true as const,
  categoryDetails: { natureza: 'Hidráulico', condicao: 'Vazamento observado' },
};
const orderInput = {
  requestId: 'req-001',
  title: 'Corrigir vazamento fictício',
  department: 'Manutenção (demonstração)',
  technician: 'Equipe demonstrativa',
  required: true,
};

test('Catálogo: seis referências de Itaíba, três evidências 2026 e nenhum contato/código inventado', () => {
  assert.equal(INITIAL_SCHOOLS.length, 6);
  assert.equal(INITIAL_SCHOOLS.filter((s) => s.verification === 'evidencia_2026').length, 3);
  for (const s of INITIAL_SCHOOLS) {
    assert.equal(s.code, '');
    assert.equal(s.principal, '');
    assert.equal(s.contactPhone, '');
    assert.match(s.sourceUrl!, /itaiba.pe.gov.br/);
  }
});
test('Formulário: detalhes obrigatórios são validados no serviço', () => {
  const { service } = setup();
  assert.throws(() => service.createRequest({ ...input, categoryDetails: {} }), /tipo de problema/);
  assert.throws(
    () =>
      service.createRequest({
        ...input,
        categoryDetails: { natureza: 'inexistente' },
      }),
    /opção válida/,
  );
});
test('Formulário: transporte exige rota e turno sem alterar a escola', () => {
  const parsed = requestFormSchema.parse({
    ...input,
    category: 'transporte_escolar',
    schoolId: 'esc-003',
    categoryDetails: { rota: 'Rota de demonstração', turno: 'Tarde' },
  });
  assert.equal(parsed.schoolId, 'esc-003');
});
test('Formulário: alimentação rejeita data inexistente', () => {
  for (const date of ['2026-02-31', '2026-13-01', 'data'])
    assert.equal(
      requestFormSchema.safeParse({
        ...input,
        category: 'alimentacao_merenda',
        categoryDetails: {
          natureza: 'Distribuição',
          turno: 'Manhã',
          data: date,
        },
      }).success,
      false,
    );
});
test('Telefone: máscara de fixo, celular, vazio e limite', () => {
  assert.equal(formatBrazilianPhone('81912345678'), '(81) 91234-5678');
  assert.equal(formatBrazilianPhone('8133334444'), '(81) 3333-4444');
  assert.equal(formatBrazilianPhone(''), '');
  assert.equal(formatBrazilianPhone('81912345678999'), '(81) 91234-5678');
});
test('Privacidade: ciência explícita é obrigatória no Zod', () => {
  assert.equal(
    requestFormSchema.safeParse({ ...input, privacyAcknowledged: false }).success,
    false,
  );
  assert.equal(requestFormSchema.safeParse({ ...input, privacyAcknowledged: true }).success, true);
});
test('Telefone: contato parcial não é aceito e contato vazio é opcional', () => {
  assert.equal(
    requestFormSchema.safeParse({ ...input, applicantContact: '(81) 912' }).success,
    false,
  );
  assert.equal(requestFormSchema.safeParse(input).success, true);
});
test('Previsão: usa regras por categoria e preserva data ao mudar prioridade', () => {
  const { service } = setup();
  const r = service.createRequest(input);
  assert.equal(r.deadline, '2026-11-04T12:00:00.000Z');
  const next = service.updateRequest(
    r.id,
    { priority: 'alta' },
    'Impacto no acesso ao ambiente escolar.',
  );
  assert.equal(next.deadline, r.deadline);
  assert.ok(next.priorityReason);
});
test('Prazos: configura novos registros sem alterar demandas existentes', () => {
  const { service } = setup();
  const r = service.createRequest(input);
  service.configureDeadlineRules(
    { baixa: 20, media: 12, alta: 4, urgente: 1 },
    'Revisão da capacidade da equipe demonstrativa.',
  );
  assert.equal(service.getRequestById(r.id)?.deadline, r.deadline);
  assert.equal(service.createRequest(input).deadline, '2026-11-02T12:00:00.000Z');
  assert.equal(service.getRuleHistory().length, 1);
});
test('Prazos: rejeita ordem incoerente e valores fora dos limites atomicamente', () => {
  const { service, memory } = setup();
  const before = memory.getItem(STATE_KEY);
  for (const rules of [
    { ...DEFAULT_DEADLINE_RULES, urgente: 20 },
    { ...DEFAULT_DEADLINE_RULES, media: 0 },
    { ...DEFAULT_DEADLINE_RULES, baixa: 1.5 },
  ])
    assert.throws(() => service.configureDeadlineRules(rules, 'Justificativa demonstrativa.'));
  assert.equal(memory.getItem(STATE_KEY), before);
});
test('Prazos: reavaliação exige motivo, data futura e preserva antes/depois', () => {
  const { service } = setup();
  const r = service.createRequest(input);
  assert.throws(() => service.updateRequest(r.id, { deadline: '2026-11-10T12:00:00Z' }), /motivo/);
  assert.throws(
    () =>
      service.updateRequest(r.id, { deadline: '2026-01-01T12:00:00Z' }, 'Data de teste anterior.'),
    /futura/,
  );
  const updated = service.updateRequest(
    r.id,
    { deadline: '2026-11-10T12:00:00Z' },
    'Aguardar reposição do material necessário.',
  );
  assert.equal(updated.history.at(-1)?.changes?.deadline.before, r.deadline);
  assert.ok(updated.deadlineReason);
});
test('Informação: solicitação e resposta retomam triagem e avisam gestão', () => {
  const { service } = setup();
  const r = service.createRequest(input);
  const waiting = service.updateRequest(
    r.id,
    { status: 'aguardando_informacoes' },
    'Informe o turno em que ocorreu a situação.',
  );
  const info = waiting.informationRequests![0];
  assert.equal(waiting.status, 'aguardando_informacoes');
  const replied = service.replyToInformation(r.id, info.id, 'Ocorreu no turno da manhã.');
  assert.equal(replied.status, 'em_triagem');
  assert.equal(replied.informationRequests![0].response, 'Ocorreu no turno da manhã.');
  assert.ok(
    service.getNotifications('gestao', r.id).some((n) => n.message.includes('complementares')),
  );
  assert.throws(() => service.replyToInformation(r.id, info.id, 'Reenvio indevido.'));
});
test('Informação: pedido sem pergunta e resposta vazia são bloqueados', () => {
  const { service } = setup();
  const r = service.createRequest(input);
  assert.throws(
    () => service.updateRequest(r.id, { status: 'aguardando_informacoes' }),
    /complementares/,
  );
  const waiting = service.updateRequest(
    r.id,
    { status: 'aguardando_informacoes' },
    'Informe a localidade.',
  );
  assert.throws(() => service.replyToInformation(r.id, waiting.informationRequests![0].id, '  '));
  assert.throws(() => service.replyToInformation(r.id, 'inexistente', 'Uma resposta válida.'));
});
test('Informação: pendência não pode ser ignorada na conclusão', () => {
  const { service } = setup();
  const r = service.createRequest(input);
  service.updateRequest(r.id, { status: 'aguardando_informacoes' }, 'Informe o turno.');
  service.updateRequest(r.id, { status: 'em_triagem' });
  service.updateRequest(r.id, {
    status: 'encaminhada',
    assignedDepartment: 'Equipe',
    assignedTechnician: 'Demonstração',
  });
  service.updateRequest(r.id, { status: 'em_atendimento' });
  assert.throws(
    () => service.updateRequest(r.id, { status: 'concluida' }, 'Conclusão sem resposta.'),
    /informações complementares pendentes/,
  );
});
test('Privacidade: nota interna não vai para projeção pública ou notificação', () => {
  const { service } = setup();
  service.updateRequest(
    'req-001',
    {},
    'Análise interna fictícia restrita.',
    undefined,
    undefined,
    false,
    { visibility: 'interna' },
  );
  const publicData = service.getPublicRequestByProtocol('EDU-2026-000001')!;
  assert.ok(!JSON.stringify(publicData).includes('Análise interna fictícia restrita'));
  assert.ok(!publicData.assignedTechnician);
  assert.equal(service.getNotifications('comunidade', 'req-001').length, 0);
  assert.ok(service.getRequestById('req-001')?.history.at(-1)?.visibility === 'interna');
});
test('Privacidade: mudança de situação é sempre pública e técnico exige divulgação explícita', () => {
  const { service } = setup();
  service.updateRequest(
    'req-002',
    { status: 'encaminhada' },
    'Encaminhamento ao setor.',
    undefined,
    undefined,
    false,
    { visibility: 'interna', publicResponsible: true },
  );
  assert.equal(service.getRequestById('req-002')?.history.at(-1)?.visibility, 'publica');
  assert.ok(service.getPublicRequestByProtocol('EDU-2026-000002')?.assignedTechnician);
});
test('Notificações: leitura persistida e separação entre públicos', () => {
  const { service, memory } = setup();
  const r = service.createRequest(input);
  const n = service.getNotifications('gestao', r.id)[0];
  assert.equal(service.getNotifications('comunidade', r.id).length, 0);
  service.markNotificationRead(n.id);
  assert.ok(new StorageService(memory, now).getNotifications('gestao', r.id)[0].readAt);
  assert.throws(() => service.markNotificationRead('missing'));
});
test('OS: vínculo, numeração e histórico sobrevivem à recarga', () => {
  const { service, memory } = setup();
  const w = service.createWorkOrder(orderInput);
  assert.equal(w.number, 'OS-DEMO-000001');
  assert.equal(new StorageService(memory, now).getWorkOrders('req-001')[0].id, w.id);
  assert.ok(service.getRequestById('req-001')?.history.at(-1)?.note.includes(w.number));
});
test('OS: rejeita demanda inexistente, recebida ou concluída', () => {
  const { service } = setup();
  const r = service.createRequest(input);
  for (const requestId of ['missing', r.id, 'req-004'])
    assert.throws(() => service.createWorkOrder({ ...orderInput, requestId }));
});
test('OS: conclusão de solicitação bloqueada até executar ordem obrigatória', () => {
  const { service } = setup();
  const w = service.createWorkOrder(orderInput);
  assert.throws(
    () => service.updateRequest('req-001', { status: 'concluida' }, 'Reparo finalizado.'),
    /ordens de serviço obrigatórias/,
  );
  service.updateWorkOrder(w.id, 'em_execucao', 'Equipe executando reparo demonstrativo.');
  service.updateWorkOrder(w.id, 'concluida', 'Vazamento corrigido e verificado.');
  assert.equal(
    service.updateRequest(
      'req-001',
      { status: 'concluida' },
      'Reparo finalizado e equipamento liberado.',
    ).resolution,
    'Reparo finalizado e equipamento liberado.',
  );
});
test('OS: pendência não libera conclusão e cancelamento exige motivo', () => {
  const { service } = setup();
  const w = service.createWorkOrder(orderInput);
  service.updateWorkOrder(w.id, 'pendente', 'Aguardando peça de reposição.');
  assert.throws(
    () => service.updateRequest('req-001', { status: 'concluida' }, 'Tentativa de concluir.'),
    /obrigatórias/,
  );
  assert.throws(() => service.updateWorkOrder(w.id, 'cancelada', ''));
  const cancelled = service.updateWorkOrder(
    w.id,
    'cancelada',
    'Atividade substituída por solução registrada no protocolo.',
  );
  assert.ok(cancelled.cancellationReason);
  assert.equal(
    service.updateRequest(
      'req-001',
      { status: 'concluida' },
      'Providência alternativa final registrada.',
    ).status,
    'concluida',
  );
});
test('OS: matriz bloqueia saltos e edição de ordem terminal', () => {
  const { service } = setup();
  const w = service.createWorkOrder(orderInput);
  assert.throws(() => service.updateWorkOrder(w.id, 'concluida', 'Sem etapa de execução.'));
  service.updateWorkOrder(w.id, 'em_execucao', 'Execução iniciada.');
  service.updateWorkOrder(w.id, 'concluida', 'Atividade realizada.');
  assert.throws(() => service.updateWorkOrder(w.id, 'pendente', 'Tentativa tardia.'));
});
test('OS e agenda: vistoria vinculada bloqueia fechamento e respeita conflito', () => {
  const { service, memory } = setup();
  const w = service.createWorkOrder({
    ...orderInput,
    inspectionDate: '2026-11-01',
    inspectionTime: '10:00',
  });
  assert.ok(w.appointmentId);
  const before = memory.getItem(STATE_KEY);
  assert.throws(
    () =>
      service.createWorkOrder({
        ...orderInput,
        inspectionDate: '2026-11-01',
        inspectionTime: '10:00',
      }),
    /mesmo horário/,
  );
  assert.equal(memory.getItem(STATE_KEY), before);
  service.updateWorkOrder(w.id, 'em_execucao', 'Equipe em atendimento.');
  assert.throws(() => service.updateWorkOrder(w.id, 'concluida', 'Reparo conferido.'), /vistoria/);
  service.updateAppointment(w.appointmentId!, {
    status: 'Realizada',
    notes: 'Vistoria realizada.',
  });
  assert.equal(service.updateWorkOrder(w.id, 'concluida', 'Reparo conferido.').status, 'concluida');
});
test('OS e agenda: cancelamento justificado encerra vistoria de forma atômica', () => {
  const { service, memory } = setup();
  const w = service.createWorkOrder({
    ...orderInput,
    inspectionDate: '2026-11-01',
    inspectionTime: '10:00',
  });
  const notes = 'Observação técnica '.padEnd(2000, 'a');
  const reason = 'Visita dispensada após análise da equipe. '.padEnd(4000, 'b');
  service.updateAppointment(w.appointmentId!, { notes });
  service.updateWorkOrder(w.id, 'cancelada', reason);
  const reloaded = new StorageService(memory, now);
  const appointment = reloaded.getAppointments().find((a) => a.id === w.appointmentId)!;
  assert.equal(appointment.status, 'Cancelada');
  assert.equal(appointment.notes, notes);
  assert.equal(appointment.cancellationReason, reason);
  assert.equal(
    reloaded.getWorkOrders().find((order) => order.id === w.id)?.cancellationReason,
    reason,
  );
  assert.ok(
    reloaded
      .getRequestById(w.requestId)!
      .history.some((event) => event.action === 'agenda' && event.note.includes(reason)),
  );
});
test('Agenda: não agenda novas atividades em solicitação concluída', () => {
  const { service } = setup();
  assert.throws(
    () =>
      service.createAppointment({
        requestId: 'req-004',
        protocolRef: '',
        schoolId: 'esc-001',
        schoolName: '',
        type: 'Vistoria de teste',
        technician: 'Técnico fictício',
        date: '2026-11-01',
        time: '11:00',
        status: 'Agendada',
      }),
    /Reabra/,
  );
});
test('Conclusão: requer providência final e agenda sem atividades pendentes', () => {
  const { service } = setup();
  assert.throws(
    () => service.updateRequest('req-001', { status: 'concluida' }),
    /providência final/,
  );
  const a = service.createAppointment({
    requestId: 'req-001',
    protocolRef: '',
    schoolId: 'esc-001',
    schoolName: '',
    type: 'Vistoria de teste',
    technician: 'Técnico fictício',
    date: '2026-11-01',
    time: '11:00',
    status: 'Agendada',
  });
  assert.throws(
    () => service.updateRequest('req-001', { status: 'concluida' }, 'Resultado final.'),
    /agendados pendentes/,
  );
  service.cancelAppointment(a.id, 'Visita dispensada por verificação concluída.');
  assert.equal(
    service.updateRequest('req-001', { status: 'concluida' }, 'Resultado final.').status,
    'concluida',
  );
});
test('Satisfação: disponível após conclusão, de 1 a 5 e uma única vez', () => {
  const { service } = setup();
  assert.throws(() => service.rateRequest('req-001', 5));
  assert.throws(() => service.rateRequest('req-004', 0));
  service.rateRequest('req-004', 4, 'Atendimento satisfatório.');
  assert.equal(service.getRequestById('req-004')?.satisfaction?.rating, 4);
  assert.throws(() => service.rateRequest('req-004', 5));
});
for (const operation of ['os', 'info', 'rules', 'rating', 'notification'] as const)
  test(`Atomicidade: falha de armazenamento em ${operation} preserva a base`, () => {
    const { service, memory } = setup();
    const r = service.createRequest(input);
    const waiting = service.updateRequest(
      r.id,
      { status: 'aguardando_informacoes' },
      'Informe o turno.',
    );
    const before = memory.getItem(STATE_KEY);
    memory.fail = true;
    assert.throws(() => {
      if (operation === 'os') service.createWorkOrder(orderInput);
      if (operation === 'info')
        service.replyToInformation(r.id, waiting.informationRequests![0].id, 'Turno da manhã.');
      if (operation === 'rules')
        service.configureDeadlineRules(DEFAULT_DEADLINE_RULES, 'Revisão da equipe.');
      if (operation === 'rating') service.rateRequest('req-004', 5);
      if (operation === 'notification')
        service.markNotificationRead(service.getNotifications('gestao')[0].id);
    });
    assert.equal(memory.getItem(STATE_KEY), before);
  });
test('Compatibilidade: base v4 recebe novos módulos sem perder protocolo, histórico ou chaves', () => {
  const { service, memory } = setup();
  const state = JSON.parse(memory.getItem(STATE_KEY)!);
  delete state.catalogRevision;
  delete state.workOrders;
  delete state.notifications;
  delete state.ruleHistory;
  delete state.deadlineRules;
  state.schools[0].name = 'Escola Demonstrativa 01 — Centro';
  const history = JSON.stringify(state.requests[0].history);
  memory.setItem(STATE_KEY, JSON.stringify(state));
  service.init();
  assert.equal(service.getRequests()[0].protocol, INITIAL_REQUESTS[0].protocol);
  assert.equal(JSON.stringify(service.getRequests()[0].history), history);
  assert.equal(service.getSchools()[0].name, INITIAL_SCHOOLS[0].name);
  assert.deepEqual(service.getWorkOrders(), []);
});
test('Próximo passo: mensagem específica para recebida, pendente e concluída', () => {
  assert.match(nextStep({ ...INITIAL_REQUESTS[0], status: 'recebida' }), /triagem/);
  assert.match(nextStep({ ...INITIAL_REQUESTS[0], status: 'aguardando_informacoes' }), /Envie/);
  assert.match(nextStep({ ...INITIAL_REQUESTS[0], status: 'concluida' }), /avalie/);
});

test('Privacidade: agenda pública oculta responsáveis sem divulgação explícita e preserva auditoria', () => {
  const { service } = setup();
  service.createAppointment({
    requestId: 'req-001',
    protocolRef: '',
    schoolId: 'esc-001',
    schoolName: '',
    type: 'Vistoria demonstrativa',
    technician: 'Responsável reservado de teste',
    date: '2026-11-02',
    time: '11:00',
    status: 'Agendada',
  });
  assert.match(
    JSON.stringify(service.getRequestById('req-001')!.history),
    /Responsável reservado de teste/,
  );
  assert.ok(
    !JSON.stringify(service.getPublicRequestByProtocol('EDU-2026-000001')!).includes(
      'Responsável reservado de teste',
    ),
  );
});
