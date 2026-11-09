import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiService } from './storage';

const waitForAbort = (signal?: AbortSignal | null) =>
  new Promise<Response>((_resolve, reject) => {
    if (signal?.aborted) reject(new DOMException('Abortado', 'AbortError'));
    else
      signal?.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError')), {
        once: true,
      });
  });

test('requisição sem resposta expira sem confirmar envio e reenvio conserva chave', async () => {
  const original = globalThis.fetch;
  const keys: string[] = [];
  let first = true;
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith('/requests')) {
      keys.push(new Headers(options?.headers).get('Idempotency-Key') ?? '');
      if (first) {
        first = false;
        return waitForAbort(options?.signal);
      }
      return Response.json({ id: 'req-ficticia-36', protocol: 'EDU-2026-000036' }, { status: 201 });
    }
    return Response.json({
      requests: [],
      schools: [],
      notifications: [],
      appointments: [],
      workOrders: [],
      attachments: [],
    });
  };
  try {
    const service = new ApiService(25),
      body = {} as Parameters<ApiService['createRequest']>[0],
      key = 'chave-ficticia-timeout-36';
    await assert.rejects(service.createRequest(body, key), /Tempo de resposta esgotado/);
    assert.equal(service.getRequests().length, 0);
    const result = await service.createRequest(body, key);
    assert.equal(result.protocol, 'EDU-2026-000036');
    assert.deepEqual(keys, [key, key]);
  } finally {
    globalThis.fetch = original;
  }
});

test('timeout apenas na atualização preserva gravação já confirmada pela API', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) =>
    String(input).endsWith('/requests')
      ? Response.json({ id: 'req-36', protocol: 'EDU-2026-000037' }, { status: 201 })
      : waitForAbort(options?.signal);
  try {
    const service = new ApiService(25),
      body = {} as Parameters<ApiService['createRequest']>[0];
    const result = await service.createRequest(body, 'chave-ficticia-refresh-36');
    assert.equal(result.protocol, 'EDU-2026-000037');
    assert.match(service.connectionError, /confirmada pelo servidor/);
  } finally {
    globalThis.fetch = original;
  }
});
