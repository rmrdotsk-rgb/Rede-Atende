# Histórico de mudanças — Rede Atende

## Finalização verificada da base 3.12.0 — 08/11/2026

- Corrigidos upload e reinício do formulário: campos bloqueados durante envio, comprovante após tentativa de anexo, escola novamente vazia e descarte explícito de anexo pendente.
- Complementos e avaliações protegidos contra saída e troca de protocolo; campos bloqueados durante a confirmação do servidor.
- Corrigida a ativação tardia do aviso ao usar Voltar imediatamente após digitar. O bloqueio consulta o estado atual sem esperar uma atualização passiva do componente.
- Corrigida corrida em filtros: uma pesquisa atrasada não regrava parâmetros antigos sobre a categoria escolhida nem altera uma rota posterior.
- Agenda sincronizada com Voltar/Avançar. Cancelamentos diretos e por ordem de serviço preservam observações e guardam motivo separado, com histórico e persistência.
- PDF com nomes escapados passa pela mesma política de conteúdo ativo; configuração restaurada usa caminhos compatíveis com Windows.
- Cabeçalho medido para evitar controles cobertos na rolagem; terceira ação principal visível no início.
- Navegadores com servidor, banco, sessões e cotas independentes; esperas verificam conteúdo real, sem relaxar timeouts. Regressões de paginação, Agenda e formulários ampliadas.
- Versão interna, dependências, identidade, créditos, escolas e migrações preservados. Resultados exatos da execução constam em `docs/RELATORIO_VALIDACAO.md`.

## Organização da distribuição — 08/11/2026

- Removidos relatórios de autoavaliação, notas, logs e capturas históricas da distribuição.
- Guias técnicos mantidos com referências atualizadas; código da aplicação e migrações preservados.
- Retirada uma checagem que exigia frases de um relatório antigo; demais verificações mantidas.

## 3.12.0 — 08/11/2026

- Proteção de preenchimento da solicitação por confirmação de saída, recarga e logout, sem armazenamento de rascunhos pessoais. React Router usa sua API de bloqueio de navegação, mantendo as mesmas rotas.
- Cabeçalho móvel com opções agrupadas e notificações identificadas como demonstrativas; atalho de conteúdo mantém foco sem criar entrada nativa de histórico.
- Estados iniciais e leitura automática de acompanhamento/triagem ajustados para reduzir deslocamentos de layout e consultas redundantes.
- Metadados por rota no cliente e no HTML de produção; política sem indexação para a demonstração e áreas privadas.
- Build automático antes dos testes de API, budgets de desempenho e ensaio móvel de todas as páginas.
- Fixtures de sessão isoladas dos demais ensaios: a limitação de login da aplicação continua ativa.

## 3.11.0 — 07/11/2026

- Cartões de demandas em telas pequenas, com ações acessíveis sem arrastar a tabela; padrão de 10 itens móvel e 20 desktop, mantendo seleção explícita por URL.
- Sincronização de pesquisa e paginação conserva textos pendentes ao trocar filtros ou ajustar a página; estado vazio único nas duas apresentações.
- Correção de corrida na leitura de detalhes: cancela a leitura anterior e ignora resposta obsoleta. Foco retorna ao botão correto ao fechar o modal.
- Ações do auditor apresentadas como consulta; conta da equipe recebe orientação antes do formulário exclusivo de cidadão.
- Formulário e acompanhamento com carregamento sob demanda; início/login/orientações imediatos; a casca de navegação permanece durante a troca de página.
- Campos específicos e sugestão de triagem disponíveis no detalhe completo; a sugestão não é calculada sobre a descrição resumida da lista.
- Novos cenários de navegador para cartões, oito larguras, paisagem, concorrência e papéis. Medições com Lighthouse e Playwright separando produção/desenvolvimento.
- Intervalo Node do manifesto alinhado ao iniciador (22.18+ ou 24.11+); dependências e migrações 001–003 sem mudança.

## 3.10.2 — 07/11/2026

- Reclassificação de categoria na triagem/API, com campos validados, motivo interno, versão obrigatória e evento público; SQL e JSON sincronizados.
- Recuperação lógica em PGlite novo, com comparação de 22 tabelas e anexos; rejeição de corrupção/esquema incompatível; sessões não transportadas.
- Cabeçalho móvel compacto, navegação única de gestão, filtros adicionais recolhidos, indicadores úteis e comprovante sem QR decorativo.
- Consulta do tempo de triagem agregada pelo histórico relacional.
- Fixtures PNG/escola e helper de upload corrigidos; banco E2E exclusivo por execução; esperas por conteúdo real; regressões de reclassificação e resposta perdida.
- Guias, OpenAPI, versão dinâmica do ensaio HTTP e formatação atualizados; migrações 001–003 preservadas.

