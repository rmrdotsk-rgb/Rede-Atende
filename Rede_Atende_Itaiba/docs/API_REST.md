# API REST — Rede Atende 3.12.0

Base relativa `/api/v1`. A interface e a API são servidas na mesma origem. Não é necessário expor a porta 5432 nem credenciais de banco ao celular. O cliente está em `src/services/storage.ts`; contratos de entrada em `src/domain/schemas.ts` e `server/app.ts`.

`GET /api/v1/openapi.json` fornece o catálogo OpenAPI 3.1. O JSON inclui autenticação, parâmetros e respostas; os corpos detalhados são descritos aqui e validados por Zod no servidor. Não há promessa de SDK gerado a partir desse catálogo resumido.

## Sessão

Login: `POST /auth/login` com `{ "email": "seu-acesso-ficticio", "password": "senha-configurada-no-setup" }` — substitua pelos valores gerados localmente. Não são credenciais remotas existentes.

Cadastro cidadão: `POST /auth/register` com `name`, `email`, `password` (12 a 128 caracteres), `academicAcknowledged: true`. O servidor sempre atribui o perfil `cidadao`; não aceita elevação de permissão no corpo.

Todos os POST/PATCH/PUT exigem `X-Requested-With: RedeAtende`. Após login, conserve o cookie HttpOnly `ra_session`. A resposta do login e `GET /auth/me` retornam `{user, csrf}`. Escritas autenticadas exigem `X-CSRF-Token: <csrf>`. Sessão expira em oito horas por padrão, sem renovação indefinida. `POST /auth/logout` revoga no banco e limpa o cookie. CORS não está aberto. Origem divergente é recusada. HTTPS e `COOKIE_SECURE=true` são obrigatórios em produção.

## Operações e perfis

| Caminho após `/api/v1` | Método | Permissão e comportamento |
| --- | --- | --- |
| `/health` | GET | Saúde e motor de banco; sem segredos |
| `/auth/me`, `/auth/login`, `/auth/register`, `/auth/logout` | GET/POST | Sessão, cadastro cidadão, saída |
| `/state` | GET | Anônimo: escolas; cidadão: somente seus atendimentos; equipe: estado administrativo |
| `/schools` | GET | Catálogo com proveniência |
| `/schools/:id` | PATCH | Gestor; valida referência e registra autoria |
| `/requests/search` | GET | Busca/filtros/paginação SQL; titular só vê seus registros; equipe consulta a gestão |
| `/requests` | GET | Titular: suas solicitações; equipe: lista da gestão |
| `/requests` | POST | Cidadão autenticado, ciência de privacidade e chave de idempotência |
| `/requests/:id`, `/protocols/:protocol` | GET | Titular ou equipe; terceiros recebem 404 |
| `/requests/:id` | PATCH | Operador/gestor; despacho, validação de transições e bloqueios |
| `/requests/:id/replies` | POST | Somente o titular cidadão, pedido em aberto |
| `/requests/:id/rating` | POST | Somente titular, concluída, uma avaliação de 1 a 5 |
| `/requests/:id/sei-simulation` | POST | Operador/gestor; integração explicitamente fictícia |
| `/work-orders` | GET/POST | Consulta autorizada / criação por operador/gestor |
| `/work-orders/:id` | PATCH | Operador/gestor; execução, pendência, conclusão, cancelamento justificado |
| `/appointments` | GET/POST | Consulta autorizada / agendamento pela equipe |
| `/appointments/:id` | PATCH | Operador/gestor; reagendar, confirmar, realizar, cancelar com motivo |
| `/notifications` | GET | Avisos da conta e do perfil |
| `/notifications/:id/read` | POST | Leitura individual persistida; exige acesso ao aviso |
| `/deadline-rules` | GET/PUT | Equipe consulta; só gestor configura |
| `/holidays` | PUT | Gestor, datas AAAA-MM-DD e justificativa |
| `/requests/:id/attachments` | POST | Titular ou operador/gestor; multipart, até 5 MB por arquivo, cinco arquivos por solicitação |
| `/attachments/:id` | GET | Titular ou equipe, download protegido; não há URL pública |
| `/reports`, `/reports.csv` | GET | Equipe, dados persistidos; CSV sem nome, contato e descrição |
| `/audit` | GET | Gestor/auditor, até 500 eventos recentes |
| `/admin/scenarios` | POST | Gestor, `{kind:"transporte"}` ou `{kind:"merenda"}`; acrescenta sem apagar |
| `/admin/backup` | GET | Gestor; exporta snapshot de atendimento, sem contas/senhas nem bytes de anexos |
| `/admin/import` | POST | Gestor; snapshot legado validado e mesclado em transação, conflitos abortam tudo |

