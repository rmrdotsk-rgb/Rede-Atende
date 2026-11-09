/** Verifica a integridade dos arquivos de um backup (não restaura dados). */
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
const supplied = process.argv[2];
if (!supplied) {
  console.error('Uso: node scripts/verify-backup.mjs CAMINHO_DO_BACKUP');
  process.exitCode = 2;
} else {
  const base = resolve(supplied);
  try {
    const manifest = JSON.parse(await readFile(join(base, 'manifest.sha256.json'), 'utf8'));
    if (manifest.algorithm !== 'sha256' || !manifest.files || typeof manifest.files !== 'object')
      throw new Error('Manifesto inválido.');
    const actual = {};
    async function walk(folder) {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && path !== join(base, 'manifest.sha256.json')) {
          actual[relative(base, path).replaceAll('\\', '/')] = createHash('sha256')
            .update(await readFile(path))
            .digest('hex');
        } else if (!entry.isFile()) throw new Error('Link ou arquivo especial não permitido.');
      }
    }
    await walk(base);
    if (!Object.hasOwn(actual, 'database.json')) throw new Error('Snapshot do banco ausente.');
    const expectedNames = Object.keys(manifest.files).sort();
    const actualNames = Object.keys(actual).sort();
    if (
      JSON.stringify(expectedNames) !== JSON.stringify(actualNames) ||
      actualNames.some((name) => actual[name] !== manifest.files[name])
    )
      throw new Error('Backup incompleto, adulterado ou com arquivos extras.');
    console.log(`Backup íntegro: ${actualNames.length} arquivo(s) com SHA-256 conferido.`);
  } catch (error) {
    console.error('Falha na verificação:', error.message);
    process.exitCode = 1;
  }
}
