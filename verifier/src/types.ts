/** Paquete de verificacion `bimo-verification-v1` (spec 05 §3) tal como lo entrega la API publica de bimo-core. */
import type { ChannelCode, Entry } from '@bimo/shared';

export interface PackageEntry {
  entry: Entry & { merchant_id: string };
  salt: string; // hex
  clock_suspect: boolean;
}

export interface PackageDay {
  /** AAAAMMDD */
  date: number;
  status: string;
  entries: PackageEntry[];
  seals: Array<{ version: number; tx_hash: string | null; added_entry_ids: string[] }>;
}

export interface VerificationPackage {
  format: 'bimo-verification-v1';
  merchant: { merchant_id: string; business_name: string; stellar_address: string | null };
  network: { network_passphrase: string; rpc_url: string; registry_ids: string[] };
  link: { date_from: string; date_to: string; expires_at: string };
  days: PackageDay[];
}

/** Registro leido de `bimo-registry` (spec 03 §4.1). */
export interface OnChainSeal {
  version: number;
  root: Uint8Array;
  entryCount: number;
  originFlags: number;
  reasonHash: Uint8Array | null;
}

export type DayResult = 'coincide' | 'sin_sellar' | 'no_coincide';

export interface DayVerification {
  date: number;
  result: DayResult;
  /** Veces que se enmendo (version vigente - 1). */
  amendments: number;
  /** Solo si coincide: ventas del dia y por canal, calculadas aqui (nunca vienen del servidor). */
  salesMinor: number;
  byChannel: Partial<Record<ChannelCode, number>>;
  txHash: string | null;
  /** IDs de los asientos que llegaron tarde (enmiendas). */
  lateEntryIds: string[];
  /** Motivo en lenguaje para depurar (no se muestra tal cual al analista). */
  reason: string | null;
}

export interface VerificationSummary {
  matching: number;
  unsealed: number;
  mismatched: number;
  /** Solo de los dias que coinciden. */
  salesMinor: number;
  byChannel: Partial<Record<ChannelCode, number>>;
  /** % de asientos `verificado` u `on_chain` frente a todos los de los dias que coinciden. */
  thirdPartyPercent: number;
  clockSuspectCount: number;
}

export interface VerificationResult {
  /** false si el paquete apunta a una red o a contratos que la pagina no trae compilados. */
  trusted: boolean;
  days: DayVerification[];
  summary: VerificationSummary;
}
