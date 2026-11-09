# Apresentação ao professor Rafael — Rede Atende

**Meta: 5–8 minutos, com dados fictícios e duas sessões independentes.** Prepare `npm.cmd run setup -- --embedded`, `npm.cmd run build` e `npm.cmd start`. Abra http://localhost:3001. Use cidadão e gestor em perfis separados; senhas geradas ficam só no computador. Não exiba `.local/demo-access.txt` na gravação.

| Etapa                  | Ação simples                                                                                                                                  | Resultado observável                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1 · Contexto           | Mostrar Início e Como funciona                                                                                                                | Projeto de Itaíba da UNINASSAU, disciplina de Rafael; fontes municipais e limites acadêmicos                 |
| 2 · Cidadão móvel      | Escolher escola, Infraestrutura/Hidráulico, assunto “Bebedouro — demonstração em sala”, relato/local fictícios; anexar fixture PNG se desejar | Formulário aceita dados válidos; escola começa vazia                                                         |
| 3 · Comprovante        | Enviar e copiar protocolo; abrir acompanhamento e recarregar                                                                                  | Um único protocolo do servidor, mesmo relato e anexo após recarga                                            |
| 4 · Gestor no notebook | Localizar exatamente o protocolo em Demandas → Despachar (no celular, usar o cartão); indicar setor/responsável; pedir complemento público    | A pergunta aparece no acompanhamento do titular                                                              |
| 5 · Complemento        | Cidadão responde; gestor atualiza                                                                                                             | Resposta persistida, retorno à triagem e histórico preservado                                                |
| 6 · Execução           | Gestor cria OS obrigatória; encaminha e atende; tenta concluir com OS pendente                                                                | Bloqueio explica a obrigação; depois de concluir a OS com serviço realizado, pedido aceita providência final |
| 7 · Retorno            | Cidadão consulta a solução e avalia uma vez                                                                                                   | Avaliação gravada e exibida nos indicadores                                                                  |
| 8 · Correção           | Em um segundo pedido de Outros, abrir Corrigir categoria e escolher Infraestrutura com campos/motivo                                          | Protocolo mantido; titular vê nova categoria; motivo e campos anteriores ficam no histórico interno          |
| 9 · Gestão             | Mostrar relatório/CSV e uma vinculação SEI simulada elegível                                                                                  | Contagens do banco e identificação explícita da simulação                                                    |
| 10 · Retomada          | Ctrl+C e `npm.cmd start`; reabrir o protocolo                                                                                                 | Dados e bytes do anexo permanecem                                                                            |

Se incluir vistoria, criar data futura com horário disponível; realizar ou cancelar com motivo antes de concluir. Uma colisão deve ser recusada. Para caber em oito minutos, prepare o segundo cenário antes, sem simular as operações ao vivo.

O roteiro detalhado está em [COMO_TESTAR_NO_WINDOWS.md](COMO_TESTAR_NO_WINDOWS.md). Antes da apresentação, execute os testes de persistência e restauração descritos nesse guia. Se não houver telefone, informe que a apresentação usa emulação. Não diga que houve teste físico no iPhone/Windows.

O desafio oficial vai além deste recorte: exige aplicativo móvel Android e/ou iOS, painel e integração nativa com SEI. Aqui há web/PWA, painel e SEI simulado. O site não opera atendimento municipal.

## Conferência adicional desta entrega

No celular, localize Entrar/Sair e abra o botão de opções para acessibilidade e notificações. Preencha parte de uma nova solicitação fictícia, tente voltar ao início e escolha Continuar preenchendo. Mostre que os campos permanecem; depois escolha descartar ou conclua o envio. Não apresente os indicadores e avisos como atividade real do município.

Windows/iPhone físicos, Safari, leitores de tela e teste moderado com pessoas dependem de execução específica no ambiente disponível.
