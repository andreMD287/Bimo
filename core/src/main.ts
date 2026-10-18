/** Punto de entrada: `tsx src/main.ts api|worker` (ADR-01: dos servicios con la misma imagen). */
import { createPgDeviceDirectory } from './auth/devices';
import { createJwtVerifier } from './auth/jwt';
import { createHealthChecks } from './api/health';
import { registerComerciosRoutes } from './api/routes/comercios';
import { registerDiasRoutes } from './api/routes/dias';
import { registerSyncRoutes } from './api/routes/sync';
import { registerVerificacionRoutes } from './api/routes/verificacion';
import { buildServer } from './api/server';
import { loadConfig } from './config';
import { createDb, createPool } from './db/client';
import { loadDeployments } from './deployments';
import { createLogger } from './logger';
import { Keypair, rpc } from '@stellar/stellar-sdk';
import { EnviadorDirecto, RpcSealPreparer, StellarAccountDeployer, StellarSealSubmitter, createSealSigner } from './modules/stellar';
import { runWorkers } from './workers';
import { createAccountDeployWorker } from './workers/account-deploy';
import { createSealSubmitWorker } from './workers/seal-submit';

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
    routes: [registerComerciosRoutes, registerSyncRoutes, registerDiasRoutes, registerVerificacionRoutes],
    ...(config.secrets.attester
      ? { signer: createSealSigner({ attester: Keypair.fromSecret(config.secrets.attester), networkPassphrase: deployments.network_passphrase }) }
      : {}),
    seals: new RpcSealPreparer({
      server: new rpc.Server(deployments.rpc_url),
      deployments,
      sourceAddress: deployments.deployer,
    }),
  });
  await app.listen({ port: config.port, host: '0.0.0.0' });
} else {
  const { deployer, fallbackSubmitter } = config.secrets;
  if (!deployer || !fallbackSubmitter) {
    log.error('Faltan DEPLOYER_SECRET o FALLBACK_SUBMITTER_SECRET para el worker');
    process.exit(1);
  }
  const server = new rpc.Server(deployments.rpc_url);
  const enviador = new EnviadorDirecto({
    server,
    networkPassphrase: deployments.network_passphrase,
    feeSource: Keypair.fromSecret(fallbackSubmitter),
  });
  const accountDeployer = new StellarAccountDeployer({ server, deployments, deployer: Keypair.fromSecret(deployer), enviador });
  const submitter = new StellarSealSubmitter({ server, deployments, deployer: Keypair.fromSecret(deployer), enviador });
  runWorkers([createAccountDeployWorker({ db, deployer: accountDeployer, log }), createSealSubmitWorker({ db, submitter, log })], log);
}