## Criar solicitação

Cabeçalhos adicionais: `Content-Type: application/json`, `Idempotency-Key: <UUID ou chave de 16 a 150 caracteres>`. Use a mesma chave ao repetir o mesmo envio depois de uma queda de conexão; não a reutilize para outro conteúdo.

```json
{
  "category": "infraestrutura",
  "schoolId": "esc-001",
  "subject": "Vazamento no bebedouro fictício",
  "description": "Cenário sintético: vazamento observado na sala demonstrativa.",
  "locationDetails": "Sala fictícia 04",
  "applicantName": "Solicitante Fictício",
  "applicantContact": "",
  "applicantRole": "comunidade",
  "priority": "media",
  "privacyAcknowledged": true,
  "categoryDetails": { "natureza": "Hidráulico" }
}
```

201 retorna a solicitação e o protocolo `EDU-AAAA-NNNNNN`. A propriedade `schoolName`, datas, status inicial, protocolo e autoria são definidos pelo servidor. O cliente não escolhe o dono nem a prioridade inicial: a API define média, ignorando uma prioridade administrativa válida enviada no cadastro público. O campo pode ser omitido; valores fora da enumeração continuam inválidos. Campos por categoria seguem `SERVICE_CATALOG`. Formulário e API usam o mesmo schema, com a validação final no servidor.

## Despacho

```json
{
  "updates": {
    "status": "em_triagem",
    "assignedDepartment": "Setor de Engenharia e Manutenção Predial",
    "assignedTechnician": "Equipe Fictícia"
  },
  "note": "Triagem demonstrativa concluída.",
  "isReopening": false,
  "options": { "visibility": "publica", "publicResponsible": false }
}
```

As únicas chaves de `updates` são status, prioridade, setor, responsável e deadline ISO. Alterações de prioridade e prazo exigem motivo. Reabertura exige gestor. Conclusão exige providência final e ausência de OS obrigatória, agenda ativa ou informação pendente. Autor vem da sessão, nunca de um nome enviado pelo navegador. Parecer interno não é enviado ao cidadão. Uma transição de estado deve ter uma nota pública apropriada ao titular.

## Demais corpos

- Resposta: `{informationId, response}` (5 a 2.000 caracteres).
- Avaliação: `{rating: 1..5, comment?: string}` (até 1.000).
- Ordem: `{requestId, title, department, technician, required, inspectionDate?, inspectionTime?}`. Atualização: `{status, note}`. Vistoria opcional cria agenda na mesma transação.
- Agenda: `{requestId?, protocolRef, schoolId, schoolName, type, technician, date, time, status:"Agendada", notes?}`. O servidor deriva escola/protocolo do vínculo. Cada atividade ocupa 60 minutos; sobreposição para o mesmo responsável é recusada, inclusive na virada do dia. PATCH aceita vínculo, escola, tipo, responsável, data, hora, status e notas. Para cancelar preservando as observações técnicas, envie somente `{cancellationReason:"Motivo do cancelamento"}` (5–2.000 caracteres). O servidor lê o registro atual e guarda o motivo em campo separado, disponível no acompanhamento interno, histórico da demanda e backup. Não combine esse campo com outras alterações. Quando uma ordem de serviço cancela a vistoria vinculada, a agenda preserva as notas e recebe a justificativa integral da OS (até 4.000 caracteres); o limite de entrada do cancelamento direto permanece 2.000. O corpo legado `{status:"Cancelada",notes:"Motivo"}` continua aceito com sua semântica anterior de substituir `notes`.
- Prazo: `{rules:{baixa,media,alta,urgente},reason}`. Valores inteiros 1–90, ordenados por prioridade. Valem para novos registros em dias corridos; não reescrevem prazos anteriores.
- Calendário: `{dates:["2026-12-25"],reason:"Calendário sintético de ensaio"}`. Valem para novos prazos em dias úteis por categoria.
- Escola: objeto SchoolUnit sem `id` e `activeRequestsCount`. URLs de proveniência precisam usar HTTP/HTTPS. Não são inventados códigos INEP, contatos ou validação oficial.

## Banco e concorrência

A implementação utiliza `pg` e SQL parametrizado como alternativa ao ORM, com repositório tipado e migrações SQL. Cada operação de negócio usa uma única transação. No PostgreSQL nativo um advisory lock transacional serializa as mutações do motor durante sua leitura/alteração/gravação; leituras selecionadas usam transação somente leitura sem esse lock; protocolo e chave de idempotência também possuem constraints únicas. Isso evita leitura desatualizada entre dois envios simultâneos. O contador respeita o ano no fuso de Recife e os protocolos históricos validados.

