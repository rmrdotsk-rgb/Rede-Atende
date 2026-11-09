import { z } from 'zod';
import { digest, HttpError, type User } from './auth';
import type { Sql } from './db/database';

/** A chave pertence a uma intenção, não a um título. O lock transacional serializa commits concorrentes. */
export async function createOnce<T extends { id: string }>(
  sql: Sql,
  user: User,
  operation: 'work-order' | 'appointment',
  header: unknown,
  body: unknown,
  create: () => Promise<T>,
): Promise<T> {
  const key = z.string().min(16).max(150).optional().parse(header);
  // Compatibilidade com clientes 3.7: sem chave continua sendo uma nova intenção.
  if (!key) return create();
  const fingerprint = digest(JSON.stringify(body));
  const prior = await sql.query<{ fingerprint: string; entity_id: string }>(
    'SELECT fingerprint,entity_id FROM operation_keys WHERE user_id=$1 AND operation=$2 AND key=$3',
    [user.id, operation, key],
  );
  const table = operation === 'work-order' ? 'work_orders' : 'appointments';
  if (prior.rows[0]) {
    if (prior.rows[0].fingerprint !== fingerprint)
      throw new HttpError(
        409,
        'Esta chave de operação já foi usada com outro conteúdo. Revise antes de iniciar uma nova operação.',
      );
    const entity = await sql.query<{ data: T }>(`SELECT data FROM ${table} WHERE id=$1`, [
      prior.rows[0].entity_id,
    ]);
    if (!entity.rows[0])
      throw new HttpError(
        503,
        'Operação confirmada temporariamente indisponível. Preserve a chave e tente novamente.',
      );
    return entity.rows[0].data;
  }
  const entity = await create();
  await sql.query(
    'INSERT INTO operation_keys(user_id,operation,key,fingerprint,entity_id) VALUES($1,$2,$3,$4,$5)',
    [user.id, operation, key, fingerprint, entity.id],
  );
  return entity;
}
