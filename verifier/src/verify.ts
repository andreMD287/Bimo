/**
 * Algoritmo de verificacion (spec 05 §4, spec 02 §8). Todo numero que se muestra lo calcula quien verifica a partir de
 * datos que coinciden con lo sellado en Stellar: el servidor nunca manda raices ni totales.
 */
import { amendReasonHash, businessDate, encodeEntry, leafHash, merkleRoot, originFlags, type ChannelCode, type Entry } from '@bimo/shared';
import type { SealReader } from './reader';
import type { DayVerification, OnChainSeal, PackageDay, PackageEntry, VerificationPackage, VerificationResult, VerificationSummary } from './types';

export interface TrustedNetwork {
  networkPassphrase: string;
  registryIds: readonly string[];
}

const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g)?.map((x) => parseInt(x, 16)) ?? []);
const bytesToHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

const ACTIVE = new Set(['caja', 'por_cobrar_clientes', 'por_cobrar_psp', 'cuenta_socio', 'bolsillo_usd']);

/** Vendido y por canal de un dia (spec 04 §9): Σ haber − Σ debe de `ventas`; por canal, los debe de activos de ventas y reversos de ventas. */
function sales(entries: PackageEntry[]): { total: number; byChannel: Partial<Record<ChannelCode, number>> } {
  const byId = new Map(entries.map((e) => [e.entry.id, e.entry]));
  let total = 0;
  const byChannel: Partial<Record<ChannelCode, number>> = {};
  for (const { entry: e } of entries) {
    for (const l of e.lines) if (l.account_code === 'ventas') total += (l.direction === 'haber' ? 1 : -1) * Number(l.amount_minor);
    const isSale = e.kind === 'venta';
    const isSaleReversal = e.kind === 'reverso' && e.reverses_entry_id != null && byId.get(e.reverses_entry_id)?.kind === 'venta';
    if (!isSale && !isSaleReversal) continue;
    for (const l of e.lines) {
      if (!ACTIVE.has(l.account_code) || !l.channel) continue;
      if (isSale && l.direction === 'debe') byChannel[l.channel] = (byChannel[l.channel] ?? 0) + Number(l.amount_minor);
      if (isSaleReversal && l.direction === 'haber') byChannel[l.channel] = (byChannel[l.channel] ?? 0) - Number(l.amount_minor);
    }
  }
  return { total, byChannel };
}

function rootOf(entries: PackageEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));
  return merkleRoot(sorted.map((e) => leafHash(hexToBytes(e.salt), encodeEntry(e.entry as Entry & { merchant_id: string }))));
}

function failed(day: PackageDay, reason: string): DayVerification {
  return { date: day.date, result: 'no_coincide', amendments: 0, salesMinor: 0, byChannel: {}, txHash: null, lateEntryIds: [], reason };
}

