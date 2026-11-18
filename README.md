# Rede Atende

O **Rede Atende** é um projeto acadêmico voltado ao registro e acompanhamento de demandas da educação em **Itaíba, Pernambuco**. A proposta é reunir em um único sistema os pedidos da comunidade e o trabalho de triagem e atendimento da equipe responsável.

Desenvolvido para a disciplina **Front-End Frameworks**, da **UNINASSAU**, com orientação do professor **Rafael Pacheco Ferreira**, a partir do desafio educacional de Itaíba (DesafioPE).

**Equipe:** Itallo Thiago Herculano da Silva, Raimundo Anthoni Carvalho Alves Cruz e José Emerson Alves Saturno Barboza.

> **Projeto de demonstração.** Os dados e as contas usadas nos testes são fictícios. O Rede Atende não é um serviço oficial da Prefeitura de Itaíba, não encaminha solicitações reais e não possui integração oficial com o SEI.

Para uma visão resumida, veja [Resumo da entrega](ENTREGA_ACADEMICA.md) e [Histórias de usuário](Rede_Atende_Itaiba/docs/HISTORIAS_DE_USUARIO.md).

## Como funciona

O cidadão se cadastra, escolhe uma escola e uma categoria, descreve o problema e recebe um número de protocolo. Depois, pode acompanhar o andamento, enviar informações complementares e avaliar a conclusão.

No ambiente de gestão, a equipe recebe as demandas, faz a triagem, define responsáveis, acompanha prazos e registra os atendimentos. Também existem ordens de serviço, agenda, relatórios e uma simulação de integração com o SEI.

**Perfis disponíveis:**

- **Cidadão:** cadastro, solicitação, acompanhamento e avaliação.
- **Operador:** acompanhamento e execução das tarefas de atendimento conforme as permissões do sistema.
- **Gestor:** triagem, despacho, acompanhamento da equipe e relatórios.
- **Auditor:** consulta dos registros, sem permissão para alterar as demandas.

## Tecnologias

- **Interface:** React, TypeScript, Vite e Tailwind CSS.
- **Servidor:** Node.js e Fastify, com API em `/api/v1`.
- **Banco de dados:** PGlite para execução local; PostgreSQL externo é opcional.
- **Testes:** testes automatizados de regras de negócio, API e navegador com Playwright.

O projeto possui interface web adaptada para computador e celular. **Não utiliza Expo Go.**

## Requisitos para executar

- Windows 11, ou outro sistema compatível com as ferramentas utilizadas.
- **Node.js 24.11 ou superior**, ou uma versão compatível da linha **22.18+**. O projeto também exige **npm 10+**.
- Conexão com a internet na primeira instalação para baixar as dependências.
- VS Code é recomendado, mas não obrigatório.
- Git é necessário para clonar e contribuir; não é necessário instalar PostgreSQL para usar o banco portátil.

Confira as versões instaladas:

```powershell
node --version
npm --version
git --version
```

## Instalação no Windows

### 1. Baixar e abrir o projeto

Para quem ainda não tem o código:

```powershell
git clone https://github.com/rmrdotsk-rgb/Rede-Atende.git
cd Rede-Atende\Rede_Atende_Itaiba
```

Como o repositório é **privado**, é preciso ter sido convidado e estar autenticado no GitHub. Quem já tem uma cópia local pode simplesmente abrir a pasta **`Rede_Atende_Itaiba`**, onde fica o `package.json`.

### 2. Preparar o ambiente

Abra um terminal PowerShell nessa pasta e execute, em ordem:

```powershell
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

- `npm.cmd ci` instala exatamente as dependências do projeto.
- `npm.cmd run setup -- --embedded` prepara o banco local e cria as contas fictícias. Use na primeira configuração; não é necessário repetir ao iniciar normalmente.
- `npm.cmd run build` verifica e compila a aplicação.
- `npm.cmd start` inicia o servidor que entrega a interface e a API.

Abra **http://localhost:3001** no navegador, mantendo o terminal aberto. Para encerrar, pressione **Ctrl+C**.

**Alternativa:** na pasta do projeto, execute `INICIAR_REDE_ATENDE.cmd`. O iniciador foi criado para preparar e abrir o ambiente local.

Nas próximas execuções, se o build já estiver pronto, normalmente basta executar `npm.cmd start`.

### 3. Acessar os perfis de demonstração

O programa gera os dados de acesso em:

```text
Rede_Atende_Itaiba/.local/demo-access.txt
```

Abra esse arquivo **somente no seu computador** e utilize o e-mail e a senha do perfil desejado na página **Entrar**. É possível também criar um cadastro fictício de cidadão na própria interface.

**Não compartilhe nem envie para o GitHub** o arquivo de senhas, o `.env`, os bancos locais ou os anexos de teste gerados durante a execução.

## Testar o fluxo principal

1. Entre como cidadão e registre uma solicitação fictícia, escolhendo escola e categoria.
2. Guarde o protocolo gerado e abra a página de acompanhamento.
3. Em outra janela de navegador (ou janela anônima), entre como gestor.
4. Localize o protocolo, faça a triagem, atribua responsável e registre o atendimento.
5. Volte à conta do cidadão, confira a atualização do protocolo e avalie a conclusão.

Uma descrição completa dos passos está em [Roteiro de demonstração](Rede_Atende_Itaiba/docs/ROTEIRO_DEMONSTRACAO_ATUAL.md).

## Testes e manutenção

Na pasta `Rede_Atende_Itaiba`, execute os testes mais importantes:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:api
```

