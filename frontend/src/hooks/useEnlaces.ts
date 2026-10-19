/**
 * useEnlaces — compartir el historial (pantalla 9; paso 7 del Blueprint). Spec 05 §2.
 *
 * Devuelve:
 *   enlaces[]   { id, url, desde, hasta, periodoTexto, venceTexto, activo, revocado, vencido, vistas }
 *   periodoPosible { desde, hasta }  primer día con datos y último día que se puede compartir
 *                                     (ayer, u hoy si hoy ya está sellado)
 *   vigencias   [7, 30, 90] días; 30 por defecto
 *
 * Acciones:
 *   crear({ desde, hasta, vigencia_dias }) → { ok: true, url } | { ok: false, error }
 *     SIMULADO: el token lo genera el front; en la app real lo genera bimo-core y se ve una sola vez
 *   revocar(id)
 */
import { useCallback, useEffect, useMemo } from 'react';
import * as Linking from 'expo-linking';
import { fechaCorta, hoyBogota, instanteBogota, sumarDias, fechaBogota } from '../lib/fechas';
import type { BusinessDate } from '../lib/tipos';
import { nuevoId } from '../mocks/contabilidad';
import { useDatos } from '../mocks/DatosProvider';
import { MODO_REAL } from '../runtime/config';

export const VIGENCIAS = [7, 30, 90] as const;
export type Vigencia = (typeof VIGENCIAS)[number];

export function urlDeVerificacion(token: string): string {
  return Linking.createURL(`/verificar/${token}`);
}

function tokenSimulado(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let t = '';
  for (let i = 0; i < 22; i++) t += abc[Math.floor(Math.random() * abc.length)];
  return t;
}

export function useEnlaces() {
  const { estado, dispatch, rt } = useDatos();
  const hoy = hoyBogota();

  // Real: la lista sale de la API (el token solo se ve al crear el enlace, spec 05 §2)
  useEffect(() => {
    if (!rt?.ready) return;
    void rt.listLinks().then((rows) =>
      dispatch({
        tipo: 'enlaces',
        enlaces: rows.map((r) => ({
          id: r.id,
          token: '',
          date_from: r.date_from,
          date_to: r.date_to,
          expires_at: r.expires_at,
          revoked_at: r.revoked_at,
          created_at: r.expires_at,
          view_count: r.view_count,
        })),
      }),
    ).catch(() => undefined);
  }, [rt, dispatch]);

  const periodoPosible = useMemo(() => {
    const primero = estado.dias[0]?.business_date ?? hoy;
    const hoySellado = estado.dias.some((d) => d.business_date === hoy && d.status === 'sellado');
    return { desde: primero, hasta: hoySellado ? hoy : sumarDias(hoy, -1) };
  }, [estado.dias, hoy]);

  const enlaces = useMemo(() => {
    const ahora = new Date().toISOString();
    return estado.enlaces.map((e) => {
      const revocado = e.revoked_at !== null;
      const vencido = e.expires_at < ahora;
      return {
        id: e.id,
        url: e.token ? urlDeVerificacion(e.token) : '',
        desde: e.date_from,
        hasta: e.date_to,
        periodoTexto: `${fechaCorta(e.date_from)} – ${fechaCorta(e.date_to)}`,
        venceTexto: fechaCorta(fechaBogota(e.expires_at)),
        activo: !revocado && !vencido,
        revocado,
        vencido,
        vistas: e.view_count,
      };
    });
  }, [estado.enlaces]);

  const crear = useCallback(
    (p: { desde: BusinessDate; hasta: BusinessDate; vigencia_dias: Vigencia }):
      | { ok: true; url: string }
      | { ok: false; error: string }
      | Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
      if (p.hasta < p.desde) return { ok: false, error: 'La fecha final es antes de la inicial.' };
      if (p.hasta > periodoPosible.hasta) return { ok: false, error: 'Solo puedes compartir días ya cerrados y sellados.' };
      if (sumarDias(p.desde, 365) < p.hasta) return { ok: false, error: 'El período máximo es de un año.' };
      if (rt) {
        return rt
          .createLink({ date_from: p.desde, date_to: p.hasta, expires_in_days: p.vigencia_dias })
          .then(async (r) => {
            const rows = await rt.listLinks();
            dispatch({
              tipo: 'enlaces',
              enlaces: rows.map((x) => ({ id: x.id, token: '', date_from: x.date_from, date_to: x.date_to, expires_at: x.expires_at, revoked_at: x.revoked_at, created_at: x.expires_at, view_count: x.view_count })),
            });
            // el token viaja en el fragmento del enlace de la API (spec 05 §2); la pagina de la app lo recibe en la ruta
            const token = r.url.split('#t=')[1] ?? '';
            return { ok: true as const, url: urlDeVerificacion(token) };
          })
          .catch(() => ({ ok: false as const, error: 'No pudimos crear el enlace. Revisa tu conexión e inténtalo de nuevo.' }));
      }
      const token = tokenSimulado();
      dispatch({
        tipo: 'crear_enlace',
        enlace: {
          id: nuevoId('enlace'),
          token,
          date_from: p.desde,
          date_to: p.hasta,
          expires_at: instanteBogota(sumarDias(hoy, p.vigencia_dias), 23, 59),
          revoked_at: null,
          created_at: new Date().toISOString(),
          view_count: 0,
        },
      });
      return { ok: true, url: urlDeVerificacion(token) };
    },
    [dispatch, hoy, periodoPosible.hasta, rt],
  );

  const revocar = useCallback(
    (id: string) => {
      if (rt) void rt.revokeLink(id).then(() => dispatch({ tipo: 'revocar_enlace', id, at: new Date().toISOString() })).catch(() => undefined);
      else dispatch({ tipo: 'revocar_enlace', id, at: new Date().toISOString() });
    },
    [dispatch, rt],
  );

  return { enlaces, periodoPosible, vigencias: VIGENCIAS, crear, revocar, simulacion: !MODO_REAL };
}
