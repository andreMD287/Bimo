/**
 * Runtime real de la app: junta sesion, dispositivo, base local, firmante, API y sincronizacion. No depende de React
 * (se prueba con vitest); `AppProvider` lo expone a los hooks. Las pantallas nunca lo importan.
 */
import { authDigest, newUlid, validateSigningPreimage } from '@bimo/shared';
import { RpcSealReader, verifyPackage, type VerificationPackage, type VerificationResult } from '@bimo/verifier';
import { ApiError, createApi, type Api, type LinkRow } from '../api/client';
import { createAuth } from '../auth/otp';
import type { Kv } from '../kv';
import type { Firmante } from '../signer';
import { syncAll, type SyncReport } from '../sync/engine';
import type { Store } from '../store/types';

export interface Deployments {
  network_passphrase: string;
  rpc_url: string;
  registry_ids: string[];
}

export interface RuntimeConfig {
  apiUrl: string;
  supabaseUrl: string;
  anonKey: string;
  deployments: Deployments;
}

export interface AccountInfo {
  merchant_id: string;
  business_name: string;
  stellar_address: string | null;
  account_status: 'pending' | 'deploying' | 'ready' | 'failed';
}

export class SigningError extends Error {
  constructor(readonly code: 'sin_cuenta' | 'nada' | 'preimagen' | 'vencida' | 'cambio' | 'sin_confirmar' | 'red') {
    super(code);
  }
}

const B64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const unB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const dateNum = (d: string) => Number(d.replace(/-/g, ''));

