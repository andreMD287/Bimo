/**
 * useSello — confirmar y sellar los días cerrados (pantalla 7; paso 6 del Blueprint).
 * Spec 07 §1 (D-4, D-5) y §6 (textos). Un solo "Face ID" confirma todos los días pendientes.
 *
 * Devuelve:
 *   pendientes[]  { fecha, fechaTexto, cantidadVentas, vendido_minor, esEnmienda, textoEstado }
 *                 días `cerrado` o `requiere_enmienda`
 *   resumen       "Sellar lunes 6 de octubre: 34 ventas, $ 1.240.000" (o varios días)
 *   fase          'listo' | 'confirmando' (Face ID) | 'guardando' ("Guardando tu cierre…") | 'sellado' | 'nada'
 *   textoFase     texto para mostrar en cada fase
 *   simulacion    true: Face ID y el sello son simulados (mostrar etiqueta "Simulación")
 *
 * Acciones:
 *   confirmar() → Promise<void>  simula Face ID (1 s) y el envío (1,5 s); los días quedan "Sellado ✓"
 *   reiniciar()                  vuelve la fase a 'listo' (para sellar otro día después)
 */
import { useCallback, useMemo, useState } from 'react';
import { formatoCOP } from '../lib/dinero';
import { textoEstadoDia } from '../lib/estados';
import { ahoraISO, fechaLarga } from '../lib/fechas';
import { cantidadVentas, vendido } from '../lib/hoy';
import { useDatos } from '../mocks/DatosProvider';

export type FaseSello = 'nada' | 'listo' | 'confirmando' | 'guardando' | 'sellado';

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useSello() {
  const { estado, dispatch } = useDatos();
  const [enCurso, setEnCurso] = useState<'confirmando' | 'guardando' | 'sellado' | null>(null);

  const pendientes = useMemo(
    () =>
      estado.dias
        .filter((d) => d.status === 'cerrado' || d.status === 'requiere_enmienda')
        .map((d) => ({
          fecha: d.business_date,
          fechaTexto: fechaLarga(d.business_date),
          cantidadVentas: cantidadVentas(estado.asientos, d.business_date),
          vendido_minor: vendido(estado.asientos, d.business_date),
          esEnmienda: d.status === 'requiere_enmienda',
          textoEstado: textoEstadoDia(d.status),
        })),
    [estado],
  );

  const resumen = useMemo(() => {
    if (pendientes.length === 0) return '';
    const ventas = pendientes.reduce((s, p) => s + p.cantidadVentas, 0);
    const total = pendientes.reduce((s, p) => s + p.vendido_minor, 0);
    const cuando = pendientes.length === 1 ? pendientes[0]!.fechaTexto : `${pendientes.length} días`;
    return `Sellar ${cuando}: ${ventas} ventas, ${formatoCOP(total)}`;
  }, [pendientes]);

  const confirmar = useCallback(async () => {
    const fechas = pendientes.map((p) => p.fecha);
    if (fechas.length === 0) return;
    setEnCurso('confirmando');
    await esperar(1000); // SIMULACIÓN de Face ID
    dispatch({ tipo: 'firmar_dias', fechas });
    setEnCurso('guardando');
    await esperar(1500); // SIMULACIÓN del envío y la confirmación del sello
    dispatch({ tipo: 'confirmar_sellos', fechas, at: ahoraISO() });
    setEnCurso('sellado');
  }, [pendientes, dispatch]);

  const reiniciar = useCallback(() => setEnCurso(null), []);

  const fase: FaseSello = enCurso ?? (pendientes.length > 0 ? 'listo' : 'nada');
  const textoFase: Record<FaseSello, string> = {
    nada: 'No hay días por confirmar.',
    listo: 'Confirmar con Face ID',
    confirmando: 'Confirmando con Face ID…',
    guardando: textoEstadoDia('firmado'),
    sellado: textoEstadoDia('sellado'),
  };

  return { pendientes, resumen, fase, textoFase: textoFase[fase], confirmar, reiniciar, simulacion: true as const };
}
