/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende 3.0 - Funções Utilitárias e Regras de Negócio do Domínio
 * Município de Referência: Itaíba - PE
 */

import {
  DashboardMetrics,
  EducationalRequest,
  RequestCategory,
  RequestPriority,
  RequestStatus,
} from '../types';

export const MAX_PROTOCOL_SEQUENCE = 999999;

/**
 * Formata o número de protocolo com proteção de limites e ano contextual
 */
export function formatProtocolNumber(
  sequenceNumber: number,
  year: number = new Date().getFullYear(),
): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999)
    throw new Error('Ano de protocolo inválido.');
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1)
    throw new Error('Sequência de protocolo deve ser um inteiro positivo.');
  if (sequenceNumber > MAX_PROTOCOL_SEQUENCE) {
    throw new Error(
      `Sequência de protocolo excede o limite máximo suportado (${MAX_PROTOCOL_SEQUENCE}).`,
    );
  }
  const padded = String(sequenceNumber).padStart(6, '0');
  return `EDU-${year}-${padded}`;
}

/**
 * Valida e extrai metadados do protocolo formatado EDU-YYYY-XXXXXX
 */
export function parseProtocolNumber(protocol: string): {
  valid: boolean;
  year?: number;
  seq?: number;
} {
  if (!protocol || typeof protocol !== 'string') return { valid: false };
  const match = protocol
    .trim()
    .toUpperCase()
    .match(/^EDU-(\d{4})-(\d{6})$/);
  if (!match || Number(match[1]) < 1000 || Number(match[2]) < 1) return { valid: false };
  return {
    valid: true,
    year: parseInt(match[1], 10),
    seq: parseInt(match[2], 10),
  };
}

/** Reconhece protocolos históricos sem alterar o identificador já entregue. */
export function parseHistoricalProtocol(
  protocol: string,
  creationYear: number,
): { valid: boolean; year?: number; seq?: number } {
  const current = parseProtocolNumber(protocol);
  if (current.valid) return current;
  const full = protocol
    .trim()
    .toUpperCase()
    .match(/^EDU-(\d{4})-(\d{1,6})$/);
  const short = protocol
    .trim()
    .toUpperCase()
    .match(/^EDU-(\d{1,6})$/);
  const year = full ? Number(full[1]) : creationYear;
  const seq = Number(full ? full[2] : short?.[1]);
  return (full || short) &&
    Number.isInteger(year) &&
    year >= 1000 &&
    year <= 9999 &&
    seq >= 1 &&
    seq <= MAX_PROTOCOL_SEQUENCE
    ? { valid: true, year, seq }
    : { valid: false };
}

export const CATEGORY_LABELS: Record<RequestCategory, string> = {
  infraestrutura: 'Infraestrutura e manutenção',
  transporte_escolar: 'Transporte escolar',
  alimentacao_merenda: 'Alimentação escolar',
  material_didatico: 'Material didático',
  apoio_pedagogico_inclusao: 'Apoio pedagógico e inclusão',
  documentacao_transferencia: 'Matrícula e documentação',
  outros: 'Outros / não sei a categoria',
};

