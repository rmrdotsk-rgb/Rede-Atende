# Rede Atende — aplicação

O código desta pasta contém a interface React, a API Fastify e o banco local PGlite. O projeto foi desenvolvido para a disciplina Front-End Frameworks da UNINASSAU.

Para executar no Windows, instale Node.js 24.11+ e abra `INICIAR_REDE_ATENDE.cmd`. Ou execute no PowerShell desta pasta:

```powershell
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

Acesse **http://127.0.0.1:3001**. Na próxima execução, use apenas `npm.cmd start` se já tiver instalado e compilado.

Entre como `gestor` ou `cidadao`. As senhas locais ficam em `.local/demo-access.txt`; não compartilhe esse arquivo. A aplicação também dispõe de contas `operador` e `auditor`.

Para definir senhas próprias, recuperar acessos e preservar os dados de uma instalação anterior, leia [Acessos locais](docs/ACESSOS_LOCAIS.md). Para apresentar o projeto, veja o [Roteiro de demonstração](docs/ROTEIRO_DEMONSTRACAO_ATUAL.md).

Documentação geral e descrição das funcionalidades: [README principal](../README.md).
