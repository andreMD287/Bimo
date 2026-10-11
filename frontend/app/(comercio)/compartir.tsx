// Pantalla 9 — Compartir historial (dueño: Santiago). Paso 7 del Blueprint.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`.

import { router } from 'expo-router';
import { useEnlaces } from '../../src/hooks';
import { Boton, EnConstruccion, FilaLista, Pantalla } from '../../src/ui';

export default function Compartir() {
  const { enlaces, periodoPosible, crear, revocar } = useEnlaces();
  return (
    <Pantalla titulo="Compartir historial" simulacion>
      <EnConstruccion />
      <Boton
        titulo="Generar enlace (30 días)"
        onPress={() => crear({ desde: periodoPosible.desde, hasta: periodoPosible.hasta, vigencia_dias: 30 })}
      />
      {enlaces.map((e) => (
        <FilaLista
          key={e.id}
          titulo={e.periodoTexto}
          detalle={`${e.activo ? `Vence ${e.venceTexto}` : 'Revocado o vencido'} · abierto ${e.vistas} veces`}
          derecha={e.activo ? 'Revocar' : undefined}
          onPress={e.activo ? () => revocar(e.id) : undefined}
        />
      ))}
      <Boton titulo="Ver como verificador" variante="secundario" onPress={() => router.push('/verificar/demo')} />
    </Pantalla>
  );
}
