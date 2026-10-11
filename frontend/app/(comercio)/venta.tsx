// Pantalla 4 — Registrar venta (dueña: Lizeth). Pasos 2 y 3 del Blueprint; H2, H6, H7, H8.
// Esqueleto: reemplázalo. Usa solo `src/hooks` y `src/ui`.

import { router } from 'expo-router';
import { useState } from 'react';
import { formatoCOP, pesosACentavos, useRegistrarVenta } from '../../src/hooks';
import { Boton, EnConstruccion, Pantalla, TecladoMonto, Texto } from '../../src/ui';

export default function Venta() {
  const { canales, canalEfectivo, estimar, registrar } = useRegistrarVenta();
  const [pesos, setPesos] = useState('');
  const monto = pesosACentavos(pesos);
  const canalId = canalEfectivo?.id ?? canales[0]?.id ?? '';
  const est = estimar([{ canal_id: canalId, monto_minor: monto }]);

  return (
    <Pantalla titulo="Registrar venta">
      <EnConstruccion />
      <Texto variante="monto">{formatoCOP(monto)}</Texto>
      <TecladoMonto valor={pesos} onChange={setPesos} />
      <Texto variante="nota">Comisión estimada {formatoCOP(est.comision_minor)}</Texto>
      <Boton
        titulo="Guardar en efectivo"
        deshabilitado={monto === 0}
        onPress={() => {
          const r = registrar({ pagos: [{ canal_id: canalId, monto_minor: monto }] });
          if (r.ok) router.back();
        }}
      />
    </Pantalla>
  );
}
