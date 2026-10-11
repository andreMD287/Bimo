// Pantalla 2 — Configurar canales (dueño: Santiago). Paso 1 del Blueprint.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`.

import { router } from 'expo-router';
import { formatoBps, useCanales } from '../src/hooks';
import { Boton, EnConstruccion, FilaLista, Pantalla } from '../src/ui';

export default function Canales() {
  const { canales, alternar } = useCanales();
  return (
    <Pantalla titulo="¿Cómo te pagan?">
      <EnConstruccion />
      {canales.map((c) => (
        <FilaLista
          key={c.id}
          titulo={`${c.activo ? '☑' : '☐'} ${c.nombre}`}
          detalle={`Comisión ${formatoBps(c.comision_bps)} · llega en ${c.dias_consignacion} días`}
          onPress={() => alternar(c.id)}
        />
      ))}
      <Boton titulo="Listo" onPress={() => router.replace('/hoy')} />
    </Pantalla>
  );
}
