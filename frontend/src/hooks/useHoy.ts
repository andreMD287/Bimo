/**
 * useHoy — la pantalla "Hoy" (pantalla 3; H1, H3, H6, H8). Cálculos del spec 04 §9.
 *
 * Devuelve (montos en centavos):
 *   fecha, fechaTexto        hoy en Bogotá ("domingo 11 de octubre")
 *   estadoDia, textoEstadoDia
 *   vendido_minor            vendido hoy
 *   cantidadVentas
 *   porCanal[]               { channel, nombre, monto_minor } vendido hoy por canal
 *   disponible               { caja_minor, cuenta_minor, total_minor }: efectivo en caja + en la cuenta
 *   pendiente                { total_minor, detalle[]: { nombre, monto_minor, fecha, fechaTexto } }
 *                            saldo por consignar de datáfonos, con fecha estimada de llegada
 *   teDeben                  { total_minor, detalle[]: { customer_id, nombre, monto_minor } } (fiado y anticipos)
 *   comisiones_minor         comisiones registradas hoy (consignaciones que llegaron)
 *   comisionEstimada_minor   comisión estimada de las ventas de hoy según cada canal (solo front)
 *   salidas_minor            gastos y retiros de hoy
 *   porSubir                 asientos sin sincronizar (siempre 0 en la simulación)
 *
 * Sin acciones: para registrar se usa useRegistrarVenta.
 */
import { useMemo } from 'react';
import { comisionEstimada } from '../lib/dinero';
import { textoCanal, textoEstadoDia } from '../lib/estados';
import { fechaCorta, fechaLarga, hoyBogota, sumarDias } from '../lib/fechas';
import {
  cantidadVentas,
  comisionesDelDia,
  saldo,
  saldoPorCliente,
  salidasDelDia,
  vendido,
  vendidoPorCanal,
} from '../lib/hoy';
import type { BusinessDate, ChannelCode, DayStatus } from '../lib/tipos';
import { useDatos } from '../mocks/DatosProvider';
import { cobrosDeVenta, idsReversados } from './_interno';

export interface PendienteDeConsignar {
  nombre: string;
  monto_minor: number;
  fecha: BusinessDate;
  fechaTexto: string;
}

export function useHoy() {
  const { estado } = useDatos();

  return useMemo(() => {
    const fecha = hoyBogota();
    const { asientos } = estado;
    const reversados = idsReversados(asientos);
    const ventasVivas = asientos.filter((a) => a.kind === 'venta' && !reversados.has(a.id));

    const pc = vendidoPorCanal(asientos, fecha);
    const porCanal = (Object.keys(pc) as ChannelCode[])
      .map((channel) => ({ channel, nombre: textoCanal(channel), monto_minor: pc[channel] ?? 0 }))
      .filter((x) => x.monto_minor !== 0)
      .sort((a, b) => b.monto_minor - a.monto_minor);

    const caja = saldo(asientos, 'caja');
    const cuenta = saldo(asientos, 'cuenta_socio');

    // Pendiente: saldo de por_cobrar_psp, repartido entre las ventas más recientes
    // (se asume que las consignaciones liquidan primero las ventas más viejas).
    const totalPendiente = saldo(asientos, 'por_cobrar_psp');
    const detalle: PendienteDeConsignar[] = [];
    let falta = totalPendiente;
    const cobrosPsp = ventasVivas
      .flatMap((a) => cobrosDeVenta(estado, a))
      .filter((c) => c.channel === 'datafono_externo' || c.channel === 'tap_to_pay')
      .sort((a, b) => b.asiento.occurred_at.localeCompare(a.asiento.occurred_at));
    for (const c of cobrosPsp) {
      if (falta <= 0) break;
      const monto = Math.min(falta, c.monto_minor);
      const llega = sumarDias(c.asiento.business_date, c.canal?.dias_consignacion ?? 1);
      detalle.push({ nombre: c.canal?.nombre ?? textoCanal(c.channel), monto_minor: monto, fecha: llega, fechaTexto: fechaCorta(llega) });
      falta -= monto;
    }
    detalle.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const porCliente = saldoPorCliente(asientos);
    const teDeben = [...porCliente.entries()]
      .filter(([, m]) => m > 0)
      .map(([customer_id, monto_minor]) => ({
        customer_id,
        nombre: estado.clientes.find((c) => c.id === customer_id)?.display_name ?? 'Cliente',
        monto_minor,
      }));

    const comisionEst = ventasVivas
      .filter((a) => a.business_date === fecha)
      .flatMap((a) => cobrosDeVenta(estado, a))
      .reduce((s, c) => s + comisionEstimada(c.monto_minor, c.canal?.comision_bps ?? 0), 0);

    const estadoDia: DayStatus = estado.dias.find((d) => d.business_date === fecha)?.status ?? 'abierto';

    return {
      fecha,
      fechaTexto: fechaLarga(fecha),
      estadoDia,
      textoEstadoDia: textoEstadoDia(estadoDia),
      vendido_minor: vendido(asientos, fecha),
      cantidadVentas: cantidadVentas(asientos, fecha),
      porCanal,
      disponible: { caja_minor: caja, cuenta_minor: cuenta, total_minor: caja + cuenta },
      pendiente: { total_minor: totalPendiente, detalle },
      teDeben: { total_minor: saldo(asientos, 'por_cobrar_clientes'), detalle: teDeben },
      comisiones_minor: comisionesDelDia(asientos, fecha),
      comisionEstimada_minor: comisionEst,
      salidas_minor: salidasDelDia(asientos, fecha),
      porSubir: 0,
    };
  }, [estado]);
}
