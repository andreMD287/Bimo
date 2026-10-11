// Pantalla 8 — Historial de días (dueño: Santiago). Paso 6 del Blueprint.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`.

import { router } from 'expo-router';
import { formatoCOP, useHistorial } from '../../src/hooks';
import { Boton, EnConstruccion, FilaLista, Pantalla } from '../../src/ui';

export default function Historial() {
  const { dias } = useHistorial();
  return (
    <Pantalla titulo="Historial">
      <EnConstruccion />
      {dias.map((d) => (
        <FilaLista
          key={d.fecha}
          titulo={d.fechaTexto}
          detalle={`${d.textoEstado} · ${d.cantidadVentas} ventas`}
          derecha={formatoCOP(d.vendido_minor)}
        />
      ))}
      <Boton titulo="Compartir historial" onPress={() => router.push('/compartir')} />
    </Pantalla>
  );
}
