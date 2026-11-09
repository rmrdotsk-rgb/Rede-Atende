/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende 3.0 - Tipos e Interfaces do Sistema Municipal de Atendimento Educacional
 * Projeto Acadêmico: Rede Atende
 * Disciplina: Front-End Frameworks (Prof. Rafael Pacheco Ferreira)
 * Instituição: UNINASSAU
 * Desafio: Desafios Day / DesafioPE — Prefeitura Municipal de Itaíba - PE
 * Estudante Demonstrativo: José Emerson Alves Saturno Barboza
 */

export type RequestStatus =
  | 'recebida'
  | 'em_triagem'
  | 'encaminhada'
  | 'em_atendimento'
  | 'concluida'
  | 'aguardando_informacoes';

export type RequestPriority = 'baixa' | 'media' | 'alta' | 'urgente';

export interface RequestPage {
  items: EducationalRequest[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export type RequestCategory =
  | 'infraestrutura'
  | 'transporte_escolar'
  | 'alimentacao_merenda'
  | 'material_didatico'
  | 'apoio_pedagogico_inclusao'
  | 'documentacao_transferencia'
  | 'outros';

export interface HistoryEvent {
  id: string;
  timestamp: string; // ISO string
  status: RequestStatus;
  previousStatus?: RequestStatus;
  author: string;
  role:
    | 'cidadao'
    | 'triagem_seduc'
    | 'gestor_escolar'
    | 'secretario_educacao'
    | 'sistema'
    | 'professor';
  note: string;
  department?: string;
  seiProtocol?: string;
  visibility?: 'publica' | 'interna';
  action?: string;
  source?: { kind: 'work_order'; id: string; status: string };
  changes?: Record<string, { before: string; after: string }>;
}

export interface EducationalRequest {
  summary?: boolean;
  id: string;
  protocol: string; // Formato EDU-YYYY-XXXXXX (6 dígitos)
  category: RequestCategory;
  schoolId: string;
  schoolName: string;
  subject: string;
  description: string;
  locationDetails?: string; // ex: Bloco B, Sala 4, Rota Sítio Maniçoba
  applicantName: string;
  applicantContact?: string;
  applicantRole: 'aluno' | 'responsavel' | 'professor' | 'comunidade';
  privacyAcknowledged?: boolean; // somente entrada; não integra o registro persistido
  status: RequestStatus;
  priority: RequestPriority;
  createdAt: string; // ISO string
  updatedAt: string;
  deadline?: string; // Data limite estimada (ISO string)
  assignedDepartment?: string; // Setor gestor na SEDUC
  assignedTechnician?: string; // Nome do servidor responsável
  attachmentName?: string;
  attachmentSize?: string;
  history: HistoryEvent[];
  seiIntegrated?: boolean;
  seiProcessNumber?: string;
  categoryDetails?: Record<string, string>;
  priorityReason?: string;
  deadlineReason?: string;
  resolution?: string;
  publicResponsible?: boolean;
  informationRequests?: InformationRequest[];
  satisfaction?: { rating: number; comment: string; createdAt: string };
}

export interface SchoolUnit {
  id: string;
  name: string;
  code: string;
  zone: 'urbana' | 'rural';
  address: string;
  principal: string;
  contactPhone: string;
  activeRequestsCount: number;
  locality?: string;
  verification?: 'evidencia_2026' | 'situacao_nao_confirmada';
  sourceUrl?: string;
  evidenceUrl?: string;
  verifiedAt?: string;
}

export interface Appointment {
  id: string;
  requestId?: string;
  protocolRef: string;
  schoolId: string;
  schoolName: string;
  type: string;
  technician: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: 'Agendada' | 'Confirmada' | 'Realizada' | 'Cancelada';
  notes?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  workOrderId?: string;
}

export interface InformationRequest {
  id: string;
  prompt: string;
  createdAt: string;
  response?: string;
  respondedAt?: string;
}
export type WorkOrderStatus = 'aberta' | 'em_execucao' | 'pendente' | 'concluida' | 'cancelada';
export interface WorkOrder {
  /** Enriched by the API join, never dependent on the request list page. */
  requestProtocol?: string;
  requestSchoolName?: string;
  requestPriority?: RequestPriority;
  summary?: boolean;
  id: string;
  number: string;
  requestId: string;
  title: string;
  department: string;
  technician: string;
  required: boolean;
  status: WorkOrderStatus;
  createdAt: string;
  updatedAt: string;
  performedService?: string;
  pendingReason?: string;
  cancellationReason?: string;
  appointmentId?: string;
  history: {
    id: string;
    timestamp: string;
    status: WorkOrderStatus;
    note: string;
  }[];
}
export interface InternalNotification {
  protocol?: string;
  id: string;
  requestId: string;
  audience: 'comunidade' | 'gestao';
  message: string;
  createdAt: string;
  readAt?: string;
}

export interface DashboardMetrics {
  total: number;
  open: number; // todas não concluídas: total - concluídas
  inTriage: number; // em triagem
  nearingDeadline: number; // não concluídas com prazo nos próximos 3 dias
  overdueCount: number; // não concluídas com prazo expirado
  completed: number; // concluídas
  waitingInfo: number; // aguardando dados complementares
  averageTriageHours: number; // calculado a partir do histórico real
  averageTriageFormatted: string; // ex: "18h" ou "Dados insuficientes para calcular"
  byCategory: Record<RequestCategory, number>;
  byStatus: Record<RequestStatus, number>;
  recentActivity: HistoryEvent[];
  evolution: { date: string; total: number }[];
}

export interface SeiSimulationLog {
  id: string;
  timestamp: string;
  protocol: string;
  action: 'processo_criado' | 'documento_enviado' | 'despacho_recebido' | 'concluido';
  seiNumber: string;
  organ: string;
  statusText: string;
}
