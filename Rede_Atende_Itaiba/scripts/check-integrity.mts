/** Diagnóstico administrativo somente leitura; não mostra os valores dos campos pessoais. */
import { readTransaction, closeDatabase } from '../server/db/database';
import {
  schoolSchema,
  storedRequestSchema,
  workOrderSchema,
  appointmentSchema,
} from '../src/domain/schemas';
const issues: { entity: string; id: string; fields: string[] }[] = [];
try {
  await readTransaction(async (sql) => {
    for (const [table, schema] of [
      ['schools', schoolSchema],
      ['requests', storedRequestSchema],
      ['work_orders', workOrderSchema],
      ['appointments', appointmentSchema],
    ] as const) {
      let last = '';
      while (true) {
        const rows = await sql.query<{ id: string; data: unknown }>(
          `SELECT id,data FROM ${table} WHERE id>$1 ORDER BY id LIMIT 200`,
          [last],
        );
        for (const row of rows.rows) {
          const result = schema.safeParse(row.data);
          if (!result.success)
            issues.push({
              entity: table,
              id: row.id,
              fields: [...new Set(result.error.issues.map((i) => i.path.join('.')))],
            });
        }
        if (rows.rows.length < 200) break;
        last = rows.rows.at(-1)!.id;
      }
    }
  });
  console.log(
    JSON.stringify(
      {
        status: issues.length ? 'INCONSISTENTE' : 'OK',
        checked:
          'Escolas, solicitações, OS e agenda: schemas por entidade. Não é uma auditoria completa de segurança.',
        issues,
      },
      null,
      2,
    ),
  );
  if (issues.length) process.exitCode = 1;
} finally {
  await closeDatabase();
}
