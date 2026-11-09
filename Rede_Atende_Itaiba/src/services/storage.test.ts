import test from 'node:test';
import assert from 'node:assert/strict';
import { StorageService, STATE_KEY } from '../domain/RequestEngine';
import { INITIAL_REQUESTS, INITIAL_SCHOOLS } from './mockData';
import type { Appointment, EducationalRequest } from '../types';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  failWrite = false;
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
const fixed = () => new Date('2026-10-21T12:00:00Z');
const setup = () => {
  const memory = new MemoryStorage();
  const service = new StorageService(memory, fixed);
  service.init();
  return { memory, service };
};
const input = () => ({
  category: 'infraestrutura' as const,
  schoolId: 'esc-001',
  schoolName: 'Nome não confiável',
  subject: 'Bebedouro sem funcionamento',
  description: 'O bebedouro da sala está sem funcionamento desde ontem.',
  locationDetails: 'Sala 4',
  applicantName: 'Solicitante de demonstração',
  applicantRole: 'aluno' as const,
  priority: 'media' as const,
  privacyAcknowledged: true as const,
  categoryDetails: { natureza: 'Hidráulico' },
});
const appointment = (requestId?: string): Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'> => ({
  requestId,
  protocolRef: 'IGNORAR',
  schoolId: 'esc-001',
  schoolName: 'IGNORAR',
  type: 'Vistoria Técnica',
  technician: 'Técnico Fictício',
  date: '2026-11-02',
  time: '10:30',
  status: 'Agendada',
});
const move = (service: StorageService, requestId: string, status: EducationalRequest['status']) =>
  service.updateRequest(
    requestId,
    {
      status,
      assignedDepartment: 'Manutenção (Demonstração)',
      assignedTechnician: 'Técnico Fictício',
    },
    `Movimentação demonstrativa: ${status}`,
  );

