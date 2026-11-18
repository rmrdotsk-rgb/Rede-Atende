import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// --embedded jamais deve executar seed contra um .env PostgreSQL já existente.
// O iniciador não sobrescreve configurações e dados de instalações anteriores.
if (process.argv.includes('--embedded') && existsSync('.env')) {
  const existing = readFileSync('.env', 'utf8');
  const mode = existing.match(/^\s*DB_MODE\s*=\s*['"]?([^'"\s#]+)/m)?.[1];
  if (mode !== 'embedded' || (process.env.DB_MODE && process.env.DB_MODE !== 'embedded')) {
    console.error(
      'ERRO: --embedded solicitado, mas .env/ambiente não aponta para DB_MODE=embedded.',
    );
    console.error(
      'Nenhum dado foi alterado. Faça cópia da configuração e escolha o modo explicitamente no .env.',
    );
    process.exit(1);
  }
}
if (!existsSync('.env')) {
  if (process.argv.includes('--embedded'))
    writeFileSync(
      '.env',
      'DB_MODE=embedded\nPORT=3001\nCOOKIE_SECURE=false\nSERVE_FRONTEND=false\n',
      { mode: 0o600, flag: 'wx' },
    );
  else {
    writeFileSync('.env', readFileSync('.env.example'), { mode: 0o600, flag: 'wx' });
    console.log(
      'Arquivo .env criado. Preencha DATABASE_URL com seu PostgreSQL e execute npm run setup novamente. Alternativa portátil explícita: npm run setup -- --embedded',
    );
    process.exit(0);
  }
}
const result = spawnSync(process.execPath, ['--import', 'tsx', 'server/db/seed.ts'], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
