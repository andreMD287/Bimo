// Pantalla 5 — Movimientos del día (dueña: Lizeth). Pasos 2 y 6 del Blueprint.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`.

import { formatoCOP, useMovimientos } from '../../src/hooks';
import { EnConstruccion, FilaLista, Pantalla } from '../../src/ui';

export default function Movimientos() {
  const { fechaTexto, movimientos } = useMovimientos();
  return (
    <Pantalla titulo={`Movimientos · ${fechaTexto}`}>
      <EnConstruccion />
      {movimientos.map((m) => (
        <FilaLista
          key={m.id}
          titulo={`${m.tipo}${m.corregido ? ' (corregida)' : ''}`}
          detalle={[m.hora, m.detalle, m.nota].filter(Boolean).join(' · ')}
          derecha={formatoCOP(m.monto_minor)}
        />
      ))}
    </Pantalla>
  );
}
