// Pantalla 4 — Registrar venta (dueña: Lizeth). Pasos 2 y 3 del Blueprint; H2, H6, H7, H8.
// Usa solo `src/hooks` y `src/ui`.
//
// QA-04: una venta en efectivo en ≤ 3 toques. Efectivo viene elegido: monto → "Guardar venta".
// "Más opciones" agrega dividir el pago (H7), anticipo (H8) y nota. Si el pago es fiado o es un
// anticipo, el cliente se pide ahí mismo y no deja guardar sin él (V-07). La nota llega hasta 140 (V-10).

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatoBps, formatoCOP, pesosACentavos, useRegistrarVenta, type CanalConfig, type PagoInput } from '../../src/hooks';
import {
  Aviso,
  Boton,
  Campo,
  ChipCanal,
  FilaLista,
  MontoGrande,
  Pantalla,
  Seccion,
  Tarjeta,
  TecladoMonto,
  Texto,
  spacing,
} from '../../src/ui';
import { NOTA_MAX, contadorNota, faltaCliente, recortarNota } from '../../src/ui/formularios';

function detalleCanal(c: CanalConfig): string {
  if (c.channel === 'fiado') return 'Te pagan después';
  const dias = c.dias_consignacion === 0 ? 'al instante' : `${c.dias_consignacion} ${c.dias_consignacion === 1 ? 'día' : 'días'}`;
  return c.comision_bps > 0 ? `${formatoBps(c.comision_bps)} · ${dias}` : `Sin comisión · ${dias}`;
}

const soloDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);

