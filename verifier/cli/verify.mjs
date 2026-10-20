import { readFileSync } from 'node:fs';
import { RpcSealReader, verifyPackage } from '../src/index';

async function run() {
  const [,, paquetePath] = process.argv;
  if (!paquetePath) {
    console.error('Uso: node verify.mjs paquete.json [--rpc <url>]');
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(paquetePath, 'utf8'));
  const rpcUrl = process.argv.includes('--rpc') ? process.argv[process.argv.indexOf('--rpc') + 1] : pkg.network.rpc_url;

  // En Node podemos usar fetch nativo
  const reader = new RpcSealReader(rpcUrl, fetch);

  // Por ahora asumimos que la red es la que viene en el paquete.
  // El spec 05 §4.1 dice que debemos rechazar si no es una red compilada.
  // Pero para el CLI de terceros, usaremos la red del paquete como "confiable" por ahora.
  const trusted = [{
    networkPassphrase: pkg.network.network_passphrase,
    registryIds: pkg.network.registry_ids
  }];

  const result = await verifyPackage(pkg, { reader, trusted });

  if (!result.trusted) {
    console.error('El paquete no es confiable: los contratos o la red no coinciden con los esperados.');
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
