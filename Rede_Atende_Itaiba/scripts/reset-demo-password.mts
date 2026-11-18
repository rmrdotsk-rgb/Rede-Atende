/** Recuperação exclusiva do responsável local. Não há endpoint HTTP equivalente. */
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';

const args = process.argv.slice(2);
const role = args[0] === '--login' ? args[1] : args[1]?.split('@')[0];
const roles = ['gestor', 'operador', 'auditor', 'cidadao'];
const email = role ? `${role}@redeatende.invalid` : '';
const identifierValid =
  (args[0] === '--login' && args[1] === role) ||
  (args[0] === '--email' && args[1] === email);
if (
  args.length !== 3 ||
  args[2] !== '--confirm' ||
  !roles.includes(role ?? '') ||
  !identifierValid
) {
  console.error('Uso: npm run demo:reset-password -- --login gestor --confirm');
  console.error('Pare o servidor e defina SEED_GESTOR_PASSWORD no .env privado antes de executar.');
  process.exit(1);
}
try {
  loadEnvFile('.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const { validateDemoPassword, recordDemoAccess } = await import('../server/db/demoAccess');
const password = process.env[`SEED_${role.toUpperCase()}_PASSWORD`] ?? '';
validateDemoPassword(password);
const backup = resolve(join('.local/backups', 'before-password-reset-' + randomUUID()));
const saved = spawnSync(process.execPath, ['--import', 'tsx', 'server/db/backup.ts', backup], {
  stdio: 'inherit',
});
if (saved.status !== 0) {
  console.error('A redefinição foi cancelada porque o backup não foi concluído.');
  process.exit(1);
}
const { transaction, closeDatabase } = await import('../server/db/database');
const { hashPassword, audit } = await import('../server/auth');
try {
  const hash = await hashPassword(password);
  await transaction(async (sql) => {
    const found = await sql.query<{ id: string; role: string }>(
      'SELECT id,role FROM users WHERE email=$1 AND active=true',
      [email],
    );
    const user = found.rows[0];
    if (!user || user.role !== role)
      throw new Error(
        'Conta de demonstração não encontrada ou perfil divergente. Nenhuma senha foi alterada.',
      );
    await sql.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, user.id]);
    await sql.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
    await audit(sql, undefined, 'demo.password.reset', user.id, {
      source: 'local-cli',
      role,
      backup,
    });
  });
  await recordDemoAccess([{ role: role as import('../server/auth').Role, password }]);
  console.log(
    'Senha local redefinida e sessões desta conta encerradas. O arquivo privado de acessos foi atualizado.',
  );
} finally {
  await closeDatabase();
}
