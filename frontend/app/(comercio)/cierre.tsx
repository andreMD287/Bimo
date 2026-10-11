// Pantalla 6 — Cerrar el día (dueña: Lizeth). Paso 5 del Blueprint; H4.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`.

import { router } from 'expo-router';
import { formatoCOP, useCierre } from '../../src/hooks';
import { Boton, EnConstruccion, FilaLista, Pantalla, Texto } from '../../src/ui';

export default function Cierre() {
  const cierre = useCierre();
  return (
    <Pantalla titulo={`Cerrar ${cierre.fechaTexto}`}>
      <EnConstruccion />
      <Texto variante="nota">{cierre.textoEstadoDia}</Texto>
      <FilaLista titulo="Efectivo que debería haber" derecha={formatoCOP(cierre.esperado.efectivo_minor)} />
      <FilaLista titulo="En la cuenta" derecha={formatoCOP(cierre.esperado.cuenta_minor)} />
      <Boton
        titulo="Cerrar con el efectivo exacto"
        deshabilitado={!cierre.sePuedeCerrar}
        onPress={() => {
          const r = cierre.cerrar({ efectivo_contado_minor: cierre.esperado.efectivo_minor });
          if (r.ok) router.push('/sellar');
        }}
      />
      <Boton titulo="Ir a confirmar y sellar" variante="secundario" onPress={() => router.push('/sellar')} />
    </Pantalla>
  );
}
