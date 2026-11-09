import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
try {
  loadEnvFile('.env');
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}
export const config = {
  mode: process.env.DB_MODE ?? 'postgres',
  databaseUrl: process.env.DATABASE_URL ?? '',
  dataDir: resolve(process.env.DATA_DIR ?? '.local/data'),
  uploadDir: resolve(process.env.UPLOAD_DIR ?? '.local/uploads'),
  port: Number(process.env.PORT ?? 3001),
  production: process.env.NODE_ENV === 'production',
  secureCookie: process.env.COOKIE_SECURE === 'true',
  sessionHours: Number(process.env.SESSION_HOURS ?? 8),
};
if (!['postgres', 'embedded'].includes(config.mode))
  throw new Error('DB_MODE deve ser postgres ou embedded.');
if (config.mode === 'postgres' && !config.databaseUrl)
  throw new Error(
    'Configure DATABASE_URL no .env (veja .env.example) ou escolha explicitamente DB_MODE=embedded.',
  );
if (config.production && !config.secureCookie)
  throw new Error('Produção exige COOKIE_SECURE=true e proxy HTTPS.');
if (
  !Number.isInteger(config.port) ||
  config.port < 1 ||
  config.port > 65535 ||
  !Number.isFinite(config.sessionHours) ||
  config.sessionHours <= 0 ||
  config.sessionHours > 24
)
  throw new Error('Porta ou expiração de sessão inválida.');