async function verifyDay(pkg: VerificationPackage, day: PackageDay, reader: SealReader): Promise<DayVerification> {
  const address = pkg.merchant.stellar_address;
  let seals: OnChainSeal[] = [];
  if (address) {
    for (const registryId of pkg.network.registry_ids) {
      seals = await reader.getSeals(registryId, address, day.date);
      if (seals.length > 0) break;
    }
  }
  if (seals.length === 0) {
    // Sin sello en la red: el paquete no puede afirmar nada de este dia
    return { date: day.date, result: 'sin_sellar', amendments: 0, salesMinor: 0, byChannel: {}, txHash: null, lateEntryIds: [], reason: null };
  }

  // Cada asiento debe ser de este comercio y de este dia (spec 02 §8 paso 3)
  const dateStr = String(day.date);
  for (const e of day.entries) {
    if (e.entry.merchant_id !== pkg.merchant.merchant_id) return failed(day, 'asiento de otro comercio');
    if (String(businessDate(Date.parse(e.entry.occurred_at as string))) !== dateStr) return failed(day, 'asiento de otra fecha');
  }
  if (new Set(day.entries.map((e) => e.entry.id)).size !== day.entries.length) return failed(day, 'asientos repetidos');

  const latest = seals[seals.length - 1] as OnChainSeal;
  if (latest.version !== seals.length) return failed(day, 'versiones incompletas en la red');
  const root = rootOf(day.entries);
  const flags = originFlags(day.entries.map((e) => ({ origin: e.entry.origin, clock_suspect: e.clock_suspect })));
  if (!eq(root, latest.root) || day.entries.length !== latest.entryCount || flags !== latest.originFlags) return failed(day, 'la raiz vigente no coincide');

  // Versiones anteriores: conjunto de la version N = conjunto de la N+1 menos los IDs que agrego la N+1 (spec 02 §7)
  const addedBy = new Map(day.seals.map((s) => [s.version, s.added_entry_ids]));
  let current = day.entries;
  for (let v = latest.version; v > 1; v--) {
    const added = addedBy.get(v);
    if (!added || added.length === 0) return failed(day, `falta el detalle de la enmienda ${v}`);
    const addedSet = new Set(added);
    const previous = current.filter((e) => !addedSet.has(e.entry.id));
    if (previous.length !== current.length - addedSet.size) return failed(day, `la enmienda ${v} menciona asientos que no estan`);
    const rec = seals[v - 2] as OnChainSeal;
    if (!eq(rootOf(previous), rec.root) || previous.length !== rec.entryCount) return failed(day, `la version ${v - 1} no coincide`);
    if (!rec.reasonHash && v - 1 > 1) return failed(day, `falta el motivo de la version ${v - 1}`);
    // el motivo guardado en la red debe ser el de los asientos agregados
    const reasonOnChain = (seals[v - 1] as OnChainSeal).reasonHash;
    if (!reasonOnChain || !eq(reasonOnChain, amendReasonHash(added))) return failed(day, `el motivo de la enmienda ${v} no coincide`);
    current = previous;
  }

  const s = sales(day.entries);
  const lastTx = [...day.seals].sort((a, b) => b.version - a.version)[0]?.tx_hash ?? null;
  const late = day.seals.filter((x) => x.version > 1).flatMap((x) => x.added_entry_ids);
  return { date: day.date, result: 'coincide', amendments: latest.version - 1, salesMinor: s.total, byChannel: s.byChannel, txHash: lastTx, lateEntryIds: late, reason: null };
}

/**
 * Verifica un paquete contra Stellar. `trusted` es la red y los contratos que la pagina trae compilados
 * (contracts/deployments/*.json): si el paquete apunta a otros, no se verifica nada (spec 05 §4 paso 1, §6).
 */
export async function verifyPackage(pkg: VerificationPackage, opts: { reader: SealReader; trusted: readonly TrustedNetwork[] }): Promise<VerificationResult> {
  const net = opts.trusted.find((t) => t.networkPassphrase === pkg.network.network_passphrase);
  const trusted = !!net && pkg.network.registry_ids.length > 0 && pkg.network.registry_ids.every((id) => net.registryIds.includes(id));
  const empty: VerificationSummary = { matching: 0, unsealed: 0, mismatched: 0, salesMinor: 0, byChannel: {}, thirdPartyPercent: 0, clockSuspectCount: 0 };
  if (pkg.format !== 'bimo-verification-v1' || !trusted) return { trusted: false, days: [], summary: empty };

  const days: DayVerification[] = [];
  for (const d of pkg.days) days.push(await verifyDay(pkg, d, opts.reader));

  const ok = new Set(days.filter((d) => d.result === 'coincide').map((d) => d.date));
  const okEntries = pkg.days.filter((d) => ok.has(d.date)).flatMap((d) => d.entries);
  const byChannel: Partial<Record<ChannelCode, number>> = {};
  let salesMinor = 0;
  for (const d of days.filter((x) => x.result === 'coincide')) {
    salesMinor += d.salesMinor;
    for (const ch of Object.keys(d.byChannel) as ChannelCode[]) byChannel[ch] = (byChannel[ch] ?? 0) + (d.byChannel[ch] ?? 0);
  }
  const thirds = okEntries.filter((e) => e.entry.origin !== 'declarado').length;
  return {
    trusted: true,
    days,
    summary: {
      matching: ok.size,
      unsealed: days.filter((d) => d.result === 'sin_sellar').length,
      mismatched: days.filter((d) => d.result === 'no_coincide').length,
      salesMinor,
      byChannel,
      thirdPartyPercent: okEntries.length === 0 ? 0 : Math.round((thirds * 100) / okEntries.length),
      clockSuspectCount: okEntries.filter((e) => e.clock_suspect).length,
    },
  };
}

export { bytesToHex };
