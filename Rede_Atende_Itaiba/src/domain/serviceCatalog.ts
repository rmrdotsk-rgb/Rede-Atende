/** Prioridade inicial de solicitações públicas; reclassificação pertence à equipe. */
export const INITIAL_CITIZEN_PRIORITY = 'media' as const;
import type { RequestCategory, RequestPriority, WorkOrderStatus } from '../types';
export interface CategoryField {
  key: string;
  label: string;
  placeholder?: string;
  options?: string[];
  type?: 'date';
  required?: boolean;
}
export const SERVICE_CATALOG: Record<
  RequestCategory,
  {
    subject: string[];
    description: string;
    locations: string[];
    fields: CategoryField[];
  }
> = {
  infraestrutura: {
    subject: [
      'Vazamento no bebedouro',
      'Manutenção de sala de aula',
      'Reparo na instalação elétrica',
    ],
    description:
      'Descreva o problema observado, o ambiente afetado e se há risco ou interrupção das atividades.',
    locations: ['Sala de aula', 'Pátio', 'Bebedouro', 'Banheiros'],
    fields: [
      {
        key: 'natureza',
        label: 'Tipo de problema',
        options: ['Hidráulico', 'Elétrico', 'Cobertura', 'Mobiliário', 'Acessibilidade', 'Outro'],
        required: true,
      },
      {
        key: 'condicao',
        label: 'Condição observada',
        placeholder: 'Ex.: vazamento ao abrir a torneira',
      },
    ],
  },
  transporte_escolar: {
    subject: ['Atraso no transporte escolar', 'Dúvida sobre a rota', 'Ajuste do ponto de embarque'],
    description:
      'Informe o que ocorreu no transporte, a frequência e o impacto no acesso à escola.',
    locations: ['Ponto de embarque', 'Trecho da rota', 'Entrada da escola'],
    fields: [
      {
        key: 'rota',
        label: 'Rota ou localidade atendida',
        placeholder: 'Informe a rota conhecida ou a localidade',
        required: true,
      },
      {
        key: 'turno',
        label: 'Turno',
        options: ['Manhã', 'Tarde', 'Noite', 'Integral'],
        required: true,
      },
    ],
  },
  alimentacao_merenda: {
    subject: [
      'Reposição de alimentação escolar',
      'Dúvida sobre o cardápio',
      'Condição observada na alimentação',
    ],
    description:
      'Relate a situação da alimentação, quando ocorreu e o turno. Não informe dados de saúde.',
    locations: ['Refeitório', 'Cozinha', 'Local de distribuição'],
    fields: [
      {
        key: 'natureza',
        label: 'Natureza do problema',
        options: ['Disponibilidade', 'Qualidade observada', 'Cardápio', 'Distribuição', 'Outro'],
        required: true,
      },
      {
        key: 'turno',
        label: 'Turno',
        options: ['Manhã', 'Tarde', 'Noite', 'Integral'],
        required: true,
      },
      {
        key: 'data',
        label: 'Data da ocorrência',
        type: 'date',
        required: true,
      },
    ],
  },
  documentacao_transferencia: {
    subject: ['Informações sobre matrícula', 'Solicitação de declaração', 'Transferência escolar'],
    description:
      'Informe o documento ou atendimento desejado e o ano letivo. Não inclua CPF, certidões ou dados de menores.',
    locations: ['Secretaria escolar', 'Unidade desejada'],
    fields: [
      {
        key: 'natureza',
        label: 'Tipo de solicitação administrativa',
        options: ['Matrícula', 'Declaração', 'Histórico escolar', 'Transferência', 'Outro'],
        required: true,
      },
      {
        key: 'ano',
        label: 'Ano letivo de referência',
        placeholder: 'Ex.: 2026',
      },
    ],
  },
  material_didatico: {
    subject: [
      'Disponibilidade de livros',
      'Reposição de material didático',
      'Material para atividade escolar',
    ],
    description: 'Indique o material necessário e a etapa de ensino, sem identificar estudantes.',
    locations: ['Biblioteca', 'Sala de aula', 'Secretaria escolar'],
    fields: [
      {
        key: 'material',
        label: 'Material solicitado',
        placeholder: 'Ex.: livro de matemática',
        required: true,
      },
      { key: 'etapa', label: 'Etapa ou turma', placeholder: 'Ex.: 6º ano' },
    ],
  },
  apoio_pedagogico_inclusao: {
    subject: [
      'Orientação pedagógica',
      'Acessibilidade no atendimento',
      'Apoio à participação nas aulas',
    ],
    description:
      'Descreva a barreira ou necessidade pedagógica. Não envie diagnósticos, laudos ou nomes de estudantes.',
    locations: ['Sala de aula', 'Sala de recursos', 'Coordenação pedagógica'],
    fields: [
      {
        key: 'natureza',
        label: 'Tipo de apoio',
        options: [
          'Orientação pedagógica',
          'Acessibilidade',
          'Recursos pedagógicos',
          'Participação nas atividades',
          'Outro',
        ],
        required: true,
      },
    ],
  },
  outros: {
    subject: ['Orientação sobre serviço educacional', 'Atendimento da comunidade escolar'],
    description: 'Descreva a demanda relacionada à educação municipal e o atendimento que procura.',
    locations: ['Secretaria escolar', 'Atendimento educacional'],
    fields: [
      {
        key: 'natureza',
        label: 'Serviço educacional procurado',
        placeholder: 'Conte o que precisa; a equipe define o setor',
        required: true,
      },
    ],
  },
};
export const DEFAULT_DEADLINE_RULES: Record<RequestPriority, number> = {
  baixa: 15,
  media: 10,
  alta: 5,
  urgente: 2,
};
export const WORK_ORDER_LABELS: Record<WorkOrderStatus, string> = {
  aberta: 'Aberta',
  em_execucao: 'Em execução',
  pendente: 'Pendente',
  concluida: 'Concluída',
  cancelada: 'Cancelada com justificativa',
};
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  aberta: ['em_execucao', 'pendente', 'cancelada'],
  em_execucao: ['pendente', 'concluida', 'cancelada'],
  pendente: ['em_execucao', 'cancelada'],
  concluida: [],
  cancelada: [],
};
export const DEPARTMENTS = [
  'Setor de Engenharia e Manutenção Predial',
  'Coordenação de Transporte Escolar e Frotas',
  'Divisão de Alimentação e Nutrição Escolar (PNAE)',
  'Coordenação do Livro Didático e Materiais Pedagógicos',
  'Coordenação Municipal de Educação Especial e Inclusiva',
  'Secretaria Geral e Atendimento ao Cidadão',
  'Gabinete do Secretário de Educação',
];
