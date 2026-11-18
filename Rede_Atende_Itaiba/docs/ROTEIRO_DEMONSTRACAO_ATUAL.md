# Roteiro de apresentação — Rede Atende

Duração sugerida: **6 a 8 minutos**. Use apenas dados fictícios.

Antes da aula, inicie `npm.cmd start` na pasta `Rede_Atende_Itaiba`. Abra **http://127.0.0.1:3001**. O cidadão pode ficar na janela normal e o gestor em uma janela anônima.

1. **Apresentar o projeto (40 s).** Explique que é um protótipo para demandas da educação de Itaíba e que não envia pedidos reais à Prefeitura.
2. **Entrar como `cidadao` (40 s).** Mostre a página de acompanhamento e a navegação adaptada ao celular.
3. **Registrar a solicitação (1 min e 30 s).** Escolha uma escola e uma categoria, descreva uma situação fictícia, anexe um arquivo de teste se desejar e envie. Anote o protocolo exibido.
4. **Conferir o registro (40 s).** Recarregue o acompanhamento e confirme que o protocolo continua salvo.
5. **Entrar como `gestor` (1 min).** Na outra janela, abra Gestão → Demandas e pesquise o mesmo protocolo. Mostre a triagem, prioridade, setor e responsável.
6. **Atualizar o atendimento (1 min e 30 s).** Registre as informações e uma ordem de serviço quando exigida pela categoria. Conclua as etapas obrigatórias antes de finalizar a demanda.
7. **Mostrar o resultado (40 s).** Volte ao cidadão, recarregue, confira o histórico público e realize a avaliação, se o pedido estiver concluído.
8. **Encerrar (40 s).** Apresente rapidamente o relatório e informe que a integração com o SEI é simulada.

As senhas das contas de demonstração estão apenas no arquivo privado `.local/demo-access.txt`; não o abra durante a apresentação. Confira antes os acessos e o procedimento de recuperação no [guia de contas](ACESSOS_LOCAIS.md).

Se o site exibir uma página offline, confira o servidor e mantenha o mesmo endereço `127.0.0.1:3001`. Não limpe o banco. O teste de funcionamento completo no Windows está descrito em [Como testar](COMO_TESTAR_NO_WINDOWS.md).
