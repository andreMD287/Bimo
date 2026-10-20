// Pantalla 1 — Bienvenida y registro (dueña: Lizeth desde el Entregable 4; L-02). Paso 1 del Blueprint.
// Correo → código → negocio listo; la cuenta se prepara sola y no bloquea vender (spec 07 §6).
// Nombre del negocio de máximo 80 caracteres (spec 01 §4.1).

import { router } from 'expo-router';
import { useState } from 'react';
import { useComercio } from '../src/hooks';
import { Aviso, Boton, Campo, Pantalla, Texto } from '../src/ui';

/** Spec 01 §4.1: `business_name` de máximo 80 caracteres. */
const NOMBRE_MAX = 80;

type Paso = 'datos' | 'codigo';

export default function Bienvenida() {
  const { comercio, enviarCodigo, verificarCodigo, registrar, simulacion } = useComercio();
  const [paso, setPaso] = useState<Paso>('datos');
  const [nombre, setNombre] = useState(comercio.business_name);
  const [correo, setCorreo] = useState(comercio.correo ?? (simulacion ? 'marta@ejemplo.co' : ''));
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: 'info' | 'error'; texto: string } | null>(null);

  const correoOk = correo.trim().includes('@') && correo.trim().includes('.');
  const nombreOk = nombre.trim().length > 0;

  const pedirCodigo = async () => {
    if (!nombreOk || !correoOk || enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      await enviarCodigo(correo.trim());
    } catch {
      setEnviando(false);
      setAviso({ tono: 'error', texto: 'No pudimos enviar el código. Revisa tu conexión y el correo.' });
      return;
    }
    setEnviando(false);
    setPaso('codigo');
    setAviso({
      tono: 'info',
      texto: simulacion ? 'Te enviamos un código de 6 dígitos a tu correo. En esta demo sirve cualquiera.' : 'Te enviamos un código de 6 dígitos a tu correo.',
    });
  };

  const confirmar = async () => {
    if (!verificarCodigo(codigo.trim())) {
      setAviso({ tono: 'error', texto: 'Escribe un código de 6 dígitos.' });
      return;
    }
    setEnviando(true);
    const r = await registrar(nombre.trim(), correo.trim());
    setEnviando(false);
    if (!r.ok) {
      setAviso({ tono: 'error', texto: r.error });
      return;
    }
    router.push('/canales');
  };

  return (
    <Pantalla titulo="Bienvenida a Bimo" simulacion={simulacion} centrado>
      <Texto>Tus ventas de todos los canales, en un solo lugar.</Texto>
      <Texto variante="etiqueta">{paso === 'datos' ? 'PASO 1 DE 3 · TUS DATOS' : 'PASO 2 DE 3 · CÓDIGO'}</Texto>

      {paso === 'datos' ? (
        <>
          <Campo
            etiqueta="Nombre del negocio"
            value={nombre}
            onChangeText={(n) => setNombre(n.slice(0, NOMBRE_MAX))}
            maxLength={NOMBRE_MAX}
            placeholder="Ej. Tienda Doña Marta"
            autoCapitalize="words"
            ayuda={`Así lo verá el banco cuando compartas tu historial · ${nombre.length}/${NOMBRE_MAX}`}
          />
          <Campo
            etiqueta="Correo"
            value={correo}
            onChangeText={setCorreo}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="tu@correo.com"
          />
          <Boton
            titulo={enviando ? 'Enviando…' : 'Enviar código'}
            deshabilitado={!nombreOk || !correoOk || enviando}
            onPress={() => {
              void pedirCodigo();
            }}
          />
        </>
      ) : (
        <>
          <Texto variante="nota">Código enviado a {correo.trim()}</Texto>
          <Campo
            etiqueta="Código de verificación"
            value={codigo}
            onChangeText={(t) => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="123456"
            maxLength={6}
          />
          <Boton
            titulo={enviando ? 'Creando tu cuenta…' : 'Verificar y continuar'}
            deshabilitado={codigo.length !== 6 || enviando}
            onPress={() => {
              void confirmar();
            }}
          />
          <Boton
            titulo="Cambiar correo"
            variante="secundario"
            onPress={() => {
              setPaso('datos');
              setCodigo('');
              setAviso(null);
            }}
          />
        </>
      )}

      {aviso ? <Aviso tono={aviso.tono}>{aviso.texto}</Aviso> : null}

      {comercio.registrado && comercio.avisoCuenta ? <Aviso tono="info">{comercio.avisoCuenta}</Aviso> : null}

      {comercio.registrado ? (
        <Boton titulo="Ir a Hoy" variante="secundario" onPress={() => router.replace('/hoy')} />
      ) : null}
    </Pantalla>
  );
}
