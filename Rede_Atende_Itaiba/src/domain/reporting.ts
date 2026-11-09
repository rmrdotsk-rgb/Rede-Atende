import type { EducationalRequest } from '../types';
import { recifeDateKey } from './governance';
/** Coorte mensal por criação. TMA de conclusões efetivas no mês em horas corridas. */
export function managementReport(requests: EducationalRequest[], now = new Date()) {
  const month = recifeDateKey(now).slice(0, 7);
  const cohort = requests.filter((r) => recifeDateKey(r.createdAt).slice(0, 7) === month);
  const completed = cohort.filter((r) => r.status === 'concluida').length;
  const bySchool: Record<string, number> = {},
    byCategory: Record<string, number> = {},
    byDepartment: Record<string, { sum: number; count: number }> = {};
  for (const r of cohort) {
    bySchool[r.schoolName] = (bySchool[r.schoolName] ?? 0) + 1;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  }
  for (const r of requests) {
    if (r.status !== 'concluida') continue;
    const end =
      r.history.filter((h) => h.status === 'concluida' && h.previousStatus !== 'concluida').at(-1)
        ?.timestamp ?? r.updatedAt;
    if (recifeDateKey(end).slice(0, 7) !== month) continue;
    const elapsed = (Date.parse(end) - Date.parse(r.createdAt)) / 3600000;
    if (elapsed < 0 || !Number.isFinite(elapsed)) continue;
    const key = r.assignedDepartment || 'Não atribuído';
    const entry = byDepartment[key] ?? { sum: 0, count: 0 };
    entry.sum += elapsed;
    entry.count++;
    byDepartment[key] = entry;
  }
  return {
    month,
    timezone: 'America/Recife',
    cohortTotal: cohort.length,
    cohortCompleted: completed,
    cohortResolutionRate: cohort.length ? Math.round((100 * completed) / cohort.length) : 0,
    bySchool,
    byCategory,
    departmentTma: Object.entries(byDepartment).map(([name, v]) => ({
      name,
      count: v.count,
      tma: Math.round((v.sum / v.count) * 100) / 100,
    })),
  };
}
