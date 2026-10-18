/**
 * useComercio — datos del negocio y registro inicial (pantalla 1, paso 1 del Blueprint).
 *
 * Devuelve:
 *   comercio.business_name   nombre del negocio
 *   comercio.correo          correo con el que se registró (null si aún no)
 *   comercio.registrado      true después de registrar()
 *   comercio.avisoCuenta     texto del estado de la cuenta (spec 07 §6) o null
 *
 * Acciones:
 *   enviarCodigo(correo)     SIMULADO: no envía nada; resuelve tras 600 ms
 *   verificarCodigo(codigo)  SIMULADO: acepta cualquier código de 6 dígitos
 *   registrar(nombre, correo) guarda el nombre del negocio y marca registrado
 *
 * Backend real: código por correo (spec 06 §2) y POST /merchants (spec 06 §3.1).
 */
import { useCallback, useRef } from 'react';
import { ApiError } from '../api/client';
import { AuthError } from '../auth/otp';
import { textoEstadoCuenta } from '../lib/estados';
import { useDatos } from '../mocks/DatosProvider';
import { MODO_REAL } from '../runtime/config';

export interface Comercio {
  business_name: string;
  correo: string | null;
  registrado: boolean;
  avisoCuenta: string | null;
}

export type ResultadoRegistro = { ok: true } | { ok: false; error: string };

function mensajeDeError(e: unknown): string {
  if (e instanceof AuthError) return e.code === 'invalid_code' ? 'El código no es correcto o ya venció.' : e.code === 'network' ? 'No hay conexión. Inténtalo de nuevo.' : 'No pudimos validar el código.';
  if (e instanceof ApiError) return e.isNetwork ? 'No hay conexión. Inténtalo de nuevo.' : 'No pudimos crear tu cuenta. Inténtalo de nuevo.';
  return 'No pudimos crear tu cuenta. Inténtalo de nuevo.';
}

export function useComercio() {
  const { estado, dispatch, rt } = useDatos();
  const c = estado.comercio;
  const codigo = useRef('');

  const enviarCodigo = useCallback(
    (correo: string) => (rt ? rt.sendCode(correo.trim()) : new Promise<void>((resolve) => setTimeout(resolve, 600))),
    [rt],
  );
  const verificarCodigo = useCallback((cod: string) => {
    codigo.current = cod;
    return /^\d{6}$/.test(cod);
  }, []);
  /** Real: valida el codigo, crea el comercio y registra este dispositivo. Simulado: guarda el nombre. */
  const registrar = useCallback(
    async (nombre: string, correo: string): Promise<ResultadoRegistro> => {
      if (!rt) {
        dispatch({ tipo: 'registrar_comercio', business_name: nombre.trim().slice(0, 80), correo: correo.trim() });
        return { ok: true };
      }
      try {
        await rt.register({ email: correo.trim(), code: codigo.current, businessName: nombre });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: mensajeDeError(e) };
      }
    },
    [rt, dispatch],
  );

  const comercio: Comercio = {
    business_name: c.business_name,
    correo: c.correo,
    registrado: c.registrado,
    avisoCuenta: textoEstadoCuenta(c.account_status),
  };
  return { comercio, enviarCodigo, verificarCodigo, registrar, simulacion: !MODO_REAL };
}
