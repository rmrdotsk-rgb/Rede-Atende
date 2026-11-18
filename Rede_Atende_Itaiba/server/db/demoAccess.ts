import { chmod, mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Role } from '../auth';

export const demoRoles: Role[] = ['gestor', 'operador', 'auditor', 'cidadao'];
export function validateDemoPassword(password: string) {
  if (password.length < 12 || password.length > 128 || /[\r\n\0]/.test(password))
    throw new Error('A senha local deve ter de 12 a 128 caracteres, sem quebras de linha.');
}
/** Arquivo privado: só registra credenciais confirmadas no banco. */
export async function recordDemoAccess(entries: { role: Role; password: string }[]) {
  const path = process.env.SEED_ACCESS_FILE ?? '.local/demo-access.txt';
  if (!entries.length) {
    try {
      await chmod(path, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let previous = '';
  try {
    previous = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const { role } of entries)
    previous = previous.replace(
      new RegExp(`^${role}: ${role}(?:@redeatende\\.invalid)?\\r?\\nSenha: [^\\r\\n]*\\r?\\n?`, 'gm'),
      '',
    );
  const content =
    previous +
    (previous ? '' : 'Acessos locais de ensaio — não compartilhar.\n') +
    entries
      .map(({ role, password }) => `${role}: ${role}\nSenha: ${password}\n\n`)
      .join('');
  // 'w' creates or truncates the file; Windows cannot ftruncate an append-only handle.
  const file = await open(path, 'w', 0o600);
  try {
    await chmod(path, 0o600);
    await file.writeFile(content);
  } finally {
    await file.close();
  }
}
