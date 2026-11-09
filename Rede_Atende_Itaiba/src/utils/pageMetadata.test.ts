import test from 'node:test';
import assert from 'node:assert/strict';
import { getPageMetadata, ROBOTS_POLICY } from './pageMetadata';
import { renderPageHtml } from '../../server/frontendMetadata';
test('rotas públicas têm identidade própria e somente conteúdo público tem canonical', () => {
  assert.notEqual(getPageMetadata('/').title, getPageMetadata('/informacoes').title);
  assert.equal(getPageMetadata('/informacoes/').canonicalPath, '/informacoes');
  for (const path of ['/entrar', '/solicitar', '/acompanhar', '/admin', '/admin/demandas'])
    assert.equal(getPageMetadata(path).canonicalPath, undefined);
  assert.match(ROBOTS_POLICY, /noindex/);
});
test('identificadores e entradas hostis na query não entram nos metadados', () => {
  const metadata = getPageMetadata('/acompanhar?protocolo=<script>privado</script>');
  assert.equal(metadata.title, 'Meus protocolos | Rede Atende');
  assert.ok(!JSON.stringify(metadata).includes('privado'));
  assert.equal(getPageMetadata('/desconhecido').title, 'Página não encontrada | Rede Atende');
});
test('HTML servido já contém título e descrição da rota sem alterar scripts ou política', () => {
  const template =
    '<title>Anterior</title><meta name="description" content="anterior" /><meta property="og:title" content="anterior" /><meta property="og:description" content="anterior" /><meta name="robots" content="noindex" /><script src="/assets/index.js"></script>';
  const html = renderPageHtml(template, '/admin/demandas?busca=segredo');
  assert.match(html, /<title>Demandas registradas \| Rede Atende<\/title>/);
  assert.match(html, /<meta property="og:title" content="Demandas registradas \| Rede Atende"/);
  assert.ok(html.includes('<script src="/assets/index.js"></script>'));
  assert.ok(html.includes('content="noindex"'));
  assert.ok(!html.includes('segredo'));
});
