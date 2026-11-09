import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
  createHash,
  randomUUID,
} from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Sql } from './db/database';
import { transaction, readTransaction } from './db/database';
import { config } from './config';
const scrypt = promisify(nodeScrypt);
export type Role = 'cidadao' | 'operador' | 'gestor' | 'auditor';
export interface User extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [, salt, key] = encoded.split(':');
  if (!salt || !key || !/^[a-f0-9]{128}$/.test(key)) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(derived, Buffer.from(key, 'hex'));
}
export async function currentSession(req: FastifyRequest) {
  const token = req.cookies.ra_session;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  return readTransaction(async (sql) => {
    const result = await sql.query<User & { csrf_hash: string; token_hash: string }>(
      `SELECT u.id,u.email,u.name,u.role,s.csrf_hash,s.token_hash FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,
      [digest(token)],
    );
    return result.rows[0];
  });
}
export async function requireUser(
  req: FastifyRequest,
  roles?: Role[],
  mutation = false,
): Promise<User> {
  const session = await currentSession(req);
  if (!session) throw new HttpError(401, 'Entre na sua conta para continuar.');
  if (roles && !roles.includes(session.role))
    throw new HttpError(403, 'Seu perfil não possui permissão para esta operação.');
  if (mutation) {
    const csrf = req.headers['x-csrf-token'];
    if (typeof csrf !== 'string' || digest(csrf) !== session.csrf_hash)
      throw new HttpError(403, 'Sessão de formulário inválida. Atualize a página.');
  }
  return { id: session.id, email: session.email, name: session.name, role: session.role };
}
export async function createSession(user: User, reply: FastifyReply) {
  const token = randomBytes(32).toString('hex');
  // CSRF é derivado do token HttpOnly; nunca é persistido no navegador.
  const csrf = digest(`csrf:${token}`);
  await transaction(async (sql) => {
    await sql.query('DELETE FROM sessions WHERE expires_at<=now()');
    await sql.query(
      'INSERT INTO sessions(token_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,$4)',
      [digest(token), user.id, digest(csrf), new Date(Date.now() + config.sessionHours * 3600000)],
    );
    await audit(sql, user, 'session.login', user.id);
  });
  reply.setCookie('ra_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookie,
    maxAge: config.sessionHours * 3600,
  });
  return { user, csrf };
}
export async function limit(sql: Sql, key: string, max: number, seconds = 900) {
  const result = await sql.query<{ attempts: number }>(
    `INSERT INTO rate_limits(key,attempts,expires_at) VALUES($1,1,now()+($2 * interval '1 second')) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN rate_limits.expires_at<=now() THEN 1 ELSE rate_limits.attempts+1 END, expires_at=CASE WHEN rate_limits.expires_at<=now() THEN excluded.expires_at ELSE rate_limits.expires_at END RETURNING attempts`,
    [digest(key), seconds],
  );
  return result.rows[0].attempts <= max;
}
export async function audit(
  sql: Sql,
  actor: User | undefined,
  action: string,
  entityId?: string,
  data: Record<string, unknown> = {},
) {
  await sql.query(
    'INSERT INTO audit_log(id,actor_id,action,entity_id,data) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), actor?.id ?? null, action, entityId ?? null, JSON.stringify(data)],
  );
}
export const staff: Role[] = ['operador', 'gestor', 'auditor'];
export const editors: Role[] = ['operador', 'gestor'];
