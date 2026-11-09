import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiService } from './storage';
function fixture() {
  const original = globalThis.fetch;
  const user = {
    id: 'titular-ficticio',
    name: 'Titular Fictício',
    email: 'titular@teste.invalid',
    role: 'cidadao',
  };
  const state = {
    schemaVersion: 4,
    catalogRevision: 1,
    schools: [],
    requests: [{ id: 'req-privada', subject: 'DADO PRIVADO FICTÍCIO' }],
    notifications: [],
    attachments: [],
    appointments: [],
    workOrders: [],
    seiLogs: [],
    ruleHistory: [],
    deadlineRules: { baixa: 15, media: 10, alta: 5, urgente: 2 },
    holidays: [],
    nextSequenceByYear: {},
    submissions: {},
  };
  let logged = false,
    holdState = false,
    holdAuth = false;
  let releaseState: (() => void) | undefined, releaseAuth: (() => void) | undefined;
  globalThis.fetch = async (input) => {
    const path = String(input);
    let data: unknown;
    if (path.endsWith('/auth/login')) {
      logged = true;
      data = { user, csrf: 'ficticio' };
    } else if (path.endsWith('/auth/logout')) {
      logged = false;
      data = { ok: true };
    } else if (path.endsWith('/auth/me')) {
      data = { user: logged ? user : null, csrf: 'ficticio' };
      if (holdAuth)
        await new Promise<void>((resolve) => {
          releaseAuth = resolve;
        });
    } else {
      data = logged ? state : { ...state, requests: [] };
      if (holdState) {
        holdState = false;
        await new Promise<void>((resolve) => {
          releaseState = resolve;
        });
      }
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return {
    restore: () => {
      globalThis.fetch = original;
    },
    holdState: () => {
      holdState = true;
    },
    holdAuth: () => {
      holdAuth = true;
    },
    releaseState: () => releaseState?.(),
    releaseAuth: () => releaseAuth?.(),
  };
}
test('resposta de dados iniciada antes do logout não repõe registros privados depois da saída', async () => {
  const f = fixture();
  try {
    const service = new ApiService();
    await service.login('titular@teste.invalid', 'SenhaDeTeste-123456');
    assert.equal(service.getRequests().length, 1);
    f.holdState();
    const pending = service.refresh();
    await service.logout();
    f.releaseState();
    await pending;
    assert.equal(service.user, null);
    assert.equal(service.getRequests().length, 0);
  } finally {
    f.restore();
  }
});
test('resposta de sessão atrasada não reativa a identidade após logout confirmado', async () => {
  const f = fixture();
  try {
    const service = new ApiService();
    await service.login('titular@teste.invalid', 'SenhaDeTeste-123456');
    f.holdAuth();
    const pending = service.refreshAuth();
    await service.logout();
    f.releaseAuth();
    await pending;
    assert.equal(service.user, null);
    assert.equal(service.getRequests().length, 0);
  } finally {
    f.restore();
  }
});
