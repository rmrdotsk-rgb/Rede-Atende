import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
try {
  loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
import { fileURLToPath } from 'node:url';
// Argumentos padrão podem ser substituídos por --host/--port (VS Code ou preview).
const api = spawn(process.execPath, ['--watch', '--import', 'tsx', 'server/index.ts'], {
  stdio: 'inherit',
});
const web = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--port',
    '3000',
    '--host',
    '0.0.0.0',
    '--strictPort',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  api.kill('SIGTERM');
  web.kill('SIGTERM');
}
for (const child of [api, web]) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 1));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
