/**
 * useVerificacion — página del verificador (pantalla 10; paso 7 del Blueprint). Spec 05 §1 y §4.
 *
 * Parámetro: token del enlace ("demo" siempre existe en los datos de ejemplo).
 *
 * Devuelve:
 *   estado      'no_encontrado' | 'inactivo' (vencido o revocado) | 'listo'
 *   comercio    { business_name, stellar_address }
 *   periodo     { desde, hasta, texto }
 *   dias[]      { fecha, fechaTexto, resultado: 'coincide' | 'sin_sellar' | 'no_coincide',
 *                 enmiendas, ventas_minor, porCanal[], tx_hash | null }
 *   resumen     { coinciden, sinSellar, noCoinciden,
 *                 ventas_minor y porCanal[] SOLO de los días que coinciden,
 *                 porcentajeTerceros (% de asientos verificado u on_chain), relojDudoso }
 *   alterados   fechas con alteración simulada
 *
 * Acciones:
 *   simularAlteracion(fecha)  alterna un día sellado entre ✅ y ❌ (para la demo)
 *
 * SIMULACIÓN: no lee Stellar ni recalcula el Merkle. La comprobación real (spec 05 §4)
 * usa el formato canónico y el árbol del paquete `shared/`.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { textoCanal } from '../lib/estados';
import { fechaCorta, fechaLarga } from '../lib/fechas';
import { vendido, vendidoPorCanal } from '../lib/hoy';
import type { BusinessDate, ChannelCode } from '../lib/tipos';
import { useDatos } from '../mocks/DatosProvider';

export type ResultadoDia = 'coincide' | 'sin_sellar' | 'no_coincide';

export interface TotalCanal {
  channel: ChannelCode;
  nombre: string;
  monto_minor: number;
}

function aLista(m: Partial<Record<ChannelCode, number>>): TotalCanal[] {
  return (Object.keys(m) as ChannelCode[])
    .map((channel) => ({ channel, nombre: textoCanal(channel), monto_minor: m[channel] ?? 0 }))
    .filter((x) => x.monto_minor !== 0)
    .sort((a, b) => b.monto_minor - a.monto_minor);
}

export function useVerificacion(token: string) {
  const { estado, dispatch } = useDatos();
  const enlace = estado.enlaces.find((e) => e.token === token) ?? null;

  useEffect(() => {
    if (enlace) dispatch({ tipo: 'ver_enlace', token });
    // cuenta una vista por token (view_count, spec 05 §3)
  }, [token]);

  const datos = useMemo(() => {
    if (!enlace) return null;
    const dias = estado.dias
      .filter((d) => d.business_date >= enlace.date_from && d.business_date <= enlace.date_to)
      .map((d) => {
        const resultado: ResultadoDia =
          d.sellos.length === 0 ? 'sin_sellar' : estado.alterados.includes(d.business_date) ? 'no_coincide' : 'coincide';
        return {
          fecha: d.business_date,
          fechaTexto: fechaLarga(d.business_date),
          resultado,
          enmiendas: Math.max(0, d.sellos.length - 1),
          ventas_minor: vendido(estado.asientos, d.business_date),
          porCanal: aLista(vendidoPorCanal(estado.asientos, d.business_date)),
          tx_hash: d.sellos[d.sellos.length - 1]?.tx_hash ?? null,
        };
      });

    const ok = new Set(dias.filter((d) => d.resultado === 'coincide').map((d) => d.fecha));
    const totalCanal: Partial<Record<ChannelCode, number>> = {};
    let ventas = 0;
    for (const f of ok) {
      ventas += vendido(estado.asientos, f);
      const pc = vendidoPorCanal(estado.asientos, f);
      for (const ch of Object.keys(pc) as ChannelCode[]) totalCanal[ch] = (totalCanal[ch] ?? 0) + (pc[ch] ?? 0);
    }
    const asientosOk = estado.asientos.filter((a) => ok.has(a.business_date));
    const terceros = asientosOk.filter((a) => a.origin !== 'declarado').length;

    return {
      comercio: { business_name: estado.comercio.business_name, stellar_address: estado.comercio.stellar_address },
      periodo: {
        desde: enlace.date_from,
        hasta: enlace.date_to,
        texto: `${fechaCorta(enlace.date_from)} – ${fechaCorta(enlace.date_to)}`,
      },
      dias,
      resumen: {
        coinciden: ok.size,
        sinSellar: dias.filter((d) => d.resultado === 'sin_sellar').length,
        noCoinciden: dias.filter((d) => d.resultado === 'no_coincide').length,
        ventas_minor: ventas,
        porCanal: aLista(totalCanal),
        porcentajeTerceros: asientosOk.length === 0 ? 0 : Math.round((terceros * 100) / asientosOk.length),
        relojDudoso: 0,
      },
    };
  }, [enlace, estado]);

  const simularAlteracion = useCallback(
    (fecha: BusinessDate) => dispatch({ tipo: 'alternar_alteracion', business_date: fecha }),
    [dispatch],
  );

  const inactivo = enlace !== null && (enlace.revoked_at !== null || enlace.expires_at < new Date().toISOString());
  const estadoPagina: 'no_encontrado' | 'inactivo' | 'listo' = !enlace ? 'no_encontrado' : inactivo ? 'inactivo' : 'listo';

  return {
    estado: estadoPagina,
    ...(datos ?? { comercio: null, periodo: null, dias: [], resumen: null }),
    alterados: estado.alterados,
    simularAlteracion,
    simulacion: true as const,
  };
}
