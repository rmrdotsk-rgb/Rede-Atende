/** Restauração lógica privada, exclusivamente em uma pasta NOVA de PGlite.
 * Não abre nem sobrescreve a base de origem. Sessões antigas ficam revogadas. */
import { readFile, readdir, lstat, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, relative, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKUP_TABLES } from './backupTables';

async function restore() {
  const [supplied, destination] = process.argv.slice(2);
  if (!supplied || !destination)
    throw new Error('Uso: npm run db:restore -- PASTA_DO_BACKUP NOVA_PASTA_DE_RECUPERACAO');
  const backup = resolve(supplied),
    target = resolve(destination);
  if (backup === target || target.startsWith(backup + sep) || backup.startsWith(target + sep))
    throw new Error('Backup e recuperação devem estar em pastas independentes.');
  // Nenhuma entrada fornecida pelo dump vira caminho ou identificador SQL livre.
  if ((await lstat(backup)).isSymbolicLink()) throw new Error('Backup não pode ser um link.');
  const manifestPath = join(backup, 'manifest.sha256.json');
  if (!(await lstat(manifestPath)).isFile() || (await lstat(manifestPath)).isSymbolicLink())
    throw new Error('Manifesto inválido.');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.algorithm !== 'sha256' || !manifest.files || Array.isArray(manifest.files))
    throw new Error('Manifesto inválido.');
  const files = new Map<string, Buffer>();
  async function walk(folder: string) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && path !== manifestPath)
        files.set(relative(backup, path).replaceAll('\\', '/'), await readFile(path));
      else if (!entry.isFile()) throw new Error('Link ou arquivo especial proibido no backup.');
    }
  }
  await walk(backup);
  const names = [...files.keys()].sort();
  if (
    !files.has('database.json') ||
    JSON.stringify(names) !== JSON.stringify(Object.keys(manifest.files).sort()) ||
    names.some(
      (name) =>
        createHash('sha256').update(files.get(name)!).digest('hex') !== manifest.files[name],
    )
  )
    throw new Error('Backup incompleto, adulterado ou com arquivos extras.');
  const dump = JSON.parse(files.get('database.json')!.toString('utf8'));
  if (
    dump.version !== 1 ||
    !['embedded', 'postgres'].includes(dump.databaseMode) ||
    !dump.tables ||
    JSON.stringify(Object.keys(dump.tables).sort()) !== JSON.stringify([...BACKUP_TABLES].sort()) ||
    BACKUP_TABLES.some((table) => !Array.isArray(dump.tables[table]))
  )
    throw new Error('Formato ou tabelas do backup incompatíveis.');
  const migrations = (await readdir(new URL('./migrations/', import.meta.url)))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, 3)))
    .sort();
  if (
    JSON.stringify(
      dump.tables.schema_migrations.map((row: { version: number }) => Number(row.version)).sort(),
    ) !== JSON.stringify(migrations)
  )
    throw new Error('Esquema incompatível: use o código correspondente ao backup.');
  const uploads = new Map<string, Buffer>();
  for (const attachment of dump.tables.attachments) {
    const name = attachment.storage_name;
    if (typeof name !== 'string' || !/^[a-f0-9-]{36}$/i.test(name) || basename(name) !== name)
      throw new Error('Caminho de anexo inválido no backup.');
    const bytes = files.get('uploads/' + name);
    if (
      !bytes ||
      bytes.length !== attachment.size ||
      createHash('sha256').update(bytes).digest('hex') !== attachment.sha256
    )
      throw new Error('Anexo ausente ou incompatível com o registro do banco.');
    uploads.set(name, bytes);
  }
  if (files.size !== uploads.size + 1)
    throw new Error('Arquivos sem vínculo com o banco no backup.');
  await mkdir(target, { mode: 0o700 }); // Sem recursive: jamais reutiliza uma pasta existente.
  Object.assign(process.env, {
    DB_MODE: 'embedded',
    DATA_DIR: join(target, 'data'),
    UPLOAD_DIR: join(target, 'uploads'),
  });
  const { transaction, closeDatabase } = await import('./database');
  let complete = false;
  try {
    const { migrate } = await import('./migrate');
    const { loadState } = await import('./repository');
    await migrate();
    await mkdir(join(target, 'uploads'), { mode: 0o700 });
    for (const [name, bytes] of uploads)
      await writeFile(join(target, 'uploads', name), bytes, { mode: 0o600, flag: 'wx' });
    await transaction(async (sql) => {
      for (const table of BACKUP_TABLES) {
        const columns = (
          await sql.query<{ column_name: string; data_type: string }>(
            'SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',
            ['public', table],
          )
        ).rows;
        for (const row of dump.tables[table]) {
          if (
            !row ||
            JSON.stringify(Object.keys(row).sort()) !==
              JSON.stringify(columns.map((c) => c.column_name).sort())
          )
            throw new Error(`Colunas incompatíveis em ${table}.`);
          const names = columns.map((c) => '"' + c.column_name + '"').join(',');
          const values = columns.map((c) =>
            c.data_type === 'jsonb' ? JSON.stringify(row[c.column_name]) : row[c.column_name],
          );
          const conflict =
            table === 'schema_migrations'
              ? ' ON CONFLICT(version) DO UPDATE SET applied_at=excluded.applied_at'
              : table === 'operational_sequences'
                ? ' ON CONFLICT(id) DO UPDATE SET next_value=excluded.next_value'
                : '';
          await sql.query(
            `INSERT INTO ${table}(${names}) VALUES(${values.map((_, i) => '$' + (i + 1)).join(',')})${conflict}`,
            values,
          );
        }
      }
      await loadState(sql); // Schemas e vínculos, além das FKs do banco restaurado.
      const inconsistent = await sql.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM requests WHERE category <> data->>'category' OR status <> data->>'status' OR priority <> data->>'priority' OR school_id <> data->>'schoolId'",
      );
      if (inconsistent.rows[0].count !== '0')
        throw new Error('Projeções SQL e registros divergentes.');
      for (const table of BACKUP_TABLES) {
        const rows = (await sql.query(`SELECT * FROM ${table}`)).rows;
        const canonical = (value: unknown): string => {
          if (value instanceof Date) return JSON.stringify(value.toISOString());
          if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
          if (value && typeof value === 'object')
            return (
              '{' +
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
                .join(',') +
              '}'
            );
          return JSON.stringify(value);
        };
        if (
          JSON.stringify(rows.map(canonical).sort()) !==
          JSON.stringify(dump.tables[table].map(canonical).sort())
        )
          throw new Error(`Comparação após restauração divergiu em ${table}.`);
      }
    });
    await writeFile(
      join(target, '.env'),
      // Barras normais também funcionam no Windows e impedem que o leitor de
      // .env interprete "\\n" em nomes de pastas como uma quebra de linha.
      `DB_MODE=embedded\nDATA_DIR=${JSON.stringify(join(target, 'data').replaceAll('\\', '/'))}\nUPLOAD_DIR=${JSON.stringify(join(target, 'uploads').replaceAll('\\', '/'))}\nPORT=3001\nCOOKIE_SECURE=false\n`,
      { mode: 0o600, flag: 'wx' },
    );
    // Não copia database.json, senhas em texto ou sessões para a instância recuperada.
    await copyFile(manifestPath, join(target, 'source-manifest.sha256.json'));
    complete = true;
    console.log(
      `Restauração lógica concluída: ${BACKUP_TABLES.length} tabelas e ${uploads.size} anexo(s) comparados em pasta nova.`,
    );
    console.log(
      `Configuração recuperada: ${join(target, '.env')}. Todas as contas precisam entrar novamente; sessões não foram importadas.`,
    );
  } finally {
    await closeDatabase();
    if (!complete) await rm(target, { recursive: true, force: true }); // Só a pasta exclusiva criada acima.
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await restore();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha ao restaurar.');
    process.exitCode = 1;
  }
}
