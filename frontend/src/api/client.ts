/**
 * Cliente de la API de bimo-core (spec 06). Solo lo usan `sync/`, `auth/` y los hooks; las pantallas nunca lo importan.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`${status} ${code}`);
  }
  /** Sin red o respuesta ilegible: se reintenta (spec 04 §3.2). */
  get isNetwork() {
    return this.status === 0;
  }
}

export interface ApiOptions {
  baseUrl: string;
  /** Devuelve el JWT vigente (renovandolo si hace falta). */
  getToken: () => Promise<string | null>;
  getDeviceId: () => string | null;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export interface PushItem {
  type: 'customer' | 'channel' | 'entry';
  data: Record<string, unknown>;
}

export interface PushResult {
  type: 'customer' | 'channel' | 'entry';
  id: string;
  result: 'accepted' | 'duplicate' | 'id_conflict' | 'rejected' | 'dependency_failed';
  code?: string;
  business_date?: string;
  day_status?: string;
}

export interface PullChange {
  seq: number;
  entity: 'entry' | 'customer' | 'channel' | 'day' | 'seal';
  data: Record<string, unknown>;
}

export interface PendingSigning {
  signing_request_id: string;
  preimage_xdr: string;
  items: Array<{ date: string; entry_count: number; is_amend: boolean }>;
  expiration_ledger: number;
  expires_at: string;
}

export interface LinkRow {
  id: string;
  date_from: string;
  date_to: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  status: 'activo' | 'vencido' | 'revocado';
}

export interface MeResponse {
  merchant_id: string;
  business_name: string;
  stellar_address: string | null;
  account_status: 'pending' | 'deploying' | 'ready' | 'failed';
  role: 'dueno' | 'empleado';
}

export function createApi(o: ApiOptions) {
  const doFetch = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;

  async function call<T>(method: string, path: string, opts: { body?: unknown; auth?: boolean; device?: boolean; token?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { 'x-device-time': new Date(now()).toISOString() };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    else if (opts.auth !== false) {
      const t = await o.getToken();
      if (!t) throw new ApiError(401, 'unauthenticated');
      headers.authorization = `Bearer ${t}`;
    }
    if (opts.device) {
      const id = o.getDeviceId();
      if (id) headers['x-device-id'] = id;
    }
    let res: Response;
    try {
      res = await doFetch(`${o.baseUrl.replace(/\/$/, '')}${path}`, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
    } catch {
      throw new ApiError(0, 'network');
    }
    if (res.status === 204 || res.status === 202) {
      const text = await res.text().catch(() => '');
      return (text ? JSON.parse(text) : {}) as T;
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* cuerpo vacio */
    }
    if (!res.ok) {
      const e = (json as { error?: { code?: string; details?: Record<string, unknown> } } | null)?.error;
      throw new ApiError(res.status >= 500 && !e ? 0 : res.status, e?.code ?? 'error', e?.details ?? {});
    }
    return json as T;
  }

  return {
    createMerchant: (b: { business_name: string; owner_name?: string; city?: string }) =>
      call<{ merchant_id: string }>('POST', '/merchants', { body: b }),
    challenge: () => call<{ challenge_id: string; challenge: string; expires_at: string }>('POST', '/devices/challenge', { body: {} }),
    registerDevice: (b: { device_id: string; challenge_id: string; public_key: string; key_kind: string; signature: string }) =>
      call<{ device_id: string; account_status: MeResponse['account_status'] }>('POST', '/devices', { body: b }),
    me: () => call<MeResponse>('GET', '/merchants/me', { device: true }),
    push: (items: PushItem[], deviceId: string) =>
      call<{ results: PushResult[]; clock_skew_ms: number }>('POST', '/sync/push', {
        device: true,
        body: { device_id: deviceId, device_time: new Date(now()).toISOString(), items },
      }),
    pull: (cursor: number, limit = 500) =>
      call<{ changes: PullChange[]; next_cursor: number; has_more: boolean }>('GET', `/sync/pull?cursor=${cursor}&limit=${limit}`, { device: true }),
    closeDay: (date: string, body: { counted_cash_minor: number | null; entry_ids: string[] }) =>
      call<{ status: string; signing_request_id?: string }>('POST', `/days/${date}/close`, { device: true, body }),
    days: (from?: string, to?: string) =>
      call<{ days: Array<{ date: string; status: string; entry_count: number; seal_version: number; tx_hash?: string }> }>(
        'GET',
        `/days${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}` : ''}`,
        { device: true },
      ),
    signingPending: () => call<{ request: PendingSigning | null }>('GET', '/signing/pending', { device: true }),
    sendSignature: (id: string, signatureB64: string) =>
      call<{ status: string }>('POST', `/signing/${id}/signature`, { device: true, body: { signature: signatureB64 } }),
    createLink: (b: { date_from: string; date_to: string; expires_in_days: 7 | 30 | 90 }) =>
      call<{ id: string; url: string; expires_at: string }>('POST', '/verification-links', { device: true, body: b }),
    links: () => call<{ links: LinkRow[] }>('GET', '/verification-links', { device: true }),
    revokeLink: (id: string) => call<Record<string, never>>('DELETE', `/verification-links/${id}`, { device: true }),
    /** Paquete publico del verificador (con el token del enlace, sin sesion). */
    verificationPackage: (token: string, from?: string, to?: string) =>
      call<unknown>('GET', `/public/verification${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}` : ''}`, { token }),
  };
}

export type Api = ReturnType<typeof createApi>;
