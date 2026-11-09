import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const directory = await mkdtemp(join(tmpdir(), 'rede-atende-agenda-final-'));
Object.assign(process.env, {
  DB_MODE: 'embedded',
  DATA_DIR: join(directory, 'data'),
  UPLOAD_DIR: join(directory, 'uploads'),
  SEED_ACCESS_FILE: join(directory, 'access.txt'),
});
const password = 'Somente-Teste-Agenda-123456';
for (const role of ['GESTOR', 'OPERADOR', 'AUDITOR', 'CIDADAO'])
  process.env[`SEED_${role}_PASSWORD`] = password;
const { buildApp } = await import('../app');
const { seed } = await import('../db/seed');
const { closeDatabase } = await import('../db/database');
const app = await buildApp();
type Actor = { cookie: string; csrf: string };
let manager: Actor, auditor: Actor;
async function call(
  actor: Actor | undefined,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url: '/api/v1' + path,
    headers: {
      'X-Requested-With': 'RedeAtende',
      ...(actor ? { cookie: actor.cookie, 'X-CSRF-Token': actor.csrf } : {}),
      ...(method === 'POST' ? { 'Idempotency-Key': randomUUID() } : {}),
    },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}
async function login(role: string) {
  const response = await call(undefined, 'POST', '/auth/login', {
    email: role + '@redeatende.invalid',
    password,
  });
  assert.equal(response.statusCode, 200, response.body);
  return { cookie: 'ra_session=' + response.cookies[0].value, csrf: response.json().csrf };
}
async function appointment(notes: string) {
  const response = await call(manager, 'POST', '/appointments', {
    schoolId: 'esc-001',
    schoolName: '',
    protocolRef: 'DEMANDA-GERAL',
    type: 'Vistoria fictícia',
    technician: 'Equipe ' + randomUUID(),
    date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    time: '09:00',
    status: 'Agendada',
    notes,
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
before(async () => {
  await seed();
  manager = await login('gestor');
  auditor = await login('auditor');
});
after(async () => {
  await app.close();
  await closeDatabase();
  await rm(directory, { recursive: true, force: true });
});

test('cancelamento preserva 2000 caracteres de observação e motivo após reabrir banco e backup', async () => {
  const notes = 'Observação fictícia '.padEnd(2000, 'a');
  const cancellationReason = 'Motivo fictício '.padEnd(2000, 'b');
  const saved = await appointment(notes);
  const response = await call(manager, 'PATCH', '/appointments/' + saved.id, {
    cancellationReason,
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().notes, notes);
  assert.equal(response.json().cancellationReason, cancellationReason);
  assert.equal(response.json().status, 'Cancelada');
  await closeDatabase();
  const workspace = await call(manager, 'GET', '/bootstrap?view=agenda&status=Cancelada');
  assert.equal(workspace.statusCode, 200, workspace.body);
  const persisted = workspace
    .json()
    .appointments.find((value: { id: string }) => value.id === saved.id);
  assert.equal(persisted.notes, notes);
  assert.equal(persisted.cancellationReason, cancellationReason);
  const backup = await call(manager, 'GET', '/admin/backup');
  assert.equal(backup.statusCode, 200, backup.body);
  const backedUp = backup
    .json()
    .appointments.find((value: { id: string }) => value.id === saved.id);
  assert.equal(backedUp.cancellationReason, cancellationReason);
  assert.equal(backedUp.notes, notes);
});

test('cancelamento isolado valida motivo, recusa campos misturados e mantém auditor sem edição', async () => {
  const saved = await appointment('Escopo técnico original.');
  for (const payload of [
    { cancellationReason: '' },
    { cancellationReason: 'cur' },
    { cancellationReason: 'x'.repeat(2001) },
    { cancellationReason: 'Motivo fictício válido', time: '11:00' },
    { cancellationReason: 'Motivo fictício válido', status: 'Cancelada' },
  ]) {
    const response = await call(manager, 'PATCH', '/appointments/' + saved.id, payload);
    assert.equal(response.statusCode, 400, response.body);
  }
  const denied = await call(auditor, 'PATCH', '/appointments/' + saved.id, {
    cancellationReason: 'Auditor não pode cancelar.',
  });
  assert.equal(denied.statusCode, 403, denied.body);
  const response = await call(manager, 'GET', '/bootstrap?view=agenda');
  const unchanged = response
    .json()
    .appointments.find((value: { id: string }) => value.id === saved.id);
  assert.equal(unchanged.status, 'Agendada');
  assert.equal(unchanged.notes, 'Escopo técnico original.');
  assert.equal(unchanged.cancellationReason, undefined);
});

test('PATCH legado com status Cancelada e notes conserva o contrato anterior', async () => {
  const saved = await appointment('Anotação anterior.');
  const response = await call(manager, 'PATCH', '/appointments/' + saved.id, {
    status: 'Cancelada',
    notes: 'Motivo legado fictício.',
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().status, 'Cancelada');
  assert.equal(response.json().notes, 'Motivo legado fictício.');
});

test('cancelar OS preserva observações da vistoria e justificativa integral de 4000 caracteres', async () => {
  const scenario = await call(manager, 'POST', '/admin/scenarios', { kind: 'merenda' });
  assert.equal(scenario.statusCode, 200, scenario.body);
  const request = (await call(manager, 'GET', '/protocols/' + scenario.json().protocol)).json();
  const created = await call(manager, 'POST', '/work-orders', {
    requestId: request.id,
    title: 'Vistoria fictícia com observações preservadas',
    department: 'Setor de Engenharia e Manutenção Predial',
    technician: 'Equipe de OS ' + randomUUID(),
    required: true,
    inspectionDate: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10),
    inspectionTime: '10:00',
  });
  assert.equal(created.statusCode, 200, created.body);
  const order = created.json();
  const notes = 'Escopo técnico original '.padEnd(2000, 'a');
  const reason = 'Motivo de cancelamento da ordem '.padEnd(4000, 'b');
  const edited = await call(manager, 'PATCH', '/appointments/' + order.appointmentId, { notes });
  assert.equal(edited.statusCode, 200, edited.body);
  const cancelled = await call(manager, 'PATCH', '/work-orders/' + order.id, {
    status: 'cancelada',
    note: reason,
  });
  assert.equal(cancelled.statusCode, 200, cancelled.body);
  await closeDatabase();
  const workspace = await call(manager, 'GET', '/bootstrap?view=agenda&requestId=' + request.id);
  assert.equal(workspace.statusCode, 200, workspace.body);
  const visit = workspace
    .json()
    .appointments.find((value: { id: string }) => value.id === order.appointmentId);
  assert.equal(visit.status, 'Cancelada');
  assert.equal(visit.notes, notes);
  assert.equal(visit.cancellationReason, reason);
  const history = (await call(manager, 'GET', '/requests/' + request.id)).json().history;
  assert.ok(
    history.some(
      (event: { action: string; note: string }) =>
        event.action === 'agenda' && event.note.includes(reason),
    ),
  );
});