test('Serviço: cadastro usa escola confiável, protocolo sequencial e histórico', () => {
  const { service } = setup();
  const req = service.createRequest(input());
  assert.equal(req.protocol, 'EDU-2026-000006');
  assert.equal(req.schoolName, INITIAL_SCHOOLS[0].name);
  assert.equal(req.status, 'recebida');
  assert.equal(req.history.length, 1);
  assert.equal(req.history[0].author, input().applicantName);
});
test('Serviço: novo objeto recupera cadastro após recarga', () => {
  const { memory, service } = setup();
  const req = service.createRequest(input());
  const next = new StorageService(memory, fixed);
  assert.deepEqual(next.getRequestByProtocol(`  ${req.protocol.toLowerCase()} `), req);
});
test('Serviço: mesma chave de envio é idempotente; novo envio gera outro protocolo', () => {
  const { service } = setup();
  const a = service.createRequest(input(), 'click');
  const b = service.createRequest(input(), 'click');
  const c = service.createRequest(input(), 'another');
  assert.equal(a.id, b.id);
  assert.notEqual(c.protocol, a.protocol);
  assert.equal(service.getRequests().length, 7);
});
test('Serviço: cadastros repetidos sem chave não colidem', () => {
  const { service } = setup();
  const requests = Array.from({ length: 30 }, () => service.createRequest(input()));
  assert.equal(new Set(requests.map((r) => r.protocol)).size, 30);
});
for (const [field, value] of Object.entries({
  category: 'invalid',
  schoolId: 'inexistente',
  subject: '   ',
  description: 'curta',
  locationDetails: '',
  applicantName: '  ',
  applicantRole: 'admin',
  priority: 'crítica',
})) {
  test(`Serviço: bloqueia cadastro inválido em ${field}`, () => {
    const { memory, service } = setup();
    const before = memory.getItem(STATE_KEY);
    assert.throws(() =>
      service.createRequest({ ...input(), [field]: value } as ReturnType<typeof input>),
    );
    assert.equal(memory.getItem(STATE_KEY), before);
  });
}
test('Serviço: usa o ano corrente e reinicia a sequência por ano', () => {
  const { memory, service } = setup();
  service.createRequest(input());
  const later = new StorageService(memory, () => new Date('2027-01-02T12:00:00Z'));
  assert.equal(later.createRequest(input()).protocol, 'EDU-2027-000001');
});
test('Migração: v1 reconhece protocolo curto e não altera chave antiga', () => {
  const memory = new MemoryStorage();
  const legacy = [{ ...INITIAL_REQUESTS[1], protocol: 'EDU-1842' }];
  const raw = JSON.stringify(legacy);
  memory.setItem('educonecta_requests_v1', raw);
  memory.setItem('educonecta_next_seq_v1', '10x');
  const service = new StorageService(memory, fixed);
  assert.equal(service.createRequest(input()).protocol, 'EDU-2026-001843');
  assert.equal(memory.getItem('educonecta_requests_v1'), raw);
  assert.equal(service.getRequestByProtocol('EDU-1842')?.id, legacy[0].id);
});
test('Migração: v2 respeita contador inteiro maior que a base', () => {
  const memory = new MemoryStorage();
  memory.setItem('redeatende_requests_v2', JSON.stringify([]));
  memory.setItem('redeatende_next_seq_v2', '42');
  const service = new StorageService(memory, fixed);
  assert.equal(service.createRequest(input()).protocol, 'EDU-2026-000042');
});
test('Migração: v3 tem precedência sobre v2 e migra agenda existente', () => {
  const memory = new MemoryStorage();
  memory.setItem('redeatende_requests_v3', JSON.stringify(INITIAL_REQUESTS));
  memory.setItem('redeatende_requests_v2', '[]');
  memory.setItem('redeatende_appointments_v3', '[]');
  const service = new StorageService(memory, fixed);
  assert.equal(service.getRequests().length, 5);
  assert.equal(service.getAppointments().length, 0);
});
test('Migração: base vazia permanece vazia, sem recriar exemplos', () => {
  const memory = new MemoryStorage();
  memory.setItem('redeatende_requests_v3', '[]');
  const service = new StorageService(memory, fixed);
  assert.equal(service.getRequests().length, 0);
  assert.equal(service.getDashboardMetrics().total, 0);
});
test('Migração: JSON corrompido é preservado, sem sobrescrita silenciosa', () => {
  const memory = new MemoryStorage();
  memory.setItem('redeatende_requests_v3', '{oops');
  assert.throws(() => new StorageService(memory, fixed).init(), /migrar/);
  assert.equal(memory.getItem('redeatende_requests_v3'), '{oops');
  assert.equal(memory.getItem(STATE_KEY), null);
});
test('Migração: protocolos duplicados bloqueiam migração sem perder originais', () => {
  const memory = new MemoryStorage();
  memory.setItem(
    'redeatende_requests_v3',
    JSON.stringify([INITIAL_REQUESTS[0], { ...INITIAL_REQUESTS[0], id: 'other' }]),
  );
  assert.throws(() => new StorageService(memory, fixed).init());
  assert.equal(memory.getItem(STATE_KEY), null);
});
test('Serviço: contador no limite impede novo cadastro sem mutação', () => {
  const { service, memory } = setup();
  const state = JSON.parse(memory.getItem(STATE_KEY)!);
  state.nextSequenceByYear['2026'] = 1000000;
  memory.setItem(STATE_KEY, JSON.stringify(state));
  assert.throws(() => service.createRequest(input()), /limite/);
  assert.equal(service.getRequests().length, 5);
});
test('Serviço: falha de gravação não cria cadastro nem consome protocolo', () => {
  const { service, memory } = setup();
  const before = memory.getItem(STATE_KEY);
  memory.failWrite = true;
  assert.throws(() => service.createRequest(input()), /gravar/);
  assert.equal(memory.getItem(STATE_KEY), before);
  memory.failWrite = false;
  assert.equal(service.createRequest(input()).protocol, 'EDU-2026-000006');
});
test('Serviço: dados atuais corrompidos não retornam exemplos de sucesso', () => {
  const { service, memory } = setup();
  memory.setItem(STATE_KEY, '{oops');
  assert.throws(() => service.getRequests(), /inválidos/);
  assert.equal(memory.getItem(STATE_KEY), '{oops');
});
test('Fluxo: trajetória canônica, atribuições e histórico completos', () => {
  const { service } = setup();
  const req = service.createRequest(input());
  for (const status of ['em_triagem', 'encaminhada', 'em_atendimento', 'concluida'] as const)
    move(service, req.id, status);
  const saved = service.getRequestById(req.id)!;
  assert.equal(saved.history.length, 5);
  assert.equal(saved.history.at(-1)?.previousStatus, 'em_atendimento');
  assert.equal(saved.history.at(-1)?.status, 'concluida');
  assert.ok(saved.history.every((h) => h.author && !isNaN(Date.parse(h.timestamp)) && h.note));
});
test('Fluxo: salto de recebida para concluída não altera dados', () => {
  const { service, memory } = setup();
  const req = service.createRequest(input());
  const before = memory.getItem(STATE_KEY);
  assert.throws(() => move(service, req.id, 'concluida'), /Transição/);
  assert.equal(memory.getItem(STATE_KEY), before);
});
test('Fluxo: pendência volta para triagem, sem saltar para atendimento', () => {
  const { service } = setup();
  const req = service.createRequest(input());
  move(service, req.id, 'aguardando_informacoes');
  assert.throws(() => move(service, req.id, 'em_atendimento'));
  assert.equal(move(service, req.id, 'em_triagem').status, 'em_triagem');
});
test('Fluxo: encaminhamento requer setor e responsável', () => {
  const { service } = setup();
  const req = service.createRequest(input());
  service.updateRequest(req.id, { status: 'em_triagem' });
  assert.throws(
    () => service.updateRequest(req.id, { status: 'encaminhada' }),
    /setor e responsável/,
  );
});
test('Fluxo: protocolo, histórico e indicadores SEI são protegidos', () => {
  const { service } = setup();
  const req = service.createRequest(input());
  for (const updates of [{ protocol: 'EDU-2026-777777' }, { history: [] }, { seiIntegrated: true }])
    assert.throws(() => service.updateRequest(req.id, updates), /protegido/);
});
test('Fluxo: mudança de prioridade exige justificativa e registra histórico', () => {
  const { service } = setup();
  const req = service.createRequest(input());
  assert.throws(() => service.updateRequest(req.id, { priority: 'urgente' }), /Justifique/);
  const updated = service.updateRequest(
    req.id,
    { priority: 'urgente' },
    'Risco observado no equipamento durante a análise.',
  );
  assert.equal(updated.history.length, 2);
  assert.ok(updated.history[1].note);
});
test('Fluxo: erro na gravação do despacho preserva status e histórico', () => {
  const { service, memory } = setup();
  const req = service.createRequest(input());
  const before = memory.getItem(STATE_KEY);
  memory.failWrite = true;
  assert.throws(() => move(service, req.id, 'em_triagem'));
  assert.equal(memory.getItem(STATE_KEY), before);
});
test('Indicadores: cadastro, modificação, conclusão e restauração usam a mesma base', () => {
  const { service } = setup();
  const initial = service.getDashboardMetrics();
  const req = service.createRequest(input());
  assert.equal(service.getDashboardMetrics().total, initial.total + 1);
  move(service, req.id, 'em_triagem');
  assert.equal(service.getDashboardMetrics().inTriage, initial.inTriage + 1);
  for (const status of ['encaminhada', 'em_atendimento', 'concluida'] as const)
    move(service, req.id, status);
  const final = service.getDashboardMetrics();
  assert.equal(final.completed, initial.completed + 1);
  assert.equal(final.open, initial.open);
  assert.equal(
    service.getSchools()[0].activeRequestsCount,
    service.getRequests().filter((r) => r.schoolId === 'esc-001' && r.status !== 'concluida')
      .length,
  );
  service.resetToDefaults();
  assert.deepEqual(service.getDashboardMetrics(), initial);
});
test('SEI: recebida e aguardando informações são inelegíveis no serviço', () => {
  const { service } = setup();
  const req = service.createRequest(input());
  assert.throws(() => service.simulateSeiDispatch(req.id));
  move(service, req.id, 'aguardando_informacoes');
  assert.throws(() => service.simulateSeiDispatch(req.id));
  assert.throws(() => service.simulateSeiDispatch('missing'));
});
test('SEI: criação elegível persiste log, vínculo e histórico; repetição falha', () => {
  const { service, memory } = setup();
  const result = service.simulateSeiDispatch('req-002');
  assert.match(result.seiNumber, /^SIM-SEI-/);
  const saved = new StorageService(memory, fixed);
  assert.equal(saved.getRequestById('req-002')?.seiProcessNumber, result.seiNumber);
  assert.ok(saved.getRequestById('req-002')?.history.at(-1)?.note.includes('Nenhum processo real'));
  assert.equal(saved.getSeiLogs()[0].seiNumber, result.seiNumber);
  assert.throws(() => saved.simulateSeiDispatch('req-002'));
});
test('SEI: falha de persistência não deixa log ou vínculo parcial', () => {
  const { service, memory } = setup();
  const before = memory.getItem(STATE_KEY);
  memory.failWrite = true;
  assert.throws(() => service.simulateSeiDispatch('req-002'));
  assert.equal(memory.getItem(STATE_KEY), before);
});
test('SEI: demanda concluída não gera processo novo', () => {
  const { service } = setup();
  assert.throws(() => service.simulateSeiDispatch('req-004'));
});
test('Agenda: criação com vínculo válido normaliza escola e protocolo e persiste histórico', () => {
  const { service, memory } = setup();
  const a = service.createAppointment(appointment('req-002'));
  assert.equal(a.protocolRef, 'EDU-2026-000002');
  assert.equal(a.schoolId, 'esc-004');
  assert.equal(new StorageService(memory, fixed).getAppointments()[0].id, a.id);
  assert.match(service.getRequestById('req-002')!.history.at(-1)!.note, /agendamento criado/);
});
test('Agenda: vínculo inexistente não cria atendimento', () => {
  const { service, memory } = setup();
  const before = memory.getItem(STATE_KEY);
  assert.throws(() => service.createAppointment(appointment('missing')), /inexistente/);
  assert.equal(memory.getItem(STATE_KEY), before);
});
for (const fields of [
  { date: '2026-02-31' },
  { date: '2020-01-01' },
  { time: '25:99' },
  { technician: ' ' },
  { schoolId: 'missing' },
])
  test(`Agenda: rejeita ${JSON.stringify(fields)}`, () => {
    const { service } = setup();
    assert.throws(() => service.createAppointment({ ...appointment(), ...fields }));
  });
