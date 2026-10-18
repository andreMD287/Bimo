// Pantalla 10 — Página del verificador (dueña: Lizeth). Paso 7 del Blueprint; H5. Spec 05 §1 y §4.
// Usa solo `src/hooks` y `src/ui`. Va a todo el ancho (sin marco): la abre un analista en su computador.
//
// Totales y porcentaje SOLO con los días que coinciden (spec 05 §4.2). "Stellar" y "blockchain"
// solo aparecen en "¿Cómo funciona?". La verificación es SIMULADA en esta demo.

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { formatoCOP, useVerificacion } from '../../src/hooks';
import {
  Boton,
  EtiquetaSimulacion,
  InsigniaResultado,
  colors,
  iconoCanal,
  radii,
  spacing,
  touch,
  typography,
} from '../../src/ui';

const ANCHO_MAX = 1100;
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const abreviar = (t: string) => (t.length > 12 ? `${t.slice(0, 6)}…${t.slice(-6)}` : t);

function Contenedor({ children, estilo }: { children: ReactNode; estilo?: object }) {
  return (
    <View style={[s.franja, estilo]}>
      <View style={s.contenedor}>{children}</View>
    </View>
  );
}

function Cifra({ etiqueta, valor, detalle, ancho }: { etiqueta: string; valor: string; detalle?: string; ancho: boolean }) {
  return (
    <View style={[s.cifra, ancho ? s.cifraAncha : null]} accessible accessibilityLabel={[etiqueta, valor, detalle].filter(Boolean).join(', ')}>
      <Text style={s.cifraEtiqueta}>{etiqueta.toUpperCase()}</Text>
      <Text style={s.cifraValor} adjustsFontSizeToFit numberOfLines={1}>
        {valor}
      </Text>
      {detalle ? <Text style={s.cifraDetalle}>{detalle}</Text> : null}
    </View>
  );
}

