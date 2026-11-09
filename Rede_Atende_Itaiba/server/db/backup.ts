/** Backup lógico privado. Para PGlite, exige ausência de servidor vivo;
 * a conexão deste processo mantém o lock até concluir cópia e manifesto. */
import { mkdir, writeFile, cp, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { transaction, closeDatabase } from './database';
import { config } from '../config';

import { BACKUP_TABLES as tables } from './backupTables';

// Se a API estiver aberta sobre o mesmo banco, um snapshot dos anexos
// poderia divergir dos registros; nunca copiar arquivos enquanto ela grava.
if (config.mode === 'embedded') {
  const lock = config.dataDir + '.api.lock';
  try {
    const pidText = (await readFile(lock, 'utf8')).trim();
    const pid = Number(pidText);
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error('Lock de banco inválido. Verifique o processo antes de fazer backup.');
    try {
      process.kill(pid, 0);
      throw new Error('Pare a API antes de gerar backup do banco portátil.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

const target = resolve(
  process.argv[2] ?? join('.local/backups', new Date().toISOString().replace(/[:.]/g, '-')),
);
try {
  // O lock do PGlite é adquirido aqui e permanece até o manifesto estar pronto.
  const dump = await transaction(async (sql) => {
    const data: Record<string, unknown> = {};
    for (const table of tables) data[table] = (await sql.query(`SELECT * FROM ${table}`)).rows;
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      databaseMode: config.mode,
      tables: data,
    };
  });
  await mkdir(resolve(target, '..'), { recursive: true, mode: 0o700 });
  await mkdir(target, { mode: 0o700 }); // Exclusivo: nunca sobrescreve outro snapshot.
  await writeFile(join(target, 'database.json'), JSON.stringify(dump, null, 2), { mode: 0o600 });
  await cp(config.uploadDir, join(target, 'uploads'), { recursive: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    },
  );
  const hashes: Record<string, string> = {};
  async function walk(folder: string) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const name = relative(target, path).replaceAll('\\', '/');
        const bytes = await readFile(path);
        hashes[name] = createHash('sha256').update(bytes).digest('hex');
      } else {
        throw new Error('Arquivo especial ou link simbólico proibido no backup.');
      }
    }
  }
  await walk(target);
  // Hashes de todos os binários + snapshot; não inclui segredos na própria lista.
  await writeFile(
    join(target, 'manifest.sha256.json'),
    JSON.stringify({ algorithm: 'sha256', files: hashes }, null, 2),
    { mode: 0o600 },
  );
  console.log(
    `Backup privado concluído em ${target}. Verifique com: node scripts/verify-backup.mjs "${target}"`,
  );
  console.log('Inclui hashes de senhas e dados pessoais; preserve a pasta privada.');
} finally {
  await closeDatabase();
}
