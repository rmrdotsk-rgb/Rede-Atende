import { z } from 'zod';
import {
  DEFAULT_DEADLINE_RULES,
  SERVICE_CATALOG,
  INITIAL_CITIZEN_PRIORITY,
} from './serviceCatalog';

export const categories = [
  'infraestrutura',
  'transporte_escolar',
  'alimentacao_merenda',
  'material_didatico',
  'apoio_pedagogico_inclusao',
  'documentacao_transferencia',
  'outros',
] as const;
export const statuses = [
  'recebida',
  'em_triagem',
  'encaminhada',
  'em_atendimento',
  'concluida',
  'aguardando_informacoes',
] as const;
export const priorities = ['baixa', 'media', 'alta', 'urgente'] as const;
export const roles = ['aluno', 'responsavel', 'professor', 'comunidade'] as const;
const categoryDetailsSchema = z.record(z.string().max(40), z.string().trim().max(250));
function validateCategoryDetails(
  data: { category: (typeof categories)[number]; categoryDetails?: Record<string, string> },
  ctx: z.RefinementCtx,
) {
  for (const field of SERVICE_CATALOG[data.category].fields) {
    const value = data.categoryDetails?.[field.key]?.trim();
    if (field.required && !value)
      ctx.addIssue({
        code: 'custom',
        path: ['categoryDetails', field.key],
        message: `Informe: ${field.label.toLowerCase()}.`,
      });
    if (value && field.options && !field.options.includes(value))
      ctx.addIssue({
        code: 'custom',
        path: ['categoryDetails', field.key],
        message: 'Selecione uma opção válida.',
      });
    if (
      value &&
      field.type === 'date' &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value + 'T12:00:00Z')) ||
        new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['categoryDetails', field.key],
        message: 'Informe uma data válida.',
      });
  }
}
export const categoryClassificationSchema = z
  .object({ category: z.enum(categories), categoryDetails: categoryDetailsSchema })
  .strict()
  .superRefine(validateCategoryDetails);
const isoDate = z.string().refine((v) => Number.isFinite(Date.parse(v)), 'Data inválida.');
const text = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, `Limite de ${max} caracteres.`);

/** Restrições compartilhadas pelo formulário e pelo serviço. */
export const requestFormSchema = z
  .object({
    category: z.enum(categories, {
      message: 'Selecione uma categoria válida.',
    }),
    schoolId: text(1, 100, 'Selecione uma unidade escolar.'),
    subject: text(5, 100, 'O assunto deve ter pelo menos 5 caracteres.'),
    description: text(15, 4000, 'Descreva a situação com pelo menos 15 caracteres.'),
    locationDetails: text(3, 250, 'Informe a localização com pelo menos 3 caracteres.'),
    applicantName: text(3, 120, 'Informe o nome de demonstração.'),
    applicantContact: z
      .string()
      .trim()
      .max(20)
      .refine(
        (v) => !v || /^(?:[1-9]{2})(?:[2-5]\d{7}|9\d{8})$/.test(v.replace(/\D/g, '')),
        'Informe um telefone brasileiro com DDD e 10 ou 11 dígitos.',
      )
      .optional(),
    applicantRole: z.enum(roles),
    priority: z.enum(priorities).default(INITIAL_CITIZEN_PRIORITY),
    privacyAcknowledged: z
      .boolean()
      .refine((value) => value, 'Confirme a ciência do tratamento demonstrativo de dados.'),
    categoryDetails: z.record(z.string().max(40), z.string().trim().max(250)).optional(),
  })
  .superRefine(validateCategoryDetails);