Para os testes de navegação, instale os navegadores utilizados pelo Playwright e execute a suíte:

```powershell
npx.cmd playwright install chromium webkit
npm.cmd run test:e2e
```

Os testes de API podem gerar o build automaticamente. Para conferências adicionais de banco, backup e desempenho, consulte o [guia de testes no Windows](Rede_Atende_Itaiba/docs/COMO_TESTAR_NO_WINDOWS.md).

**Se aparecer “Execute npm run build antes de npm start”**, rode `npm.cmd run build` e depois `npm.cmd start`.

### Se a aplicação não abrir

Abra o PowerShell na pasta `Rede_Atende_Itaiba`, onde estão `package.json` e `package-lock.json`. Se aparecer `tsc não é reconhecido` ou `Cannot find package 'tsx'`, a instalação das dependências não foi concluída. Execute:

```powershell
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

Só avance para o próximo comando quando o anterior terminar sem erro. Mantenha o terminal de `npm.cmd start` aberto durante a demonstração.

Se o navegador mostrar **“Sem conexão com o atendimento”**, confirme primeiro que o servidor está aberto. Em outro PowerShell, execute `Invoke-WebRequest http://127.0.0.1:3001 -UseBasicParsing`. Uma resposta HTTP 200 indica que o servidor respondeu; nesse caso, tente abrir `http://127.0.0.1:3001` no navegador. Isso evita uma página offline antiga que pode ter sido armazenada na origem `localhost`. A página offline, isoladamente, não indica falta de internet.

## Organização das pastas

Todo o aplicativo fica em **`Rede_Atende_Itaiba/`**:

| Pasta ou arquivo | Conteúdo |
| --- | --- |
| `src/` | Páginas, componentes, estilos, regras e serviços da interface |
| `server/` | API, autenticação, banco e migrações |
| `scripts/` | Inicialização, preparação e verificações |
| `tests/` | Testes automatizados |
| `public/` | Ícones e recursos da aplicação |
| `docs/` | Regras de uso, referências, API e roteiro da apresentação |
| `package.json` | Dependências e comandos do projeto |

## Trabalhar em equipe

O código principal fica na branch `main`. Para evitar que uma alteração de um integrante atrapalhe o trabalho dos outros:

1. Aceite o convite para colaborar e clone o repositório.
2. Antes de começar, atualize a cópia local com `git pull origin main`.
3. Crie uma branch para a tarefa, por exemplo: `git switch -c ajuste-formulario`.
4. Faça alterações pequenas e rode os testes relacionados.
5. Envie a branch com `git push -u origin ajuste-formulario` e abra um **Pull Request** para revisão antes de integrar à `main`.

Não envie `node_modules`, `dist`, `.env`, dados do banco, senhas ou arquivos temporários.

## Documentação

- [README técnico da aplicação](Rede_Atende_Itaiba/README.md)
- [Funcionalidades e rotas](Rede_Atende_Itaiba/docs/FUNCIONALIDADES.md)
- [Como testar no Windows](Rede_Atende_Itaiba/docs/COMO_TESTAR_NO_WINDOWS.md)
- [Roteiro de apresentação](Rede_Atende_Itaiba/docs/ROTEIRO_DEMONSTRACAO_ATUAL.md)
- [API REST](Rede_Atende_Itaiba/docs/API_REST.md)
- [Fontes e referências de Itaíba](Rede_Atende_Itaiba/docs/FONTES_MUNICIPAIS_ITAIBA.md)

O sistema é um protótipo acadêmico. Para uso público real seriam necessários infraestrutura, homologação, governança de dados e integrações oficiais que não fazem parte desta entrega.
