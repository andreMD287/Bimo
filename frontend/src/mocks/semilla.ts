// Datos de ejemplo: "Tienda Doña Marta", con 7 días de historia relativos a hoy
// en Bogotá: 5 días sellados, ayer cerrado (falta confirmación) y hoy abierto.
// SIMULACIÓN: nada de esto viene de un servidor.

import type { Asiento, BusinessDate, CanalConfig, Cliente } from '../lib/tipos';
import { hoyBogota, instanteBogota, sumarDias } from '../lib/fechas';
import { comisionEstimada } from '../lib/dinero';
import { saldo } from '../lib/hoy';
import {
  asientoAbono,
  asientoAjusteCaja,
  asientoGasto,
  asientoLiquidacion,
  asientoReverso,
  asientoVenta,
  type PagoVenta,
} from './contabilidad';
import { txHashSimulado, type DiaMock, type EstadoMock, type MetaAsiento } from './estado';

const P = 100; // centavos por peso, para escribir los montos en pesos

export const CANALES_SEMILLA: CanalConfig[] = [
  { id: 'canal_efectivo', nombre: 'Efectivo', channel: 'efectivo', comision_bps: 0, dias_consignacion: 0, activo: true },
  { id: 'canal_breb', nombre: 'Bre-B', channel: 'breb', comision_bps: 0, dias_consignacion: 0, activo: true },
  { id: 'canal_bold', nombre: 'Datáfono Bold', channel: 'datafono_externo', comision_bps: 299, dias_consignacion: 1, activo: true },
  { id: 'canal_redeban', nombre: 'Datáfono Redeban', channel: 'datafono_externo', comision_bps: 250, dias_consignacion: 3, activo: true },
  { id: 'canal_nequi', nombre: 'Nequi', channel: 'transferencia_otro', comision_bps: 0, dias_consignacion: 0, activo: true },
  { id: 'canal_daviplata', nombre: 'Daviplata', channel: 'transferencia_otro', comision_bps: 0, dias_consignacion: 0, activo: false },
  { id: 'canal_fiado', nombre: 'Fiado', channel: 'fiado', comision_bps: 0, dias_consignacion: 0, activo: true },
];

export const CLIENTES_SEMILLA: Cliente[] = [
  { id: 'cli_rosa', display_name: 'Doña Rosa' },
  { id: 'cli_camila', display_name: 'Camila (pedido de torta)' },
  { id: 'cli_jorge', display_name: 'Don Jorge' },
];

function canal(id: string): CanalConfig {
  const c = CANALES_SEMILLA.find((x) => x.id === id);
  if (!c) throw new Error(`canal ${id}`);
  return c;
}

type VentaSemilla = {
  h: number; // hora local
  m: number;
  pagos: [canalId: string, pesos: number, customer?: string][];
  nota?: string;
  anticipoTotal?: number; // pesos
};

