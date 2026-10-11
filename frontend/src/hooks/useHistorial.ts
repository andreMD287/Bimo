/**
 * useHistorial — historial de días (pantalla 8; paso 6 del Blueprint).
 *
 * Devuelve:
 *   dias[]  del más reciente al más viejo:
 *     { fecha, fechaTexto, status (day_status del spec), textoEstado (spec 07 §6),
 *       cantidadVentas, vendido_minor, versiones (sellos confirmados), enmendado }
 *   resumen { sellados, porConfirmar, abiertos }
 *
 * Sin acciones: para cerrar o sellar se usan useCierre y useSello.
 */
import { useMemo } from 'react';
import { textoEstadoDia } from '../lib/estados';
import { fechaLarga } from '../lib/fechas';
import { cantidadVentas, vendido } from '../lib/hoy';
import { useDatos } from '../mocks/DatosProvider';

export function useHistorial() {
  const { estado } = useDatos();
  return useMemo(() => {
    const dias = [...estado.dias]
      .sort((a, b) => b.business_date.localeCompare(a.business_date))
      .map((d) => ({
        fecha: d.business_date,
        fechaTexto: fechaLarga(d.business_date),
        status: d.status,
        textoEstado: textoEstadoDia(d.status),
        cantidadVentas: cantidadVentas(estado.asientos, d.business_date),
        vendido_minor: vendido(estado.asientos, d.business_date),
        versiones: d.sellos.length,
        enmendado: d.sellos.length > 1,
      }));
    return {
      dias,
      resumen: {
        sellados: dias.filter((d) => d.status === 'sellado').length,
        porConfirmar: dias.filter((d) => d.status === 'cerrado' || d.status === 'requiere_enmienda').length,
        abiertos: dias.filter((d) => d.status === 'abierto').length,
      },
    };
  }, [estado]);
}