O modo portátil usa PGlite no processo Node, com diretório em disco e fila de transações. O banco nunca é instanciado nos navegadores. Use só uma instância da API nesse modo. Essa estratégia é adequada ao MVP acadêmico; o snapshot global e as escritas do motor ainda precisam evoluir para operações por entidade em escala maior, embora a tela Demandas e as consultas diretas já tenham consultas SQL específicas.

## Erros e limites

400 entrada inválida; 401 sessão ausente/expirada; 403 permissão/CSRF/origem; 404 não encontrado para esta conta; 409 conflito; 413 arquivo grande; 422 regra de negócio; 429 limite; 503 indisponibilidade. A mensagem não revela se o protocolo existe para outro cidadão. Falha de rede nunca é tratada como sucesso. A interface mantém a mesma chave de envio até confirmação ou correção explícita.


## Evolução de consultas e escrita na 3.7

`GET /requests/search` retorna `{items,total,page,pageSize,pages}`. Padrão: página 1, 20 itens; máximo 100. Filtros combináveis: `search`, `category`, `status`, `priority`, `schoolId`, `department` (nome do catálogo ou `unassigned`), `technician`, `zone` (`urbana`/`rural`), `sla=overdue`, `from`, `to` e `sort=newest|oldest`. Datas `AAAA-MM-DD` têm início/fim inclusivos no calendário Recife; o fim é convertido para início do dia seguinte exclusivo no SQL. Página acima do total é ajustada à última página. Filtro de responsável é exclusivo da equipe, para não permitir sondagem de identidade privada pelo cidadão.

Exemplo: `/api/v1/requests/search?page=1&pageSize=20&category=infraestrutura&status=recebida`. Parâmetros são validados e valores enviados como parâmetros SQL. Contagem e itens vêm do mesmo snapshot. O endpoint anterior `GET /requests` conserva a resposta em array para clientes existentes; ID e protocolo agora consultam o registro diretamente.

No `PATCH /requests/:id`, `expectedUpdatedAt` opcional é a marca ISO recebida na leitura da solicitação. A UI atual conserva a versão aberta para edição e envia esse valor. Caso divergente: 409, sem alteração. Recarregue, revise e reenvie. Clientes antigos que omitem esse campo preservam compatibilidade e validações de negócio, mas não têm essa detecção de intenção de edição antiga.

No upload multipart, o cliente 3.7 envia `Idempotency-Key` de 16–150 caracteres, conservada para retry da mesma tentativa. A chave é escopada por conta e solicitação. 201 retorna o mesmo `{id,requestId,name,mime,size}` tanto na criação quanto no replay idêntico; não duplica binário/metadados nem consome nova cota. Mesmo nome com bytes diferentes não é deduplicado. Mesma chave com conteúdo/metadados diferentes gera 409. Uma chave nova é outra operação.

Clientes antigos sem cabeçalho reconciliam conteúdo+nome+MIME+tamanho iguais, inclusive anexos anteriores à migração. Não deduzimos igualdade só pelo nome. MIME, extensão, tamanho e assinatura continuam validados antes da reconciliação; terceiros continuam sem acesso. Na cota de cinco arquivos, replay válido ainda funciona. Divergência entre bytes e hash armazenado não recebe falso sucesso.

As leituras selecionadas usam transação somente leitura; no PostgreSQL não adquirem advisory lock global de escrita. Escritas continuam serializadas e atômicas. PGlite mantém fila exclusiva. `/state` de equipe/cidadão e o motor de escrita ainda recompõem coleções completas; a 3.7 não afirma eliminar esse custo de toda a aplicação.

O contrato estruturado está em [openapi.json](openapi.json). Para exemplos de uso, consulte as [regras operacionais](REGRAS_OPERACIONAIS_ITAIBA.md).

## Contratos aditivos 3.8

`GET /bootstrap?view=...&page=1&requestId=...&protocol=...&search=...&status=...`: estado limitado da tela. Views: home, dashboard, demands, triage, orders, agenda, deadlines, reports, integrations, schools, track. Anônimo recebe somente catálogo público em home. Cidadão recebe apenas suas informações e pode usar home/track. Demais views exigem equipe. Páginas operacionais têm 20 itens; listas retornam total/page/pages/pageSize em lists. Um detalhe explicitamente selecionado pode ser acrescentado à página.

`GET /requests/search` aceita `view=summary` (novo; a UI usa esse modo). Resumos vêm com `summary:true`, `history:[]` e `description:''`; não devem ser usados como detalhe. Conteúdo completo é obtido em /requests/:id ou /protocols/:protocol. O padrão `view=full` conserva o contrato anterior. `sla=due` inclui abertos atrasados ou vencendo em até três dias; `sla=overdue` restringe aos vencidos.

