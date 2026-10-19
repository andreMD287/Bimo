/**
 * Sesion por codigo de un solo uso al correo (spec 06 §2) contra la API REST de Supabase Auth; sin supabase-js
 * (no esta entre las dependencias permitidas, spec 08 §2).
 */
import type { Kv } from '../kv';

export interface Session {
  access_token: string;
  refresh_token: string;
  /** segundos desde 1970 */
  expires_at: number;
  user_id: string;
  email: string;
}

export interface AuthOptions {
  supabaseUrl: string;
  anonKey: string;
  kv: Kv;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

const KEY = 'bimo.session';

export class AuthError extends Error {
  constructor(readonly code: 'network' | 'invalid_code' | 'rejected') {
    super(code);
  }
}

export function createAuth(o: AuthOptions) {
  const now = o.now ?? Date.now;
  const doFetch = o.fetchImpl ?? fetch;
  const base = `${o.supabaseUrl.replace(/\/$/, '')}/auth/v1`;

  async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, { method: 'POST', headers: { apikey: o.anonKey, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new AuthError('network');
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new AuthError(res.status === 400 || res.status === 401 || res.status === 403 ? 'invalid_code' : 'rejected');
    return json;
  }

  const toSession = (j: Record<string, unknown>, email: string): Session => {
    const user = j.user as { id: string } | undefined;
    const expiresAt = typeof j.expires_at === 'number' ? j.expires_at : Math.floor(now() / 1000) + Number(j.expires_in ?? 3600);
    if (typeof j.access_token !== 'string' || typeof j.refresh_token !== 'string' || !user) throw new AuthError('rejected');
    return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: expiresAt, user_id: user.id, email };
  };

  const read = (): Session | null => {
    const raw = o.kv.get(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  };

  return {
    /** Envia el codigo de 6 digitos al correo. */
    async sendCode(email: string): Promise<void> {
      await post('/otp', { email, create_user: true });
    },
    /** Verifica el codigo y guarda la sesion. */
    async verifyCode(email: string, code: string): Promise<Session> {
      const s = toSession(await post('/verify', { email, token: code, type: 'email' }), email);
      o.kv.set(KEY, JSON.stringify(s));
      return s;
    },
    session: read,
    signOut(): void {
      o.kv.remove(KEY);
    },
    /** JWT vigente; lo renueva si vence en menos de un minuto. */
    async getToken(): Promise<string | null> {
      const s = read();
      if (!s) return null;
      if (s.expires_at - now() / 1000 > 60) return s.access_token;
      try {
        const next = toSession(await post('/token?grant_type=refresh_token', { refresh_token: s.refresh_token }), s.email);
        o.kv.set(KEY, JSON.stringify(next));
        return next.access_token;
      } catch (e) {
        if (e instanceof AuthError && e.code === 'network') return s.access_token; // sin red se intenta con el que hay
        o.kv.remove(KEY);
        return null;
      }
    },
  };
}