export const STATUS_CONFIG: Record<
  RequestStatus,
  {
    label: string;
    description: string;
    stepIndex: number;
    colorClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  recebida: {
    label: 'Recebida',
    description: 'Solicitação registrada no sistema demonstrativo e aguardando triagem.',
    stepIndex: 0,
    colorClass: 'text-sky-700',
    bgClass: 'bg-sky-50',
    borderClass: 'border-sky-200',
  },
  em_triagem: {
    label: 'Em Triagem',
    description: 'Avaliando prioridade, competência setorial e encaminhamento pela SEDUC.',
    stepIndex: 1,
    colorClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  encaminhada: {
    label: 'Encaminhada',
    description:
      'Enviada ao setor responsável ou direção escolar para planejamento da intervenção.',
    stepIndex: 2,
    colorClass: 'text-indigo-700',
    bgClass: 'bg-indigo-50',
    borderClass: 'border-indigo-200',
  },
  em_atendimento: {
    label: 'Em Atendimento',
    description: 'Medidas práticas em execução pela equipe técnica municipal.',
    stepIndex: 3,
    colorClass: 'text-blue-700',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
  },
  concluida: {
    label: 'Concluída',
    description: 'Demanda atendida e parecer conclusivo registrado no histórico.',
    stepIndex: 4,
    colorClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
  },
  aguardando_informacoes: {
    label: 'Aguardando Informações',
    description: 'Necessário complemento de dados, laudo ou esclarecimentos pelo solicitante.',
    stepIndex: 1,
    colorClass: 'text-orange-700',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
  },
};

export const PRIORITY_CONFIG: Record<
  RequestPriority,
  { label: string; colorClass: string; bgClass: string; borderClass: string }
> = {
  baixa: {
    label: 'Baixa',
    colorClass: 'text-slate-600',
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-300',
  },
  media: {
    label: 'Média',
    colorClass: 'text-blue-700',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
  },
  alta: {
    label: 'Alta',
    colorClass: 'text-amber-800',
    bgClass: 'bg-amber-100',
    borderClass: 'border-amber-300',
  },
  urgente: {
    label: 'Urgente',
    colorClass: 'text-rose-800',
    bgClass: 'bg-rose-100',
    borderClass: 'border-rose-300',
  },
};

/**
 * Matriz estrita de transições de status válidas (State Machine)
 * Impede alterações caóticas ou saltos arbitrários no fluxo
 */
export const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  recebida: ['em_triagem', 'aguardando_informacoes'],
  em_triagem: ['encaminhada', 'aguardando_informacoes', 'recebida'],
  encaminhada: ['em_atendimento', 'em_triagem', 'aguardando_informacoes'],
  em_atendimento: ['concluida', 'encaminhada', 'aguardando_informacoes'],
  aguardando_informacoes: ['em_triagem'],
  concluida: [], // Terminal por padrão
};

/**
 * Validador central de transição de status
 */
export function isValidStatusTransition(
  from: RequestStatus,
  to: RequestStatus,
  isReopening: boolean = false,
): boolean {
  if (from === to) return true;

  // Reabertura explícita de demanda concluída
  if (from === 'concluida') {
    return isReopening && (to === 'em_atendimento' || to === 'em_triagem');
  }

  const allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * Regra centralizada de elegibilidade para simulação de autuação no SEI
 * Requisitos:
 * 1. Não pode estar autuado previamente (idempotência).
 * 2. Deve ter passado pela triagem (não pode ser 'recebida' pura).
 * 3. Não pode estar em estado pendente de dados básicos ('aguardando_informacoes').
 */
export function isRequestEligibleForSei(request: EducationalRequest): {
  eligible: boolean;
  reason?: string;
} {
  if (request.seiIntegrated || request.seiProcessNumber) {
    return {
      eligible: false,
      reason: 'A solicitação já possui processo administrativo simulado autuado no SEI.',
    };
  }

  if (request.status === 'recebida') {
    return {
      eligible: false,
      reason:
        'Solicitação em estado "Recebida" deve ser avaliada na triagem antes do encaminhamento ao SEI.',
    };
  }

  if (request.status === 'aguardando_informacoes') {
    return {
      eligible: false,
      reason: 'Solicitação aguardando complementação de informações não pode ser autuada no SEI.',
    };
  }

  if (!['em_triagem', 'encaminhada', 'em_atendimento'].includes(request.status)) {
    return {
      eligible: false,
      reason:
        'Somente solicitações em triagem, encaminhadas ou em atendimento podem gerar processo simulado.',
    };
  }

  return { eligible: true };
}

export function formatDatePtBr(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Recife',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function formatDateShort(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(isoString) ? `${isoString}T12:00:00-03:00` : isoString,
    );
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Recife',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return isoString;
  }
}

/**
 * Avalia se o prazo está próximo do vencimento (<= 3 dias) ou vencido
 */
export function isDeadlineNear(deadlineIso?: string, now = Date.now()): boolean {
  if (!deadlineIso) return false;
  try {
    const deadline = new Date(deadlineIso).getTime();
    if (isNaN(deadline)) return false;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    return deadline >= now && deadline - now <= threeDaysMs;
  } catch {
    return false;
  }
}

