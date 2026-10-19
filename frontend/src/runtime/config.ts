/**
 * Configuracion publica de la app (EXPO_PUBLIC_*, se incrusta al compilar). Nunca hay secretos aqui (CLAUDE.md §4).
 * Sin API configurada la app corre en MODO SIMULACION con datos de ejemplo (demo de la semana 3).
 */
import deployments from '../../../contracts/deployments/testnet.json';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** true cuando la app habla con bimo-core de verdad. */
export const MODO_REAL = apiUrl !== '' && supabaseUrl !== '' && anonKey !== '';

export const config = {
  apiUrl,
  supabaseUrl,
  anonKey,
  deployments: {
    network_passphrase: deployments.network_passphrase,
    rpc_url: deployments.rpc_url,
    registry_ids: deployments.registry_ids,
  },
};
