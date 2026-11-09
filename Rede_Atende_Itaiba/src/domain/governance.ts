/**
 * Regras acadêmicas sugeridas; não representam prazos oficiais da Prefeitura.
 * Dias úteis excluem sábado, domingo e feriados fornecidos pela configuração acadêmica.
 */
import type { EducationalRequest, RequestCategory, RequestPriority } from '../types';

export type SlaRule = { amount: number; unit: 'hours' | 'businessDays'; explanation: string };
export function getSlaRule(category: RequestCategory, details?: Record<string, string>): SlaRule {
  switch (category) {
    case 'alimentacao_merenda':
      return { amount: 24, unit: 'hours', explanation: 'Alimentação / possível risco sanitário' };
    case 'transporte_escolar':
      return { amount: 48, unit: 'hours', explanation: 'Transporte escolar' };
    case 'infraestrutura':
      return details?.natureza === 'Elétrico'
        ? { amount: 5, unit: 'businessDays', explanation: 'Reparo elétrico' }
        : { amount: 10, unit: 'businessDays', explanation: 'Infraestrutura / manutenção' };
    case 'material_didatico':
      return { amount: 15, unit: 'businessDays', explanation: 'Material didático' };
    default:
      return { amount: 10, unit: 'businessDays', explanation: 'Atendimento geral' };
  }
}
/** America/Recife utiliza UTC-03, sem horário de verão no horizonte deste MVP. */
export function recifeDateKey(date: Date | string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Recife',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}
export function calculateCategoryDeadline(
  createdAt: Date,
  category: RequestCategory,
  details?: Record<string, string>,
  holidays: readonly string[] = [],
): string {
  const rule = getSlaRule(category, details);
  if (!Number.isFinite(createdAt.getTime())) throw new Error('Data inicial inválida.');
  if (rule.unit === 'hours')
    return new Date(createdAt.getTime() + rule.amount * 3600_000).toISOString();
  // Faz aritmética no calendário local, preservando hora, minutos e milissegundos.
  const local = new Date(createdAt.getTime() - 3 * 3600_000);
  const excluded = new Set(holidays);
  let remaining = rule.amount;
  while (remaining > 0) {
    local.setUTCDate(local.getUTCDate() + 1);
    if (![0, 6].includes(local.getUTCDay()) && !excluded.has(local.toISOString().slice(0, 10)))
      remaining--;
  }
  return new Date(local.getTime() + 3 * 3600_000).toISOString();
}
export function getSlaProgress(
  request: Pick<EducationalRequest, 'createdAt' | 'deadline' | 'status'>,
  currentTime = Date.now(),
) {
  const end = Date.parse(request.deadline ?? '');
  const start = Date.parse(request.createdAt);
  if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start) return null;
  const complete = request.status === 'concluida';
  const elapsed = Math.max(0, currentTime - start);
  const progress = Math.min(100, Math.round((elapsed / (end - start)) * 100));
  const remaining = end - currentTime;
  const overdue = !complete && remaining < 0;
  const magnitude = Math.abs(remaining);
  const time =
    magnitude < 3600_000
      ? `${Math.max(1, Math.ceil(magnitude / 60_000))} min`
      : magnitude < 86400_000
        ? `${Math.ceil(magnitude / 3600_000)} h`
        : `${Math.ceil(magnitude / 86400_000)} dia(s)`;
  return {
    progress: complete ? 100 : progress,
    overdue,
    completed: complete,
    label: complete
      ? 'Atendimento concluído'
      : overdue
        ? `Prazo estimado excedido há ${time}`
        : `Dentro do prazo estimado — restam ${time}`,
  };
}
/** Sugestão automática para triagem; a decisão final continua com a equipe. */
export function suggestPriority(
  request: Pick<EducationalRequest, 'category' | 'categoryDetails' | 'subject' | 'description'>,
): { priority: RequestPriority; reason: string } {
  const text = `${request.subject} ${request.description}`.toLocaleLowerCase('pt-BR');
  if (
    request.category === 'alimentacao_merenda' ||
    /risco sanitário|intoxica[cç][aã]o|sem merenda/.test(text)
  )
    return { priority: 'urgente', reason: 'Risco imediato à alimentação / saúde escolar' };
  if (
    request.category === 'transporte_escolar' &&
    /sem transporte|alunos desatendidos|sem ônibus|falta de ônibus/.test(text)
  )
    return { priority: 'urgente', reason: 'Risco de perda de dias letivos' };
  if (request.category === 'transporte_escolar' || request.category === 'infraestrutura')
    return { priority: 'alta', reason: 'Afeta o acesso ou continuidade das atividades escolares' };
  if (request.category === 'material_didatico')
    return { priority: 'media', reason: 'Material necessário à continuidade pedagógica' };
  return { priority: 'media', reason: 'Triagem necessária para determinar impacto concreto' };
}
export function maskApplicantName(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => `${part[0] ?? '*'}***`)
      .join(' ') || 'Não informado'
  );
}
export function maskPhone(value?: string) {
  if (!value) return 'Não informado';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return '***';
  return `(${digits.slice(0, 2)}) ${digits.length === 11 ? '9****' : '****'}-${digits.slice(-4)}`;
}
