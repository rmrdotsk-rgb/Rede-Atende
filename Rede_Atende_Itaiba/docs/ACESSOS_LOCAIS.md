# Contas e senhas para a demonstração

O sistema possui quatro contas de exemplo com estes nomes de usuário:

| Usuário para entrar | Perfil |
| --- | --- |
| `gestor` | Administração |
| `cidadao` | Comunidade |
| `operador` | Equipe |
| `auditor` | Consulta |

Os identificadores são fixos. O banco continua guardando os mesmos registros de usuário de versões anteriores; por isso os pedidos e permissões não são perdidos. O cadastro público cria somente cidadãos e exige e-mail.

## Primeira instalação

Na pasta `Rede_Atende_Itaiba`, execute:

```powershell
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

A preparação cria o banco PGlite local e salva as senhas geradas em `.local/demo-access.txt`. Leia esse arquivo em particular, sem compartilhar a tela. As senhas permanecem válidas quando o servidor é reiniciado.

Se quiser **escolher as senhas antes da primeira instalação**, crie manualmente o arquivo `.env` dentro de `Rede_Atende_Itaiba` com estas configurações e os valores escolhidos por você:

```dotenv
DB_MODE=embedded
PORT=3001
COOKIE_SECURE=false
SERVE_FRONTEND=false
SEED_GESTOR_PASSWORD=ESCOLHA_UMA_SENHA_DE_12_OU_MAIS_CARACTERES
SEED_CIDADAO_PASSWORD=ESCOLHA_OUTRA_SENHA_DE_12_OU_MAIS_CARACTERES
```

Substitua os textos após `=` por senhas de 12 a 128 caracteres. Você pode incluir `SEED_OPERADOR_PASSWORD` e `SEED_AUDITOR_PASSWORD` do mesmo modo. Depois execute `npm.cmd run setup -- --embedded` e os comandos de compilação e início.

**Não salve as senhas no código, no README ou no repositório**, mesmo que ele seja privado. O Git ignora `.env`, `.local`, bancos locais e arquivos de backup.

## Trocar uma senha de uma instalação existente

Modificar `SEED_GESTOR_PASSWORD` ou `SEED_CIDADAO_PASSWORD` no `.env` **não troca a senha de uma conta que já foi cadastrada**. Para alterá-la sem apagar dados:

1. Pare o servidor com **Ctrl+C**.
2. Abra `.env` e defina a nova senha na variável `SEED_GESTOR_PASSWORD` ou `SEED_CIDADAO_PASSWORD`.
3. No terminal da pasta do aplicativo, execute o comando correspondente:

```powershell
npm.cmd run demo:reset-password -- --login gestor --confirm
npm.cmd run demo:reset-password -- --login cidadao --confirm
```

Execute apenas o comando da conta cuja senha deseja trocar. O sistema faz um backup antes da mudança, encerra as sessões antigas da conta e preserva seus dados, protocolos e permissões. Se houver erro no backup, o reset é cancelado. O mesmo procedimento serve para `operador` e `auditor`.

Para consultar a cópia privada de senhas, com a tela não compartilhada:

```powershell
notepad .\.local\demo-access.txt
```

Em instalações antigas, o arquivo pode mostrar os identificadores anteriores em formato de e-mail. Os nomes curtos funcionam com a mesma senha. Executar o setup da versão atual normaliza a apresentação do arquivo quando ele existe.

## Usar duas contas ao mesmo tempo

Abra **http://127.0.0.1:3001** na janela normal do navegador para `cidadao` e numa janela anônima para `gestor`. Isso mantém as sessões separadas.

Evite alternar entre `localhost` e `127.0.0.1`, pois os navegadores tratam os dois endereços como origens diferentes. Para encerrar o servidor, use Ctrl+C. Nas próximas execuções, use `npm.cmd start`.

## Cuidados ao atualizar o ZIP

Guarde `.env` e toda a pasta `.local`. Eles não vêm no ZIP do GitHub. Ao baixar uma versão nova, copie apenas os arquivos de código para sua instalação existente, mantendo seus dados; ou preserve uma cópia privada e teste o novo projeto em outra pasta. Não apague o banco para tentar corrigir um login.

Para usar PostgreSQL externo, consulte `.env.example` e o README. Não execute `setup -- --embedded` sobre uma instalação já configurada para PostgreSQL.
