# Acessos locais da demonstração

As quatro contas fictícias usam e-mail como identificador: `gestor@redeatende.invalid`, `operador@redeatende.invalid`, `auditor@redeatende.invalid` e `cidadao@redeatende.invalid`. Os IDs são gerados uma vez e preservados no banco. Nenhuma senha é publicada na interface ou neste repositório.

## Primeira instalação no Windows

Abra no VS Code a pasta **Rede_Atende_Itaiba**, onde está `package.json`, e use o terminal PowerShell:

```powershell
Get-Location
Test-Path .\package.json
node --version
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

`Test-Path` deve retornar `True`. Use Node 24.11 ou superior, conforme a faixa de versões do projeto. Abra **http://127.0.0.1:3001** e mantenha o terminal aberto. Para encerrar, pressione **Ctrl+C**. Nas próximas aberturas, entre na mesma pasta e execute `npm.cmd start`; se alterar os fontes, execute `npm.cmd run build` antes.

O primeiro setup gera senhas aleatórias de forma automática e grava uma cópia em `.local/demo-access.txt`. Consulte esse arquivo **em particular**, antes de compartilhar a tela. Ele e `.env` são ignorados pelo Git. No Linux/macOS, a gravação usa permissão `0600`; no Windows, a proteção adicional depende das permissões NTFS da pasta do usuário. Não coloque esses arquivos em pastas compartilhadas nem os inclua no ZIP.

Para escolher as senhas antes do primeiro setup, copie `.env.example` para `.env`, escolha `DB_MODE=embedded` e preencha localmente `SEED_GESTOR_PASSWORD`, `SEED_OPERADOR_PASSWORD`, `SEED_AUDITOR_PASSWORD` e `SEED_CIDADAO_PASSWORD`. Use valores próprios de 12 a 128 caracteres, sem quebra de linha. No PostgreSQL, preserve `DB_MODE=postgres` e sua `DATABASE_URL` em vez de solicitar o modo portátil.

## Atualizações e reinício

Repetir setup **não troca a senha de uma conta existente**, mesmo se uma variável `SEED_*_PASSWORD` mudar. O login válido continua sendo o que corresponde ao hash já salvo no banco. Também não gera uma senha nova para substituir uma cópia perdida do arquivo de acessos. Preserve `.env`, `.local`, anexos e banco ao atualizar os fontes.

Para backup do banco portátil, pare a API com Ctrl+C e execute `npm.cmd run db:backup`. Guarde também uma cópia privada da configuração antes de editar `.env`. Nunca compartilhe os backups: eles contêm dados e hashes de senha.

## Recuperar uma senha perdida

Este procedimento é reservado ao responsável com acesso ao computador e ao banco da demonstração. Não existe rota pública de recuperação administrativa.

1. Pare o servidor com **Ctrl+C**. Confirme que outra janela não mantém a API aberta.
2. Faça uma cópia privada de `.env`. Edite no próprio VS Code a variável da conta desejada, por exemplo `SEED_GESTOR_PASSWORD`, com a nova senha de 12 a 128 caracteres. Não cole a senha em comandos, chats ou gravações.
3. Confira a configuração do banco que será usado e execute a confirmação explícita:

```powershell
npm.cmd run demo:reset-password -- --email gestor@redeatende.invalid --confirm
```

O comando gera um backup privado **antes** de alterar o hash, mantém ID/perfil/solicitações, invalida as sessões da conta e registra `demo.password.reset` na auditoria. Ele recusa conta fora dos quatro e-mails fictícios, senha inválida, falta de `--confirm` ou falha no backup. O lock do PGlite impede execução com a API portátil em uso. Para PostgreSQL externo, o responsável também deve parar a API antes de executar o procedimento.

4. O arquivo privado de acessos passa a refletir a nova senha. Inicie com `npm.cmd start` e entre novamente. Se o arquivo estiver indisponível após uma falha de disco/permissão, consulte o resultado do comando e o banco antes de repetir; ele não apaga solicitações.

Altere o e-mail e a variável correspondente para recuperar operador, auditor ou cidadão. Não use esse comando para criar uma conta nova ou mudar permissões. Para voltar à senha anterior, configure-a em particular e execute novamente o mesmo procedimento explícito.

## Duas sessões para apresentar

Use o cidadão na janela normal e o gestor numa janela privada. Mantenha ambas em **http://127.0.0.1:3001**: `localhost` e `127.0.0.1` são origens diferentes, com cookies, preferências e cache próprios. O banco do servidor é o mesmo quando apontam para a mesma instância.

Em **Tema de cores**, escolha **Claro**, **Escuro** ou **Alto contraste**; no celular, o seletor fica no botão de opções do cabeçalho. A escolha e o tamanho de fonte pertencem ao navegador e não alteram o perfil da conta. Preferências de uma janela privada normalmente são descartadas quando ela é encerrada.

Um cidadão que abrir `/admin` encontra a página de acesso restrito e pode voltar à comunidade ou encerrar a sessão para entrar com uma conta da equipe. O auditor permanece em consulta; somente as permissões existentes do servidor autorizam alterações.
