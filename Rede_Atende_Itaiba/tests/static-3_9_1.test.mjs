import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('rotas públicas e 404 explícito', () => {
  const app = read('src/App.tsx');
  assert.match(app, /path="informacoes" element=\{<InformationItaiba \/>\}/);
  assert.match(app, /path="\*" element=\{<NotFound \/>\}/);
  assert.doesNotMatch(app, /path="\*" element=\{<Navigate/);
});

test('menus independentes para equipe e comunidade', () => {
  const header = read('src/components/common/Header.tsx');
  const management = read('src/components/layout/AdminLayout.tsx');
  assert.match(header, /\{community && \(/);
  for (const to of ['/solicitar', '/acompanhar', '/informacoes'])
    assert.ok(header.includes('to="' + to + '"'), 'missing community route ' + to);
  for (const to of ['/admin/demandas', '/admin/triagem'])
    assert.ok(management.includes("to: '" + to + "'"), 'missing management route ' + to);
  assert.match(header, /aria-expanded=/);
});

test('formulário sem escola preselecionada e sem nome escolar inventado', () => {
  const form = read('src/pages/community/NewRequest.tsx');
  assert.match(form, /schoolId: ''/);
  assert.match(form, /if \(!school\) throw new Error/);
  assert.match(form, /schoolId: data\.schoolId/);
  assert.doesNotMatch(form, /school \? school\.name : 'Escola Municipal de Itaíba'/);
  assert.match(form, /storageService\.subscribe/);
});

test('repositório único de fontes institucionais e contato rastreável', () => {
  const data = read('src/data/municipalSources.ts');
  for (const url of [
    'desafios.pe.gov.br',
    'itaiba.pe.gov.br/educacao/',
    'itaiba.pe.gov.br/relacao-de-escolas/',
    'itaiba.pe.gov.br/noticias/',
  ])
    assert.ok(data.includes(url), url);
  assert.match(data, /educacao@itaiba\.pe\.gov\.br/);
  assert.doesNotMatch(data, /instagram\.com|tiktok\.com/);
});

test('página distingue serviço oficial, conteúdos fictícios e fontes externas', () => {
  const info = read('src/pages/community/InformationItaiba.tsx');
  assert.match(info, /não encaminha\s+solicitações reais para a Prefeitura/);
  assert.match(info, /dados|chamados/);
  assert.match(info, /noopener noreferrer/);
});

test('versão consistente entre manifesto e lockfile', () => {
  const manifest = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
});
