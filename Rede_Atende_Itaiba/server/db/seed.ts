import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transaction, closeDatabase } from './database';
import { migrate } from './migrate';
import { emptyState, saveState, loadState, mutate } from './repository';
import { INITIAL_SCHOOLS } from '../../src/services/mockData';
import { DEPARTMENTS } from '../../src/domain/serviceCatalog';
import { hashPassword, type Role, type User } from '../auth';
export async function seed() {
  await migrate();
  await mkdir('.local', { recursive: true });
  let access = 'Acessos locais de ensaio — não compartilhar em produção.\n';
  for (const role of ['gestor', 'operador', 'auditor', 'cidadao'] as Role[]) {
    const email = `${role}@redeatende.invalid`;
    const existing = await transaction((sql) =>
      sql.query('SELECT id FROM users WHERE email=$1', [email]),
    );
    if (existing.rows.length) continue;
    const env = process.env[`SEED_${role.toUpperCase()}_PASSWORD`];
    const password = env || randomBytes(18).toString('base64url');
    if (password.length < 12 || password.length > 128)
      throw new Error('Senha de seed deve ter 12 a 128 caracteres.');
    const hash = await hashPassword(password);
    const user: User = {
      id: randomUUID(),
      email,
      name: `${role[0].toUpperCase() + role.slice(1)} de demonstração`,
      role,
    };
    await transaction((sql) =>
      sql.query(
        'INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING',
        [user.id, email, user.name, hash, role],
      ),
    );
    access += `${role}: ${email}\nSenha: ${password}\n\n`;
  }
  await transaction(async (sql) => {
    for (const [i, name] of DEPARTMENTS.entries())
      await sql.query('INSERT INTO departments(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING', [
        `dep-${i + 1}`,
        name,
      ]);
    const initialized = await sql.query("SELECT id FROM settings WHERE id='initialized'");
    const state = await loadState(sql);
    const before = structuredClone(state);
    for (const school of INITIAL_SCHOOLS)
      if (!state.schools.some((s) => s.id === school.id)) state.schools.push(school);
    await saveState(sql, state, before);
    await sql.query("INSERT INTO settings(id,data) VALUES('holidays','[]') ON CONFLICT DO NOTHING");
    if (!initialized.rows.length) {
      const manager = (
        await sql.query<User>(
          "SELECT id,email,name,role FROM users WHERE role='gestor' ORDER BY created_at LIMIT 1",
        )
      ).rows[0];
      const citizen = (
        await sql.query<User>(
          "SELECT id,email,name,role FROM users WHERE email='cidadao@redeatende.invalid'",
        )
      ).rows[0];
      await mutate(
        sql,
        manager,
        'seed.scenarios',
        (e) => {
          e.loadDemoScenario('merenda');
          e.loadDemoScenario('transporte');
        },
        citizen.id,
      );
    }
    await sql.query(
      "INSERT INTO settings(id,data) VALUES('initialized','true') ON CONFLICT DO NOTHING",
    );
  });
  if (access.includes('Senha:')) {
    let previous = '';
    try {
      previous = await readFile(process.env.SEED_ACCESS_FILE ?? '.local/demo-access.txt', 'utf8');
    } catch {}
    await writeFile(process.env.SEED_ACCESS_FILE ?? '.local/demo-access.txt', previous + access, {
      mode: 0o600,
    });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await seed();
  console.log(
    'Banco preparado. Acessos gerados em .local/demo-access.txt; senhas não são incluídas na entrega.',
  );
  await closeDatabase();
}
