import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { executeMigration, readTransaction, closeDatabase } from './database';

/** Migrações numeradas são imutáveis: nunca reaplique DDL já confirmado no registro. */
export async function migrate() {
  const directory = new URL('./migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const versions = files.map((f) => Number(f.slice(0, 3)));
  if (new Set(versions).size !== files.length || versions.some((v, i) => v !== i + 1))
    throw new Error('Sequência de migrações inválida: verifique lacunas e versões repetidas.');

  const hasRegistry = await readTransaction(async (sql) => {
    const result = await sql.query<{ present: boolean }>(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
    );
    return result.rows[0].present;
  });
  const installed = hasRegistry
    ? new Set(
        (
          await readTransaction((sql) =>
            sql.query<{ version: number }>(
              'SELECT version FROM schema_migrations ORDER BY version',
            ),
          )
        ).rows.map((row) => Number(row.version)),
      )
    : new Set<number>();
  if ([...installed].some((v) => !versions.includes(v)))
    throw new Error(
      'Banco contém versão de migração desconhecida. Atualize o código, não reinicie a base.',
    );

  for (const [index, file] of files.entries()) {
    const version = versions[index];
    if (installed.has(version)) continue;
    if (version > 1 && !installed.has(version - 1))
      throw new Error(`Migração anterior ausente antes de ${file}. Dados preservados.`);
    // Cada arquivo 001/002/003 registra sua versão na MESMA transação que o DDL.
    await executeMigration(await readFile(new URL(file, directory), 'utf8'));
    const registered = await readTransaction((sql) =>
      sql.query<{ version: number }>('SELECT version FROM schema_migrations WHERE version=$1', [
        version,
      ]),
    );
    if (!registered.rows.length)
      throw new Error(`Migração ${file} não confirmou sua versão; verifique o banco.`);
    installed.add(version);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await migrate();
    console.log('Migrações verificadas/aplicadas sem reaplicar versões registradas.');
  } finally {
    await closeDatabase();
  }
}
