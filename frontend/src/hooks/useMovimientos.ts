/**
 * useMovimientos — lista de movimientos de un día (pantalla 5; pasos 2 y 6 del Blueprint).
 *
 * Parámetro: fecha "AAAA-MM-DD" (por defecto hoy en Bogotá).
 *
 * Devuelve:
 *   fecha, fechaTexto
 *   movimientos[]  del más reciente al más viejo:
 *     { id, hora, tipo ("Venta", "Corrección", "Abono", "Consignación", "Ajuste de caja", "Gasto"),
 *       detalle (canales: "Efectivo + Bre-B"), monto_minor (con signo: las correcciones restan),
 *       nota, anticipoTotal_minor | null, corregido (fue reversado), esCorreccion,
 *       verificadoPorTercero (llegó de un socio o PSP), sePuedeCorregir }
 *
 * Acciones:
 *   corregir(id, motivo?) → { ok } | { ok: false, error }
 *     crea un reverso visible (espejo del asiento); nunca borra ni edita (spec 01 §6).
 *     Para dejar el monto correcto, después se registra la venta nueva con useRegistrarVenta.
 */
import { useCallback, useMemo } from 'react';
import { textoCanal } from '../lib/estados';
import { ahoraISO, fechaLarga, horaBogota, hoyBogota } from '../lib/fechas';
import type { Asiento, BusinessDate, EntryKind } from '../lib/tipos';
import { asientoReverso } from '../mocks/contabilidad';
import { useDatos } from '../mocks/DatosProvider';
import { cobrosDeVenta, idsReversados } from './_interno';

export interface Movimiento {
  id: string;
  hora: string;
  tipo: string;
  detalle: string;
  monto_minor: number;
  nota: string | null;
  anticipoTotal_minor: number | null;
  corregido: boolean;
  esCorreccion: boolean;
  verificadoPorTercero: boolean;
  sePuedeCorregir: boolean;
}

const TIPO: Record<EntryKind, string> = {
  venta: 'Venta',
  abono_cliente: 'Abono',
  liquidacion_psp: 'Consignación',
  ajuste_caja: 'Ajuste de caja',
  reverso: 'Corrección',
  conversion: 'Cambio de moneda',
  salida: 'Gasto o retiro',
};

function montoDe(a: Asiento): number {
  const debe = a.lines.filter((l) => l.direction === 'debe').reduce((s, l) => s + l.amount_minor, 0);
  return debe;
}

export function useMovimientos(fecha?: BusinessDate) {
  const { estado, dispatch } = useDatos();
  const dia = fecha ?? hoyBogota();

  const movimientos = useMemo<Movimiento[]>(() => {
    const reversados = idsReversados(estado.asientos);
    const porId = new Map(estado.asientos.map((a) => [a.id, a]));
    return estado.asientos
      .filter((a) => a.business_date === dia)
      .map((a) => {
        const base = a.kind === 'reverso' && a.reverses_entry_id ? porId.get(a.reverses_entry_id) ?? a : a;
        const canales = base.kind === 'venta'
          ? cobrosDeVenta(estado, base).map((c) => c.canal?.nombre ?? textoCanal(c.channel))
          : base.lines.filter((l) => l.channel !== null).map((l) => textoCanal(l.channel!));
        return {
          id: a.id,
          hora: horaBogota(a.occurred_at),
          tipo: TIPO[a.kind],
          detalle: [...new Set(canales)].join(' + '),
          monto_minor: a.kind === 'reverso' ? -montoDe(a) : montoDe(a),
          nota: a.note,
          anticipoTotal_minor: estado.meta[a.id]?.anticipo_total_minor ?? null,
          corregido: reversados.has(a.id),
          esCorreccion: a.kind === 'reverso',
          verificadoPorTercero: a.origin !== 'declarado',
          sePuedeCorregir:
            a.origin === 'declarado' && a.kind !== 'reverso' && a.kind !== 'ajuste_caja' && !reversados.has(a.id),
        };
      })
      .reverse();
  }, [estado, dia]);

  const corregir = useCallback(
    (id: string, motivo?: string): { ok: true } | { ok: false; error: string } => {
      const original = estado.asientos.find((a) => a.id === id);
      if (!original) return { ok: false, error: 'No encontramos ese movimiento.' };
      if (idsReversados(estado.asientos).has(id)) return { ok: false, error: 'Ese movimiento ya fue corregido.' };
      if (original.origin !== 'declarado' || original.kind === 'reverso')
        return { ok: false, error: 'Ese movimiento no se puede corregir desde aquí.' };
      const nota = motivo?.trim().normalize('NFC').slice(0, 140) || null;
      // La corrección queda en el día de hoy, aunque el original sea de otro día
      dispatch({ tipo: 'agregar_asiento', asiento: asientoReverso(ahoraISO(), original, nota) });
      return { ok: true };
    },
    [estado.asientos, dispatch],
  );

  return { fecha: dia, fechaTexto: fechaLarga(dia), movimientos, corregir };
}
