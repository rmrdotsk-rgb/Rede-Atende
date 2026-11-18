# Rede Atende — resumo da entrega

**Disciplina:** Front-End Frameworks — UNINASSAU
**Professor:** Rafael Pacheco Ferreira
**Equipe:** Itallo Thiago Herculano da Silva, Raimundo Anthoni Carvalho Alves Cruz e José Emerson Alves Saturno Barboza
**Versão do aplicativo:** 3.12.0

## Objetivo

O Rede Atende é um protótipo web para registrar, organizar e acompanhar demandas da educação de Itaíba (PE). O cidadão cria uma solicitação e recebe um protocolo. A equipe pode consultar o mesmo registro, fazer a triagem, acompanhar o serviço e informar a conclusão.

O projeto é independente e acadêmico. Não é um canal oficial da Prefeitura de Itaíba. Os atendimentos da demonstração são fictícios e a integração com o SEI é simulada.

## O que demonstrar

1. Criar uma conta de cidadão e entrar no sistema.
2. Registrar uma demanda com escola, categoria, descrição e anexo opcional.
3. Receber e acompanhar o protocolo.
4. Entrar como gestor em uma segunda sessão de navegador.
5. Localizar a solicitação, triar, encaminhar e atualizar o andamento.
6. Consultar relatórios e avaliar o atendimento concluído pelo cidadão.

## Tecnologias

Interface em React, TypeScript, Vite e Tailwind CSS; servidor Node.js/Fastify; banco PGlite na execução portátil, com opção de PostgreSQL. As permissões são validadas pelo servidor.

## Executar no Windows

Abra a pasta `Rede_Atende_Itaiba`, onde está o `package.json`. Na primeira instalação, execute um comando por vez:

```powershell
npm.cmd ci
npm.cmd run setup -- --embedded
npm.cmd run build
npm.cmd start
```

Abra `http://127.0.0.1:3001`. Nas próximas execuções normalmente basta `npm.cmd start`, sem recriar o banco. Os acessos fictícios ficam somente no computador, em `.local/demo-access.txt`; nunca envie esse arquivo ao GitHub.

## Estado da validação

Em 18/11/2026, as gravações locais demonstraram cadastro, envio de solicitação com PDF, geração de protocolo e acompanhamento. A tela de acesso restrito em `/admin` foi exibida porque a sessão estava autenticada como cidadão. A jornada completa de gestão e conclusão ainda exige validação com uma conta de gestor.

Foram reexecutados 14 testes estáticos, todos aprovados. Os relatórios históricos registram testes de 08/11/2026 e não substituem a verificação de todas as funcionalidades no ambiente final. A instalação anterior informou cinco alertas de vulnerabilidade alta, ainda pendentes de classificação.

## Documentação

- [Histórias de usuário](Rede_Atende_Itaiba/docs/HISTORIAS_DE_USUARIO.md)
- [Roteiro da apresentação](Rede_Atende_Itaiba/docs/ROTEIRO_DEMONSTRACAO_ATUAL.md)
- [README do aplicativo](Rede_Atende_Itaiba/README.md)
- [Relatório de validação](Rede_Atende_Itaiba/docs/RELATORIO_VALIDACAO.md)

A proposta original chamada *EduConecta* está preservada como referência histórica; o nome do aplicativo é **Rede Atende**.
