/**
 * useRegistrarVenta — registrar una venta (pantalla 4; H2, H6, H7, H8; pasos 2 y 3 del Blueprint).
 *
 * Devuelve:
 *   canales         canales activos para elegir (CanalConfig)
 *   canalEfectivo   el canal de efectivo, para la venta en ≤ 3 toques (QA-04)
 *   clientes        clientes conocidos (para fiado y anticipos)
 *
 * Acciones:
 *   estimar(pagos)  → { total_minor, comision_minor, llegadas[]: { nombre, monto_minor, fecha, fechaTexto, inmediata } }
 *                     comisión estimada y cuándo llega la plata de cada pago, sin guardar nada
 *   registrar({ pagos, nota?, anticipo? }) → { ok: true, id } | { ok: false, error }
 *                     pagos: [{ canal_id, monto_minor, customer_id? }]; varios pagos = venta dividida (un solo asiento)
 *                     anticipo: { total_minor, customer_id }: lo que no se pagó queda como "te deben"
 *   registrarAbono({ customer_id, canal_id, monto_minor }) → resultado igual; abono de un cliente (fiado o anticipo)
 *   agregarCliente(nombre) → Cliente
 *
 * Solo crea asientos `declarado`. Montos en centavos enteros.
 */
import { useCallback } from 'react';
import { comisionEstimada } from '../lib/dinero';
import { ahoraISO, fechaCorta, hoyBogota, sumarDias } from '../lib/fechas';
import type { Cliente } from '../lib/tipos';
import { asientoAbono, asientoVenta, nuevoId, type PagoVenta } from '../mocks/contabilidad';
import { useDatos } from '../mocks/DatosProvider';

export interface PagoInput {
  canal_id: string;
  monto_minor: number;
  customer_id?: string | null;
}

export interface VentaInput {
  pagos: PagoInput[];
  nota?: string;
  anticipo?: { total_minor: number; customer_id: string };
}

export type Resultado = { ok: true; id: string } | { ok: false; error: string };

const montoValido = (m: number) => Number.isSafeInteger(m) && m >= 1 && m <= 1e12;

export function useRegistrarVenta() {
  const { estado, dispatch } = useDatos();
  const activos = estado.canales.filter((c) => c.activo);

  const estimar = useCallback(
    (pagos: PagoInput[]) => {
      const hoy = hoyBogota();
      let total = 0;
      let comision = 0;
      const llegadas = pagos.flatMap((p) => {
        const c = estado.canales.find((x) => x.id === p.canal_id);
        if (!c || !montoValido(p.monto_minor)) return [];
        total += p.monto_minor;
        comision += comisionEstimada(p.monto_minor, c.comision_bps);
        if (c.channel === 'fiado') return [];
        const fecha = sumarDias(hoy, c.dias_consignacion);
        return [{ nombre: c.nombre, monto_minor: p.monto_minor, fecha, fechaTexto: fechaCorta(fecha), inmediata: c.dias_consignacion === 0 }];
      });
      return { total_minor: total, comision_minor: comision, llegadas };
    },
    [estado.canales],
  );

  const registrar = useCallback(
    (v: VentaInput): Resultado => {
      if (v.pagos.length === 0) return { ok: false, error: 'Escribe el monto de la venta.' };
      const pagos: PagoVenta[] = [];
      for (const p of v.pagos) {
        const canal = estado.canales.find((c) => c.id === p.canal_id);
        if (!canal) return { ok: false, error: 'Elige cómo te pagaron.' };
        if (!montoValido(p.monto_minor)) return { ok: false, error: 'El monto no es válido.' };
        if (canal.channel === 'fiado' && !p.customer_id) return { ok: false, error: 'Elige a quién le fías.' };
        pagos.push({ canal, monto_minor: p.monto_minor, customer_id: p.customer_id ?? null });
      }
      const canal_ids = v.pagos.map((p) => p.canal_id);
      if (v.anticipo) {
        const pagado = pagos.reduce((s, p) => s + p.monto_minor, 0);
        const falta = v.anticipo.total_minor - pagado;
        const fiado = estado.canales.find((c) => c.channel === 'fiado');
        if (!montoValido(v.anticipo.total_minor) || falta <= 0) return { ok: false, error: 'El anticipo debe ser menor que el total.' };
        if (!fiado) return { ok: false, error: 'Falta el canal de fiado.' };
        pagos.push({ canal: fiado, monto_minor: falta, customer_id: v.anticipo.customer_id });
        canal_ids.push(fiado.id);
      }
      if (pagos.length > 19) return { ok: false, error: 'Demasiados pagos en una venta.' };
      const nota = v.nota?.trim().normalize('NFC') || null;
      if (nota && nota.length > 140) return { ok: false, error: 'La nota es muy larga (máximo 140 letras).' };

      const asiento = asientoVenta(ahoraISO(), pagos, nota);
      dispatch({
        tipo: 'agregar_asiento',
        asiento,
        meta: v.anticipo ? { canal_ids, anticipo_total_minor: v.anticipo.total_minor } : { canal_ids },
      });
      return { ok: true, id: asiento.id };
    },
    [estado.canales, dispatch],
  );

  const registrarAbono = useCallback(
    (a: { customer_id: string; canal_id: string; monto_minor: number }): Resultado => {
      const canal = estado.canales.find((c) => c.id === a.canal_id);
      if (!canal || !['efectivo', 'breb', 'transferencia_otro'].includes(canal.channel))
        return { ok: false, error: 'Un abono se recibe en efectivo, Bre-B o billetera.' };
      if (!montoValido(a.monto_minor)) return { ok: false, error: 'El monto no es válido.' };
      const asiento = asientoAbono(ahoraISO(), canal, a.customer_id, a.monto_minor);
      dispatch({ tipo: 'agregar_asiento', asiento, meta: { canal_ids: [canal.id] } });
      return { ok: true, id: asiento.id };
    },
    [estado.canales, dispatch],
  );

  const agregarCliente = useCallback(
    (nombre: string): Cliente => {
      const cliente: Cliente = { id: nuevoId('cli'), display_name: nombre.trim().slice(0, 60) };
      dispatch({ tipo: 'agregar_cliente', cliente });
      return cliente;
    },
    [dispatch],
  );

  return {
    canales: activos,
    canalEfectivo: activos.find((c) => c.channel === 'efectivo') ?? null,
    clientes: estado.clientes,
    estimar,
    registrar,
    registrarAbono,
    agregarCliente,
  };
}
