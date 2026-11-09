# Testar o Rede Atende no Windows — 3.12.0

Extraia **Rede Atende.zip** em uma pasta nova. No VS Code, abra **Rede_Atende_Itaiba**, a pasta que contém `package.json` e o iniciador. Use Node 24.11 ou superior compatível com as dependências (alternativa: Node 22.18+; Node 23 e 24.0–24.10 não são aceitos); a versão de referência está em `.nvmrc`.

## Iniciar

Dê dois cliques em **INICIAR_REDE_ATENDE.cmd** e mantenha o terminal aberto. O iniciador instala dependências ausentes, prepara o banco portátil sem apagar dados, compila e inicia o site.

Alternativa no terminal PowerShell, dentro da pasta do projeto:

```powershell
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

Abra **http://localhost:3001**. A primeira instalação precisa de internet para baixar dependências. Nas próximas vezes, use `npm.cmd start`. Confira a versão do Node com `node --version` se houver erro antes da instalação.

Os acessos fictícios de cidadão, operador, gestor e auditor são gerados em `.local/demo-access.txt`. Leia-os somente no seu computador; não projete o arquivo nem o envie. Outra opção é cadastrar uma conta fictícia de cidadão pela tela **Entrar**; ela começa sem pedidos. O cadastro público não cria administradores. No celular, as demandas aparecem em cartões. Detalhes e Despachar ficam no próprio cartão; em Mais informações aparecem categoria e previsão. Auditor verá Ver triagem.

Se já existir `.env` PostgreSQL, o setup portátil recusa trocar a configuração. Preserve essa instalação e seus dados. Para usar o ZIP como demonstração nova, extraia em outra pasta. Não apague o banco para resolver erros de instalação.

## Roteiro curto: cidadão e gestor

Use janela comum e janela anônima, ou dois perfis diferentes. Duas abas do mesmo perfil compartilham a mesma conta.

1. **Cidadão:** entre, abra Nova solicitação, escolha explicitamente uma escola. Selecione Infraestrutura → Hidráulico e escreva um relato fictício, como “Bebedouro — demonstração em sala”. Preencha local e confirmação. Foto é opcional; a fixture `server/tests/fixtures/imagem-ficticia.png` é válida.
2. Envie uma vez. O comprovante precisa mostrar `EDU-AAAA-NNNNNN`. Copie o protocolo e abra o acompanhamento. Recarregue: o mesmo pedido permanece.
3. **Gestor na outra sessão:** em Demandas, busque esse protocolo e clique Despachar. Informe setor e responsável. Peça complemento no status Aguardando informações, com uma pergunta pública na Nota de parecer.
4. **Cidadão:** atualize o acompanhamento, leia a pergunta e envie Sua resposta. A gestão recebe a atualização e o pedido retorna à triagem.
5. **Gestor:** crie uma ordem vinculada, obrigatória, para manutenção fictícia. Encaminhe o pedido e inicie o atendimento. A tentativa de concluir com a ordem em aberto deve ser recusada. Inicie e conclua a ordem, registrando o serviço; depois conclua o pedido com a providência final.
6. **Cidadão:** atualize e avalie uma única vez. **Gestor:** confira relatórios e, quando elegível, a vinculação SEI simulada.
7. Para mostrar **correção de categoria**, registre um segundo pedido como Outros. Na triagem, abra Corrigir categoria, escolha Infraestrutura, preencha os campos e o motivo interno. Salve: protocolo, titular, relato, anexos, prazo e encaminhamento são preservados. O cidadão vê a categoria corrigida; o motivo interno fica reservado.
8. Pare com Ctrl+C e inicie novamente, sem apagar `.local`. Protocolo, histórico e anexo devem permanecer.

A lista de escolas é contextual e tem situação a confirmar. Use somente ocorrências fictícias. O projeto não recebe atendimentos oficiais da Prefeitura.

## No telefone

Com o notebook ligado e o servidor aberto, use o navegador do telefone na mesma rede privada e o endereço **http://IP-DO-NOTEBOOK:3001**. Descubra o IPv4 com `ipconfig`. Rede e firewall precisam permitir a conexão; não publique o servidor na internet. É web/PWA, não Expo Go.

Teste o fluxo no navegador e telefone que serão usados na apresentação. Emulação móvel não substitui Windows físico, Safari ou iPhone físico.

## Backup e recuperação

Pare a API com Ctrl+C. No banco portátil, comandos de backup precisam de acesso exclusivo.

```powershell
npm.cmd run db:backup
npm.cmd run db:verify-backup -- CAMINHO_DO_BACKUP
npm.cmd run db:restore -- CAMINHO_DO_BACKUP C:\TesteRedeAtendeRecuperado
```

A pasta de recuperação precisa **não existir**. O comando confere hashes, restaura as 22 tabelas e os anexos em PGlite novo e compara os registros. Nunca sobrescreve a origem. Sessões antigas não são importadas: entre novamente com as contas restauradas. O formato lógico contém hashes de senhas e dados de atendimento; guarde-o em local privado.

O `.env` na pasta recuperada aponta para os novos dados. Para abrir essa recuperação em uma cópia do projeto, pare a instância original, preserve o `.env` dessa cópia e use a configuração recuperada nela; inicie com `npm.cmd start`, sem executar seed/reset. O comando de restauração desta versão cria PGlite; ele não restaura diretamente uma instância PostgreSQL externa.

## Repetir os testes

Cada suíte de banco cria diretórios descartáveis próprios. Os testes não usam a base da apresentação.

O comando `test:e2e` inicia um ambiente novo para Chromium e outro para WebKit. Execute pelo comando npm abaixo para preservar esse isolamento. Os dois relatórios por motor e o consolidado ficam em `test-results/3.9`. WebKit emula o navegador móvel; isso não comprova uso em iPhone físico.

```powershell
npm.cmd run test:static
npm.cmd run build
npm.cmd test
npm.cmd run test:api
npm.cmd run test:flow
npm.cmd run test:persistence
npm.cmd run test:restore
npm.cmd run test:migrations
npm.cmd run format:check
npx.cmd playwright install chromium webkit
npm.cmd run test:e2e
npm.cmd run test:performance
```

Build inclui TypeScript e ESLint. Para validar apenas Chromium: `npm.cmd run test:e2e -- --project=chromium`. Instalação ou dependências ausentes de um navegador não significam aprovação dele. Consulte também o [plano de teste com pessoas](PLANO_TESTE_COM_PESSOAS.md).

## Medir o carregamento (opcional)

Depois de instalar Chromium e fazer o build, `npm.cmd run test:browser-performance` mede produção e desenvolvimento em bancos temporários separados, sem usar a apresentação. O resultado vai para `browser-performance.json`. A medição de produção emula rede móvel; desenvolvimento usa loopback sem limitação de rede. Não compare esses dois modos como se as condições fossem iguais.

Para incluir Lighthouse, instale a ferramenta em uma pasta separada do projeto e passe essa pasta como argumento: `npm.cmd run test:browser-performance -- C:\Ferramentas\Lighthouse`. Esse complemento é opcional, sem chave paga. Registre a versão do navegador e a configuração ao comparar resultados. Medição de laboratório não é INP de usuários reais.
