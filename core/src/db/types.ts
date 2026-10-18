/**
 * Tipos de las tablas del spec 01 (v1.4) para Kysely. Los nombres son los del spec.
 * Convenciones del cliente `pg` de bimo-core: `bigint` llega como `number` entero seguro (ver client.ts),
 * `timestamptz` como `Date`, `bytea` como `Buffer`.
 */
import type { ColumnType, Generated } from 'kysely';

export type MemberRole = 'dueno' | 'empleado';
export type KeyKind = 'secure_enclave_p256' | 'software_p256' | 'passkey_webauthn';
export type CurrencyCode = 'COP' | 'USDC';
export type AccountType = 'activo' | 'pasivo' | 'ingreso' | 'gasto' | 'patrimonio';
export type AccountCode =
  | 'caja'
  | 'por_cobrar_clientes'
  | 'por_cobrar_psp'
  | 'cuenta_socio'
  | 'bolsillo_usd'
  | 'adelantos_por_pagar'
  | 'ventas'
  | 'comisiones'
  | 'diferencias_caja'
  | 'gastos'
  | 'retiros_dueno';
export type ChannelCode = 'efectivo' | 'breb' | 'datafono_externo' | 'tap_to_pay' | 'fiado' | 'transferencia_otro';
export type EntryKind = 'venta' | 'abono_cliente' | 'liquidacion_psp' | 'ajuste_caja' | 'reverso' | 'conversion' | 'salida';
export type EntryOrigin = 'declarado' | 'verificado' | 'on_chain';
export type LineDirection = 'debe' | 'haber';
export type DayStatus = 'abierto' | 'cerrado' | 'firmado' | 'sellado' | 'requiere_enmienda';
export type SealStatus = 'preparado' | 'firmado' | 'enviado' | 'confirmado' | 'fallido';
export type OutboxStatus = 'pendiente' | 'enviado' | 'fallido';
export type SigningStatus = 'abierta' | 'firmada' | 'vencida' | 'reemplazada';
export type AccountStatus = 'pending' | 'deploying' | 'ready' | 'failed';

type Ts = ColumnType<Date, Date | string | undefined, Date | string>;
type TsRequired = ColumnType<Date, Date | string, Date | string>;

export interface MerchantsTable {
  id: string;
  stellar_address: string | null;
  network: 'testnet' | 'mainnet';
  account_status: Generated<AccountStatus>;
  created_at: Ts;
  forgotten_at: Date | null;
}

export interface MerchantProfilesTable {
  merchant_id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  city: string | null;
}

export interface MerchantMembersTable {
  merchant_id: string;
  user_id: string;
  role: MemberRole;
  created_at: Ts;
}

export interface DevicesTable {
  id: string;
  merchant_id: string;
  user_id: string;
  key_kind: KeyKind;
  public_key: Buffer;
  signer_registered_tx: string | null;
  created_at: Ts;
  revoked_at: Date | null;
}

export interface LedgerAccountsTable {
  id: string;
  merchant_id: string;
  code: AccountCode;
  type: AccountType;
  currency: CurrencyCode;
}

export interface MerchantChannelsTable {
  id: string;
  merchant_id: string;
  name: string;
  channel: ChannelCode;
  commission_bps: number;
  settlement_days: number;
  active: Generated<boolean>;
  created_at: TsRequired;
  updated_at: TsRequired;
}

export interface CustomersTable {
  id: string;
  merchant_id: string;
  display_name: string;
  phone: string | null;
  created_at: TsRequired;
  updated_at: TsRequired;
}

export interface BusinessDaysTable {
  id: string;
  merchant_id: string;
  business_date: ColumnType<string, string, string>; // 'AAAA-MM-DD' (ver client.ts: date llega como texto)
  status: Generated<DayStatus>;
  counted_cash_minor: number | null;
  closed_at: Date | null;
  closed_by: string | null;
  current_seal_version: Generated<number>;
}

