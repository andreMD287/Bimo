// Pantalla 10 — Página del verificador (dueña: Lizeth). Paso 7 del Blueprint; H5. Spec 05.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`. Va a todo el ancho (sin marco).

import { useLocalSearchParams } from 'expo-router';
import { formatoCOP, useVerificacion } from '../../src/hooks';
import { Boton, EnConstruccion, FilaLista, Pantalla, Texto } from '../../src/ui';

const ICONO = { coincide: '✅', sin_sellar: '⚪', no_coincide: '❌' } as const;

export default function Verificar() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const v = useVerificacion(token ?? '');

  if (v.estado !== 'listo' || !v.resumen) {
    return (
      <Pantalla titulo="Verificación de historial">
        <Texto>{v.estado === 'inactivo' ? 'Este enlace ya no está activo.' : 'No encontramos este enlace.'}</Texto>
      </Pantalla>
    );
  }
  const primerSellado = v.dias.find((d) => d.resultado !== 'sin_sellar');
  return (
    <Pantalla titulo={v.comercio?.business_name} simulacion>
      <EnConstruccion />
      <Texto variante="nota">Período {v.periodo?.texto} · {v.resumen.porcentajeTerceros} % verificado por terceros</Texto>
      <Texto variante="monto">{formatoCOP(v.resumen.ventas_minor)}</Texto>
      {v.dias.map((d) => (
        <FilaLista key={d.fecha} titulo={`${ICONO[d.resultado]} ${d.fechaTexto}`} derecha={formatoCOP(d.ventas_minor)} />
      ))}
      {primerSellado ? (
        <Boton titulo="Simular alteración" variante="secundario" onPress={() => v.simularAlteracion(primerSellado.fecha)} />
      ) : null}
    </Pantalla>
  );
}
