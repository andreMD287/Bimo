import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppError } from '../errors';

export interface JwtVerifier {
  /** Valida el JWT de Supabase y devuelve el `sub` (uuid del usuario). Lanza AppError('unauthenticated'). */
  verify(token: string): Promise<{ userId: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verificador con las llaves publicas de Supabase (JWKS), spec 06 §2. `keys` permite inyectar llaves en pruebas. */
export function createJwtVerifier(opts: { jwksUrl?: string; supabaseUrl?: string; keys?: JWTVerifyGetKey }): JwtVerifier {
  let keys = opts.keys;
  if (!keys) {
    const url = opts.jwksUrl ?? (opts.supabaseUrl ? `${opts.supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json` : undefined);
    if (!url) throw new Error('Falta SUPABASE_JWKS_URL o SUPABASE_URL para validar los JWT');
    keys = createRemoteJWKSet(new URL(url));
  }
  const getKey = keys;
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, getKey, { audience: 'authenticated' });
        const sub = payload.sub;
        if (!sub || !UUID.test(sub)) throw new Error('sub invalido');
        return { userId: sub.toLowerCase() };
      } catch {
        throw new AppError('unauthenticated', 'Token invalido o vencido');
      }
    },
  };
}