export default function Verificar() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const v = useVerificacion(token ?? '');
  const { width } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const hero = [s.hero, { paddingTop: spacing.xxl + top }];
  const ancho = width >= 820;

  const sellados = v.dias.filter((d) => d.resultado !== 'sin_sellar');
  const [diaPrueba, setDiaPrueba] = useState<string | null>(null);
  const elegido = diaPrueba ?? sellados[0]?.fecha ?? null;

  if (v.estado !== 'listo' || !v.resumen || !v.periodo || !v.comercio) {
    return (
      <ScrollView style={s.pagina} contentContainerStyle={s.paginaContenido}>
        <Contenedor estilo={hero}>
          <Text style={s.marca}>bimo</Text>
          <Text style={s.heroTitulo}>
            {v.estado === 'cargando'
              ? 'Verificando el historial…'
              : v.estado === 'error'
                ? 'No pudimos verificar este historial'
                : v.estado === 'inactivo'
                  ? 'Este enlace ya no está activo'
                  : 'No encontramos este enlace'}
          </Text>
          <Text style={s.heroTexto}>
            {v.estado === 'cargando'
              ? 'Estamos comprobando los registros contra la red pública. Puede tardar unos segundos.'
              : v.estado === 'error'
                ? 'Revisa tu conexión e inténtalo de nuevo. Si el problema sigue, pídele al comercio un enlace nuevo.'
                : v.estado === 'inactivo'
                  ? 'El comercio lo revocó o se venció. Pídele uno nuevo.'
                  : 'Revisa que el enlace esté completo o pídele al comercio que te lo comparta de nuevo.'}
          </Text>
        </Contenedor>
      </ScrollView>
    );
  }

  const r = v.resumen;
  const maxCanal = Math.max(1, ...r.porCanal.map((c) => c.monto_minor));
  const totalDias = v.dias.length;
  const alterado = elegido !== null && v.alterados.includes(elegido);
  const diaElegido = v.dias.find((d) => d.fecha === elegido);

  return (
    <ScrollView style={s.pagina} contentContainerStyle={s.paginaContenido}>
      {/* ─── Hero ─── */}
      <Contenedor estilo={hero}>
        <View style={s.heroArriba}>
          <Text style={s.marca}>bimo</Text>
          <EtiquetaSimulacion />
        </View>
        <Text style={s.heroEtiqueta}>VERIFICACIÓN DE HISTORIAL DE VENTAS</Text>
        <Text style={s.heroTitulo} accessibilityRole="header">
          {v.comercio.business_name}
        </Text>
        <Text style={s.heroTexto}>
          Período {v.periodo.texto} · {totalDias} días.{'\n'}Registros sellados en una red pública que ni Bimo ni el comercio
          pueden modificar.
        </Text>

        <View style={[s.cifras, ancho ? s.fila : null]}>
          <Cifra
            ancho={ancho}
            etiqueta="Ventas que coinciden"
            valor={formatoCOP(r.ventas_minor)}
            detalle={`Solo de los ${r.coinciden} días que coinciden`}
          />
          <Cifra
            ancho={ancho}
            etiqueta="Verificado por terceros"
            valor={`${r.porcentajeTerceros} %`}
            detalle="Registros confirmados por un banco o pasarela, no solo declarados"
          />
          <Cifra
            ancho={ancho}
            etiqueta="Resultado por día"
            valor={`✅ ${r.coinciden} · ⚪ ${r.sinSellar} · ❌ ${r.noCoinciden}`}
            detalle="Coinciden · sin sellar · no coinciden"
          />
        </View>
      </Contenedor>

      {/* ─── Alerta si algo no coincide ─── */}
      {r.noCoinciden > 0 ? (
        <Contenedor>
          <View style={s.alerta} accessibilityRole="alert">
            <Text style={s.alertaTitulo}>
              ❌ {r.noCoinciden === 1 ? '1 día no coincide' : `${r.noCoinciden} días no coinciden`} con lo sellado
            </Text>
            <Text style={s.alertaTexto}>
              Los datos de ese día cambiaron después de sellarse. Sus ventas no se suman a los totales de esta página.
            </Text>
          </View>
        </Contenedor>
      ) : null}

      <Contenedor>
        <View style={[s.columnas, ancho ? s.fila : null]}>
          {/* ─── Resultado por día ─── */}
          <View style={[s.bloque, ancho ? s.bloqueAncho : null]}>
            <Text style={s.titulo} accessibilityRole="header">
              Resultado por día
            </Text>
            <View style={s.tarjeta}>
              {v.dias.map((d, i) => {
                const no = d.resultado === 'no_coincide';
                return (
                  <View key={d.fecha} style={[s.dia, i < v.dias.length - 1 ? s.diaBorde : null, no ? s.diaMal : null]}>
                    <View style={{ flex: 1, gap: spacing.xs }}>
                      <Text style={s.diaFecha}>{mayuscula(d.fechaTexto)}</Text>
                      <InsigniaResultado resultado={d.resultado} enmiendas={d.enmiendas} />
                      {d.tx_hash ? <Text style={s.nota}>Comprobante del sello: {abreviar(d.tx_hash)} (simulado)</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
                      <Text style={[s.diaMonto, no ? s.tachado : d.resultado === 'sin_sellar' ? s.apagado : null]}>
                        {formatoCOP(d.ventas_minor)}
                      </Text>
                      {no ? <Text style={s.notaMal}>No se suma</Text> : null}
                      {d.resultado === 'sin_sellar' ? <Text style={s.nota}>Aún sin sellar</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ─── Totales por canal ─── */}
          <View style={[s.bloque, ancho ? s.bloqueAngosto : null]}>
            <Text style={s.titulo} accessibilityRole="header">
              Ventas por canal
            </Text>
            <View style={s.tarjeta}>
              <Text style={s.nota}>Solo días que coinciden ({r.coinciden} de {totalDias})</Text>
              {r.porCanal.length === 0 ? <Text style={s.cuerpo}>No hay días que coincidan.</Text> : null}
              {r.porCanal.map((c) => (
                <View key={c.channel} style={{ gap: spacing.xs }} accessible accessibilityLabel={`${c.nombre}, ${formatoCOP(c.monto_minor)}`}>
                  <View style={s.canalFila}>
                    <Text style={s.cuerpoFuerte}>
                      {iconoCanal(c.channel)} {c.nombre}
                    </Text>
                    <Text style={s.cuerpoFuerte}>{formatoCOP(c.monto_minor)}</Text>
                  </View>
                  <View style={s.barraFondo}>
                    <View style={[s.barra, { width: `${Math.max(2, Math.round((c.monto_minor * 100) / maxCanal))}%` }]} />
                  </View>
                </View>
              ))}
              <View style={[s.canalFila, s.totalFila]}>
                <Text style={s.cuerpoFuerte}>Total</Text>
                <Text style={s.total}>{formatoCOP(r.ventas_minor)}</Text>
              </View>
              <Text style={s.nota}>Registros con hora dudosa del celular: {r.relojDudoso}</Text>
            </View>

            {/* ─── Simular alteración ─── */}
            {sellados.length > 0 ? (
              <View style={s.prueba}>
                <Text style={s.pruebaTitulo}>Prueba: ¿qué pasa si alguien cambia los datos?</Text>
                <Text style={s.pruebaTexto}>
                  Elige un día sellado y simula que alguien modificó una venta. La página lo detecta y lo saca de los totales.
                </Text>
                <View style={s.diasPrueba} accessibilityRole="radiogroup" accessibilityLabel="Día para la prueba">
                  {sellados.map((d) => {
                    const activo = d.fecha === elegido;
                    return (
                      <Pressable
                        key={d.fecha}
                        onPress={() => setDiaPrueba(d.fecha)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: activo, checked: activo }}
                        style={[s.diaChip, activo ? s.diaChipActivo : null]}
                      >
                        <Text style={[s.diaChipTexto, activo ? s.diaChipTextoActivo : null]}>
                          {activo ? '✓ ' : ''}
                          {d.fechaTexto.split(' ').slice(0, 2).join(' ')}
                          {v.alterados.includes(d.fecha) ? ' ❌' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Boton
                  titulo={alterado ? 'Restaurar el día' : 'Simular alteración'}
                  variante={alterado ? 'secundario' : 'primario'}
                  onPress={() => elegido && v.simularAlteracion(elegido)}
                  ayuda={diaElegido ? `Cambia el resultado del ${diaElegido.fechaTexto}` : undefined}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Contenedor>

      {/* ─── ¿Cómo funciona? ─── */}
      <Contenedor estilo={s.como}>
        <Text style={s.comoTitulo} accessibilityRole="header">
          ¿Cómo funciona?
        </Text>
        <View style={[s.pasos, ancho ? s.fila : null]}>
          {[
            ['1', 'El comercio registra sus ventas', 'Cada venta, de cualquier canal, se anota en la app de Bimo. Nada se borra: los errores se corrigen con ajustes a la vista.'],
            ['2', 'Cada día se sella', 'Al cerrar el día, el dueño lo confirma con su cara. Una huella de las ventas de ese día se guarda en Stellar, una red pública tipo blockchain. Las ventas no se publican: solo la huella.'],
            ['3', 'Tu navegador lo comprueba', 'Esta página recalcula la huella con las ventas que recibiste y la compara con la guardada en Stellar. Si alguien cambió algo, ya no coincide.'],
            ['4', 'Sin confiar en nadie', 'Ni Bimo ni el comercio pueden cambiar un día sellado. Todos los totales los calcula tu propio navegador.'],
          ].map(([n, t, d]) => (
            <View key={n} style={s.paso}>
              <View style={s.pasoNumero}>
                <Text style={s.pasoNumeroTexto}>{n}</Text>
              </View>
              <Text style={s.pasoTitulo}>{t}</Text>
              <Text style={s.pasoTexto}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={s.comoNota}>
          Cuenta del comercio en Stellar: {abreviar(v.comercio.stellar_address)}. En esta demostración la comprobación es simulada.
        </Text>
      </Contenedor>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.white },
  paginaContenido: { paddingBottom: 0 },
  franja: { width: '100%', alignItems: 'center', paddingHorizontal: spacing.l },
  contenedor: { width: '100%', maxWidth: ANCHO_MAX, gap: spacing.l },
  fila: { flexDirection: 'row' },

  hero: { backgroundColor: colors.navy, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl },
  heroArriba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  marca: { ...typography.titulo, color: colors.lavender, letterSpacing: -0.5 },
  heroEtiqueta: { ...typography.etiqueta, color: colors.lavender, marginTop: spacing.l },
  heroTitulo: { ...typography.hero, color: colors.white },
  heroTexto: { ...typography.cuerpo, color: colors.lilac, maxWidth: 680 },
  cifras: { gap: spacing.m, marginTop: spacing.l },
  cifraAncha: { flex: 1 },
  cifra: {
    gap: spacing.xs,
    padding: spacing.l + 4,
    borderRadius: radii.l,
    borderWidth: 1,
    borderColor: colors.purple,
    backgroundColor: colors.purple,
  },
  cifraEtiqueta: { ...typography.etiqueta, color: colors.lilac },
  cifraValor: { ...typography.monto, color: colors.white },
  cifraDetalle: { ...typography.nota, color: colors.lilac },

  alerta: {
    marginTop: spacing.xl,
    padding: spacing.l + 4,
    borderRadius: radii.m,
    backgroundColor: colors.danger,
    gap: spacing.xs,
  },
  alertaTitulo: { ...typography.subtitulo, color: colors.navy },
  alertaTexto: { ...typography.cuerpo, color: colors.navy },

  columnas: { gap: spacing.xl, marginTop: spacing.xl, alignItems: 'flex-start' },
  bloque: { width: '100%', gap: spacing.m },
  bloqueAncho: { flex: 3, width: 'auto' },
  bloqueAngosto: { flex: 2, width: 'auto' },
  titulo: { ...typography.subtitulo, color: colors.text },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: radii.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.l + 4,
    gap: spacing.m,
  },
  cuerpo: { ...typography.cuerpo, color: colors.text },
  cuerpoFuerte: { ...typography.cuerpoFuerte, color: colors.text },
  nota: { ...typography.nota, color: colors.textMuted },
  notaMal: { ...typography.nota, fontWeight: '700', color: colors.dangerText },
  tachado: { textDecorationLine: 'line-through', color: colors.textMuted },
  apagado: { color: colors.textMuted },

  dia: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingVertical: spacing.m },
  diaBorde: { borderBottomWidth: 1, borderBottomColor: colors.border },
  diaMal: { backgroundColor: colors.white, marginHorizontal: -spacing.s, paddingHorizontal: spacing.s, borderRadius: radii.s },
  diaFecha: { ...typography.cuerpoFuerte, color: colors.text },
  diaMonto: { ...typography.cuerpoFuerte, color: colors.text, fontVariant: ['tabular-nums'] },

  canalFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.s },
  barraFondo: { height: 10, borderRadius: radii.pill, backgroundColor: colors.lilac, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.lavender },
  totalFila: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.m },
  total: { ...typography.subtitulo, color: colors.text },

  prueba: {
    gap: spacing.m,
    padding: spacing.l + 4,
    borderRadius: radii.l,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.danger,
    borderStyle: 'dashed',
  },
  pruebaTitulo: { ...typography.cuerpoFuerte, color: colors.text },
  pruebaTexto: { ...typography.nota, color: colors.textMuted },
  diasPrueba: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  diaChip: {
    minHeight: touch.minimo,
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  diaChipActivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  diaChipTexto: { ...typography.nota, fontWeight: '700', color: colors.text },
  diaChipTextoActivo: { color: colors.white },

  como: { backgroundColor: colors.navy, marginTop: spacing.xxxl, paddingVertical: spacing.xxxl },
  comoTitulo: { ...typography.titulo, color: colors.white },
  pasos: { gap: spacing.l },
  paso: { flex: 1, gap: spacing.s },
  pasoNumero: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasoNumeroTexto: { ...typography.cuerpoFuerte, color: colors.navy },
  pasoTitulo: { ...typography.cuerpoFuerte, color: colors.white },
  pasoTexto: { ...typography.nota, color: colors.lilac },
  comoNota: { ...typography.nota, color: colors.lavender, marginTop: spacing.l },
});
