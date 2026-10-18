/**
 * Tipos del dominio con los enums del spec 01 §3 (mismos nombres). Dinero: enteros en unidades minimas; tiempo: milisegundos UTC.
 * Sin dependencias de Node ni de React Native.
 */

export const MEMBER_ROLES = ['dueno', 'empleado'] as const;
export const KEY_KINDS = ['secure_enclave_p256', 'software_p256', 'passkey_webauthn'] as const;
export const CURRENCY_CODES = ['COP', 'USDC'] as const;
export const ACCOUNT_TYPES = ['activo', 'pasivo', 'ingreso', 'gasto', 'patrimonio'] as const;
export const ACCOUNT_CODES = [
  'caja', 'por_cobrar_clientes', 'por_cobrar_psp', 'cuenta_socio', 'bolsillo_usd', 'adelantos_por_pagar',
  'ventas', 'comisiones', 'diferencias_caja', 'gastos', 'retiros_dueno',
] as const;
export const CHANNEL_CODES = ['efectivo', 'breb', 'datafono_externo', 'tap_to_pay', 'fiado', 'transferencia_otro'] as const;
export const ENTRY_KINDS = ['venta', 'abono_cliente', 'liquidacion_psp', 'ajuste_caja', 'reverso', 'conversion', 'salida'] as const;
export const ENTRY_ORIGINS = ['declarado', 'verificado', 'on_chain'] as const;
export const LINE_DIRECTIONS = ['debe', 'haber'] as const;
export const DAY_STATUSES = ['abierto', 'cerrado', 'firmado', 'sellado', 'requiere_enmienda'] as const;
export const SEAL_STATUSES = ['preparado', 'firmado', 'enviado', 'confirmado', 'fallido'] as const;
export const OUTBOX_STATUSES = ['pendiente', 'enviado', 'fallido'] as const;
export const SIGNING_STATUSES = ['abierta', 'firmada', 'vencida', 'reemplazada'] as const;
export const ACCOUNT_STATUSES = ['pending', 'deploying', 'ready', 'failed'] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];
export type KeyKind = (typeof KEY_KINDS)[number];
export type CurrencyCode = (typeof CURRENCY_CODES)[number];
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type AccountCode = (typeof ACCOUNT_CODES)[number];
export type ChannelCode = (typeof CHANNEL_CODES)[number];
export type EntryKind = (typeof ENTRY_KINDS)[number];
export type EntryOrigin = (typeof ENTRY_ORIGINS)[number];
export type LineDirection = (typeof LINE_DIRECTIONS)[number];
export type DayStatus = (typeof DAY_STATUSES)[number];
export type SealStatus = (typeof SEAL_STATUSES)[number];
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];
export type SigningStatus = (typeof SIGNING_STATUSES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Tipo de cada cuenta del ledger (spec 01 §4.2). */
export const ACCOUNT_TYPE_OF: Record<AccountCode, AccountType> = {
  caja: 'activo',
  por_cobrar_clientes: 'activo',
  por_cobrar_psp: 'activo',
  cuenta_socio: 'activo',
  bolsillo_usd: 'activo',
  adelantos_por_pagar: 'pasivo',
  ventas: 'ingreso',
  comisiones: 'gasto',
  diferencias_caja: 'gasto',
  gastos: 'gasto',
  retiros_dueno: 'patrimonio',
};

/** Linea de un asiento. `amount_minor` es un entero (COP en centavos, USDC en 10^-7). */
export interface EntryLine {
  line_no: number;
  account_code: AccountCode;
  direction: LineDirection;
  amount_minor: number | bigint;
  currency: CurrencyCode;
  channel?: ChannelCode | null | undefined;
  customer_id?: string | null | undefined;
  /** ULID de la linea (solo en el push; no entra al formato canonico). */
  id?: string | undefined;
}

/** Asiento tal como viaja en el push (spec 04 §5.1) y como entra al formato canonico (spec 02 §3). */
export interface Entry {
  id: string;
  /** Presente al codificar (spec 02); el push no lo manda, lo pone el servidor. */
  merchant_id?: string | undefined;
  /** ISO-8601 UTC con milisegundos, o milisegundos desde 1970. */
  occurred_at: string | number;
  kind: EntryKind;
  origin: EntryOrigin;
  reverses_entry_id?: string | null | undefined;
  external_source?: string | null | undefined;
  external_ref?: string | null | undefined;
  note?: string | null | undefined;
  lines: EntryLine[];
}
