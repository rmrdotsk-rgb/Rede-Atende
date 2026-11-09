# Rede Atende — Itaíba

Projeto acadêmico da disciplina **Front-End Frameworks**, UNINASSAU, professor **Rafael Pacheco Ferreira**. Equipe: **Itallo Thiago Herculano da Silva, Raimundo Anthoni Carvalho Alves Cruz e José Emerson Alves Saturno Barboza**.

O projeto centraliza demandas educacionais de **Itaíba–PE**, a partir do DesafioPE. A comunidade registra e acompanha protocolos; a equipe faz triagem, organiza a execução e informa a conclusão. Os dados de demonstração são sintéticos. Não há vínculo, autorização ou operação pela Prefeitura; a integração SEI é **simulada**.

Frontend React/TypeScript/Vite/Tailwind, API Fastify em `/api/v1` e banco persistente no servidor. O modo portátil usa PGlite; PostgreSQL externo é opcional. O acesso usa cookie HttpOnly, CSRF e permissões de cidadão, operador, gestor e auditor.

## Iniciar no Windows 11

1. Instale **Node.js 24.11+** compatível com as dependências e extraia o ZIP para uma pasta nova.
2. Abra `Rede_Atende_Itaiba` e dê dois cliques em **`INICIAR_REDE_ATENDE.cmd`**. O iniciador verifica versões, instala dependências ausentes, prepara o banco portátil, compila e inicia o servidor.
3. Abra **http://localhost:3001** e mantenha o terminal aberto. Os acessos fictícios ficam em `.local/demo-access.txt`, somente no computador. Também é possível cadastrar um cidadão pela tela **Entrar**.

No VS Code, abra a pasta que contém `package.json` e execute no PowerShell:

```powershell
node --version
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

Nas próximas execuções, use `npm.cmd start`. Pare com `Ctrl+C`. Preserve `.env` e `.local` ao atualizar. Se já existir uma configuração PostgreSQL, `setup -- --embedded` recusa trocar o banco automaticamente; para uma demonstração nova, extraia em outra pasta.

Para usar o telefone na mesma rede privada, mantenha o servidor no notebook e abra `http://IP-DO-NOTEBOOK:3001`. Veja o [guia de Windows e iPhone](docs/INSTALACAO_WINDOWS_IPHONE.md). A aplicação é web/PWA.

## Usar a demonstração

O cidadão escolhe escola e categoria, preenche o relato e recebe um protocolo `EDU-AAAA-NNNNNN`. O acompanhamento reúne histórico público, anexos, pedidos de complemento, solução e avaliação do atendimento. O servidor aceita PNG, JPEG e PDF de até 5 MB, com limite de cinco anexos por solicitação.

A equipe acessa demandas, triagem, unidades, ordens de serviço, prazos, agenda, relatórios/CSV e SEI simulado. As permissões são conferidas na API; o auditor consulta sem despachar. Use duas sessões independentes para apresentar cidadão e gestor: [roteiro de demonstração](docs/ROTEIRO_DEMONSTRACAO_ATUAL.md).

Há sete categorias: infraestrutura, transporte escolar, alimentação, documentação, material didático, apoio pedagógico/inclusão e outros. O catálogo público de escolas é referencial e não é importado automaticamente; os registros de operação da demonstração são fictícios.

## Testes

```powershell
npm.cmd run test:static
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run test:api
npm.cmd run test:flow
npm.cmd run test:persistence
npm.cmd run test:restore
npm.cmd run test:migrations
npx.cmd playwright install chromium webkit
npm.cmd run test:e2e
npm.cmd run test:performance
npm.cmd run test:budgets
```

`build` inclui TypeScript e ESLint. `test:api` gera o build automaticamente. Os testes de banco e navegador usam diretórios descartáveis. `test:static` verifica contratos estáticos e integridade de backup; não substitui as jornadas no navegador. Os resultados devem ser obtidos ao executar os comandos no ambiente usado para apresentação.

`test:e2e` executa Chromium e WebKit em sequência, cada um com API, banco, sessões e cotas próprios. Isso evita que um motor consuma os limites do outro. Os limites de segurança da aplicação continuam ativos. O resultado consolidado fica em `test-results/3.9/e2e-results.json`, com um relatório adicional por motor. Para investigar um cenário: `npm.cmd run test:e2e -- --project=chromium --grep "Agenda cria"`.

A validação desta entrega, seus resultados e limitações estão em [RELATORIO_VALIDACAO.md](docs/RELATORIO_VALIDACAO.md).

## Backup e recuperação

Pare a API antes do backup portátil. Guarde os backups em local privado: eles contêm dados de atendimento, anexos e hashes de senhas.

```powershell
npm.cmd run db:backup
npm.cmd run db:verify-backup -- CAMINHO_DO_BACKUP
npm.cmd run db:restore -- CAMINHO_DO_BACKUP NOVA_PASTA
```

O destino de restauração precisa não existir. A restauração cria PGlite separado, confere as 22 tabelas e os anexos e exige novo login. Instruções completas no [guia de testes e recuperação](docs/COMO_TESTAR_NO_WINDOWS.md).

## Documentação

- [Funcionalidades e rotas](docs/FUNCIONALIDADES.md)
- [API REST](docs/API_REST.md) e [contrato OpenAPI](docs/openapi.json)
- [Regras operacionais](docs/REGRAS_OPERACIONAIS_ITAIBA.md)
- [Fontes municipais](docs/FONTES_MUNICIPAIS_ITAIBA.md) e [catálogo referencial de escolas](docs/ESCOLAS_REFERENCIA_PUBLICA_ITAIBA.csv)
- [Plano de teste com pessoas](docs/PLANO_TESTE_COM_PESSOAS.md)
- [Histórico de mudanças](CHANGELOG.md)
- [Proposta acadêmica original](referencias/Proposta_academica_original_EduConecta.pdf)

O protótipo não envia solicitações ao município nem mensagens externas. SEI oficial, operação pública com HTTPS, PostgreSQL externo, dispositivos físicos e leitores de tela exigem verificações específicas. Não há certificação de segurança, acessibilidade ou conformidade jurídica. Use somente dados fictícios.
