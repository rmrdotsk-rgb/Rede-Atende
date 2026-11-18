# Rede Atende — relatório técnico de validação

**Data da execução documentada:** 08/11/2026. **Escopo:** protótipo acadêmico web/PWA, Front-End Frameworks, UNINASSAU, professor Rafael Pacheco Ferreira.

**Equipe preservada:** Itallo Thiago Herculano da Silva, Raimundo Anthoni Carvalho Alves Cruz e José Emerson Alves Saturno Barboza.

**Parecer:** Aprovado para demonstração acadêmica local nos cenários executados, com limitação explícita de confirmação nativa de recarga no WebKit móvel. A entrega não representa serviço municipal homologado.

## 1. Base recebida e método

Este relatório registra uma execução anterior sobre o pacote `Rede Atende(8).zip`, que continha 189 arquivos. Seus resultados não comprovam automaticamente alterações posteriores realizadas no GitHub. A verificação independente desta execução aprovou CRC dos 189 arquivos, ausência de caminhos duplicados e tamanho/SHA-256 dos 188 itens do inventário. SHA-256 do ZIP original: `5fb5735180fb22c6e7fac2d3a3b0d64abf00ccd2cff71fbd8d2cd2e7d3a156eb`.

O projeto foi extraído em diretório isolado. Antes das correções, `npm ci`, setup portátil, TypeScript, ESLint, build, 14 testes estáticos, 155 testes de domínio e 61 de API passaram. Fluxo, persistência, recuperação e migrações também passaram. Isso não foi tratado como aprovação automática do navegador: a execução inicial revelou falhas adicionais.

Ambiente efetivo: Windows 11 Pro, PowerShell 7.6.9, Node **26.13.0**, npm **11.20.0**, PGlite, Playwright **1.64.1**, Chromium e WebKit. O Node utilizado atende ao intervalo do manifesto; a versão exata 24.22.1 de `.nvmrc` não foi reproduzida. A instalação informou zero vulnerabilidades conhecidas no levantamento do npm, sem equivaler a uma certificação de segurança.

Foram preservados arquitetura, versão interna, dependências e lockfile, migrações, sete categorias, quatro perfis, seis IDs de escolas, créditos e proposta acadêmica original. Não foram adicionados novos módulos de produto, IA, mapas ou integração municipal real.

## 2. Defeitos encontrados e correções

