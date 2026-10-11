/**
 * useCierre — cerrar el día (pantalla 6; H4; paso 5 del Blueprint). Spec 04 §6 y §9, spec 07 D-3.
 *
 * Devuelve (montos en centavos):
 *   fecha, fechaTexto, estadoDia, textoEstadoDia, sePuedeCerrar (el día está abierto)
 *   vendido_minor, cantidadVentas
 *   esperado     { efectivo_minor: saldo de caja, cuenta_minor: saldo de cuenta_socio,
 *                  pendiente_minor: saldo por consignar }
 *   diasSinCerrar[]  { fecha, fechaTexto } días anteriores que siguen abiertos
 *
 * Acciones:
 *   revisar({ efectivo_contado_minor, cuenta_informada_minor? })
 *     → { cuadra, diferencias[]: { concepto, esperado_minor, contado_minor, diferencia_minor } }
 *       diferencia > 0 = sobra plata; < 0 = falta plata. No guarda nada.
 *   cerrar({ efectivo_contado_minor })
 *     si el efectivo no cuadra registra un `ajuste_caja` y después cierra el día (queda
 *     "Cerrado · falta tu confirmación"); luego se sella con useSello.
 *   cerrarDiaPasado(fecha)   cierra un día viejo sin conteo de efectivo (spec 07 §1)
 */
import { useCallback, useMemo } from 'react';
import { textoEstadoDia } from '../lib/estados';
import { ahoraISO, fechaLarga, hoyBogota } from '../lib/fechas';
import { cantidadVentas, saldo, vendido } from '../lib/hoy';
import type { BusinessDate, DayStatus } from '../lib/tipos';
import { asientoAjusteCaja } from '../mocks/contabilidad';
import { useDatos } from '../mocks/DatosProvider';

export interface Diferencia {
  concepto: string;
  esperado_minor: number;
  contado_minor: number;
  diferencia_minor: number;
}

export function useCierre() {
  const { estado, dispatch } = useDatos();
  const fecha = hoyBogota();

  const datos = useMemo(() => {
    const { asientos } = estado;
    const estadoDia: DayStatus = estado.dias.find((d) => d.business_date === fecha)?.status ?? 'abierto';
    return {
      fecha,
      fechaTexto: fechaLarga(fecha),
      estadoDia,
      textoEstadoDia: textoEstadoDia(estadoDia),
      sePuedeCerrar: estadoDia === 'abierto',
      vendido_minor: vendido(asientos, fecha),
      cantidadVentas: cantidadVentas(asientos, fecha),
      esperado: {
        efectivo_minor: saldo(asientos, 'caja'),
        cuenta_minor: saldo(asientos, 'cuenta_socio'),
        pendiente_minor: saldo(asientos, 'por_cobrar_psp'),
      },
      diasSinCerrar: estado.dias
        .filter((d) => d.business_date < fecha && d.status === 'abierto')
        .map((d) => ({ fecha: d.business_date, fechaTexto: fechaLarga(d.business_date) })),
    };
  }, [estado, fecha]);

  const revisar = useCallback(
    (c: { efectivo_contado_minor: number; cuenta_informada_minor?: number }) => {
      const diferencias: Diferencia[] = [
        {
          concepto: 'Efectivo en caja',
          esperado_minor: datos.esperado.efectivo_minor,
          contado_minor: c.efectivo_contado_minor,
          diferencia_minor: c.efectivo_contado_minor - datos.esperado.efectivo_minor,
        },
      ];
      if (c.cuenta_informada_minor !== undefined)
        diferencias.push({
          concepto: 'En la cuenta',
          esperado_minor: datos.esperado.cuenta_minor,
          contado_minor: c.cuenta_informada_minor,
          diferencia_minor: c.cuenta_informada_minor - datos.esperado.cuenta_minor,
        });
      return { cuadra: diferencias.every((d) => d.diferencia_minor === 0), diferencias };
    },
    [datos.esperado],
  );

  const cerrar = useCallback(
    (c: { efectivo_contado_minor: number }): { ok: true } | { ok: false; error: string } => {
      if (!datos.sePuedeCerrar) return { ok: false, error: 'Este día ya está cerrado.' };
      if (!Number.isSafeInteger(c.efectivo_contado_minor) || c.efectivo_contado_minor < 0)
        return { ok: false, error: 'El efectivo contado no es válido.' };
      const faltante = datos.esperado.efectivo_minor - c.efectivo_contado_minor;
      if (faltante !== 0) dispatch({ tipo: 'agregar_asiento', asiento: asientoAjusteCaja(ahoraISO(), faltante) });
      dispatch({ tipo: 'cerrar_dia', business_date: fecha, counted_cash_minor: c.efectivo_contado_minor, at: ahoraISO() });
      return { ok: true };
    },
    [datos, dispatch, fecha],
  );

  const cerrarDiaPasado = useCallback(
    (f: BusinessDate) => dispatch({ tipo: 'cerrar_dia', business_date: f, counted_cash_minor: null, at: ahoraISO() }),
    [dispatch],
  );

  return { ...datos, revisar, cerrar, cerrarDiaPasado };
}