const historySchema = z.object({
  id: z.string().min(1),
  timestamp: isoDate,
  status: z.enum(statuses),
  previousStatus: z.enum(statuses).optional(),
  author: z.string().min(1),
  role: z.enum([
    'cidadao',
    'triagem_seduc',
    'gestor_escolar',
    'secretario_educacao',
    'sistema',
    'professor',
  ]),
  visibility: z.enum(['publica', 'interna']).optional(),
  action: z.string().optional(),
  source: z
    .object({ kind: z.literal('work_order'), id: z.string(), status: z.string() })
    .optional(),
  changes: z.record(z.string(), z.object({ before: z.string(), after: z.string() })).optional(),
  note: z.string(),
  department: z.string().optional(),
  seiProtocol: z.string().optional(),
});
export const storedRequestSchema = z.object({
  id: z.string().min(1),
  protocol: z.string().trim().min(1),
  category: z.enum(categories),
  schoolId: z.string().min(1),
  schoolName: z.string().min(1),
  subject: z.string(),
  description: z.string(),
  locationDetails: z.string().optional(),
  applicantName: z.string(),
  applicantContact: z.string().optional(),
  applicantRole: z.enum(roles),
  status: z.enum(statuses),
  priority: z.enum(priorities),
  createdAt: isoDate,
  updatedAt: isoDate,
  deadline: isoDate.optional(),
  assignedDepartment: z.string().optional(),
  assignedTechnician: z.string().optional(),
  attachmentName: z.string().max(250).optional(),
  attachmentSize: z.string().max(40).optional(),
  categoryDetails: z.record(z.string(), z.string()).optional(),
  priorityReason: z.string().optional(),
  deadlineReason: z.string().optional(),
  resolution: z.string().optional(),
  publicResponsible: z.boolean().optional(),
  informationRequests: z
    .array(
      z.object({
        id: z.string(),
        prompt: z.string(),
        createdAt: isoDate,
        response: z.string().optional(),
        respondedAt: isoDate.optional(),
      }),
    )
    .optional(),
  satisfaction: z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(1000),
      createdAt: isoDate,
    })
    .optional(),
  history: z.array(historySchema),
  seiIntegrated: z.boolean().optional(),
  seiProcessNumber: z.string().optional(),
});
export const schoolSchema = z.object({
  id: z.string().min(1),
  name: text(1, 200, 'Informe o nome da escola.'),
  code: z.string().trim().max(80),
  zone: z.enum(['urbana', 'rural']),
  address: z.string().trim().max(500),
  principal: z.string().trim().max(120),
  contactPhone: z.string().trim().max(100),
  activeRequestsCount: z.number(),
  locality: z.string().trim().max(250).optional(),
  verification: z.enum(['evidencia_2026', 'situacao_nao_confirmada']).optional(),
  sourceUrl: z
    .url()
    .max(1000)
    .regex(/^https?:\/\//)
    .optional(),
  evidenceUrl: z
    .url()
    .max(1000)
    .regex(/^https?:\/\//)
    .optional(),
  verifiedAt: z.string().optional(),
});
export const calendarDate = z.iso.date({ error: 'Informe uma data de calendário válida.' });
export const appointmentSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().optional(),
  protocolRef: z.string(),
  schoolId: z.string(),
  schoolName: z.string(),
  type: z.string().trim().min(3).max(150),
  technician: z.string().trim().min(3).max(120),
  date: calendarDate,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  status: z.enum(['Agendada', 'Confirmada', 'Realizada', 'Cancelada']),
  notes: z.string().max(2000).optional(),
  // Cancelamento de uma OS pode transmitir sua justificativa integral de até 4.000 caracteres.
  cancellationReason: z.string().trim().min(5).max(4000).optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
  workOrderId: z.string().optional(),
});
export const seiLogSchema = z.object({
  id: z.string(),
  timestamp: isoDate,
  protocol: z.string(),
  action: z.enum(['processo_criado', 'documento_enviado', 'despacho_recebido', 'concluido']),
  seiNumber: z.string(),
  organ: z.string(),
  statusText: z.string(),
});
export const workOrderSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  requestId: z.string().min(1),
  title: text(5, 160, 'Descreva a atividade com pelo menos 5 caracteres.'),
  department: text(3, 150, 'Defina o setor.'),
  technician: text(3, 120, 'Defina o responsável demonstrativo.'),
  required: z.boolean(),
  status: z.enum(['aberta', 'em_execucao', 'pendente', 'concluida', 'cancelada']),
  createdAt: isoDate,
  updatedAt: isoDate,
  performedService: z.string().max(4000).optional(),
  pendingReason: z.string().max(4000).optional(),
  cancellationReason: z.string().max(4000).optional(),
  appointmentId: z.string().optional(),
  history: z.array(
    z.object({
      id: z.string(),
      timestamp: isoDate,
      status: z.enum(['aberta', 'em_execucao', 'pendente', 'concluida', 'cancelada']),
      note: z.string(),
    }),
  ),
});
export const deadlineRulesSchema = z.object({
  baixa: z.number().int().min(1).max(90),
  media: z.number().int().min(1).max(90),
  alta: z.number().int().min(1).max(90),
  urgente: z.number().int().min(1).max(90),
});
export const stateSchema = z.object({
  schemaVersion: z.literal(4),
  catalogRevision: z.number().int().default(0),
  requests: z.array(storedRequestSchema),
  schools: z.array(schoolSchema),
  appointments: z.array(appointmentSchema),
  seiLogs: z.array(seiLogSchema),
  workOrders: z.array(workOrderSchema).default([]),
  notifications: z
    .array(
      z.object({
        id: z.string(),
        requestId: z.string(),
        audience: z.enum(['comunidade', 'gestao']),
        message: z.string(),
        createdAt: isoDate,
        readAt: isoDate.optional(),
      }),
    )
    .default([]),
  deadlineRules: deadlineRulesSchema.default(DEFAULT_DEADLINE_RULES),
  ruleHistory: z
    .array(
      z.object({
        timestamp: isoDate,
        reason: z.string(),
        before: deadlineRulesSchema,
        after: deadlineRulesSchema,
      }),
    )
    .default([]),
  nextSequenceByYear: z.record(z.string(), z.number().int().min(1).max(1000000)),
  submissions: z.record(z.string(), z.string()),
});
export type StoredState = z.infer<typeof stateSchema>;
