# Fontes verificadas — Itaíba–PE

Revisão da página de Educação, relação pública de escolas e página explicativa do Catálogo de Escolas INEP: **08/11/2026**. Verificações documentais anteriores: **07/11/2026 e 21/10/2026**. Os contatos da Educação continuam correspondendo à fonte pública. A revisão atual não confirmou individualmente situação de funcionamento nem códigos INEP das escolas. O produto se chama **Rede Atende** e usa apenas Itaíba. Não é um serviço implantado ou autorizado pela Prefeitura.

| Fonte primária | O que foi verificado | Limite da evidência |
| --- | --- | --- |
| [DesafioPE — desafio da Prefeitura de Itaíba](https://desafios.pe.gov.br/challenge?url=como-podemos-otimizar-e-centralizar-o-atendimento-de-demandas-educacionais-da-rede-publica-municipal-por-meio-de-um-ecossistema-digital-integrado-aos-processos-administrativos-do-governo) | Desafio do programa Desafios Day, lançado em 21/09/2026; abrange comunidade escolar, gestão administrativa e integração com o SEI. | É referência de requisitos, não comprova parceria ou implantação do protótipo. A aplicação é um protótipo local com frontend, API e banco; o SEI é simulado. |
| [Prefeitura — relação de escolas](https://itaiba.pe.gov.br/relacao-de-escolas/) | Nomes e localidades das seis unidades abaixo. | A página não comprova, individualmente, a situação atual de funcionamento. |
| [Prefeitura — Edital nº 001/2026–SME](https://itaiba.pe.gov.br/wp-content/uploads/2026/08/EDITAL-No-001_2026-SME-1.pdf) | O Anexo VII, página 26 do PDF, inclui Médici, Getúlio Vargas e Major Antônio Inácio no quadro de vagas de gestão escolar. | É evidência municipal de referência em 2026, não certificação cadastral do Censo Escolar. No edital, Médici e Major aparecem com a indicação de tempo integral. A interface mantém os nomes da relação municipal. |
| [Inep — Catálogo de Escolas](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas/) | A página informa atualização anual a partir do Censo Escolar e consulta por município e situação de funcionamento. A página estava atualizada em 15/07/2026. | A página explicativa não forneceu uma exportação individual filtrada de Itaíba nesta execução. Não se afirma que a situação cadastral de cada unidade foi confirmada no painel. |
| [SEE–PE — IDEPE 2025, publicado em 2026](https://portal.educacao.pe.gov.br/wp-content/uploads/2026/08/IDEPE-2025-ESCOLA-REDE-MUNICIPAL.pdf) | A página 110 do PDF relaciona Médici, Getúlio Vargas e Major Antônio Inácio em Itaíba. | Confirma referência no período de avaliação de 2025; não substitui consulta cadastral atual. Nenhum código foi importado para o produto sem conferência individual no catálogo. |

## Tratamento das seis escolas

| Unidade na relação municipal | Localidade na fonte | Representação no produto |
| --- | --- | --- |
| Escola Municipal Presidente Emílio Garrastazu Médici | Sede | Mencionada em fonte municipal de 2026. |
| Escola Municipal Major Antônio Inácio | Distrito Negras | Mencionada em fonte municipal de 2026. A interface usa “Distrito de Negras”. |
| Escola Municipal Getúlio Vargas | Povoado Jirau | Mencionada em fonte municipal de 2026. |
| Escola Municipal João Paulo I | Sítio Pinhões | Situação atual de funcionamento não confirmada. |
| Escola Municipal Tiradentes | Sítio Pedra de Fogo | Situação atual de funcionamento não confirmada. |
| Escola Municipal Dom Pedro II | Sítio Broca | Situação atual de funcionamento não confirmada. |

As três referências sem confirmação atual ficam explicitamente identificadas e podem ser selecionadas apenas em chamados de simulação. Nenhuma escola é classificada no código como “ativa” em decorrência de sua presença na lista. O indicador “demandas em aberto” conta chamados fictícios, não o funcionamento das unidades.

Os campos de direção, telefone e código foram deixados vazios e são omitidos na interface. O endereço exibido é somente a localidade da fonte; não foram inventadas ruas, números ou coordenadas. O campo legado `zone` foi mantido por compatibilidade técnica, mas não é apresentado como classificação territorial oficial: a interface usa a localidade documentada.

Todos os relatos, visitas, setores operacionais, responsáveis e ordens de serviço são exemplos de demonstração. A associação de um exemplo a um nome de escola real não afirma que o problema ocorreu. Nenhum dos profissionais demonstrativos é apresentado como servidor real.

Os prazos de 15, 10, 5 e 2 dias corridos são parâmetros iniciais de simulação por prioridade, configuráveis no painel. Não foram extraídos de norma municipal e não são apresentados como prazos legais de Itaíba.


## Retificação confirmada em 07/11/2026 — contato institucional

A [página específica da Secretaria de Educação](https://itaiba.pe.gov.br/educacao/) informa **Rua Manoel Martins, S/N, Itaíba–PE**, telefone **(87) 99867-0711**, e-mail **educacao@itaiba.pe.gov.br** e atendimento **08:00–13:00**. O rodapé geral do mesmo portal publica **Praça Francisco Martins, s/n** para a sede da **Prefeitura**, telefone e e-mail gerais distintos. A versão anterior do frontend confundia esses endereços; o arquivo `src/data/municipalSources.ts` e a tela `/informacoes` foram corrigidos. A revisão não comprova atendimento presencial.

A [relação municipal de escolas](https://itaiba.pe.gov.br/relacao-de-escolas/) foi transcrita como referência documental no arquivo `docs/ESCOLAS_REFERENCIA_PUBLICA_ITAIBA.csv`, com **44 nomes** individualizados a partir da página publicada. Esta é uma **lista pública referencial**, não uma certidão de funcionamento ou homologação de cadastro. A página mescla, numa mesma linha, os registros Padre Cícero / Padre Inocêncio de Lima; a separação foi anotada para conferência antes de importação automatizada. A linha da Secretaria de Educação, que não é escola, **não foi cadastrada como escola**.

Os seis registros de escola já existentes no seed **não foram modificados nem expandidos automaticamente** para evitar mexer em IDs, filtros, testes e dados legados. Antes de atualizar a base operacional, cruzar cada unidade com o [Catálogo de Escolas INEP](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas/) por município, código INEP, dependência administrativa e situação de funcionamento. Até isso acontecer, campos `codigo_inep`, responsável e contatos pessoais permanecem sem preenchimento e a situação é marcada `nao_verificada`. Não atribuir geolocalização, números de telefone ou direção fictícios.

Fontes públicas: [desafio DesafioPE](https://desafios.pe.gov.br/challenge?url=como-podemos-otimizar-e-centralizar-o-atendimento-de-demandas-educacionais-da-rede-publica-municipal-por-meio-de-um-ecossistema-digital-integrado-aos-processos-administrativos-do-governo), [Secretaria de Educação](https://itaiba.pe.gov.br/educacao/), [relação municipal de escolas](https://itaiba.pe.gov.br/relacao-de-escolas/), [catálogo INEP](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas/) e [ANPD — guia para poder público](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_tratamento_de_dados_pessoais_pelo_poder_publico).