## 3.10.1 — 07/11/2026 (revisão editorial sem alteração de regras de negócio)

- Terminologia da interface simplificada; títulos, cartões, menus e metadados deixam explícito o caráter acadêmico, evitando associação indevida a serviços oficiais.
- Nome interno do pacote atualizado para `rede-atende`; ZIP final distribuído como `Rede Atende.zip`.
- Sem dependências ou módulos de inteligência artificial ativos na interface; nenhuma funcionalidade removida.

## 3.10.0 — 07/11/2026 (revisão limitada por ambiente)

- A suíte Playwright passa a incluir `tests/functional` e `tests/e2e`; cenários E2E antigos que dependiam de `localStorage` foram reescritos para o backend de sessões reais, controle de acesso A/B, idempotência, anexos, gestor e auditor. **Sem alegação de execução E2E nesta revisão**.
- Comando de backup lógico passa a bloquear leitura do PGlite com API ativa, criar manifesto SHA-256 de arquivos e preservar metadados para verificação posterior. Novo `db:verify-backup`; verificação de bytes não substitui restauração e não valida PostgreSQL ativo.
- Acrescentadas verificações sintéticas de integridade do manifesto de backup.
- README simplificado, guia Windows e `.gitignore` reforçado. Nenhuma migração 001–003 ou catálogo operacional de escolas alterado.
- Documento de referência contém as 44 escolas municipais sem comprovação de funcionamento e sem importação automática. Fontes oficiais verificadas em 07/11/2026.

## Organização da cópia 3.9.1 — 07/11/2026 (sem atualização funcional de versão)

- Removidos da distribuição enxuta somente relatórios históricos duplicados, evidências antigas e instruções de IA ultrapassadas. Fonte, testes, banco, migrações e créditos preservados.
- Endereço de Educação corrigido conforme página oficial: Rua Manoel Martins, s/n. Endereço da sede municipal identificado separadamente.
- Catálogo de referência da lista municipal de escolas acrescentado, **sem importar automaticamente unidades** para o banco nem declarar funcionamento atual.

## Revisão de confiabilidade da base 3.9.1 — 07/11/2026 (sem mudança de versão)

- Inicializador Windows valida Node compatível com Babel 8, npm funcional e dependências completas; o setup portátil evita confundir `.env` PostgreSQL existente com PGlite.
- Execução de migrações registra/consulta versões e não recria gatilhos de auditoria já aplicados.
- Download de anexos valida SHA-256/tamanho e audita apenas entrega íntegra; GETs de listagens têm transação de leitura.
- Ajustes pontuais na comunicação acadêmica e na divergência de endereços oficiais; 14 páginas documentadas.
- Verificações estáticas e regressões de API/persistência entre processos adicionadas.

## 3.9.1 — 07/11/2026 (UX e fontes municipais)

- Navegação pública e administrativa separadas, ajuda de três passos e informações municipais com links verificáveis.
- Seleção de escola obrigatória sem pré-seleção; validação de referência e conservação da escolha ao criar outro chamado.
- Explicação clara para URLs inexistentes (404), rótulos mais precisos nos protocolos, contatos oficiais destacados do canal demonstrativo.
- Sem alterações em API, regras de transição, migrações ou SEI simulado.

## 3.9.0 — 06/11/2026

- PGlite 0.4.6, mantendo explicitamente `template1` para compatibilidade com a 3.8; falha de escrita no driver antigo reproduzida em carga de navegador.
- Consultas SEI com elegibilidade no SQL, totais globais, busca e três paginações independentes.
- Ordens enriquecidas por JOIN com protocolo, escola e prioridade; seletor remoto paginado preserva vínculos antigos.
- Formulários preservados durante filtros/páginas; filtros, prioridade e ordenação de Demandas mantidos na URL.
- Menu móvel com nome dinâmico, Escape e foco; alvos de caixas de seleção ampliados após falha real no axe.
- Tipografia em tokens, componentes de comprovante/anexo/cartão de OS extraídos e fontes formatadas.
- ESLint (hooks/acessibilidade), TypeScript e Prettier integrados; testes de regressão de API e navegador acrescentados.
- Migrações 001/002/003, 13 rotas, sete categorias, créditos e dados existentes preservados.

