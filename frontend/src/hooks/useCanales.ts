/**
 * useCanales — canales de cobro del negocio (pantalla 2, paso 1 del Blueprint).
 *
 * Devuelve:
 *   canales        todos los canales configurados (CanalConfig), activos o no
 *   activos        solo los activos, en el orden de la lista
 *   tiposDeCanal   los `channel` del spec que se pueden configurar, con su nombre
 *
 * Acciones:
 *   guardar(canal)              crea o actualiza un canal (comisión en bps, días de consignación)
 *   crear({ nombre, channel, comision_bps, dias_consignacion }) → CanalConfig nuevo y activo
 *   alternar(id)                activa o desactiva un canal
 *
 * SOLO FRONT (A-00): los specs todavía no modelan esta configuración.
 */
import { useCallback } from 'react';
import { textoCanal } from '../lib/estados';
import type { CanalConfig, ChannelCode } from '../lib/tipos';
import { nuevoId } from '../mocks/contabilidad';
import { useDatos } from '../mocks/DatosProvider';

export type { CanalConfig, ChannelCode };

const TIPOS: ChannelCode[] = ['efectivo', 'breb', 'datafono_externo', 'transferencia_otro', 'fiado'];

export function useCanales() {
  const { estado, dispatch } = useDatos();

  const guardar = useCallback((canal: CanalConfig) => dispatch({ tipo: 'guardar_canal', canal }), [dispatch]);

  const crear = useCallback(
    (datos: Omit<CanalConfig, 'id' | 'activo'>): CanalConfig => {
      const canal: CanalConfig = { ...datos, id: nuevoId('canal'), activo: true };
      dispatch({ tipo: 'guardar_canal', canal });
      return canal;
    },
    [dispatch],
  );

  const alternar = useCallback(
    (id: string) => {
      const c = estado.canales.find((x) => x.id === id);
      if (c) dispatch({ tipo: 'guardar_canal', canal: { ...c, activo: !c.activo } });
    },
    [estado.canales, dispatch],
  );

  return {
    canales: estado.canales,
    activos: estado.canales.filter((c) => c.activo),
    tiposDeCanal: TIPOS.map((channel) => ({ channel, nombre: textoCanal(channel) })),
    guardar,
    crear,
    alternar,
  };
}
