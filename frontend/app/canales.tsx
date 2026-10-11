// Pantalla 2 — Configurar canales (dueño: Santiago). Paso 1 del Blueprint.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { formatoBps, useCanales, type CanalConfig } from '../src/hooks';
import { Boton, Campo, Pantalla, Tarjeta, Texto, color } from '../src/ui';

/** 150 → "1,5"; 300 → "3". */
function bpsAInput(bps: number): string {
  return formatoBps(bps).replace(/\s*%$/, '');
}

/** "1,5" o "1.5" → 150. null si no es un porcentaje válido. */
function inputABps(texto: string): number | null {
  const t = texto.trim().replace(/\s*%\s*$/, '').replace(',', '.');
  if (t === '' || !/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const partes = t.split('.');
  const entero = Number(partes[0]);
  const dec = ((partes[1] ?? '') + '00').slice(0, 2);
  return entero * 100 + Number(dec);
}

function EditorCanal({
  canal,
  onGuardar,
  onAlternar,
}: {
  canal: CanalConfig;
  onGuardar: (c: CanalConfig) => void;
  onAlternar: () => void;
}) {
  const [comision, setComision] = useState(bpsAInput(canal.comision_bps));
  const [dias, setDias] = useState(String(canal.dias_consignacion));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComision(bpsAInput(canal.comision_bps));
    setDias(String(canal.dias_consignacion));
  }, [canal.comision_bps, canal.dias_consignacion, canal.id]);

  const aplicar = () => {
    const bps = inputABps(comision);
    const d = Number(dias.trim());
    if (bps === null || bps < 0 || bps > 10000) {
      setError('La comisión debe ser un porcentaje entre 0 y 100.');
      return;
    }
    if (!Number.isInteger(d) || d < 0 || d > 60) {
      setError('Los días de consignación deben ser un número entero entre 0 y 60.');
      return;
    }
    setError(null);
    onGuardar({ ...canal, comision_bps: bps, dias_consignacion: d });
  };

  return (
    <Tarjeta>
      <Texto variante="subtitulo">{canal.nombre}</Texto>
      <Texto variante="nota">{canal.activo ? 'Encendido' : 'Apagado'}</Texto>
      <Boton
        titulo={canal.activo ? 'Apagar' : 'Encender'}
        variante="secundario"
        onPress={onAlternar}
      />
      {canal.activo ? (
        <>
          <Campo
            etiqueta="Comisión (%)"
            value={comision}
            onChangeText={setComision}
            onEndEditing={aplicar}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <Campo
            etiqueta="Días para consignar"
            value={dias}
            onChangeText={(t) => setDias(t.replace(/\D/g, '').slice(0, 2))}
            onEndEditing={aplicar}
            keyboardType="number-pad"
            placeholder="0"
          />
          <Texto variante="nota">
            Comisión {formatoBps(canal.comision_bps)}
            {canal.dias_consignacion === 0
              ? ' · la plata queda de una vez'
              : ` · llega en ${canal.dias_consignacion} días`}
          </Texto>
          <Boton titulo="Guardar canal" variante="secundario" onPress={aplicar} />
          {error ? <Texto variante="nota" color={color.error}>{error}</Texto> : null}
        </>
      ) : null}
    </Tarjeta>
  );
}

export default function Canales() {
  const { canales, guardar, alternar } = useCanales();

  return (
    <Pantalla titulo="¿Cómo te pagan?">
      <Texto variante="nota">
        Enciende los canales que usas. Para cada uno indica la comisión y en cuántos días te consignan.
      </Texto>
      {canales.map((c) => (
        <EditorCanal
          key={c.id}
          canal={c}
          onGuardar={guardar}
          onAlternar={() => alternar(c.id)}
        />
      ))}
      <Boton titulo="Listo" onPress={() => router.replace('/hoy')} />
    </Pantalla>
  );
}
