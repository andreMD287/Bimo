// Componentes básicos, sin estilo elaborado. Lizeth los rediseña después;
// las pantallas los usan desde `src/ui` para que el cambio sea en un solo lugar.

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { color, espacio, radio } from './tema';

export function Pantalla({ titulo, children, simulacion }: { titulo?: string; children?: ReactNode; simulacion?: boolean }) {
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido}>
      {titulo ? <Texto variante="titulo">{titulo}</Texto> : null}
      {simulacion ? <EtiquetaSimulacion /> : null}
      {children}
    </ScrollView>
  );
}

type Variante = 'titulo' | 'subtitulo' | 'cuerpo' | 'nota' | 'monto';
export function Texto({ variante = 'cuerpo', children, color: c }: { variante?: Variante; children?: ReactNode; color?: string }) {
  return <Text style={[s[variante], c ? { color: c } : null]}>{children}</Text>;
}

export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  deshabilitado,
}: {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario';
  deshabilitado?: boolean;
}) {
  const primario = variante === 'primario';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={deshabilitado}
      style={[s.boton, primario ? s.botonPrimario : s.botonSecundario, deshabilitado ? s.deshabilitado : null]}
    >
      <Text style={[s.botonTexto, { color: primario ? color.sobrePrimario : color.primario }]}>{titulo}</Text>
    </Pressable>
  );
}

export function Tarjeta({ children }: { children?: ReactNode }) {
  return <View style={s.tarjeta}>{children}</View>;
}

export function FilaLista({
  titulo,
  detalle,
  derecha,
  onPress,
}: {
  titulo: string;
  detalle?: string;
  derecha?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={s.fila}>
      <View style={{ flex: 1 }}>
        <Text style={s.cuerpo}>{titulo}</Text>
        {detalle ? <Text style={s.nota}>{detalle}</Text> : null}
      </View>
      {derecha ? <Text style={s.cuerpo}>{derecha}</Text> : null}
    </Pressable>
  );
}

export function Campo({ etiqueta, ...props }: { etiqueta: string } & TextInputProps) {
  return (
    <View style={{ gap: espacio.xs }}>
      <Text style={s.nota}>{etiqueta}</Text>
      <TextInput style={s.campo} placeholderTextColor={color.textoSuave} {...props} />
    </View>
  );
}

/** Teclado de monto en pesos enteros. `valor` son los dígitos ("20000"). */
export function TecladoMonto({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];
  const tocar = (t: string) => {
    if (t === '⌫') onChange(valor.slice(0, -1));
    else if ((valor + t).replace(/^0+/, '').length <= 10) onChange((valor + t).replace(/^0+/, ''));
  };
  return (
    <View style={s.teclado}>
      {teclas.map((t) => (
        <Pressable key={t} onPress={() => tocar(t)} style={s.tecla} accessibilityLabel={t === '⌫' ? 'Borrar' : t}>
          <Text style={s.subtitulo}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Etiqueta discreta para lo que se simula (Face ID, sello, envío de código). */
export function EtiquetaSimulacion() {
  return (
    <View style={s.etiqueta}>
      <Text style={s.etiquetaTexto}>Simulación</Text>
    </View>
  );
}

export function EnConstruccion() {
  return <Texto variante="nota">En construcción</Texto>;
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: espacio.l, gap: espacio.m },
  titulo: { fontSize: 24, fontWeight: '700', color: color.texto },
  subtitulo: { fontSize: 18, fontWeight: '600', color: color.texto },
  cuerpo: { fontSize: 16, color: color.texto },
  nota: { fontSize: 13, color: color.textoSuave },
  monto: { fontSize: 32, fontWeight: '700', color: color.texto },
  boton: { paddingVertical: 14, paddingHorizontal: espacio.l, borderRadius: radio.m, alignItems: 'center' },
  botonPrimario: { backgroundColor: color.primario },
  botonSecundario: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.primario },
  botonTexto: { fontSize: 16, fontWeight: '600' },
  deshabilitado: { opacity: 0.4 },
  tarjeta: { backgroundColor: color.superficie, borderRadius: radio.m, padding: espacio.l, gap: espacio.s, borderWidth: 1, borderColor: color.borde },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: espacio.m, borderBottomWidth: 1, borderBottomColor: color.borde, gap: espacio.m },
  campo: { borderWidth: 1, borderColor: color.borde, borderRadius: radio.s, padding: espacio.m, fontSize: 16, backgroundColor: color.superficie, color: color.texto },
  teclado: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s },
  tecla: { width: '31%', flexGrow: 1, paddingVertical: espacio.l, alignItems: 'center', backgroundColor: color.superficie, borderRadius: radio.s, borderWidth: 1, borderColor: color.borde },
  etiqueta: { alignSelf: 'flex-start', paddingHorizontal: espacio.s, paddingVertical: 2, borderRadius: radio.s, backgroundColor: '#EFEAE0' },
  etiquetaTexto: { fontSize: 11, color: color.textoSuave },
});
