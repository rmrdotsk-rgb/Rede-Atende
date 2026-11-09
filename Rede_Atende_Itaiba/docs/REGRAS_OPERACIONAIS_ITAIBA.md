# Regras operacionais — Rede Atende 3.12.0

Regras acadêmicas para Itaíba–PE, validadas no servidor. Não constituem prazo municipal oficial ou homologação governamental.

## Solicitação e acesso

O cidadão autenticado usa dados sintéticos, uma das sete categorias e escola do catálogo. O servidor define titularidade, prioridade inicial **média**, Recebida, protocolo e datas. Um valor de prioridade enviado pelo cliente não eleva a classificação inicial. Operador/gestor reclassifica com motivo e histórico de antes/depois, autoria e data.

Protocolos novos seguem `EDU-AAAA-NNNNNN`, com ano no fuso Recife e sequência preservada; o banco também protege unicidade. Históricos válidos não são renumerados. Chave de idempotência por conta reconcilia o envio; outro conteúdo com a mesma chave gera conflito.

Cidadão só consulta seus protocolos/anexos e responde/avalia por si. Auditor consulta. Escritas exigem sessão, CSRF, papel e validação. Parecer interno, responsável não público e motivo interno de prazo são removidos da projeção do cidadão; agenda pública não repete observações técnicas privadas.

## Fluxo, prazos e concorrência

O ciclo normal é Recebida → Em triagem → Encaminhada → Em atendimento → Concluída. Desvios para Aguardando informações retornam à triagem. Transições, reabertura restrita e campos imutáveis permanecem no motor existente.

Encaminhar/atender/concluir exige setor e responsável. Alterar prioridade exige motivo; alterar previsão exige motivo e nova data futura. Prazos iniciais são estimativas acadêmicas por categoria/calendário configurável. Após configuração por prioridade, novos cadastros usam essa configuração. Reclassificar não muda a previsão silenciosamente.

Agenda e filtros de período usam Recife (`-03:00`); instantes ficam em ISO/UTC. Atualizações de histórico recebem marca crescente inclusive no mesmo milissegundo, para distinguir versões.

A UI atual envia a versão aberta para edição. Outro despacho gera 409, sem sobrescrever o primeiro. **Atualizar dados da solicitação** recarrega para revisão. `expectedUpdatedAt` é opcional por compatibilidade: clientes antigos sem esse campo não recebem detecção de intenção de edição antiga, mas continuam sujeitos às regras/autorizações transacionais.

## Complementos, execução e conclusão

Pedir complemento exige pergunta. Titular responde uma vez por pedido, com 5–2.000 caracteres. Pedido sem resposta impede conclusão, mesmo após mudança manual de status. Resposta retorna à triagem e registra histórico/avisos.

Ordens vinculadas podem ficar abertas, em execução, pendentes, concluídas ou canceladas com justificativa. Cada transição exige providência/motivo. Vistoria vinculada é gravada junto à ordem; agenda rejeita sobreposição inferior a 60 minutos para o mesmo responsável. Realizada/Cancelada são terminais. Cancelar ordem cancela sua vistoria ativa com motivo.

Não se conclui demanda com OS obrigatória aberta, compromisso ativo ou complemento pendente. É exigida providência final com pelo menos cinco caracteres. Após conclusão, o titular avalia de 1 a 5 uma única vez. Indicadores derivam desses registros, sem números oficiais inventados.

## Anexos, falhas e operação

PNG/JPEG/PDF têm limite de 5 MB e cinco anexos. MIME, extensão, assinatura e estrutura PNG/JPEG são conferidos; limite de 12 megapixels e 8192 pixels por lado; PDF ativo conhecido é recusado. Download é autenticado, sem URL pública permanente. A verificação básica não é antivírus nem sanitização completa de PDF.

`Idempotency-Key` é vinculada a usuário, solicitação e operação. Retry idêntico verifica os bytes gravados e retorna o mesmo anexo, sem nova cota. Outro arquivo/metadados com a mesma chave gera 409. Nova chave significa nova operação. Clientes antigos sem cabeçalho reconciliam conteúdo, nome, MIME e tamanho iguais, nunca apenas o nome.

Metadados, chave e auditoria são transacionais. Na falha confirmada, só o novo binário sem registro é removido. Se não for possível confirmar o commit, o arquivo privado é preservado para evitar apagar conteúdo possivelmente confirmado. Queda abrupta pode deixar órfão privado: não se promete transação distribuída entre filesystem e banco. Registros anteriores são preservados.

A migração 001 não foi editada; a 002 é aditiva e reaplicável. Não apague `.local`, base ou chaves ao atualizar. Setup não reinicializa cenários existentes. Backup do painel não inclui contas/senhas/binários; importação válida mescla e conflitos abortam. Backup técnico CLI é privado, inclui hashes e anexos e não vai no ZIP.

O banco fica no servidor, compartilhado pela API. Não há botão público de limpar a base. SEI é simulação e avisos são internos.

## Complementos 3.8

Notas técnicas da OS são internas, inclusive providência técnica da ordem concluída. Um evento público resumido informa a situação sem repetir texto livre. Eventos antigos reconhecíveis da 3.7 são resumidos na projeção pública, sem reescrever a auditoria. A providência final da solicitação, deliberadamente pública, permanece disponível.

OS e agenda aceitam Idempotency-Key por usuário e operação. A UI sempre envia chave e a conserva ao repetir uma tentativa incerta. Mesma chave/conteúdo retorna a mesma entidade; conteúdo diferente gera 409. Clientes legados sem chave continuam criando uma nova operação. Não se proíbem títulos intencionalmente iguais.

Somente o gestor reabre demanda concluída, para triagem ou atendimento, com motivo público de pelo menos cinco caracteres. A UI envia a versão esperada. Avaliação anterior é preservada e não pode ser repetida.

Nome escolar é normalizado e obrigatório, até 200 caracteres. Falha valida antes da gravação; renomeação atualiza demandas e agenda. Caso uma versão anterior já tenha persistido nome vazio, o gestor pode corrigir em Unidades Escolares: esse PATCH não depende do snapshot inválido. Faça backup e use db:check com a API portátil parada para diagnóstico, sem correções automáticas ou nomes inventados.

A migração 003 acrescenta operações idempotentes, sequência de OS e índices. 001 e 002 permanecem intactas.

Na correção de categoria, a versão é obrigatória. Campos novos seguem o catálogo; os anteriores e o motivo ficam em evento interno, com evento público separado para o titular. Prazo e encaminhamento permanecem até despacho explícito. Solicitação concluída precisa ser reaberta antes.
