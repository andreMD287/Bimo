// Tipos del dominio. Los nombres y valores salen del spec 01 (§3, §4.2 y §8);
// no se agregan valores a los enums aquí. Lo que es solo del front está marcado.

export type CurrencyCode = 'COP' | 'USDC';

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

export type ChannelCode =
  | 'efectivo'
  | 'breb'
  | 'datafono_externo'
  | 'tap_to_pay'
  | 'fiado'
  | 'transferencia_otro';

export type EntryKind =
  | 'venta'
  | 'abono_cliente'
  | 'liquidacion_psp'
  | 'ajuste_caja'
  | 'reverso'
  | 'conversion'
  | 'salida';

export type EntryOrigin = 'declarado' | 'verificado' | 'on_chain';
export type LineDirection = 'debe' | 'haber';
export type DayStatus = 'abierto' | 'cerrado' | 'firmado' | 'sellado' | 'requiere_enmienda';
export type AccountStatus = 'pending' | 'deploying' | 'ready' | 'failed';

/** Fecha de negocio en Bogotá, `AAAA-MM-DD` (spec 01 §7). */
export type BusinessDate = string;

/** Línea de un asiento, como `local_lines` (spec 01 §8). Montos en unidades mínimas. */
export interface Linea {
  id: string;
  line_no: number;
  account_code: AccountCode;
  direction: LineDirection;
  amount_minor: number;
  currency: CurrencyCode;
  channel: ChannelCode | null;
  customer_id: string | null;
}

/** Asiento con sus líneas, como `local_entries` (spec 01 §8). Nunca se edita. */
export interface Asiento {
  id: string;
  business_date: BusinessDate;
  occurred_at: string; // instante UTC ISO con milisegundos
  kind: EntryKind;
  origin: EntryOrigin;
  reverses_entry_id: string | null;
  note: string | null;
  lines: Linea[];
}

export interface Cliente {
  id: string;
  display_name: string;
}

/**
 * SOLO FRONT (tarea A-00): los specs 01 y 04 todavía no modelan la configuración
 * de canales del Blueprint. `channel` sí es el enum del spec.
 */
export interface CanalConfig {
  id: string;
  nombre: string; // "Datáfono Bold", "Nequi"...
  channel: ChannelCode;
  comision_bps: number; // puntos básicos: 150 = 1,5 %
  dias_consignacion: number; // días calendario hasta que llega la plata
  activo: boolean;
}
