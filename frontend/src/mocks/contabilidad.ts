// Construcción de asientos según spec 01 §6 y spec 04 §4.1–4.2.
// SIMULACIÓN: en la app real los IDs son ULID y las reglas V-01..V-11 vienen del
// paquete `shared/`; aquí solo se arma lo necesario para los datos de ejemplo.

import type { AccountCode, Asiento, CanalConfig, ChannelCode, Linea } from '../lib/tipos';
import { fechaBogota } from '../lib/fechas';

let contador = 0;
/** ID de prueba. En la app real es un ULID generado con `shared/`. */
export function nuevoId(prefijo: string): string {
  contador += 1;
  return `${prefijo}_${Date.now().toString(36)}_${contador.toString(36)}`;
}

/** Cuenta de activo que recibe un cobro por cada canal (spec 01 §6, spec 04 §4.2). */
export function cuentaDeCanal(channel: ChannelCode): AccountCode {
  switch (channel) {
    case 'efectivo':
      return 'caja';
    case 'breb':
    case 'transferencia_otro':
      return 'cuenta_socio';
    case 'datafono_externo':
    case 'tap_to_pay':
      return 'por_cobrar_psp';
    case 'fiado':
      return 'por_cobrar_clientes';
  }
}

type LineaSinId = Omit<Linea, 'id' | 'line_no' | 'currency'>;

function armar(
  base: Omit<Asiento, 'id' | 'lines' | 'business_date'>,
  lineas: LineaSinId[],
  id?: string,
): Asiento {
  const entryId = id ?? nuevoId('as');
  return {
    ...base,
    id: entryId,
    business_date: fechaBogota(base.occurred_at),
    lines: lineas.map((l, i) => ({ ...l, id: `${entryId}_l${i + 1}`, line_no: i + 1, currency: 'COP' })),
  };
}

export interface PagoVenta {
  canal: CanalConfig;
  monto_minor: number;
  customer_id?: string | null; // obligatorio si el canal es fiado
}

/**
 * Venta: un débito por cada pago (venta dividida = un solo asiento) y un haber
 * a `ventas` por el total. El saldo pendiente de un anticipo entra como pago
 * con canal fiado (simplificación del front, ver Bloqueos A-00).
 */
export function asientoVenta(occurred_at: string, pagos: PagoVenta[], note: string | null, id?: string): Asiento {
  const total = pagos.reduce((s, p) => s + p.monto_minor, 0);
  const lineas: LineaSinId[] = pagos.map((p) => ({
    account_code: cuentaDeCanal(p.canal.channel),
    direction: 'debe',
    amount_minor: p.monto_minor,
    channel: p.canal.channel,
    customer_id: p.canal.channel === 'fiado' ? (p.customer_id ?? null) : null,
  }));
  lineas.push({ account_code: 'ventas', direction: 'haber', amount_minor: total, channel: null, customer_id: null });
  return armar(
    { occurred_at, kind: 'venta', origin: 'declarado', reverses_entry_id: null, note },
    lineas,
    id,
  );
}

/** Abono de un cliente: D caja o cuenta_socio / H por_cobrar_clientes. */
export function asientoAbono(occurred_at: string, canal: CanalConfig, customer_id: string, monto: number): Asiento {
  return armar(
    { occurred_at, kind: 'abono_cliente', origin: 'declarado', reverses_entry_id: null, note: null },
    [
      { account_code: cuentaDeCanal(canal.channel), direction: 'debe', amount_minor: monto, channel: canal.channel, customer_id: null },
      { account_code: 'por_cobrar_clientes', direction: 'haber', amount_minor: monto, channel: 'fiado', customer_id },
    ],
  );
}

/** Reverso: espejo exacto del asiento original con la dirección invertida (V-09). */
export function asientoReverso(occurred_at: string, original: Asiento, note: string | null): Asiento {
  return armar(
    { occurred_at, kind: 'reverso', origin: 'declarado', reverses_entry_id: original.id, note },
    original.lines.map((l) => ({
      account_code: l.account_code,
      direction: l.direction === 'debe' ? 'haber' : 'debe',
      amount_minor: l.amount_minor,
      channel: l.channel,
      customer_id: l.customer_id,
    })),
  );
}

/** Ajuste de caja al cerrar: diferencia > 0 es faltante, < 0 es sobrante. */
export function asientoAjusteCaja(occurred_at: string, faltante_minor: number): Asiento {
  const monto = Math.abs(faltante_minor);
  const faltante = faltante_minor > 0;
  return armar(
    { occurred_at, kind: 'ajuste_caja', origin: 'declarado', reverses_entry_id: null, note: null },
    [
      faltante
        ? { account_code: 'diferencias_caja', direction: 'debe', amount_minor: monto, channel: null, customer_id: null }
        : { account_code: 'caja', direction: 'debe', amount_minor: monto, channel: 'efectivo', customer_id: null },
      faltante
        ? { account_code: 'caja', direction: 'haber', amount_minor: monto, channel: 'efectivo', customer_id: null }
        : { account_code: 'diferencias_caja', direction: 'haber', amount_minor: monto, channel: null, customer_id: null },
    ],
  );
}

/** Pago a un proveedor en efectivo: D gastos / H caja. */
export function asientoGasto(occurred_at: string, monto: number, note: string | null): Asiento {
  return armar(
    { occurred_at, kind: 'salida', origin: 'declarado', reverses_entry_id: null, note },
    [
      { account_code: 'gastos', direction: 'debe', amount_minor: monto, channel: null, customer_id: null },
      { account_code: 'caja', direction: 'haber', amount_minor: monto, channel: 'efectivo', customer_id: null },
    ],
  );
}

/**
 * Consignación de un datáfono: D cuenta_socio (neto) · D comisiones / H por_cobrar_psp.
 * En los datos de ejemplo llega como `verificado` (lo crearía `bimo-core` con el PSP).
 */
export function asientoLiquidacion(
  occurred_at: string,
  channel: ChannelCode,
  bruto: number,
  comision: number,
): Asiento {
  const lineas: LineaSinId[] = [
    { account_code: 'cuenta_socio', direction: 'debe', amount_minor: bruto - comision, channel, customer_id: null },
  ];
  if (comision > 0)
    lineas.push({ account_code: 'comisiones', direction: 'debe', amount_minor: comision, channel: null, customer_id: null });
  lineas.push({ account_code: 'por_cobrar_psp', direction: 'haber', amount_minor: bruto, channel, customer_id: null });
  return armar({ occurred_at, kind: 'liquidacion_psp', origin: 'verificado', reverses_entry_id: null, note: null }, lineas);
}