export interface JournalEntriesTable {
  id: string;
  merchant_id: string;
  day_id: ColumnType<string, string | undefined, never>; // lo resuelve el trigger DB-03
  business_date: ColumnType<string, string | undefined, never>; // lo calcula el trigger DB-02
  occurred_at: TsRequired;
  recorded_at: Ts;
  kind: EntryKind;
  origin: EntryOrigin;
  reverses_entry_id: string | null;
  external_source: string | null;
  external_ref: string | null;
  note: string | null;
  device_id: string | null;
  created_by: string | null;
  clock_suspect: Generated<boolean>;
}

export interface JournalLinesTable {
  id: string;
  entry_id: string;
  line_no: number;
  account_id: string;
  direction: LineDirection;
  amount_minor: number;
  currency: CurrencyCode;
  channel: ChannelCode | null;
  customer_id: string | null;
}

export interface EntrySaltsTable {
  entry_id: string;
  salt: Buffer;
  created_at: Ts;
}

export interface SigningRequestsTable {
  id: string;
  merchant_id: string;
  status: Generated<SigningStatus>;
  preimage_xdr: Buffer;
  expiration_ledger: number;
  expires_at: TsRequired;
  created_at: Ts;
  closed_at: Date | null;
}

export interface SealsTable {
  id: string;
  day_id: string;
  signing_request_id: string | null;
  version: number;
  merkle_root: Buffer;
  entry_count: number;
  origin_flags: number;
  amend_reason_hash: Buffer | null;
  merchant_signature: Buffer | null;
  attester_signature: Buffer | null;
  status: Generated<SealStatus>;
  tx_hash: string | null;
  ledger_seq: number | null;
  error: string | null;
  created_at: Ts;
  confirmed_at: Date | null;
}

export interface SealLeavesTable {
  seal_id: string;
  leaf_index: number;
  entry_id: string;
  leaf_hash: Buffer;
}

export interface VerificationLinksTable {
  id: string;
  merchant_id: string;
  token_hash: Buffer;
  date_from: string;
  date_to: string;
  expires_at: TsRequired;
  revoked_at: Date | null;
  created_at: Ts;
  view_count: Generated<number>;
}

export interface InboxEventsTable {
  id: string;
  source: string;
  external_id: string;
  payload: unknown;
  signature_valid: boolean;
  received_at: Ts;
  processed_at: Date | null;
  error: string | null;
}

export interface OutboxMessagesTable {
  id: string;
  topic: string;
  payload: unknown;
  status: Generated<OutboxStatus>;
  attempts: Generated<number>;
  next_attempt_at: Ts;
  last_error: string | null;
  created_at: Ts;
}

export interface ChainEventsTable {
  tx_hash: string;
  event_index: number;
  contract_id: string;
  ledger_seq: number;
  event_type: string;
  topics: unknown;
  data: unknown;
  ingested_at: Ts;
}

export interface MerchantChangesTable {
  seq: Generated<number>;
  merchant_id: string;
  entity: 'entry' | 'customer' | 'channel' | 'day' | 'seal';
  entity_id: string;
  at: Ts;
}

export interface IndexerCursorTable {
  contract_id: string;
  last_ledger: number;
}

export interface AuditLogTable {
  id: Generated<number>;
  actor: string;
  action: string;
  target: string | null;
  detail: unknown;
  at: Ts;
}

export interface Database {
  merchants: MerchantsTable;
  merchant_profiles: MerchantProfilesTable;
  merchant_members: MerchantMembersTable;
  devices: DevicesTable;
  ledger_accounts: LedgerAccountsTable;
  merchant_channels: MerchantChannelsTable;
  customers: CustomersTable;
  business_days: BusinessDaysTable;
  journal_entries: JournalEntriesTable;
  journal_lines: JournalLinesTable;
  entry_salts: EntrySaltsTable;
  signing_requests: SigningRequestsTable;
  seals: SealsTable;
  seal_leaves: SealLeavesTable;
  verification_links: VerificationLinksTable;
  inbox_events: InboxEventsTable;
  outbox_messages: OutboxMessagesTable;
  chain_events: ChainEventsTable;
  merchant_changes: MerchantChangesTable;
  indexer_cursor: IndexerCursorTable;
  audit_log: AuditLogTable;
}