/** Ventas de los días pasados: [días atrás, ventas]. */
const PASADO: [number, VentaSemilla[]][] = [
  [6, [
    { h: 7, m: 15, pagos: [['canal_efectivo', 12_500]] },
    { h: 8, m: 40, pagos: [['canal_breb', 34_000]] },
    { h: 10, m: 5, pagos: [['canal_bold', 86_000]] },
    { h: 12, m: 30, pagos: [['canal_efectivo', 9_800]] },
    { h: 16, m: 10, pagos: [['canal_nequi', 22_000]] },
    { h: 18, m: 45, pagos: [['canal_fiado', 40_000, 'cli_rosa']] },
  ]],
  [5, [
    { h: 7, m: 5, pagos: [['canal_efectivo', 6_200]] },
    { h: 9, m: 20, pagos: [['canal_redeban', 145_000]] },
    { h: 11, m: 0, pagos: [['canal_efectivo', 30_000], ['canal_breb', 45_000]] },
    { h: 14, m: 35, pagos: [['canal_breb', 18_500]] },
    { h: 19, m: 10, pagos: [['canal_efectivo', 27_000]] },
  ]],
  [4, [
    { h: 8, m: 0, pagos: [['canal_efectivo', 15_000]] },
    { h: 9, m: 45, pagos: [['canal_nequi', 12_000]] },
    { h: 11, m: 30, pagos: [['canal_bold', 64_000]] },
    { h: 15, m: 15, pagos: [['canal_efectivo', 8_400]] },
    { h: 17, m: 50, pagos: [['canal_breb', 52_000]] },
    { h: 20, m: 5, pagos: [['canal_efectivo', 11_000]] },
  ]],
  [3, [
    { h: 7, m: 30, pagos: [['canal_efectivo', 4_500]] },
    { h: 10, m: 15, pagos: [['canal_redeban', 98_000]] },
    { h: 13, m: 0, pagos: [['canal_breb', 26_000]] },
    { h: 16, m: 40, pagos: [['canal_fiado', 15_000, 'cli_jorge']] },
    { h: 18, m: 20, pagos: [['canal_efectivo', 33_000]] },
  ]],
  [2, [
    { h: 8, m: 10, pagos: [['canal_efectivo', 7_700]] },
    { h: 9, m: 55, pagos: [['canal_bold', 120_000]] },
    { h: 12, m: 10, pagos: [['canal_nequi', 16_000]] },
    { h: 14, m: 0, pagos: [['canal_efectivo', 20_000], ['canal_nequi', 30_000]] },
    { h: 19, m: 30, pagos: [['canal_breb', 41_000]] },
  ]],
  [1, [
    { h: 7, m: 20, pagos: [['canal_efectivo', 10_200]] },
    { h: 9, m: 0, pagos: [['canal_breb', 23_000]] },
    { h: 11, m: 40, pagos: [['canal_redeban', 76_000]] },
    { h: 15, m: 25, pagos: [['canal_efectivo', 18_000]] },
    { h: 17, m: 0, pagos: [['canal_bold', 54_000]] },
    { h: 20, m: 15, pagos: [['canal_efectivo', 9_000]] },
  ]],
];

/** Ventas de hoy (unas 12, con una dividida, un anticipo y una corrección). */
const HOY: VentaSemilla[] = [
  { h: 7, m: 10, pagos: [['canal_efectivo', 8_500]] },
  { h: 7, m: 45, pagos: [['canal_breb', 23_000]] },
  { h: 8, m: 30, pagos: [['canal_bold', 64_000]] },
  { h: 9, m: 5, pagos: [['canal_efectivo', 3_200]] },
  { h: 9, m: 50, pagos: [['canal_nequi', 15_000]] },
  { h: 10, m: 20, pagos: [['canal_efectivo', 30_000], ['canal_breb', 70_000]], nota: 'Mercado de la semana' },
  { h: 11, m: 0, pagos: [['canal_efectivo', 12_000]] },
  { h: 11, m: 35, pagos: [['canal_redeban', 120_000]] },
  {
    h: 12, m: 15,
    pagos: [['canal_nequi', 40_000], ['canal_fiado', 50_000, 'cli_camila']],
    nota: 'Anticipo torta de cumpleaños',
    anticipoTotal: 90_000,
  },
  { h: 13, m: 5, pagos: [['canal_efectivo', 5_600]] },
  { h: 13, m: 40, pagos: [['canal_fiado', 18_000, 'cli_rosa']] },
  { h: 14, m: 20, pagos: [['canal_breb', 9_900]] },
];

function venta(fecha: BusinessDate, v: VentaSemilla): { asiento: Asiento; meta: MetaAsiento } {
  const pagos: PagoVenta[] = v.pagos.map(([id, pesos, customer]) => ({
    canal: canal(id),
    monto_minor: pesos * P,
    customer_id: customer ?? null,
  }));
  const asiento = asientoVenta(instanteBogota(fecha, v.h, v.m), pagos, v.nota ?? null);
  const meta: MetaAsiento = { canal_ids: v.pagos.map(([id]) => id) };
  if (v.anticipoTotal !== undefined) meta.anticipo_total_minor = v.anticipoTotal * P;
  return { asiento, meta };
}