| Defeito e causa | Correção e arquivos principais |
| --- | --- |
| A segunda solicitação herdava a escola anterior, pois `reset` reutilizava `schoolId`. | `NewRequest.tsx` volta a exigir escolha explícita de escola em cada novo formulário. |
| O comprovante aparecia enquanto o upload ainda estava em andamento. O usuário podia abrir outro formulário e receber um reset tardio. | Comprovante após terminar a tentativa de anexo; campos bloqueados durante envio; resposta tardia de retry não altera um formulário posterior. |
| “Registrar Outra Demanda” descartava anexo pendente sem decisão do usuário. | Reutilizado o aviso de continuar ou descartar antes da ação. O pedido já salvo continua identificado separadamente do anexo não enviado. |
| Complemento e avaliação preenchidos podiam desaparecer ao sair ou trocar de protocolo. Voltar imediatamente após digitar também podia vencer a publicação tardia do aviso. | Proteção de preenchimento nas páginas e correção da ativação em `NavigationGuard.tsx`; `TrackRequest.tsx` espera a decisão antes de trocar o detalhe. Campos ficam bloqueados durante confirmação da API. |
| Uma pesquisa atrasada podia regravar os parâmetros antigos e apagar a categoria selecionada. O trace mostrou a categoria primeiro na URL, depois removida e uma consulta sem esse filtro. | `useDemandFilters.ts` usa uma base atual e coerente ao combinar alterações de texto e filtros. A regressão reproduz a ordem dos eventos, sem ampliar tempo máximo nem atribuir a falha ao servidor. |
| Agenda copiava o filtro da URL somente na montagem. Voltar/Avançar podia deixar seletor e resultados divergentes. | `AdminAgenda.tsx` deriva o filtro da URL atual. Teste verifica criação, conflito, edição, confirmação, realização, cancelamento, recarga e histórico do navegador. |
| Cancelamento substituía observações técnicas. Pela OS, uma justificativa válida de 4.000 caracteres também podia exceder o limite das observações. | `RequestEngine.ts`, schemas, tipos, `storage.ts`, `app.ts` e projeções guardam motivo separado. Observações de até 2.000 caracteres são preservadas; motivo direto aceita até 2.000 e o proveniente de OS, até 4.000. Motivos internos ficam fora da projeção do cidadão. API/OpenAPI documentados. |
| O filtro PDF recusava nomes literais de ações, mas aceitava equivalentes com escapes hexadecimais. | `server/fileValidation.ts` decodifica nomes uma vez antes de aplicar a política. Testes pela rota de upload comprovam recusa e ausência de gravação dos arquivos rejeitados. |
| O `.env` restaurado podia interpretar barras invertidas de caminhos Windows como escapes. O teste antigo herdava os caminhos por variável e não detectava isso. | `server/db/restore.ts` grava caminhos com `/`; o ensaio carrega o `.env` gerado em processo novo, incluindo caminho com espaços, acento e `#`. |
| Em tela baixa, rolagem automática deixava um filtro parcialmente sob o cabeçalho fixo. Em WebKit, fechar o menu podia devolver foco ao controle anterior em vez do botão de abertura. | `Header.tsx` mede sua altura, reserva essa área na rolagem e foca explicitamente o botão antes de abrir o menu. Os casos de axe e retorno de foco foram repetidos. |
| Os dois motores de navegador compartilhavam banco, sessões e limites de login. O segundo recebia HTTP 429 e reutilizava uma sessão de logout já revogada. | `scripts/e2e.mjs` inicia cada motor com ambiente próprio, mantém os limites da API, consolida resultados e limpa somente seus temporários. Não foram aumentados timeouts nem removidas verificações. |
| Alguns testes aceitavam o conteúdo de carregamento, procuravam tabela numa tela com cartões ou tentavam clicar na navegação móvel fechada. A matriz de 120 vistas usava lotes grandes para um único limite global. | Esperas por títulos reais, seletor da apresentação visível e abertura efetiva do menu móvel. A matriz foi separada por largura e público, preservando as 120 vistas por motor e o limite padrão de 45 s por caso. O trace inicial mostrou 114 vistas concluídas, zero erros JavaScript e API sem falhas; os últimos estouros de lote são registrados no resultado abaixo. |

A paginação de demandas foi investigada sem presumir lentidão do ambiente. A corrida de filtros foi corrigida no hook; `AdminDemands.tsx` não precisou de alteração. Os testes exercitam 10/20/50 itens, próxima/anterior, retorno do despacho, combinação de pesquisa e categoria, lista vazia e uma resposta antiga deliberadamente retida até chegar a consulta nova. As verificações distinguem o resultado da pesquisa atual de uma resposta anterior ainda em trânsito.

O acabamento conserva azul `#1351B4`, azul-marinho `#071D41`, fundo `#F8FAFC` e tipografia existente. A faixa inicial agora oferece Nova solicitação, Acompanhar protocolo e Como funciona. A leitura foi avaliada renderizada; `text-xs` continua correspondendo a 14 px no tamanho padrão.

## 3. Resultados efetivamente executados

Os números abaixo representam os resultados finais; não incluem execuções intermediárias com falhas como se tivessem sido aprovadas.