export interface RuntimeDeps {
  config: RuntimeConfig;
  kv: Kv;
  store: Store;
  signer: Firmante;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createRuntime(d: RuntimeDeps) {
  const now = d.now ?? Date.now;
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const auth = createAuth({ supabaseUrl: d.config.supabaseUrl, anonKey: d.config.anonKey, kv: d.kv, now, ...(d.fetchImpl ? { fetchImpl: d.fetchImpl } : {}) });
  const deviceId = () => d.kv.get('bimo.device_id') || null;
  const api: Api = createApi({ baseUrl: d.config.apiUrl, getToken: () => auth.getToken(), getDeviceId: deviceId, now, ...(d.fetchImpl ? { fetchImpl: d.fetchImpl } : {}) });

  const readAccount = (): AccountInfo | null => {
    const raw = d.kv.get('bimo.account');
    return raw ? (JSON.parse(raw) as AccountInfo) : null;
  };

  let syncing: Promise<SyncReport> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((f) => f());
  const rt = {
    /** Avisa cuando la base local cambio por una sincronizacion o por la cuenta (la UI se refresca). */
    onChange(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    api,
    auth,
    store: d.store,
    signer: d.signer,
    deviceId,
    account: readAccount,
    /** Hay sesion y dispositivo registrado: la app esta lista para vender y sincronizar. */
    get ready() {
      return auth.session() !== null && deviceId() !== null;
    },

    sendCode: (email: string) => auth.sendCode(email),

    /**
     * CU-01 (spec 03 §6): verifica el codigo, crea el comercio, registra este dispositivo con la prueba de posesion
     * del reto y deja la cuenta Stellar preparandose.
     */
    async register(input: { email: string; code: string; businessName: string }): Promise<AccountInfo> {
      await auth.verifyCode(input.email, input.code);
      try {
        await api.createMerchant({ business_name: input.businessName.trim().slice(0, 80) });
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'already_exists')) throw e; // el usuario ya tenia comercio
      }
      if (!deviceId()) {
        const ch = await api.challenge();
        const id = newUlid();
        const signature = d.signer.sign(unB64(ch.challenge));
        await api.registerDevice({
          device_id: id,
          challenge_id: ch.challenge_id,
          public_key: B64(d.signer.publicKey()),
          key_kind: d.signer.kind,
          signature: B64(signature),
        });
        d.kv.set('bimo.device_id', id);
      }
      return rt.refreshAccount();
    },

    async refreshAccount(): Promise<AccountInfo> {
      const me = await api.me();
      const info: AccountInfo = { merchant_id: me.merchant_id, business_name: me.business_name, stellar_address: me.stellar_address, account_status: me.account_status };
      d.kv.set('bimo.account', JSON.stringify(info));
      notify();
      return info;
    },

    /** Push y pull. Una sola sincronizacion a la vez. */
    sync(): Promise<SyncReport> {
      const id = deviceId();
      if (!id) return Promise.resolve({ online: false, pushed: 0, rejected: 0, pulled: 0, clockSkewMs: null });
      syncing ??= syncAll({ store: d.store, api, deviceId: id, now }).finally(() => {
        syncing = null;
        notify();
      });
      return syncing;
    },

    /**
     * CU-04 (spec 03 §5): pull completo, pide la solicitud pendiente, VALIDA la preimagen contra la base local,
     * calcula `auth_digest` por su cuenta, firma y espera a que el dia quede sellado. Nunca firma un hash ajeno.
     */
    async signPending(opts: { onPhase?: (p: 'validando' | 'firmando' | 'guardando') => void; timeoutMs?: number } = {}): Promise<{ sealedDates: string[] }> {
      const acc = rt.account();
      if (!acc?.stellar_address || acc.account_status !== 'ready') {
        const fresh = await rt.refreshAccount().catch(() => acc);
        if (!fresh?.stellar_address || fresh.account_status !== 'ready') throw new SigningError('sin_cuenta');
      }
      const address = (rt.account() as AccountInfo).stellar_address as string;
      opts.onPhase?.('validando');
      const rep = await rt.sync(); // sube lo pendiente y hace un pull completo (spec 04 §6)
      if (!rep.online) throw new SigningError('red');
      let pending;
      try {
        pending = (await api.signingPending()).request;
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) throw new SigningError('red');
        throw e;
      }
      if (!pending) throw new SigningError('nada');
      await rt.sync(); // la solicitud trae asientos que otros dispositivos pudieron crear

      const snap = d.store.snapshot();
      const localDays = snap.days
        .filter((x) => x.status === 'cerrado' || x.status === 'requiere_enmienda')
        .map((x) => ({ date: dateNum(x.business_date), entryCount: snap.entries.filter((e) => e.asiento.business_date === x.business_date && e.sync_status !== 'rechazado').length }));
      const preimage = unB64(pending.preimage_xdr);
      const check = validateSigningPreimage(preimage, {
        networkPassphrase: d.config.deployments.network_passphrase,
        registryId: d.config.deployments.registry_ids[d.config.deployments.registry_ids.length - 1] as string,
        merchantAddress: address,
        localDays,
      });
      if (!check.ok) throw new SigningError(check.reason === 'dias' ? 'cambio' : 'preimagen');

      opts.onPhase?.('firmando');
      const signature = d.signer.sign(check.authDigest);
      try {
        await api.sendSignature(pending.signing_request_id, B64(signature));
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'signature_expired' || e.code === 'request_superseded')) throw new SigningError(e.code === 'signature_expired' ? 'vencida' : 'cambio');
        throw e;
      }

      opts.onPhase?.('guardando');
      const dates = pending.items.map((i) => i.date);
      const deadline = now() + (opts.timeoutMs ?? 90_000);
      for (;;) {
        await rt.sync();
        const days = d.store.snapshot().days.filter((x) => dates.includes(x.business_date));
        if (days.length === dates.length && days.every((x) => x.status === 'sellado' || x.status === 'requiere_enmienda')) return { sealedDates: dates };
        if (now() >= deadline) throw new SigningError('sin_confirmar');
        await sleep(2000);
      }
    },

    createLink: (b: { date_from: string; date_to: string; expires_in_days: 7 | 30 | 90 }) => api.createLink(b),
    listLinks: async (): Promise<LinkRow[]> => (await api.links()).links,
    revokeLink: (id: string) => api.revokeLink(id),

    /** Pagina del verificador (spec 05 §4): baja el paquete publico y lo comprueba contra Stellar en este dispositivo. */
    async verify(token: string, opts: { reader?: RpcSealReader } = {}): Promise<{ pkg: VerificationPackage; result: VerificationResult }> {
      const first = (await api.verificationPackage(token)) as VerificationPackage;
      const pkg: VerificationPackage = first;
      // el servidor entrega como maximo 31 dias por peticion: se piden los tramos que faltan
      let from = nextDay(lastDate(first) ?? first.link.date_to);
      while (from <= first.link.date_to) {
        const to = addDays(from, 30) < first.link.date_to ? addDays(from, 30) : first.link.date_to;
        const part = (await api.verificationPackage(token, from, to)) as VerificationPackage;
        pkg.days.push(...part.days);
        from = nextDay(to);
      }
      const reader = opts.reader ?? new RpcSealReader(first.network.rpc_url, d.fetchImpl);
      const result = await verifyPackage(pkg, { reader, trusted: [{ networkPassphrase: d.config.deployments.network_passphrase, registryIds: d.config.deployments.registry_ids }] });
      return { pkg, result };
    },
  };
  return rt;
}

const iso = (n: number) => String(n).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const lastDate = (p: VerificationPackage) => (p.days.length ? iso(p.days[p.days.length - 1]!.date) : null);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const nextDay = (date: string) => addDays(date, 1);

export type Runtime = ReturnType<typeof createRuntime>;
export { authDigest };
