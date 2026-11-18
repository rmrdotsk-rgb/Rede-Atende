# Histórias de usuário — Rede Atende

Ações do protótipo acadêmico, com registros fictícios. **Leitura** consulta informações salvas; **escrita** cria ou altera registros.

## HU01 — Cadastro de cidadão (escrita)
**Como** integrante da comunidade, **quero** criar uma conta **para** registrar e acompanhar solicitações.
**Conferência:** cadastrar na rota `/entrar`, autenticar-se e confirmar que o usuário não tem acesso administrativo.
**Código:** `src/pages/community/Login.tsx`; `POST /api/v1/auth/register`.

## HU02 — Nova solicitação (escrita)
**Como** cidadão, **quero** informar escola, categoria e problema **para** receber um protocolo.
**Conferência:** preencher `/solicitar`, enviar e conferir o protocolo após recarregar. Anexo é opcional.
**Código:** `src/pages/community/NewRequest.tsx`; `POST /api/v1/requests`.

## HU03 — Acompanhamento (leitura)
**Como** cidadão, **quero** consultar o histórico de um protocolo **para** saber o andamento.
**Conferência:** abrir `/acompanhar`, localizar o pedido e verificar que outra conta não acessa dados privados.
**Código:** `src/pages/community/TrackRequest.tsx`; `GET /api/v1/protocols/:protocol`.

## HU04 — Triagem e encaminhamento (leitura e escrita)
**Como** gestor, **quero** consultar as demandas e atribuir responsáveis **para** organizar o atendimento.
**Conferência:** entrar como gestor em outra sessão, procurar o protocolo, alterar status e salvar; conferir atualização na conta do cidadão.
**Código:** `src/pages/admin/AdminDemands.tsx`, `AdminTriage.tsx`; `PATCH /api/v1/requests/:id`.

## HU05 — Ordem de serviço (escrita)
**Como** integrante autorizado da equipe, **quero** registrar execução e conclusão do serviço.
**Conferência:** vincular uma ordem a uma demanda e respeitar as etapas necessárias à conclusão.
**Código:** `src/pages/admin/AdminWorkOrders.tsx`; `/api/v1/work-orders`.

## HU06 — Relatórios (leitura)
**Como** gestor, **quero** consultar indicadores para acompanhar o volume de solicitações.
**Conferência:** entrar em `/admin/relatorios`, consultar dados persistidos e, se autorizado, exportar CSV.
**Código:** `src/pages/admin/AdminReports.tsx`; `GET /api/v1/reports`.

## HU07 — Avaliação (escrita)
**Como** cidadão, **quero** avaliar uma solicitação concluída para registrar o resultado.
**Conferência:** concluir como gestor, voltar à conta titular e registrar uma única avaliação.
**Código:** `src/pages/community/TrackRequest.tsx`; `POST /api/v1/requests/:id/rating`.

Estas histórias indicam o comportamento esperado. A existência das rotas não substitui testes completos no navegador.
