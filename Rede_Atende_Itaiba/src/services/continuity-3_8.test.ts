import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiService } from './storage';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const state = {
  schemaVersion: 4,
  catalogRevision: 1,
  requests: [],
  schools: [],
  appointments: [],
  workOrders: [],
  seiLogs: [],
  notifications: [],
  attachments: [],
  holidays: [],
  ruleHistory: [],
  deadlineRules: { baixa: 15, media: 10, alta: 5, urgente: 2 },
  nextSequenceByYear: {},
  submissions: {},
};
const data = {
  requestId: 'ficticio',
  title: 'Atividade de teste fictícia',
  department: 'Setor fictício',
  technician: 'Pessoa fictícia',
  required: true,
};
test('retry de OS após resposta perdida conserva chave; nova intenção recebe nova chave', async () => {
  const original = globalThis.fetch;
  const keys: string[] = [];
  let fail = true;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/work-orders')) {
      keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
      if (fail) {
        fail = false;
        throw new TypeError('Resposta perdida depois de commit sintético');
      }
      return json({ id: 'os-confirmada' });
    }
    return json(state);
  };
  try {
    const service = new ApiService();
    await assert.rejects(service.createWorkOrder(data), /conexão/);
    const replay = await service.createWorkOrder(data);
    assert.equal(replay.id, 'os-confirmada');
    assert.equal(keys[0], keys[1]);
    await service.createWorkOrder(data);
    assert.notEqual(keys[2], keys[1]);
  } finally {
    globalThis.fetch = original;
  }
});
test('inicialização e atualização comum usam bootstrap, sem snapshot e sem revalidar login a cada polling', async () => {
  const original = globalThis.fetch,
    paths: string[] = [];
  globalThis.fetch = async (input) => {
    paths.push(String(input));
    return json(String(input).endsWith('/auth/me') ? { user: null, csrf: '' } : state);
  };
  try {
    const service = new ApiService();
    await service.init();
    await service.refresh();
    await service.refresh();
    assert.equal(paths.filter((p) => p.endsWith('/auth/me')).length, 1);
    assert.equal(paths.filter((p) => p.endsWith('/bootstrap')).length, 3);
    assert.ok(!paths.some((p) => p.endsWith('/state')));
  } finally {
    globalThis.fetch = original;
  }
});
test('abort de busca anterior é propagado sem sinalizar falso erro de conexão', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Abortado', 'AbortError')),
        { once: true },
      ),
    );
  try {
    const service = new ApiService(),
      controller = new AbortController();
    const pending = service.searchRequests({ search: 'fictício' }, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(service.connectionError, '');
  } finally {
    globalThis.fetch = original;
  }
});
