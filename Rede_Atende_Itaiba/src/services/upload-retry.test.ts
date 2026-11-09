import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiService } from './storage';

test('timeout de upload mantém chave para a mesma tentativa e distingue outro arquivo de mesmo nome', async () => {
  const original = globalThis.fetch,
    keys: string[] = [];
  let fail = true;
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith('/attachments')) {
      keys.push(new Headers(options?.headers).get('Idempotency-Key') ?? '');
      if (fail) {
        fail = false;
        throw new TypeError('Resposta perdida após gravação de teste');
      }
      return Response.json({ id: 'anexo-ficticio-37' }, { status: 201 });
    }
    return Response.json({
      requests: [],
      schools: [],
      attachments: [],
      appointments: [],
      workOrders: [],
      notifications: [],
    });
  };
  try {
    const service = new ApiService(),
      file = new File(['primeiro'], 'foto.png', { type: 'image/png' });
    await assert.rejects(service.uploadAttachment('req-37', file));
    await service.uploadAttachment('req-37', file);
    await service.uploadAttachment(
      'req-37',
      new File(['outro'], 'foto.png', { type: 'image/png' }),
    );
    assert.ok(keys.every((k) => k.length >= 16));
    assert.equal(keys[0], keys[1]);
    assert.notEqual(keys[1], keys[2]);
  } finally {
    globalThis.fetch = original;
  }
});
