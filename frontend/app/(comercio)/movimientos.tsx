// Pantalla 5 — Movimientos del día (dueña: Lizeth). Pasos 2 y 6 del Blueprint. Spec 01 §6.
// Usa solo `src/hooks` y `src/ui`.
//
// Nada se borra ni se edita: corregir crea una "Corrección" visible que anula la venta, y la
// venta original se queda en la lista, tachada. Después se registra la venta con el monto bueno.

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatoCOP, useMovimientos, type Movimiento } from '../../src/hooks';
import { Aviso, Boton, Campo, FilaLista, Insignia, Pantalla, Tarjeta, Texto, colors, spacing } from '../../src/ui';

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function icono(m: Movimiento): string {
  if (m.esCorreccion) return '↩️';
  switch (m.tipo) {
    case 'Venta':
      return '🛒';
    case 'Abono':
      return '📒';
    case 'Consignación':
      return '🏦';
    case 'Ajuste de caja':
      return '⚖️';
    default:
      return '•';
  }
}

function detalle(m: Movimiento): string {
  const partes = [m.hora, m.detalle];
  if (m.anticipoTotal_minor !== null) partes.push(`anticipo de un total de ${formatoCOP(m.anticipoTotal_minor)}`);
  if (m.nota) partes.push(`"${m.nota}"`);
  return partes.filter(Boolean).join(' · ');
}

export default function Movimientos() {
  const { fechaTexto, movimientos, corregir } = useMovimientos();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [corregido, setCorregido] = useState<string | null>(null);

  const ventas = movimientos.filter((m) => m.tipo === 'Venta' && !m.corregido).length;

  return (
    <Pantalla
      titulo={mayuscula(fechaTexto)}
      subtitulo={`${movimientos.length} movimientos · ${ventas} ventas vigentes`}
      pie={<Boton titulo="Registrar venta" icono="＋" grande onPress={() => router.push('/venta')} />}
    >
      {corregido ? (
        <Aviso tono="exito" titulo="Corrección guardada">
          <Texto variante="nota">
            La venta de {corregido} quedó anulada con una corrección a la vista. Si el monto era otro, registra la venta correcta.
          </Texto>
          <View style={s.accion}>
            <Boton titulo="Registrar la venta correcta" variante="suave" onPress={() => router.push('/venta')} />
          </View>
        </Aviso>
      ) : (
        <Aviso tono="info">Toca una venta para corregirla. Nada se borra: la corrección queda a la vista.</Aviso>
      )}

      {movimientos.length === 0 ? (
        <Aviso tono="info" titulo="Aún no hay movimientos hoy" />
      ) : (
        <Tarjeta>
          {movimientos.map((m, i) => {
            const estaAbierto = abierto === m.id;
            const ultima = i === movimientos.length - 1;
            return (
              <View key={m.id}>
                <FilaLista
                  icono={icono(m)}
                  titulo={m.corregido ? `${m.tipo} · corregida` : m.tipo}
                  detalle={detalle(m)}
                  derecha={formatoCOP(m.monto_minor)}
                  colorDerecha={m.monto_minor < 0 ? colors.dangerText : undefined}
                  tachado={m.corregido}
                  ultima={ultima || estaAbierto || m.verificadoPorTercero}
                  onPress={
                    m.sePuedeCorregir
                      ? () => {
                          setAbierto(estaAbierto ? null : m.id);
                          setMotivo('');
                          setError(null);
                        }
                      : undefined
                  }
                />
                {m.verificadoPorTercero ? (
                  <View style={[s.extra, ultima && !estaAbierto ? null : s.borde]}>
                    <Insignia tono="ok" texto="Confirmado por un tercero" />
                  </View>
                ) : null}
                {estaAbierto ? (
                  <View style={[s.panel, ultima ? null : s.borde]}>
                    <Texto variante="cuerpoFuerte">¿Corregir esta venta de {formatoCOP(m.monto_minor)}?</Texto>
                    <Texto variante="nota">
                      Se agrega una corrección que la anula. La venta original no se borra: se ve tachada.
                    </Texto>
                    <Campo
                      etiqueta="Motivo (opcional)"
                      value={motivo}
                      onChangeText={setMotivo}
                      maxLength={140}
                      placeholder="Ej.: era $ 15.000, no $ 50.000"
                    />
                    {error ? <Aviso tono="error">{error}</Aviso> : null}
                    <Boton
                      titulo="Corregir esta venta"
                      variante="peligro"
                      onPress={() => {
                        const r = corregir(m.id, motivo);
                        if (!r.ok) return setError(r.error);
                        setCorregido(formatoCOP(m.monto_minor));
                        setAbierto(null);
                      }}
                    />
                    <Boton titulo="Cancelar" variante="secundario" onPress={() => setAbierto(null)} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </Tarjeta>
      )}
    </Pantalla>
  );
}

const s = StyleSheet.create({
  accion: { marginTop: spacing.s, alignItems: 'flex-start' },
  extra: { paddingBottom: spacing.m, paddingLeft: 52 },
  borde: { borderBottomWidth: 1, borderBottomColor: colors.border },
  panel: { gap: spacing.m, paddingVertical: spacing.m, backgroundColor: colors.surface },
});
