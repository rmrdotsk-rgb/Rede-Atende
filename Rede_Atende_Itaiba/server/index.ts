import { buildApp } from './app';
import { config } from './config';
import { closeDatabase } from './db/database';
import { migrate } from './db/migrate';
await migrate();
const app = await buildApp({ serveFrontend: process.env.SERVE_FRONTEND === 'true', logger: true });
await app.listen({ host: process.env.HOST ?? '0.0.0.0', port: config.port });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await app.close();
    await closeDatabase();
    process.exit(0);
  });
