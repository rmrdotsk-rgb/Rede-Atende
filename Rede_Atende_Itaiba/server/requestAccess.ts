import type { Sql } from './db/database';
import { HttpError, type User } from './auth';
import type { EducationalRequest } from '../src/types';

export async function assertRequestAccess(sql: Sql, user: User, id: string, ownerOnly = false) {
  const found = await sql.query<{ owner_id: string }>('SELECT owner_id FROM requests WHERE id=$1', [
    id,
  ]);
  if (
    !found.rows[0] ||
    ((ownerOnly || user.role === 'cidadao') && found.rows[0].owner_id !== user.id)
  )
    throw new HttpError(404, 'Solicitação não encontrada para esta conta.');
}

/** Mesma projeção para consulta, paginação e resposta de mutação. */
export function requestForUser(request: EducationalRequest, user: User): EducationalRequest {
  if (user.role !== 'cidadao') return request;
  return {
    ...request,
    history: request.history
      .filter((h) => h.visibility !== 'interna' && h.action !== 'work_order.internal')
      .map((h) => ({
        ...h,
        changes: undefined,
        author: h.role === 'cidadao' ? user.name : 'Equipe de atendimento',
        note:
          h.action !== 'work_order.public' &&
          (h.source?.kind === 'work_order' ||
            (h.role !== 'cidadao' && /^(?:Ordem OS-DEMO-\d+ criada:|OS-DEMO-\d+ — )/.test(h.note)))
            ? 'Atividade de atendimento atualizada. Detalhes técnicos restritos à equipe.'
            : h.action === 'agenda' || h.note.startsWith('Agenda:')
              ? 'Agenda de atendimento atualizada. Consulte os agendamentos vinculados.'
              : h.note,
      })),
    assignedTechnician: request.publicResponsible ? request.assignedTechnician : undefined,
    priorityReason: undefined,
    deadlineReason: undefined,
  };
}
