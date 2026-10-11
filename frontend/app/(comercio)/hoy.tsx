// Pantalla 3 — Hoy (dueña: Lizeth). Paso 4 del Blueprint; H1, H3, H6.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`.

import { router } from 'expo-router';
import { formatoCOP, useHoy } from '../../src/hooks';
import { Boton, EnConstruccion, FilaLista, Pantalla, Tarjeta, Texto } from '../../src/ui';

export default function Hoy() {
  const hoy = useHoy();
  return (
    <Pantalla titulo={hoy.fechaTexto}>
      <EnConstruccion />
      <Tarjeta>
        <Texto variante="nota">Vendido hoy · {hoy.cantidadVentas} ventas · {hoy.textoEstadoDia}</Texto>
        <Texto variante="monto">{formatoCOP(hoy.vendido_minor)}</Texto>
      </Tarjeta>
      {hoy.porCanal.map((c) => (
        <FilaLista key={c.channel} titulo={c.nombre} derecha={formatoCOP(c.monto_minor)} />
      ))}
      <FilaLista titulo="Disponible (caja + cuenta)" derecha={formatoCOP(hoy.disponible.total_minor)} />
      <FilaLista
        titulo="Pendiente de consignar"
        detalle={hoy.pendiente.detalle.map((p) => `${p.nombre} ${formatoCOP(p.monto_minor)} llega ${p.fechaTexto}`).join(' · ')}
        derecha={formatoCOP(hoy.pendiente.total_minor)}
      />
      <FilaLista titulo="Te deben" derecha={formatoCOP(hoy.teDeben.total_minor)} />
      <FilaLista titulo="Comisiones de hoy" detalle={`Estimadas: ${formatoCOP(hoy.comisionEstimada_minor)}`} derecha={formatoCOP(hoy.comisiones_minor)} />
      <Boton titulo="Registrar venta" onPress={() => router.push('/venta')} />
      <Boton titulo="Movimientos" variante="secundario" onPress={() => router.push('/movimientos')} />
      <Boton titulo="Cerrar el día" variante="secundario" onPress={() => router.push('/cierre')} />
      <Boton titulo="Historial" variante="secundario" onPress={() => router.push('/historial')} />
    </Pantalla>
  );
}