export default function Venta() {
  const { canales, canalEfectivo, clientes, estimar, registrar, agregarCliente } = useRegistrarVenta();
  const [pesos, setPesos] = useState('');
  const [canalId, setCanalId] = useState(canalEfectivo?.id ?? canales[0]?.id ?? '');
  const [masOpciones, setMasOpciones] = useState(false);

  const [dividir, setDividir] = useState(false);
  const [canal2Id, setCanal2Id] = useState('');
  const [pesos2, setPesos2] = useState('');

  const [anticipo, setAnticipo] = useState(false);
  const [totalAnticipo, setTotalAnticipo] = useState('');

  const [clienteId, setClienteId] = useState<string | null>(null);
  const [nuevoCliente, setNuevoCliente] = useState('');
  const [nota, setNota] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [guardada, setGuardada] = useState<string | null>(null);

  const canal = canales.find((c) => c.id === canalId) ?? null;
  const canal2 = canales.find((c) => c.id === canal2Id) ?? null;
  const total = pesosACentavos(pesos);
  const parte2 = dividir && canal2 ? Math.min(pesosACentavos(pesos2), total) : 0;
  const parte1 = total - parte2;

  const pagos: PagoInput[] = [];
  if (parte1 > 0) pagos.push({ canal_id: canalId, monto_minor: parte1, customer_id: canal?.channel === 'fiado' ? clienteId : null });
  if (parte2 > 0) pagos.push({ canal_id: canal2Id, monto_minor: parte2, customer_id: canal2?.channel === 'fiado' ? clienteId : null });
  const est = estimar(pagos);

  const channels = [canal?.channel, parte2 > 0 ? canal2?.channel : undefined].filter((c): c is NonNullable<typeof c> => !!c);
  const necesitaCliente = anticipo || channels.includes('fiado') || canal2?.channel === 'fiado';
  // V-07: no se deja guardar un fiado sin cliente
  const faltaElCliente = faltaCliente({ channels, anticipo, clienteId });
  const totalAnticipoMinor = pesosACentavos(totalAnticipo);

  function reiniciar() {
    setPesos('');
    setCanalId(canalEfectivo?.id ?? canales[0]?.id ?? '');
    setMasOpciones(false);
    setDividir(false);
    setCanal2Id('');
    setPesos2('');
    setAnticipo(false);
    setTotalAnticipo('');
    setClienteId(null);
    setNota('');
    setError(null);
    setGuardada(null);
  }

  function guardar() {
    if (faltaElCliente) return setError('Elige a quién le fías.');
    const r = registrar({
      pagos,
      nota: nota.trim() || undefined,
      anticipo: anticipo && clienteId ? { total_minor: totalAnticipoMinor, customer_id: clienteId } : undefined,
    });
    if (!r.ok) return setError(r.error);
    setError(null);
    setGuardada(formatoCOP(anticipo ? totalAnticipoMinor : total));
  }

  if (guardada) {
    return (
      <Pantalla
        pie={
          <>
            <Boton titulo="Registrar otra venta" grande onPress={reiniciar} />
            <Boton titulo="Volver a Hoy" variante="secundario" onPress={() => router.back()} />
          </>
        }
      >
        <View style={s.exito}>
          <Texto variante="montoGrande" centrado>
            ✓
          </Texto>
          <Texto variante="titulo" centrado>
            Venta guardada
          </Texto>
          <Texto variante="subtitulo" centrado>
            {guardada}
          </Texto>
          <Texto variante="nota" centrado>
            Ya aparece en "Hoy". Si te equivocaste, la corriges desde Movimientos.
          </Texto>
        </View>
      </Pantalla>
    );
  }

  return (
    <Pantalla
      pie={
        <>
          {error ? <Aviso tono="error">{error}</Aviso> : null}
          {!error && faltaElCliente && total > 0 ? <Texto variante="nota" centrado>Elige a quién le fías para poder guardar.</Texto> : null}
          <Boton
            titulo={total > 0 ? `Guardar venta · ${formatoCOP(total)}` : 'Guardar venta'}
            grande
            deshabilitado={total === 0 || !canal || faltaElCliente}
            onPress={guardar}
          />
        </>
      }
    >
      <MontoGrande etiqueta={anticipo ? 'Recibes ahora' : 'Monto'} monto={formatoCOP(total)} />

      <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="¿Cómo te pagaron?">
        {canales.map((c) => (
          <ChipCanal
            key={c.id}
            nombre={c.nombre}
            detalle={detalleCanal(c)}
            seleccionado={c.id === canalId}
            onPress={() => {
              setCanalId(c.id);
              setError(null);
            }}
          />
        ))}
      </View>

      <TecladoMonto
        valor={pesos}
        onChange={(v) => {
          setPesos(v);
          setError(null);
        }}
      />

      {total > 0 ? (
        <Tarjeta variante="destacada" titulo="Lo que va a pasar">
          {est.llegadas.map((l, i) => (
            <Texto key={`${l.nombre}-${i}`}>
              {l.inmediata
                ? `${formatoCOP(l.monto_minor)} por ${l.nombre}: ya es tuyo.`
                : `${formatoCOP(l.monto_minor)} por ${l.nombre}: llega el ${l.fechaTexto}.`}
            </Texto>
          ))}
          {pagos.some((p) => canales.find((c) => c.id === p.canal_id)?.channel === 'fiado') ? (
            <Texto>Lo fiado queda en "Te deben" hasta que te paguen.</Texto>
          ) : null}
          <Texto variante="cuerpoFuerte">
            {est.comision_minor > 0 ? `Comisión estimada: ${formatoCOP(est.comision_minor)}` : 'Sin comisión'}
          </Texto>
        </Tarjeta>
      ) : null}

      {necesitaCliente ? (
        <Seccion titulo={faltaElCliente ? "¿A quién le fías? (obligatorio)" : "Cliente"}>
          <View style={s.chips}>
            {clientes.map((c) => (
              <ChipCanal key={c.id} nombre={c.display_name} seleccionado={c.id === clienteId} onPress={() => setClienteId(c.id)} />
            ))}
          </View>
          <View style={s.fila}>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Cliente nuevo" value={nuevoCliente} onChangeText={setNuevoCliente} placeholder="Nombre" />
            </View>
            <Boton
              titulo="Agregar"
              variante="secundario"
              deshabilitado={nuevoCliente.trim() === ''}
              onPress={() => {
                setClienteId(agregarCliente(nuevoCliente).id);
                setNuevoCliente('');
              }}
            />
          </View>
        </Seccion>
      ) : null}

      <Boton
        titulo={masOpciones ? 'Menos opciones' : 'Más opciones: dividir, anticipo o nota'}
        variante="suave"
        icono={masOpciones ? '−' : '＋'}
        onPress={() => setMasOpciones(!masOpciones)}
      />

      {masOpciones ? (
        <>
          <Seccion titulo="Dividir el pago">
            <Boton
              titulo={dividir ? 'No dividir' : 'Pagó con dos medios'}
              variante="secundario"
              onPress={() => {
                setDividir(!dividir);
                setPesos2('');
              }}
            />
            {dividir ? (
              <>
                <Texto variante="nota">¿Con qué pagó la otra parte?</Texto>
                <View style={s.chips}>
                  {canales
                    .filter((c) => c.id !== canalId)
                    .map((c) => (
                      <ChipCanal key={c.id} nombre={c.nombre} seleccionado={c.id === canal2Id} onPress={() => setCanal2Id(c.id)} />
                    ))}
                </View>
                <Campo
                  etiqueta={`Cuánto pagó con ${canal2?.nombre ?? 'el otro medio'} (en pesos)`}
                  value={pesos2}
                  onChangeText={(t) => setPesos2(soloDigitos(t))}
                  keyboardType="number-pad"
                  placeholder="0"
                />
                {canal2 && parte2 > 0 ? (
                  <Tarjeta>
                    <FilaLista titulo={canal?.nombre ?? ''} derecha={formatoCOP(parte1)} />
                    <FilaLista titulo={canal2.nombre} derecha={formatoCOP(parte2)} ultima />
                  </Tarjeta>
                ) : null}
              </>
            ) : null}
          </Seccion>

          <Seccion titulo="Anticipo">
            <Boton
              titulo={anticipo ? 'No es anticipo' : 'Es un anticipo (pagará el resto después)'}
              variante="secundario"
              onPress={() => setAnticipo(!anticipo)}
            />
            {anticipo ? (
              <>
                <Campo
                  etiqueta="Valor total del pedido (en pesos)"
                  value={totalAnticipo}
                  onChangeText={(t) => setTotalAnticipo(soloDigitos(t))}
                  keyboardType="number-pad"
                  placeholder="0"
                />
                {totalAnticipoMinor > total && total > 0 ? (
                  <Texto variante="nota">Quedará debiendo {formatoCOP(totalAnticipoMinor - total)}.</Texto>
                ) : null}
              </>
            ) : null}
          </Seccion>

          <Campo
            etiqueta="Nota (opcional)"
            value={nota}
            onChangeText={(n) => setNota(recortarNota(n))}
            maxLength={NOTA_MAX}
            placeholder="Ej.: torta de cumpleaños"
            ayuda={contadorNota(nota)}
          />
        </>
      ) : null}

    </Pantalla>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  fila: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.s },
  exito: { flex: 1, alignItems: 'center', gap: spacing.m, paddingTop: spacing.xxxl },
});