| Comando ou ensaio | Resultado final |
| --- | --- |
| `npm.cmd ci` | Aprovado; 454 pacotes instalados, lockfile preservado |
| `npm.cmd run setup -- --embedded` | Aprovado; banco portátil criado em área local de ensaio |
| `npm.cmd run typecheck` | Aprovado |
| `npm.cmd run lint` | Aprovado |
| `npm.cmd run build` | Aprovado |
| `npm.cmd run format:check` | Aprovado |
| `npm.cmd run test:static` | **14/14**, zero falhas e ignorados |
| `npm.cmd test` | **155/155**, zero falhas e ignorados |
| `npm.cmd run test:api` | **66/66**, zero falhas e ignorados |
| `npm.cmd run test:flow` | Aprovado; HTTP local, cidadão/gestor, anexo, complemento, OS, Agenda, conclusão, avaliação e reabertura |
| `npm.cmd run test:persistence` | Aprovado; criação e duas verificações em processos separados |
| `npm.cmd run test:restore` | Aprovado; 22 tabelas, vínculos, anexo/hash, login e configuração restaurada; negativos recusados |
| `npm.cmd run test:migrations` | Aprovado; upgrade 001/002 → 003, repetição e reabertura |
| `npx.cmd playwright install chromium webkit` | Ambos instalados |
| `npm.cmd run test:e2e` | **113 aprovados, dois timeouts de lote e um ignorado**, entre 116 casos da rodada integral; correção de organização e reexecução abaixo |
| Reexecução da matriz por largura e público | **32/32 aprovados** após dividir a mesma matriz por largura e público, mantendo 45 s por caso e os limites por operação |
| Cobertura de navegador consolidada | **131 casos aprovados e 1 ignorado**, entre 132 definições atuais (66 por motor). Consolidação da rodada integral e da reexecução; não corresponde a uma única rodada integral final de saída zero |
| `npm.cmd run test:performance` | Aprovado; volumes 100, 1.000 e 5.000, com 20 amostras por operação |
| `npm.cmd run test:budgets` | JS/CSS aprovados, sem alterar os limites |
| Laboratório de 14 rotas + Lighthouse | 84 medições e nove auditorias concluídas; verificador completo de orçamento aprovado |
| `server/tests/start-entry.mts` | Aprovado; entrypoint de `npm start`, build e sessão anônima por HTTP |
| `server/tests/production-smoke.mts` | Aprovado; rotas, CSP, arquivos públicos, API privada, PWA/offline e backup com API parada |
| `npm.cmd start` em `http://localhost:3001` | Aprovado; 40 vistas adicionais do build, cinco telas × oito larguras, sem erro JavaScript ou resposta de rede ≥400 |

As rodadas intermediárias de 96 e 112 casos registraram, respectivamente, 90 aprovações/seis falhas e 108 aprovações/três falhas/um ignorado. Foram corrigidos foco, seletores móveis e as duas corridas reais de filtro e aviso de saída. Na última rodada integral, 113 de 116 passaram; os dois timeouts restantes ocorreram no orçamento global de lotes com 15 navegações do WebKit, e o caso nativo continuou ignorado. A matriz foi separada em comunidade (seis vistas, incluindo 404) e gestão (nove), por largura, sem aumentar 45 s por caso nem mudar a aplicação. A primeira reexecução teve 31/32: consultas de seletores ainda estavam em trânsito ao descartar uma página. Após aguardar sua conclusão por networkidle, somente essa parte alterada foi reexecutada: 32/32 passaram. A cobertura consolidada final contém 132 definições atuais; a alteração na contagem decorre da organização dos testes, sem funcionalidades novas. As falhas anteriores permanecem identificadas em sourceRuns no JSON.

As jornadas de navegador incluem as 14 rotas e a página 404 nas larguras **320, 375, 390, 430, 768, 1024, 1366 e 1440 px**, em Chromium e WebKit. Incluem cadastro com estado vazio, sete categorias, sessões separadas de cidadão e gestor, fluxo até avaliação, uso offline sem falsa confirmação, teclado, retorno de foco, axe e reflow equivalente a 200%/400%. A inspeção adicional do build, em Chromium, cobre Início, Nova solicitação, Acompanhamento, Demandas e Agenda; não deve ser confundida com a matriz integral feita na suíte.

Os testes negativos cobrem isolamento de contas e anexos, auditor sem escrita, ações reservadas ao gestor, CSRF, sessão inválida/expirada, validações, upload inválido, idempotência de pedido/anexo e alterações concorrentes. São evidências dos cenários executados, sem afirmar auditoria exaustiva ou segurança certificada.

## 4. Desempenho medido

**Build de produção:** JavaScript inicial **403.034 bytes**, limite 420.000; CSS inicial **45.773 bytes**, limite 60.000. Valores sem compressão, calculados pelo verificador a partir dos recursos iniciais do HTML. Não são o tamanho do ZIP nem o tráfego total de todas as rotas. Gráficos administrativos e formulário permanecem em chunks separados, carregados sob demanda. O tamanho inicial não precisou de remoção de bibliotecas.

