/**
 * Configuracion de bimo-core (spec 08 §3.1). Ningun secreto vive en el repo: todo llega por variables de entorno.
 */
import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const EnvSchema = z.object({
  BIMO_ENV: z.enum(['local', 'staging', 'production']),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  SUPABASE_JWKS_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  RELAYER_URL: optionalString,
  RELAYER_API_KEY: optionalString,
  ATTESTER_SECRET: optionalString,
  DEPLOYER_SECRET: optionalString,
  FALLBACK_SUBMITTER_SECRET: optionalString,
  BIMO_SIMULATORS: z.enum(['on', 'off']).default('off'),
  VERIFIER_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
});

export type CoreConfig = {
  env: 'local' | 'staging' | 'production';
  databaseUrl: string;
  supabaseJwksUrl: string | undefined;
  supabaseUrl: string | undefined;
  stellarNetwork: 'testnet' | 'mainnet';
  relayerUrl: string | undefined;
  simulators: boolean;
  verifierBaseUrl: string | undefined;
  port: number;
  /** Secretos: solo para los adaptadores de stellar; nunca se registran ni se devuelven por la API. */
  secrets: {
    relayerApiKey: string | undefined;
    attester: string | undefined;
    deployer: string | undefined;
    fallbackSubmitter: string | undefined;
  };
};

export class ConfigError extends Error {}

/** Valida las variables; falla el arranque si algo no cuadra (por ejemplo simuladores en produccion). */
export function loadConfig(env: Record<string, string | undefined>): CoreConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new ConfigError(`Variables de entorno invalidas: ${fields}`);
  }
  const e = parsed.data;
  if (e.BIMO_ENV === 'production' && e.BIMO_SIMULATORS === 'on') {
    throw new ConfigError('BIMO_SIMULATORS=on no esta permitido con BIMO_ENV=production');
  }
  return {
    env: e.BIMO_ENV,
    databaseUrl: e.DATABASE_URL,
    supabaseJwksUrl: e.SUPABASE_JWKS_URL,
    supabaseUrl: e.SUPABASE_URL,
    stellarNetwork: e.STELLAR_NETWORK,
    relayerUrl: e.RELAYER_URL,
    simulators: e.BIMO_SIMULATORS === 'on',
    verifierBaseUrl: e.VERIFIER_BASE_URL,
    port: e.PORT,
    secrets: {
      relayerApiKey: e.RELAYER_API_KEY,
      attester: e.ATTESTER_SECRET,
      deployer: e.DEPLOYER_SECRET,
      fallbackSubmitter: e.FALLBACK_SUBMITTER_SECRET,
    },
  };
}