test('Agenda: edição de data e responsável atualiza histórico e persiste', () => {
  const { service } = setup();
  const a = service.createAppointment(appointment('req-002'));
  const saved = service.updateAppointment(a.id, {
    date: '2026-11-03',
    technician: 'Outro Técnico Fictício',
  });
  assert.equal(saved.date, '2026-11-03');
  assert.match(service.getRequestById('req-002')!.history.at(-1)!.note, /Outro Técnico/);
});
test('Agenda: bloqueia conflito de responsável no mesmo horário', () => {
  const { service } = setup();
  service.createAppointment(appointment());
  assert.throws(() => service.createAppointment(appointment()), /mesmo horário/);
});
test('Agenda: confirmação, cancelamento com motivo e bloqueio de edição terminal', () => {
  const { service } = setup();
  const a = service.createAppointment(appointment('req-002'));
  assert.equal(service.updateAppointment(a.id, { status: 'Confirmada' }).status, 'Confirmada');
  assert.throws(() => service.cancelAppointment(a.id, ''), /motivo/);
  const cancelled = service.cancelAppointment(a.id, 'Reagendamento solicitado');
  assert.equal(cancelled.status, 'Cancelada');
  assert.match(service.getRequestById('req-002')!.history.at(-1)!.note, /Reagendamento/);
  assert.throws(() => service.updateAppointment(a.id, { status: 'Realizada' }));
});
test('Agenda: conclusão registra histórico e impede cancelamento posterior', () => {
  const { service } = setup();
  const a = service.createAppointment(appointment('req-002'));
  service.updateAppointment(a.id, { status: 'Realizada' });
  assert.match(service.getRequestById('req-002')!.history.at(-1)!.note, /Realizada/);
  assert.throws(() => service.cancelAppointment(a.id, 'Tarde demais'));
});
test('Agenda: falha de gravação preserva atendimento e histórico juntos', () => {
  const { service, memory } = setup();
  const before = memory.getItem(STATE_KEY);
  memory.failWrite = true;
  assert.throws(() => service.createAppointment(appointment('req-002')));
  assert.equal(memory.getItem(STATE_KEY), before);
});
test('Restauração: falha de gravação preserva base anterior inteira', () => {
  const { service, memory } = setup();
  service.createRequest(input());
  const before = memory.getItem(STATE_KEY);
  memory.failWrite = true;
  assert.throws(() => service.resetToDefaults());
  assert.equal(memory.getItem(STATE_KEY), before);
});
test('Serviço: inicialização sem permissão de escrita não informa sucesso', () => {
  const memory = new MemoryStorage();
  memory.failWrite = true;
  assert.throws(() => new StorageService(memory, fixed).init(), /gravar/);
  assert.equal(memory.length, 0);
});
test('Migração: duplicidade entre formato curto e canônico é detectada', () => {
  const memory = new MemoryStorage();
  memory.setItem(
    'redeatende_requests_v3',
    JSON.stringify([
      INITIAL_REQUESTS[0],
      { ...INITIAL_REQUESTS[0], id: 'another', protocol: 'EDU-1' },
    ]),
  );
  assert.throws(() => new StorageService(memory, fixed).init());
  assert.equal(memory.getItem(STATE_KEY), null);
});
test('Migração: sequência de protocolo zero é inválida e preservada para recuperação', () => {
  const memory = new MemoryStorage();
  const raw = JSON.stringify([{ ...INITIAL_REQUESTS[0], protocol: 'EDU-2026-000000' }]);
  memory.setItem('redeatende_requests_v3', raw);
  assert.throws(() => new StorageService(memory, fixed).init());
  assert.equal(memory.getItem('redeatende_requests_v3'), raw);
});
test('Migração: contador de ano anterior não avança sequência do ano novo', () => {
  const memory = new MemoryStorage();
  memory.setItem('redeatende_requests_v3', JSON.stringify(INITIAL_REQUESTS));
  memory.setItem('redeatende_next_seq_v3', '500');
  const service = new StorageService(memory, () => new Date('2027-01-02T12:00:00Z'));
  assert.equal(service.createRequest(input()).protocol, 'EDU-2027-000001');
});

test('alterações no mesmo instante recebem versões de atualização distintas', () => {
  const { service } = setup();
  const request = service.createRequest(input());
  const first = service.updateRequest(request.id, {}, 'Primeiro parecer fictício.');
  const second = service.updateRequest(request.id, {}, 'Segundo parecer fictício.');
  assert.ok(first.updatedAt > request.updatedAt);
  assert.ok(second.updatedAt > first.updatedAt);
});
