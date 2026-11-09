import { existsSync } from 'node:fs';
if (!existsSync('dist/index.html')) {
  console.error('Execute npm run build antes de npm start.');
  process.exit(1);
}
process.env.SERVE_FRONTEND = 'true';
await import('../server/index.ts');
