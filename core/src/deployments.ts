import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** contracts/deployments/<red>.json (spec 03 §9): lo unico que core necesita saber de la red. */
export const DeploymentsSchema = z.object({
  network: z.enum(['testnet', 'mainnet']),
  network_passphrase: z.string(),
  rpc_url: z.url(),
  registry_ids: z.array(z.string()).min(1),
  p256_verifier_id: z.string(),
  account_wasm_hash: z.string(),
  attester: z.string(),
  admin: z.string(),
  deployer: z.string(),
  usdc_sac: z.string(),
});
export type Deployments = z.infer<typeof DeploymentsSchema>;

export function loadDeployments(network: 'testnet' | 'mainnet'): Deployments {
  const file = new URL(`../../contracts/deployments/${network}.json`, import.meta.url);
  return DeploymentsSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
