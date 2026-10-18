/** Punto de entrada: `tsx src/main.ts api|worker` (ADR-01: dos servicios con la misma imagen). */
import { createPgDeviceDirectory } from './auth/devices';
import { createJwtVerifier } from './auth/jwt';
import { createHealthChecks } from './api/health';
import { buildServer } from './api/server';
import { loadConfig } from './config';
import { createDb, createPool } from './db/client';
import { loadDeployments } from './deployments';
import { createLogger } from './logger';
import { runWorkers } from './workers';

const mode = process.argv[2];
if (mode !== 'api' && mode !== 'worker') {
  console.error('Uso: main.ts api|worker');
  process.exit(2);
}

const config = loadConfig(process.env);
const log = createLogger(config.env === 'local' ? 'debug' : 'info');
const pool = createPool(config.databaseUrl);
const db = createDb(pool);
const deployments = loadDeployments(config.stellarNetwork);

if (mode === 'api') {
  const app = await buildServer({
    config,
    db,
    jwt: createJwtVerifier({ jwksUrl: config.supabaseJwksUrl, supabaseUrl: config.supabaseUrl }),
    devices: createPgDeviceDirectory(db),
    health: createHealthChecks(db, deployments.rpc_url, config.relayerUrl),
  });
  await app.listen({ port: config.port, host: '0.0.0.0' });
} else {
  runWorkers([], log);
}