`GET /work-orders/:id`: detalhe autorizado da OS. Bootstrap traz apenas resumo; detalhes/histórico técnico são consultados quando abertos. Cidadão sempre recebe projeção restrita.

`POST /work-orders` e `POST /appointments`: Idempotency-Key opcional por compatibilidade, de 16 a 150 caracteres. A UI atual sempre envia. Fingerprint de entrada validada e entidade são persistidos na mesma transação. Reenvio idêntico retorna a entidade corrente, não uma cópia imutável da primeira resposta; outra entrada com a mesma chave retorna 409. Sem chave, cada chamada é uma nova intenção, como na 3.7.

`PATCH /appointments/:id`: `requestId:null` remove vínculo; `notes:null` remove observação. Campo omitido conserva o valor. A UI usa esse contrato para limpar campos opcionais.

`GET /reports`: métricas e relatório agregados no SQL, mais operational (OS abertas/concluídas, média e quantidade de avaliações). Evolução limitada aos 90 dias com registros mais recentes; contagens gerais usam toda a base. /state e /requests completos continuam disponíveis por compatibilidade; a UI não os usa em navegação/polling. Backup, importação e cenários são operações administrativas explícitas que podem processar snapshots completos.

Origin malformada/null ou divergente recebe 403. Datas impossíveis recebem 400. Falhas inesperadas têm diagnóstico por request ID/endpoint/categoria sem corpo pessoal ou credenciais. Respostas privadas permanecem no-store, inclusive comprimidas. Assets com hash usam cache longo e gzip/Brotli; HTML/service worker usam no-cache.


## Contratos aditivos 3.9

`GET /bootstrap?view=integrations&eligiblePage=2&integratedPage=1&logPage=3&search=...` consulta páginas independentes de 20 itens. `requests` contém apenas demandas elegíveis; `integratedRequests`, as vinculadas ao SEI simulado; `seiLogs`, o histórico. `lists.eligibleRequests`, `lists.integratedRequests` e `lists.seiLogs` contêm os metadados filtrados. `integrationTotals` informa `{eligible,integrated,logs}` de toda a base, independentemente da busca. Página acima do máximo é ajustada ao último resultado. Busca filtra as três listas. O parâmetro legado `page` continua atendendo às outras views; não dirige essas três paginações.

`GET /requests/search?statuses=em_triagem,encaminhada,em_atendimento&view=summary` aplica o conjunto de situações antes da paginação, sem filtrar apenas os primeiros 20 resultados. `sei=eligible|integrated` é exclusivo da equipe. Elegível exige situação em triagem/encaminhada/em atendimento e ausência de marca/número SEI. O POST continua verificando a regra transacionalmente e recusando repetição.

Bootstrap de ordens e `GET /work-orders/:id` acrescentam `requestProtocol`, `requestSchoolName` e `requestPriority` por JOIN com a demanda; são campos de resposta, não mudança de esquema persistido. Dados e autorização permanecem no servidor.

URLs da interface usam `pendentesPagina`, `integradosPagina` e `historicoPagina`; a busca comum reinicia as três páginas. Filtros de Demandas também ficam na URL, preservando retorno de detalhes e atualização da página. Esses nomes são da interface, não parâmetros de API.

## Correção de categoria — 3.10.2

O mesmo PATCH de despacho aceita `updates.category` e `updates.categoryDetails`.
Para essa operação, `expectedUpdatedAt` e `options.categoryReason` são obrigatórios.
Exemplo depois de ler a demanda como operador/gestor:

```json
{
  "updates": {
    "category": "infraestrutura",
    "categoryDetails": { "natureza": "Hidráulico", "condicao": "Vazamento fictício" }
  },
  "options": { "categoryReason": "Classificação inicial revista pela equipe fictícia." },
  "expectedUpdatedAt": "2026-11-07T12:00:00.000Z"
}
```

O servidor valida os campos do novo catálogo e exige motivo de 5–2000 caracteres.
Prazo, prioridade, setor e responsável permanecem; ajustes são despachos explícitos
com as justificativas correspondentes. Demandas concluídas precisam ser reabertas
por gestor antes da correção. Cidadão e auditor recebem 403; versão antiga, 409;
versão ausente, 400; dados específicos incompletos, 422.

O histórico interno guarda categoria anterior/nova, campos antigos/novos e motivo.
O titular recebe evento público com os nomes das categorias; o motivo interno e
os dados anteriores não são expostos. SQL e JSON são atualizados na mesma transação.
Não há troca de protocolo, titular, relato ou anexos.