API — mediana / p95 em milissegundos:

| Demandas | Painel/bootstrap | Busca paginada | Detalhe | Despacho |
| --- | --- | --- | --- | --- |
| 100 | 11,05 / 12,39 | 3,39 / 6,2 | 3,17 / 5,23 | 12,41 / 15,91 |
| 1.000 | 30,99 / 44,62 | 3,61 / 8,81 | 3,23 / 5,69 | 10,17 / 15,09 |
| 5.000 | 104,29 / 120,83 | 5,39 / 7,78 | 2,6 / 5,56 | 14,48 / 19,62 |

Navegador — medianas de três navegações frias por rota:

| Rota | LCP (ms) | CLS | Prontidão (ms) |
| --- | --- | --- | --- |
| `/` | 1.748 | 0 | 2.745,85 |
| `/entrar` | 1.652 | 0 | 2.732,48 |
| `/informacoes` | 1.724 | 0 | 2.729,8 |
| `/solicitar` | 2.104 | 0 | 3.212,93 |
| `/acompanhar` | 2.188 | 0 | 3.236,55 |
| `/admin` | 2.544 | 0 | 3.566,82 |
| `/admin/demandas` | 2.052 | 0 | 3.249,16 |
| `/admin/triagem` | 2.164 | 0 | 3.135,31 |
| `/admin/agenda` | 2.036 | 0 | 3.012,41 |
| `/admin/ordens` | 2.064 | 0,0081 | 3.229,51 |
| `/admin/prazos` | 2.056 | 0 | 3.195,51 |
| `/admin/unidades` | 2.088 | 0 | 3.252,28 |
| `/admin/relatorios` | 2.408 | 0 | 3.443,21 |
| `/admin/integracoes` | 2.008 | 0 | 3.004,29 |

Lighthouse — intervalo das três notas e mediana das métricas por página:

| Página | Desempenho /100 | Acessibilidade /100 | LCP (ms) | CLS |
| --- | --- | --- | --- | --- |
| `/` | 99 | 100 | 1.956,77 | 0 |
| `/entrar` | 99 | 100 | 1.955,65 | 0 |
| `/informacoes` | 99 | 100 | 1.954,84 | 0 |

O benchmark de API usa PGlite descartável, 100/1.000/5.000 demandas sintéticas, aquecimento e 20 amostras por operação. `Fastify.inject` exclui transporte de rede e renderização. O p95 com 20 observações é exploratório.

O laboratório de navegador serve o build pela API local, com viewport 390×844, desaceleração de CPU de 4×, rede de 1,6 Mbps/750 Kbps e latência de 150 ms. Cada rota recebe três contextos novos, navegação fria e recarga quente: 84 medições. O service worker fica bloqueado para separar o efeito do cache da aplicação. O teste PWA é executado separadamente. Lighthouse **13.6.0** mede três páginas públicas, três amostras por página. Navegador utilizado: Chromium Headless Shell instalado pelo Playwright. Os testes funcionais não são executados em paralelo com estas medições.

