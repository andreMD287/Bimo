// Cálculos de "Hoy" (spec 04 §9) y saldos (spec 01 §5, vista account_balances).
// Funciones puras sobre asientos y líneas: las usan los hooks, nunca las pantallas.

import type { AccountCode, Asiento, BusinessDate, ChannelCode } from './tipos';

const CUENTAS_ACTIVO: ReadonlySet<AccountCode> = new Set([
  'caja',
  'por_cobrar_clientes',
  'por_cobrar_psp',
  'cuenta_socio',
  'bolsillo_usd',
]);

export function esCuentaDeActivo(code: AccountCode): boolean {
  return CUENTAS_ACTIVO.has(code);
}

/** Saldo con signo natural (Σ debe − Σ haber) de una cuenta COP en todos los asientos. */
export function saldo(asientos: readonly Asiento[], cuenta: AccountCode): number {
  let s = 0;
  for (const a of asientos)
    for (const l of a.lines)
      if (l.account_code === cuenta && l.currency === 'COP')
        s += l.direction === 'debe' ? l.amount_minor : -l.amount_minor;
  return s;
}

/** Σ debe − Σ haber de una cuenta, solo en los asientos de una fecha. */
function movimientoDelDia(asientos: readonly Asiento[], fecha: BusinessDate, cuenta: AccountCode): number {
  return saldo(
    asientos.filter((a) => a.business_date === fecha),
    cuenta,
  );
}

/** Vendido en la fecha: Σ haber − Σ debe de `ventas`. */
export function vendido(asientos: readonly Asiento[], fecha: BusinessDate): number {
  return -movimientoDelDia(asientos, fecha, 'ventas');
}

/**
 * Vendido por canal: en asientos `venta` y sus reversos, Σ de las líneas `debe`
 * en cuentas de activo agrupadas por `channel`; los reversos restan.
 */
export function vendidoPorCanal(
  asientos: readonly Asiento[],
  fecha: BusinessDate,
): Partial<Record<ChannelCode, number>> {
  const porId = new Map(asientos.map((a) => [a.id, a]));
  const out: Partial<Record<ChannelCode, number>> = {};
  for (const a of asientos) {
    if (a.business_date !== fecha) continue;
    const esVenta = a.kind === 'venta';
    const esReversoDeVenta =
      a.kind === 'reverso' && a.reverses_entry_id !== null && porId.get(a.reverses_entry_id)?.kind === 'venta';
    if (!esVenta && !esReversoDeVenta) continue;
    for (const l of a.lines) {
      if (!esCuentaDeActivo(l.account_code) || l.channel === null) continue;
      if (esVenta && l.direction === 'debe') out[l.channel] = (out[l.channel] ?? 0) + l.amount_minor;
      if (esReversoDeVenta && l.direction === 'haber') out[l.channel] = (out[l.channel] ?? 0) - l.amount_minor;
    }
  }
  return out;
}

/** Comisiones de la fecha: Σ debe − Σ haber de `comisiones`. */
export function comisionesDelDia(asientos: readonly Asiento[], fecha: BusinessDate): number {
  return movimientoDelDia(asientos, fecha, 'comisiones');
}

/** Salidas de la fecha: Σ debe de `gastos` y de `retiros_dueno`. */
export function salidasDelDia(asientos: readonly Asiento[], fecha: BusinessDate): number {
  let s = 0;
  for (const a of asientos) {
    if (a.business_date !== fecha) continue;
    for (const l of a.lines)
      if ((l.account_code === 'gastos' || l.account_code === 'retiros_dueno') && l.direction === 'debe')
        s += l.amount_minor;
  }
  return s;
}

/** Saldo de `por_cobrar_clientes` por cliente (detalle de "Te deben"). */
export function saldoPorCliente(asientos: readonly Asiento[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of asientos)
    for (const l of a.lines)
      if (l.account_code === 'por_cobrar_clientes' && l.customer_id !== null)
        out.set(l.customer_id, (out.get(l.customer_id) ?? 0) + (l.direction === 'debe' ? l.amount_minor : -l.amount_minor));
  return out;
}

/** Cantidad de ventas de la fecha (asientos `venta` que no fueron reversados). */
export function cantidadVentas(asientos: readonly Asiento[], fecha: BusinessDate): number {
  const reversados = new Set(asientos.filter((a) => a.kind === 'reverso').map((a) => a.reverses_entry_id));
  return asientos.filter((a) => a.business_date === fecha && a.kind === 'venta' && !reversados.has(a.id)).length;
}
