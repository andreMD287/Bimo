// Pantalla 7 — Confirmar y sellar (dueña: Lizeth). Paso 6 del Blueprint.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`.

import { router } from 'expo-router';
import { useSello } from '../../src/hooks';
import { Boton, EnConstruccion, Pantalla, Texto } from '../../src/ui';

export default function Sellar() {
  const sello = useSello();
  return (
    <Pantalla titulo="Confirmar y sellar" simulacion>
      <EnConstruccion />
      <Texto>{sello.resumen || 'No hay días por confirmar.'}</Texto>
      <Texto variante="subtitulo">{sello.textoFase}</Texto>
      {sello.fase === 'listo' ? <Boton titulo="Confirmar con Face ID" onPress={() => void sello.confirmar()} /> : null}
      {sello.fase === 'sellado' || sello.fase === 'nada' ? (
        <Boton titulo="Ver historial" onPress={() => router.push('/historial')} />
      ) : null}
    </Pantalla>
  );
}
