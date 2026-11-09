import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_MODE = 'embedded';
const { buildApp } = await import('../app');
const { BusinessRuleError } = await import('../../src/domain/errors');

test('erro inesperado não expõe mensagem técnica, SQL, caminho ou segredo no corpo HTTP', async () => {
  const app = await buildApp();
  app.get('/api/v1/ensaio-erro-interno', async () => {
    throw new Error('SELECT password_hash FROM users; caminho=/private/db; segredo=fixture-36');
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/ensaio-erro-interno' });
    assert.equal(response.statusCode, 503, response.body);
    assert.match(response.json().error, /temporariamente indisponível/);
    assert.doesNotMatch(response.body, /SELECT|password_hash|private|segredo|fixture-36|stack/);
  } finally {
    await app.close();
  }
});

test('erro esperado de regra mantém mensagem útil sem ser tratado como falha interna', async () => {
  const app = await buildApp();
  app.post('/api/v1/ensaio-regra', async () => {
    throw new BusinessRuleError('Existem ordens de serviço obrigatórias pendentes.');
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ensaio-regra',
      headers: { 'X-Requested-With': 'RedeAtende' },
    });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().error, 'Existem ordens de serviço obrigatórias pendentes.');
  } finally {
    await app.close();
  }
});
