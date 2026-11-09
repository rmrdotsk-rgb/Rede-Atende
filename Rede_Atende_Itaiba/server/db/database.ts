import { Pool, type PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config';
export interface Sql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}
let pool: Pool | undefined;
function nativePool() {
  if (config.mode !== 'postgres') return undefined;
  return (pool ??= new Pool({
    connectionString: config.databaseUrl,
    max: 8,
    connectionTimeoutMillis: 8000,
  }));
}
let embedded: PGlite | undefined;
let embeddedLock: string | undefined;
let queue = Promise.resolve();
async function instance() {
  if (!embedded) {
    await mkdir(dirname(config.dataDir), { recursive: true });
    const lock = config.dataDir + '.api.lock';
    try {
      const file = await open(lock, 'wx', 0o600);
      await file.writeFile(String(process.pid));
      await file.close();
      embeddedLock = lock;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(await readFile(lock, 'utf8'));
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (e) {
        alive = (e as NodeJS.ErrnoException).code !== 'ESRCH';
      }
      if (alive)
        throw new Error(
          'Banco portátil em uso por outro processo. Pare a outra API antes de continuar.',
        );
      await unlink(lock);
      return instance();
    }
    try {
      await mkdir(config.dataDir, { recursive: true });
      // PGlite 0.3 used template1. Keep that database when opening existing 3.8 data.
      embedded = new PGlite(config.dataDir, { database: 'template1' });
      await embedded.waitReady;
    } catch (e) {
      embedded = undefined;
      await unlink(lock).catch(() => {});
      embeddedLock = undefined;
      throw e;
    }
  }
  return embedded;
}
export async function transaction<T>(
  fn: (sql: Sql) => Promise<T>,
  options: { readOnly?: boolean } = {},
): Promise<T> {
  const native = nativePool();
  if (native) {
    const client: PoolClient = await native.connect();
    try {
      await client.query(
        options.readOnly ? 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN',
      );
      await client.query('SET LOCAL statement_timeout = 15000');
      if (!options.readOnly) await client.query('SELECT pg_advisory_xact_lock(340034)');
      const value = await fn(client);
      await client.query('COMMIT');
      return value;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  let release!: () => void;
  const previous = queue;
  queue = new Promise<void>((r) => {
    release = r;
  });
  await previous;
  try {
    const db = await instance();
    return await db.transaction(async (tx) => {
      if (options.readOnly) await tx.query('SET TRANSACTION READ ONLY');
      return fn({
        query: async <R extends Record<string, unknown>>(sql: string, params?: unknown[]) => {
          const result = await tx.query<R>(sql, params);
          return { rows: result.rows, rowCount: result.affectedRows };
        },
      });
    });
  } finally {
    release();
  }
}
export function readTransaction<T>(fn: (sql: Sql) => Promise<T>) {
  return transaction(fn, { readOnly: true });
}
export async function executeMigration(sql: string) {
  if (config.mode === 'postgres')
    await transaction(async (client) => {
      await client.query(sql);
    });
  else {
    const db = await instance();
    await db.transaction(async (tx) => {
      await tx.exec(sql);
    });
  }
}
export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
  if (embedded) {
    await embedded.close();
    embedded = undefined;
  }
  if (embeddedLock) {
    await unlink(embeddedLock).catch(() => {});
    embeddedLock = undefined;
  }
}
