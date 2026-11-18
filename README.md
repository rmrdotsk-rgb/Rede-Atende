# Rede Atende

Projeto da disciplina **Front-End Frameworks**, UNINASSAU, orientado pelo professor **Rafael Pacheco Ferreira**.

**Equipe:** Itallo Thiago Herculano da Silva, Raimundo Anthoni Carvalho Alves Cruz e José Emerson Alves Saturno Barboza.

O Rede Atende é um protótipo para registrar e acompanhar demandas relacionadas à educação de Itaíba (PE). O cidadão abre um pedido e acompanha o protocolo; a equipe organiza a triagem, os serviços, os prazos e a conclusão.

É uma demonstração acadêmica, não um serviço da Prefeitura. Os dados devem ser fictícios, e a integração com o SEI é simulada.

## Baixar e executar no Windows

Acesse [o repositório](https://github.com/rmrdotsk-rgb/Rede-Atende), selecione **Code → Download ZIP**, extraia o arquivo e abra a pasta **Rede_Atende_Itaiba**. Como o repositório é privado, é necessário estar autorizado no GitHub.

É preciso ter **Node.js 24.11 ou superior** (ou Node 22.18+) e **npm 10 ou superior**. Na primeira instalação, também é necessário acesso à internet para baixar as dependências. Não é preciso instalar PostgreSQL.

**Forma mais simples:** dê dois cliques em `INICIAR_REDE_ATENDE.cmd` dentro da pasta `Rede_Atende_Itaiba`. Ele verifica as dependências, prepara o banco local, compila e inicia o sistema.

**Pelo terminal:** abra essa mesma pasta no VS Code e execute no PowerShell:

```powershell
node --version
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

Abra **http://127.0.0.1:3001**. Mantenha o terminal aberto durante o uso; para encerrar, pressione **Ctrl+C**. Nas próximas execuções, normalmente basta `npm.cmd start`, sem reinstalar ou recriar o banco.

## Entrar no sistema

As contas de apresentação aceitam nomes de usuário simples:

| Usuário | Perfil | Pode fazer |
| --- | --- | --- |
| `gestor` | Administração | Gerenciar demandas, serviços e relatórios |
| `cidadao` | Comunidade | Criar, acompanhar e avaliar as próprias demandas |
| `operador` | Equipe | Triagem e execução das tarefas permitidas |
| `auditor` | Consulta | Consultar dados sem alterar solicitações |

As senhas são definidas na instalação ou geradas automaticamente. Elas ficam apenas no computador, em `Rede_Atende_Itaiba/.local/demo-access.txt`, e continuam válidas entre reinicializações. É possível entrar também com e-mail em contas cadastradas pelo formulário.

Para escolher senhas fixas ou recuperá-las sem apagar o banco, siga [Acessos locais](Rede_Atende_Itaiba/docs/ACESSOS_LOCAIS.md). **Nunca envie `.env`, `.local`, banco, anexos privados ou senhas ao GitHub.**

## Apresentação

1. Entre como `cidadao` e registre uma solicitação com escola, categoria e descrição fictícias.
2. Copie o protocolo gerado e abra o acompanhamento.
3. Em uma janela anônima, entre como `gestor` e localize esse protocolo em **Demandas**.
4. Faça a triagem, registre o atendimento e conclua o processo respeitando as etapas obrigatórias.
5. Retorne ao cidadão, confira o histórico e avalie o atendimento.

Roteiro completo: [Demonstração](Rede_Atende_Itaiba/docs/ROTEIRO_DEMONSTRACAO_ATUAL.md).

## Testes

Na pasta `Rede_Atende_Itaiba`:

```powershell
npm.cmd run test:static
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:api
npm.cmd run test:budgets
```

Para os testes no navegador:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e -- --project=chromium
```

O projeto também possui testes de persistência, backup e restauração. Veja [Como testar no Windows](Rede_Atende_Itaiba/docs/COMO_TESTAR_NO_WINDOWS.md). Os testes automatizados do GitHub ficam na aba **Actions**.

## Estrutura

- `Rede_Atende_Itaiba/src/`: telas React, componentes e regras da interface.
- `Rede_Atende_Itaiba/server/`: API Fastify, permissões e banco de dados.
- `Rede_Atende_Itaiba/scripts/`: instalação, inicialização e manutenção.
- `Rede_Atende_Itaiba/tests/`: testes de navegação e regressão.
- `Rede_Atende_Itaiba/docs/`: documentação técnica e referências.
- `Rede_Atende_Itaiba/public/`: ícones e recursos da aplicação.

O frontend utiliza React, TypeScript, Vite e Tailwind CSS. O banco local é PGlite, com opção de PostgreSQL externo. A aplicação é web/PWA responsiva, não um aplicativo Android/iOS nativo.

Se o sistema não abrir, confira se o terminal continua executando `npm.cmd start` e se está acessando **127.0.0.1:3001**. Se aparecer mensagem de build ausente, execute `npm.cmd run build` e inicie novamente. **Não apague a pasta `.local` para resolver erros:** ela contém os dados e as contas já criadas.
