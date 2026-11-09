# Histórico de alterações — Rede Atende

Registro resumido das melhorias incorporadas ao projeto. Para conhecer mudanças por arquivo, utilize o histórico de commits do GitHub.

## Atendimento e acompanhamento

- Cadastro e autenticação para cidadão, operador, gestor e auditor, com permissões verificadas no servidor.
- Registro de solicitações com escola, categoria, protocolo, histórico e anexos.
- Acompanhamento, complementação, avaliação, reabertura e controle de estados das demandas.
- Triagem, despacho, responsáveis, prazos, ordens de serviço, agenda e relatórios.
- Simulação de integração SEI, identificada como não oficial.

## Correções de funcionamento

- Proteção contra perda de dados preenchidos ao trocar de página ou de protocolo.
- Ajustes no envio e na repetição de anexos, inclusive respostas atrasadas do servidor.
- Correção da atualização dos filtros e da paginação em consultas concorrentes.
- Sincronização da agenda com a navegação Voltar/Avançar.
- Separação das justificativas de cancelamento e preservação das observações anteriores.
- Validações adicionais para arquivos PDF e restauração da configuração do banco no Windows.

## Interface e acessibilidade

- Layout responsivo para telas pequenas, com ações acessíveis em cartões.
- Navegação distinta para cidadão e equipe, com ajustes de foco e teclado.
- Indicação explícita de dados e operações fictícias, evitando confusão com o atendimento oficial.
- Formulários e páginas administrativas carregados sob demanda.

## Dados, segurança e testes

- Banco portátil PGlite e opção de PostgreSQL externo.
- Migrações de banco preservadas e recuperação com validação de integridade.
- Verificações de autenticação, permissões, CSRF, upload e consistência de dados.
- Testes automatizados de domínio, API e navegador, com resultados e limitações descritos em [Relatório técnico de validação](docs/RELATORIO_VALIDACAO.md).

O histórico anterior continua acessível nos commits do repositório. Os resultados dos testes apresentados no relatório são de uma execução documentada, não uma certificação permanente do código.