/**
 * Avalia se o prazo já está vencido
 */
export function isDeadlineOverdue(deadlineIso?: string, now = Date.now()): boolean {
  if (!deadlineIso) return false;
  try {
    const deadline = new Date(deadlineIso).getTime();
    if (isNaN(deadline)) return false;
    return deadline < now;
  } catch {
    return false;
  }
}

/**
 * Calcula o tempo médio real de triagem a partir dos históricos auditáveis
 * Calcula a diferença entre a criação da demanda e o primeiro evento de triagem/encaminhamento
 */
export function calculateAverageTriageTime(requests: EducationalRequest[]): {
  hours: number;
  formatted: string;
  hasData: boolean;
} {
  const deltasInHours: number[] = [];

  requests.forEach((r) => {
    const createdAt = new Date(r.createdAt).getTime();
    if (isNaN(createdAt)) return;

    // Busca o primeiro evento de triagem ou encaminhamento posterior ao cadastro
    const triageEvent = [...r.history]
      .filter(
        (h) =>
          (h.status === 'em_triagem' ||
            h.status === 'encaminhada' ||
            h.status === 'em_atendimento') &&
          Date.parse(h.timestamp) >= createdAt,
      )
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0];

    if (triageEvent) {
      const triageTime = new Date(triageEvent.timestamp).getTime();
      if (!isNaN(triageTime) && triageTime >= createdAt) {
        const deltaHours = (triageTime - createdAt) / (1000 * 60 * 60);
        deltasInHours.push(deltaHours);
      }
    }
  });

  if (deltasInHours.length === 0) {
    return {
      hours: 0,
      formatted: 'Dados insuficientes para calcular',
      hasData: false,
    };
  }

  const sum = deltasInHours.reduce((acc, val) => acc + val, 0);
  const avg = sum / deltasInHours.length;
  const rounded = Math.round(avg);

  return {
    hours: avg,
    formatted: avg < 1 ? `${Math.round(avg * 60)} min` : `${rounded}h`,
    hasData: true,
  };
}

/**
 * Calcula métricas centralizadas e rigorosas do Dashboard
 */
export function calculateMetrics(
  requests: EducationalRequest[],
  now = Date.now(),
): DashboardMetrics {
  const byCategory: Record<RequestCategory, number> = {
    infraestrutura: 0,
    transporte_escolar: 0,
    alimentacao_merenda: 0,
    material_didatico: 0,
    apoio_pedagogico_inclusao: 0,
    documentacao_transferencia: 0,
    outros: 0,
  };

  const byStatus: Record<RequestStatus, number> = {
    recebida: 0,
    em_triagem: 0,
    encaminhada: 0,
    em_atendimento: 0,
    concluida: 0,
    aguardando_informacoes: 0,
  };

  let nearingDeadlineCount = 0;
  let overdueCount = 0;

  requests.forEach((r) => {
    if (byCategory[r.category] !== undefined) {
      byCategory[r.category]++;
    }
    if (byStatus[r.status] !== undefined) {
      byStatus[r.status]++;
    }
    // Apenas demandas NÃO concluídas são contabilizadas em prazos
    if (r.status !== 'concluida') {
      if (isDeadlineOverdue(r.deadline, now)) {
        overdueCount++;
      }
      if (isDeadlineNear(r.deadline, now)) {
        nearingDeadlineCount++;
      }
    }
  });

  const completedCount = byStatus.concluida;
  const openCount = requests.length - completedCount;
  const inTriageCount = byStatus.em_triagem;
  const waitingInfoCount = byStatus.aguardando_informacoes;

  const averageTriage = calculateAverageTriageTime(requests);

  // Atividades recentes ordenadas cronologicamente de forma decrescente
  const allHistory = requests.flatMap((r) => r.history);
  allHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    total: requests.length,
    open: openCount,
    inTriage: inTriageCount,
    nearingDeadline: nearingDeadlineCount,
    overdueCount,
    completed: completedCount,
    waitingInfo: waitingInfoCount,
    averageTriageHours: averageTriage.hours,
    averageTriageFormatted: averageTriage.formatted,
    byCategory,
    byStatus,
    recentActivity: allHistory.slice(0, 8),
    evolution: Object.entries(
      requests.reduce<Record<string, number>>((days, r) => {
        const date = new Date(r.createdAt);
        if (Number.isFinite(date.getTime())) {
          const key = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(date);
          days[key] = (days[key] ?? 0) + 1;
        }
        return days;
      }, {}),
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total })),
  };
}

