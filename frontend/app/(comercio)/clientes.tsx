// Clientes de fiado (dueña: Lizeth; L-05). Historia H8. Spec 01 §4.2 y §6, spec 04 §4.1 y §9.
// Usa solo `src/hooks` y `src/ui`.
//
// Lista de clientes con lo que deben (saldo de `por_cobrar_clientes`, spec 04 §9), registrar un
// abono en efectivo, Bre-B o billetera (`abono_cliente`, spec 04 §4.1) y crear un cliente (nombre ≤ 60).

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatoCOP, pesosACentavos, useHoy, useRegistrarVenta } from '../../src/hooks';
import {
  Aviso,
  Boton,
  Campo,
  ChipCanal,
  EstadoVacio,
  FilaLista,
  MontoGrande,
  Pantalla,
  Seccion,
  Tarjeta,
  TecladoMonto,
  Texto,
  colors,
  spacing,
} from '../../src/ui';

/** Spec 01 §4.2: `customers.display_name` de máximo 60 caracteres. */
const NOMBRE_CLIENTE_MAX = 60;
/** Spec 04 §4.1: un abono entra a caja (efectivo) o a la cuenta (Bre-B o billetera). */
const CANALES_ABONO = ['efectivo', 'breb', 'transferencia_otro'];

export default function Clientes() {
  const { clientes, canales, registrarAbono, agregarCliente } = useRegistrarVenta();
  const { teDeben } = useHoy();
  const [elegido, setElegido] = useState<string | null>(null);
  const [canalId, setCanalId] = useState<string | null>(null);
  const [pesos, setPesos] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [aviso, setAviso] = useState<{ tono: 'exito' | 'error'; texto: string } | null>(null);

  const saldoDe = (id: string) => teDeben.detalle.find((d) => d.customer_id === id)?.monto_minor ?? 0;
  const ordenados = [...clientes].sort((a, b) => saldoDe(b.id) - saldoDe(a.id) || a.display_name.localeCompare(b.display_name));
  const canalesAbono = canales.filter((c) => CANALES_ABONO.includes(c.channel));
  const cliente = clientes.find((c) => c.id === elegido) ?? null;
  const saldo = cliente ? saldoDe(cliente.id) : 0;
  const abono = pesosACentavos(pesos);
  const canalAbono = canalId ?? canalesAbono[0]?.id ?? null;

  function abonar() {
    if (!cliente || !canalAbono) return;
    const r = registrarAbono({ customer_id: cliente.id, canal_id: canalAbono, monto_minor: abono });
    if (!r.ok) return setAviso({ tono: 'error', texto: r.error });
    const queda = saldo - abono;
    setAviso({
      tono: 'exito',
      texto: `Abono de ${formatoCOP(abono)} guardado. ${queda > 0 ? `${cliente.display_name} todavía debe ${formatoCOP(queda)}.` : `${cliente.display_name} quedó al día.`}`,
    });
    setPesos('');
  }

  return (
    <Pantalla titulo="Te deben" subtitulo={`Total: ${formatoCOP(teDeben.total_minor)}`}>
      {aviso ? <Aviso tono={aviso.tono}>{aviso.texto}</Aviso> : null}

      {clientes.length === 0 ? (
        <EstadoVacio icono="📒" titulo="Todavía no tienes clientes" texto="Cuando fíes una venta, el cliente aparece aquí con lo que te debe." />
      ) : (
        <Tarjeta>
          {ordenados.map((c, i) => {
            const debe = saldoDe(c.id);
            return (
              <FilaLista
                key={c.id}
                icono="📒"
                titulo={c.display_name}
                detalle={debe > 0 ? 'Te debe' : 'Al día'}
                derecha={formatoCOP(debe)}
                colorDerecha={debe > 0 ? colors.dangerText : colors.successText}
                onPress={() => {
                  setElegido(elegido === c.id ? null : c.id);
                  setPesos('');
                  setAviso(null);
                }}
                ultima={i === ordenados.length - 1}
              />
            );
          })}
        </Tarjeta>
      )}

      {cliente ? (
        <Seccion titulo={`Abono de ${cliente.display_name}`}>
          <Tarjeta>
            <MontoGrande tamano="mediano" etiqueta="Te debe" monto={formatoCOP(saldo)} />
            {saldo === 0 ? <Texto variante="nota">No te debe nada. Igual puedes registrar un abono adelantado.</Texto> : null}
            <Texto variante="nota">¿Cómo te pagó?</Texto>
            <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="Cómo te pagó el abono">
              {canalesAbono.map((c) => (
                <ChipCanal key={c.id} nombre={c.nombre} seleccionado={c.id === canalAbono} onPress={() => setCanalId(c.id)} />
              ))}
            </View>
            <MontoGrande tamano="mediano" etiqueta="Abona" monto={formatoCOP(abono)} />
            <TecladoMonto valor={pesos} onChange={setPesos} />
            {abono > 0 && saldo > 0 ? (
              <Texto variante="cuerpoFuerte">
                {abono >= saldo ? 'Queda al día.' : `Después del abono debe ${formatoCOP(saldo - abono)}.`}
              </Texto>
            ) : null}
            <Boton titulo={abono > 0 ? `Registrar abono · ${formatoCOP(abono)}` : 'Registrar abono'} deshabilitado={abono === 0 || !canalAbono} onPress={abonar} />
          </Tarjeta>
        </Seccion>
      ) : clientes.length > 0 ? (
        <Texto variante="nota">Toca un cliente para registrar un abono.</Texto>
      ) : null}

      <Seccion titulo="Nuevo cliente">
        <View style={s.fila}>
          <View style={{ flex: 1 }}>
            <Campo
              etiqueta="Nombre"
              value={nuevo}
              onChangeText={(t) => setNuevo(t.slice(0, NOMBRE_CLIENTE_MAX))}
              maxLength={NOMBRE_CLIENTE_MAX}
              placeholder="Ej.: Doña Rosa"
            />
          </View>
          <Boton
            titulo="Agregar"
            variante="secundario"
            deshabilitado={nuevo.trim() === ''}
            onPress={() => {
              const c = agregarCliente(nuevo);
              setNuevo('');
              setElegido(c.id);
              setAviso({ tono: 'exito', texto: `${c.display_name} quedó en tu lista.` });
            }}
          />
        </View>
      </Seccion>
    </Pantalla>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  fila: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.s },
});