## 3.7.0 — 06/11/2026

- Prioridade inicial pública definida no servidor, com reclassificação justificada e autoria preservadas.
- Upload idempotente persistido, concorrência, retry na cota e reconciliação de arquivo/metadados.
- Consulta SQL por ID/protocolo; endpoint paginado de demandas e filtros no servidor, integrado à tela.
- Leituras explicitamente somente leitura; locks de escrita preservados. Bloqueio de triagem desatualizada na UI atual.
- Migração aditiva 002; backup técnico inclui chaves de upload; documentação corrente revisada.

## Entradas anteriores — histórico

## 3.3.0 — 05/11/2026 (GovTech acadêmico, validação parcial)

- Identidade ilustrativa sem falsa oficialidade; barra de acessibilidade; comprovante de impressão com marca não verificável.
- Ciência de privacidade obrigatória; projeção pública minimizada; prazos por categoria e alertas visuais.
- Filtros de zona e SLA, sugestões de prioridade, relatório mensal com Recharts e TMA por setor, anexos JPG/PNG/PDF, cenários DEV.

---

## 3.2.0 — 21/10/2026

- Mantida a aplicação React/TypeScript existente, o PDF original, as dez rotas anteriores, os créditos e a identidade de José Emerson Alves Saturno Barboza.
- Cabeçalho único, alternador de visão, navegação com foco e restauração de rolagem, sete categorias distribuídas sem categoria artificial.
- Escolas referenciadas em fontes de Itaíba com grau de confirmação explícito; sem contatos/direção/códigos inventados.
- Campos por categoria, escola estável, máscara de telefone, sugestões que exigem escolha, validação e pré-visualização temporária de anexo até 5 MB.
- Comprovante com data/hora, copiar protocolo, impressão dedicada e próximo passo.
- Histórico legível, notas internas separadas da projeção pública, publicação opcional de responsável.
- Pedidos de informação e respostas do cidadão, avisos locais e avaliação após conclusão.
- Ordens de serviço, execução, pendências, vistorias vinculadas e cancelamento justificado.
- Regras de previsão configuráveis, alterações justificadas/auditadas e bloqueio de conclusão com atividades obrigatórias pendentes.
- Novas rotas `/admin/ordens` e `/admin/prazos`; relatórios com execução e satisfação.
- Ajustes de requisitos e novos testes de regressão.

---

## 3.1.0 — 2026-10-21 — revisão independente Work

- Resolve conflito de dependências sem `--force` e gera lockfile npm reproduzível.
- Remove bibliotecas de IA/servidor/animação e metadados do exportador após confirmar ausência de uso. Move ferramentas de build para desenvolvimento.
- Ativa TypeScript estrito, símbolos não utilizados, runner de testes multiplataforma e módulos administrativos sob demanda.
- Corrige texto residual e o estado de pendência na linha do tempo; preserva as telas e a identidade azul/azul-marinho.
- Centraliza validação de cadastro no formulário e no serviço; inclui erros visíveis, trava e chave de envio idempotente.
- Implementa contador por ano, validação de sequências, reconhecimento de protocolos históricos e bloqueio de duplicidades na migração.
- Refatora persistência para um único estado versionado por operação composta; falhas não deixam agenda, SEI e histórico parcialmente gravados. Isso não equivale a transações entre abas.
- Restringe transições na UI e no serviço, protege campos imutáveis e registra atribuições no histórico.
- Calcula tempo médio, totais, atrasos, prazos próximos e evolução temporal pela mesma base.
- Acrescenta edição de agenda, validação de vínculo/data/horário/conflito, histórico e cancelamento confirmado com motivo.
- Unifica elegibilidade SEI, bloqueia casos concluídos/pendentes e repetição, usando somente identificadores fictícios.
- Reforça CSV contra fórmulas precedidas de espaços/controles e omite dados pessoais desnecessários.
- Substitui contatos e identificadores escolares inventados por dados explicitamente fictícios; remove alegações de serviço oficial e de conformidade integral.
- Revisa responsividade, contraste, labels, erros associados, foco, Escape, modais e navegação por teclado.
- Acrescenta documentação e testes de regressão.
