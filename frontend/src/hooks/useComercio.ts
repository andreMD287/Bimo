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
import { useCallback } from 'react';
import { textoEstadoCuenta } from '../lib/estados';
import { useDatos } from '../mocks/DatosProvider';

export interface Comercio {
  business_name: string;
  correo: string | null;
  registrado: boolean;
  avisoCuenta: string | null;
}

export function useComercio() {
  const { estado, dispatch } = useDatos();
  const c = estado.comercio;

  const enviarCodigo = useCallback(
    (_correo: string) => new Promise<void>((resolve) => setTimeout(resolve, 600)),
    [],
  );
  const verificarCodigo = useCallback((codigo: string) => /^\d{6}$/.test(codigo), []);
  const registrar = useCallback(
    (nombre: string, correo: string) =>
      dispatch({ tipo: 'registrar_comercio', business_name: nombre.trim().slice(0, 80), correo: correo.trim() }),
    [dispatch],
  );

  const comercio: Comercio = {
    business_name: c.business_name,
    correo: c.correo,
    registrado: c.registrado,
    avisoCuenta: textoEstadoCuenta(c.account_status),
  };
  return { comercio, enviarCodigo, verificarCodigo, registrar, simulacion: true as const };
}