export function crearEstadoInicial(): EstadoMock {
  const hoy = hoyBogota();
  const asientos: Asiento[] = [];
  const meta: Record<string, MetaAsiento> = {};
  const agregar = (a: Asiento, m?: MetaAsiento) => {
    asientos.push(a);
    if (m) meta[a.id] = m;
  };

  // Plata que ya había en la caja al empezar: sobrante del primer cierre (spec 04 §9)
  agregar(asientoAjusteCaja(instanteBogota(sumarDias(hoy, -6), 6, 30), -200_000 * P));

  const ventasPsp: { fecha: BusinessDate; canalId: string; monto: number }[] = [];
  const registrar = (fecha: BusinessDate, v: VentaSemilla) => {
    const { asiento, meta: m } = venta(fecha, v);
    agregar(asiento, m);
    v.pagos.forEach(([id, pesos]) => {
      if (canal(id).channel === 'datafono_externo') ventasPsp.push({ fecha, canalId: id, monto: pesos * P });
    });
  };

  for (const [atras, ventas] of PASADO) {
    const fecha = sumarDias(hoy, -atras);
    ventas.forEach((v) => registrar(fecha, v));
  }
  // Otros movimientos de días pasados
  agregar(asientoGasto(instanteBogota(sumarDias(hoy, -4), 9, 0), 85_000 * P, 'Pago a Postobón'));
  agregar(asientoAbono(instanteBogota(sumarDias(hoy, -3), 10, 30), canal('canal_efectivo'), 'cli_rosa', 20_000 * P));
  agregar(asientoAjusteCaja(instanteBogota(sumarDias(hoy, -2), 21, 0), 5_000 * P)); // faltaron $ 5.000

  HOY.forEach((v) => registrar(hoy, v));
  // Corrección visible: venta mal digitada, reverso y venta correcta
  const errada = asientoVenta(instanteBogota(hoy, 14, 50), [{ canal: canal('canal_efectivo'), monto_minor: 45_000 * P }], null);
  agregar(errada, { canal_ids: ['canal_efectivo'] });
  agregar(asientoReverso(instanteBogota(hoy, 14, 52), errada, 'Era $ 4.500, no $ 45.000'));
  registrar(hoy, { h: 14, m: 53, pagos: [['canal_efectivo', 4_500]] });

  // Consignaciones de datáfono que ya llegaron (fecha de venta + días del canal)
  for (const v of ventasPsp) {
    const c = canal(v.canalId);
    const llega = sumarDias(v.fecha, c.dias_consignacion);
    if (llega > hoy) continue;
    agregar(asientoLiquidacion(instanteBogota(llega, 6, 0), c.channel, v.monto, comisionEstimada(v.monto, c.comision_bps)));
  }

  asientos.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  // Días: 5 sellados, ayer cerrado y hoy abierto
  const dias: DiaMock[] = [];
  for (let atras = 6; atras >= 0; atras--) {
    const fecha = sumarDias(hoy, -atras);
    const hasta = asientos.filter((a) => a.business_date <= fecha);
    const cierre = instanteBogota(fecha, 21, 30);
    const sellado = atras >= 2;
    dias.push({
      business_date: fecha,
      status: atras === 0 ? 'abierto' : sellado ? 'sellado' : 'cerrado',
      counted_cash_minor: atras === 0 ? null : saldo(hasta, 'caja'),
      closed_at: atras === 0 ? null : cierre,
      sellos: sellado
        ? [{
            version: 1,
            entry_count: asientos.filter((a) => a.business_date === fecha).length,
            tx_hash: txHashSimulado(`${fecha}#1`),
            confirmed_at: instanteBogota(fecha, 21, 32),
          }]
        : [],
    });
  }

  return {
    comercio: {
      merchant_id: 'merchant_demo',
      business_name: 'Tienda Doña Marta',
      correo: null,
      stellar_address: 'CDEMO' + txHashSimulado('doña marta').slice(0, 51).toUpperCase(),
      account_status: 'ready',
      registrado: false,
    },
    canales: CANALES_SEMILLA,
    clientes: CLIENTES_SEMILLA,
    asientos,
    meta,
    dias,
    enlaces: [
      {
        id: 'enlace_demo',
        token: 'demo',
        date_from: sumarDias(hoy, -6),
        date_to: sumarDias(hoy, -1),
        expires_at: instanteBogota(sumarDias(hoy, 30), 23, 59),
        revoked_at: null,
        created_at: instanteBogota(sumarDias(hoy, -1), 21, 40),
        view_count: 2,
      },
    ],
    alterados: [],
  };
}