/**
 * Sanitiza valores contra injeção de fórmulas CSV (CSV Formula Injection)
 * Protege contra prefixos perigosos (=, +, -, @, \t, \r) em planilhas eletrônicas
 */
export function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);

  // Sanitização de injeção de fórmulas de planilha
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(str) || /^[\t\r\n]/.test(str)) {
    str = `'${str}`;
  }

  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Gera arquivo CSV com UTF-8 BOM (\uFEFF) para visualização correta no Excel e Calc
 */
export function generateRequestsCsv(requests: EducationalRequest[]): string {
  const headers = [
    'Protocolo',
    'Escola',
    'Categoria',
    'Assunto',
    'Prioridade',
    'Status',
    'Data de Abertura',
    'Prazo Estimado',
    'Setor Responsavel',
    'Tecnico Designado',
    'Processo SEI (Simulado)',
  ];

  const rows = requests.map((r) => [
    escapeCsvValue(r.protocol),
    escapeCsvValue(r.schoolName),
    escapeCsvValue(CATEGORY_LABELS[r.category] || r.category),
    escapeCsvValue(r.subject),
    escapeCsvValue(PRIORITY_CONFIG[r.priority]?.label || r.priority),
    escapeCsvValue(STATUS_CONFIG[r.status]?.label || r.status),
    escapeCsvValue(formatDatePtBr(r.createdAt)),
    escapeCsvValue(formatDateShort(r.deadline)),
    escapeCsvValue(r.assignedDepartment || 'Em definição'),
    escapeCsvValue(r.assignedTechnician || 'Aguardando escala'),
    escapeCsvValue(r.seiProcessNumber || 'Não autuado'),
  ]);

  const csvLines = [headers.map((h) => `"${h}"`).join(';'), ...rows.map((row) => row.join(';'))];

  return `\uFEFF${csvLines.join('\r\n')}`;
}

/**
 * Executa o download funcional no navegador
 */
export function downloadCsvFile(csvContent: string, fileName: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (err) {
    console.error('Rede Atende: Falha ao exportar arquivo CSV:', err);
    return false;
  }
}

export function formatBrazilianPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  const local = digits.slice(2);
  const split = local.length > 8 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${local.slice(0, split)}${local.length > split ? `-${local.slice(split)}` : ''}`;
}
export const ROLE_LABELS: Record<import('../types').HistoryEvent['role'], string> = {
  cidadao: 'Comunidade escolar',
  professor: 'Equipe pedagógica',
  triagem_seduc: 'Equipe de triagem',
  gestor_escolar: 'Equipe responsável',
  secretario_educacao: 'Gestão da educação',
  sistema: 'Rede Atende',
};
export const STATUS_SENTENCES: Record<RequestStatus, string> = {
  recebida: 'Solicitação recebida.',
  em_triagem: 'Encaminhada à equipe de triagem.',
  encaminhada: 'Enviada ao setor responsável.',
  em_atendimento: 'Atendimento iniciado.',
  concluida: 'Solicitação concluída.',
  aguardando_informacoes: 'Informações complementares solicitadas.',
};
export function nextStep(request: EducationalRequest): string {
  if (request.status === 'aguardando_informacoes')
    return 'Envie as informações solicitadas abaixo para retomar a triagem.';
  if (request.status === 'concluida') return 'Confira a providência final e avalie o atendimento.';
  if (request.status === 'recebida')
    return 'A equipe de triagem vai analisar as informações e definir o setor responsável.';
  if (request.status === 'em_triagem')
    return 'A equipe vai validar a demanda e encaminhar ao setor competente.';
  if (request.status === 'encaminhada')
    return 'O setor responsável vai planejar e iniciar o atendimento.';
  return 'Acompanhe as providências, ordens de serviço e eventuais vistorias.';
}
