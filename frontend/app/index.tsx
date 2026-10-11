// Pantalla 1 — Bienvenida y registro (dueño: Santiago). Paso 1 del Blueprint.

import { router } from 'expo-router';
import { useState } from 'react';
import { useComercio } from '../src/hooks';
import { Boton, Campo, Pantalla, Texto } from '../src/ui';

type Paso = 'datos' | 'codigo';

export default function Bienvenida() {
  const { comercio, enviarCodigo, verificarCodigo, registrar } = useComercio();
  const [paso, setPaso] = useState<Paso>('datos');
  const [nombre, setNombre] = useState(comercio.business_name);
  const [correo, setCorreo] = useState(comercio.correo ?? 'marta@ejemplo.co');
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const correoOk = correo.trim().includes('@') && correo.trim().includes('.');
  const nombreOk = nombre.trim().length > 0;

  const pedirCodigo = async () => {
    if (!nombreOk || !correoOk || enviando) return;
    setEnviando(true);
    setAviso(null);
    await enviarCodigo(correo.trim());
    setEnviando(false);
    setPaso('codigo');
    setAviso('Te enviamos un código de 6 dígitos a tu correo. En esta demo sirve cualquiera.');
  };

  const confirmar = () => {
    if (!verificarCodigo(codigo.trim())) {
      setAviso('Escribe un código de 6 dígitos.');
      return;
    }
    registrar(nombre.trim(), correo.trim());
    router.push('/canales');
  };

  return (
    <Pantalla titulo="Bienvenida a Bimo" simulacion>
      <Texto>Tus ventas de todos los canales, en un solo lugar.</Texto>

      {paso === 'datos' ? (
        <>
          <Campo
            etiqueta="Nombre del negocio"
            value={nombre}
            onChangeText={setNombre}
            placeholder="Ej. Tienda Doña Marta"
            autoCapitalize="words"
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
          <Boton titulo="Verificar y continuar" deshabilitado={codigo.length !== 6} onPress={confirmar} />
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

      {aviso ? <Texto variante="nota">{aviso}</Texto> : null}

      {comercio.registrado ? (
        <Boton titulo="Ir a Hoy" variante="secundario" onPress={() => router.replace('/hoy')} />
      ) : null}
    </Pantalla>
  );
}