Comando do laboratório: `node --import tsx scripts/routes-performance.mts . SAIDA.json DIRETORIO_DAS_FERRAMENTAS`. O diretório de ferramentas contém Lighthouse e fica fora do projeto entregue; nenhuma dependência da aplicação foi acrescentada. O executável funcional foi indicado pela variável `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

LCP e CLS aqui são sintéticos. **Não foi medido INP de usuários reais**, nem desempenho em aparelho físico ou rede municipal. O tempo de prontidão inclui espera por conteúdo, estabilização e condições do ensaio; não equivale a LCP. Aprovação do orçamento do build, sozinha, não prova aprovação de Web Vitals.

## 5. Itaíba, segurança e limites

Em 08/11/2026 foram conferidas a [página da Educação](https://itaiba.pe.gov.br/educacao/), a [relação municipal de escolas](https://itaiba.pe.gov.br/relacao-de-escolas/) e a [página do Catálogo de Escolas do INEP](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas/). O contato da Secretaria corresponde à página específica, distinguindo-o do rodapé geral da Prefeitura. A relação continua tratada como referência documental; não foram confirmados individualmente códigos INEP nem funcionamento atual. Os 44 nomes referenciais não foram importados para o seed de seis unidades.

A correção PDF considera a sintaxe de escapes de nomes documentada pela [Adobe](https://developer.adobe.com/acrobat-pdfl-sdk/guides/plugin/plugins-cos). O filtro continua sendo uma política limitada de upload, não parser completo de PDF, antivírus ou sanitização certificada. Cookies HttpOnly, hash de senha, expiração, CSRF, permissões e verificações de integridade foram mantidos.

Permanecem pendentes: avaliação moderada com usuários externos, leitor de tela real, telefone físico/Safari, PostgreSQL externo e operação sob infraestrutura pública. O iniciador por duplo clique foi revisado, mas não foi demonstrado pela interface do Windows; seus comandos principais foram executados no PowerShell. Não houve homologação, implantação pública ou integração oficial SEI. As medições locais não certificam WCAG, segurança ou conformidade jurídica.

**Recarga/fechamento da aba:** o Chromium comprovou o diálogo nativo. O WebKit móvel desta execução não o exibiu em duas reproduções; esse caso específico permanece no código e foi marcado como ignorado por limitação observada. O contrato cancelável do evento é verificado nos dois motores, assim como os avisos de navegação dentro do site, logout e troca de protocolo. Isso não comprova que Safari/iPhone impedirá perder o rascunho ao atualizar ou fechar a aba. A interface informa que o preenchimento não é salvo antes do envio. A limitação também é registrada no [WebKit #219102](https://bugs.webkit.org/show_bug.cgi?id=219102).

## 6. Abrir no VS Code e apresentar

1. Extraia `Rede Atende.zip` em uma pasta nova. Abra no VS Code a pasta **Rede_Atende_Itaiba**, que contém `package.json`.
2. Use Node compatível: referência `.nvmrc` 24.22.1; manifesto aceita `^22.18.0 || >=24.11.0`. Evite Node 23 e 24 anterior a 24.11.
3. No PowerShell integrado:

```powershell
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

4. Abra **http://localhost:3001**. Nas próximas execuções, use `npm.cmd start`; pare com Ctrl+C. Alternativa de conveniência: `INICIAR_REDE_ATENDE.cmd`.
5. As contas fictícias são geradas localmente em `.local/demo-access.txt`. Não compartilhe esse arquivo. O cidadão também pode criar conta fictícia na tela Entrar.

Para apresentar em 5–8 minutos, use dois perfis de navegador ou janela comum e anônima. Mostre início → cidadão entra/registra → protocolo/acompanhamento → gestor faz triagem/execução → conclusão → cidadão avalia → gestor confere indicadores. Se houver OS ou vistoria obrigatória, conclua ou cancele com justificativa antes de concluir a demanda. Prepare cenários secundários antes da aula. O roteiro completo continua em `docs/ROTEIRO_DEMONSTRACAO_ATUAL.md`.

A entrega não inclui `node_modules`, `dist`, `.env`, credenciais geradas, banco, uploads locais, caches, traces ou logs temporários. Todos os testes, fontes, lockfile e proposta acadêmica foram mantidos. O inventário da validação anterior foi conferido na ocasião, mas o arquivo `INVENTARIO_ENTREGA.json` foi removido do repositório no commit `1039cf1`. Portanto, este relatório descreve evidências históricas, não comprova a integridade da versão atual do GitHub. Os JSON em `docs/validacao/` registram resultados e metodologia sem cookies ou tokens; as capturas mostram somente dados fictícios.

## 7. Considerações finais

Os testes documentados sustentam a demonstração acadêmica local dos fluxos que foram executados. A cobertura de navegador foi consolidada a partir de mais de uma rodada; não houve uma única execução integral final com todos os casos aprovados. Permanece pendente a comprovação de recarga no WebKit móvel.

A aplicação é um protótipo. Seu uso público exigiria, entre outros itens, homologação, infraestrutura adequada, integração institucional e testes independentes com usuários e dispositivos reais.
