// Pantalla 8 — Historial de días (dueño: Santiago). Paso 6 del Blueprint.

import { router } from 'expo-router';
import { formatoCOP, useHistorial } from '../../src/hooks';
import { Boton, FilaLista, Pantalla, Tarjeta, Texto } from '../../src/ui';

export default function Historial() {
  const { dias, resumen } = useHistorial();

  return (
    <Pantalla titulo="Historial">
      <Tarjeta>
        <Texto variante="nota">
          {resumen.sellados} sellados · {resumen.porConfirmar} por confirmar · {resumen.abiertos} abiertos
        </Texto>
      </Tarjeta>

      {dias.map((d) => (
        <FilaLista
          key={d.fecha}
          titulo={d.fechaTexto}
          detalle={`${d.textoEstado} · ${d.cantidadVentas} ventas`}
          derecha={formatoCOP(d.vendido_minor)}
        />
      ))}

      <Boton titulo="Compartir historial" onPress={() => router.push('/compartir')} />
      <Boton titulo="Volver a Hoy" variante="secundario" onPress={() => router.replace('/hoy')} />
    </Pantalla>
  );
}
