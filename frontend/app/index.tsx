// Pantalla 1 — Bienvenida y registro (dueño: Santiago). Paso 1 del Blueprint.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`.

import { router } from 'expo-router';
import { useState } from 'react';
import { useComercio } from '../src/hooks';
import { Boton, Campo, EnConstruccion, Pantalla, Texto } from '../src/ui';

export default function Bienvenida() {
  const { comercio, registrar } = useComercio();
  const [nombre, setNombre] = useState(comercio.business_name);
  const [correo, setCorreo] = useState('marta@ejemplo.co');

  return (
    <Pantalla titulo="Bienvenida a Bimo" simulacion>
      <EnConstruccion />
      <Texto>Tus ventas de todos los canales, en un solo lugar.</Texto>
      <Campo etiqueta="Nombre del negocio" value={nombre} onChangeText={setNombre} />
      <Campo etiqueta="Correo" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoCapitalize="none" />
      <Boton
        titulo="Crear mi cuenta"
        deshabilitado={nombre.trim() === ''}
        onPress={() => {
          registrar(nombre, correo);
          router.push('/canales');
        }}
      />
      {comercio.registrado ? <Boton titulo="Ir a Hoy" variante="secundario" onPress={() => router.replace('/hoy')} /> : null}
    </Pantalla>
  );
}
