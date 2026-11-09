import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiService } from './storage';
import type { EducationalRequest } from '../types';

const body = {} as Parameters<ApiService['createRequest']>[0];
const saved = { id: 'pedido-ficticio-35', protocol: 'EDU-2026-000123' } as EducationalRequest;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('envio confirmado mantém o protocolo quando a consulta seguinte perde conexão', async () => {
  const original = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/requests')) {
      posts++;
      return json(saved, 201);
    }
    throw new TypeError('Conexão interrompida após commit');
  };
  try {
    const service = new ApiService();
    const result = await service.createRequest(body, 'chave-ficticia-35');
    assert.equal(result.protocol, saved.protocol);
    assert.equal(posts, 1);
    assert.match(service.connectionError, /confirmada pelo servidor/);
  } finally {
    globalThis.fetch = original;
  }
});

test('falha do envio à API continua rejeitada e não produz comprovante', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => json({ error: 'Servidor indisponível no envio.' }, 503);
  try {
    await assert.rejects(
      new ApiService().createRequest(body, 'chave-ficticia-35'),
      /indisponível no envio/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('anexo confirmado não é apresentado como perdido quando apenas a atualização falha', async () => {
  const original = globalThis.fetch;
  let uploads = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/attachments')) {
      uploads++;
      return json({ id: 'anexo-35', requestId: saved.id, name: 'ficticio.png' }, 201);
    }
    return json({ error: 'Consulta indisponível.' }, 503);
  };
  try {
    const service = new ApiService();
    const result = await service.uploadAttachment(
      saved.id,
      new File(['ficticio'], 'ficticio.png', { type: 'image/png' }),
    );
    assert.equal(result.id, 'anexo-35');
    assert.equal(uploads, 1);
    assert.match(service.connectionError, /confirmada pelo servidor/);
  } finally {
    globalThis.fetch = original;
  }
});
