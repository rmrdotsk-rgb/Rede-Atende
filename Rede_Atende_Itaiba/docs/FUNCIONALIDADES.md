# Funcionalidades — Rede Atende

MVP acadêmico de atendimento educacional de Itaíba–PE. React/TypeScript na interface, API Fastify em `/api/v1` e PostgreSQL/PGlite no servidor. O navegador não mantém banco independente: cidadão e equipe consultam os mesmos registros por contas distintas.

| Rota | Comportamento atual |
| --- | --- |
| `/` | Home acadêmica, sete categorias e acesso ao atendimento; visitante não recebe solicitações privadas. |
| `/entrar` | Cadastro de cidadão, login e sessão; cadastro público não cria equipe. |
| `/informacoes` | Como funciona, fontes municipais e limites do protótipo. |
| `/solicitar` | Categoria, escola, detalhes, anexo opcional, ciência acadêmica e comprovante com protocolo. |
| `/acompanhar` | Dados autorizados: histórico público, agenda, anexos, complemento, providência final e avaliação única. |
| `/admin` | Dashboard dos registros persistidos, avisos e ferramentas restritas por perfil. |
| `/admin/demandas` | Busca/filtros SQL, páginas de 10/20/50 itens, modal de detalhes e despacho. |
| `/admin/triagem` | Setor, responsável, prioridade/prazo justificados, parecer público/interno e controle de edição desatualizada e reabertura visual com motivo exclusivo do gestor. |
| `/admin/unidades` | Catálogo municipal referenciado, com grau de confirmação preservado. |
| `/admin/ordens` | Ordem vinculada à demanda, execução, pendência, cancelamento justificado e vistoria opcional. |
| `/admin/prazos` | Estimativas, configurações permitidas ao gestor e histórico de regras. |
| `/admin/agenda` | Agendamento vinculado, conflitos de 60 minutos, realização/cancelamento e histórico. |
| `/admin/relatorios` | Indicadores do banco e CSV gerencial protegido contra fórmulas. |
| `/admin/integracoes` | SEI exclusivamente simulado, sem comunicação oficial. |
| Caminho inexistente | Página 404 com acesso ao início. |

As rotas administrativas exigem equipe autenticada. Auditor consulta, mas não despacha; operador não recebe permissões exclusivas de gestor. A autorização é aplicada na API.

As sete categorias são infraestrutura, transporte escolar, alimentação/merenda, documentação/transferência, material didático, apoio pedagógico/inclusão e outros. Campos específicos e validações permanecem no catálogo/schema. Não são exigidos CPF, laudos ou dados pessoais de crianças.

Prioridade inicial pública é **média**, definida pelo servidor mesmo que o cliente envie alta/urgente. Somente a equipe autorizada reclassifica com motivo e autoria. Dono, protocolo, status inicial e datas também são definidos no servidor.

Solicitações têm protocolo único e chave de idempotência por conta. Retry idêntico conserva o registro; outro conteúdo com a mesma chave é conflito. Falha de envio não confirma sucesso. Se apenas o refresh falhar, o resultado já confirmado é preservado; espera HTTP tem limite.

Upload/download são reais e privados: PNG, JPEG e PDF de até 5 MB, cinco arquivos por solicitação. A operação idempotente não duplica anexo em retry, inclusive após reinício e na cota máxima. Nome igual não basta para deduplicar arquivos diferentes. Prévia de imagem é temporária; PDF não abre em iframe antes da validação.

Conclusão exige providência final e ausência de obrigação pendente. Complemento é respondido pelo titular e retorna à triagem. Avaliação é permitida após conclusão, uma única vez.

Backup administrativo exporta atendimento sem contas/senhas/sessões ou bytes de anexos. Importação é aditiva e atômica. O backup técnico de CLI é privado e tem escopo diferente, explicado no README.

**Limites:** escritas preservam lock global PostgreSQL e fila exclusiva PGlite. A validação de arquivos não é antivírus completo. E-mail/SMS externos e SEI oficial não fazem parte da demonstração.

## Consultas, sessão e atualizações

As listas comuns são paginadas; /bootstrap substitui o snapshot global no navegador. Painel e relatórios usam agregações do banco; evolução limitada aos 90 dias com registros mais recentes. Detalhes, históricos e anexos são obtidos por protocolo/ID. Notificações mostram 20 avisos recentes com contagem total de não lidos; históricos completos seguem no protocolo autorizado. OS abre detalhes técnicos sob demanda.

Acesso inclui confirmação de senha no cadastro, mostrar/ocultar senha e guia de demonstração, sem publicar credenciais da equipe. Reabertura limpa a providência final resumida, preserva histórico e avaliação original. Cancelamento de agenda usa diálogo com motivo e retorno de foco.

## Listagens e navegação

SEI calcula elegibilidade e totais na base, com três listas paginadas independentemente. Ordens identificam o vínculo mesmo fora da primeira página. O seletor remoto pagina, filtra situações no servidor e mantém uma opção selecionada durante novas buscas/polling. Formulários não são desmontados ao paginar na mesma rota. Demandas tem prioridade, ordenação e filtros conservados na URL. O menu móvel anuncia seu estado e devolve foco com Escape; caixas de seleção foram ampliadas após detecção no axe. Comprovante e anexo foram extraídos do formulário para componentes próprios.

## Preenchimento e acesso móvel

O formulário avisa antes de descartar alterações por navegação, recarga ou logout. O usuário pode continuar preenchendo ou descartar; rascunhos pessoais não são salvos no navegador. No celular, as demandas usam cartões com ações e detalhes; notificações e acessibilidade ficam nas opções do cabeçalho.
