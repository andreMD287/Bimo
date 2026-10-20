// Sistema de diseño de Bimo (paleta Velto). Las pantallas usan estos componentes desde
// `src/ui`; ninguno escribe un color directo: todo sale de `tokens.ts`.
//
// Accesibilidad: todo lo que se toca mide al menos 48 px de alto, anuncia su rol y su
// estado, y ningún estado se distingue solo por el color (siempre ícono + texto).

import { useState, type ReactNode } from 'react';
import { MODO_REAL } from '../runtime/config';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatoCOP } from '../lib/dinero';
import { TECLAS, teclear } from './teclado';
import { borders, colors, radii, shadow, spacing, touch, typography } from './tokens';

// ─── Pantalla ──────────────────────────────────────────────────────────────────

/**
 * Contenedor de cada pantalla del dueño: fondo `bg`, desplazable.
 * `pie` queda fijo abajo, siempre a mano (por ejemplo, el botón "Registrar venta").
 */
export function Pantalla({
  titulo,
  subtitulo,
  children,
  simulacion,
  pie,
  centrado,
}: {
  titulo?: string;
  subtitulo?: string;
  children?: ReactNode;
  simulacion?: boolean;
  pie?: ReactNode;
  /** Para pantallas sin barra de navegación: respeta la hora y la batería y centra el contenido en vertical. */
  centrado?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.pantalla}>
      <ScrollView
        style={s.pantalla}
        contentContainerStyle={[
          s.contenido,
          centrado ? { flexGrow: 1, justifyContent: 'center', paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl } : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {titulo || simulacion ? (
          <View style={s.encabezado}>
            {titulo ? (
              <Text style={s.titulo} accessibilityRole="header">
                {titulo}
              </Text>
            ) : null}
            {subtitulo ? <Text style={s.nota}>{subtitulo}</Text> : null}
            {simulacion && !MODO_REAL ? <EtiquetaSimulacion /> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {pie ? <View style={s.pie}>{pie}</View> : null}
    </View>
  );
}

// ─── Texto ─────────────────────────────────────────────────────────────────────

type Variante = 'titulo' | 'subtitulo' | 'cuerpo' | 'cuerpoFuerte' | 'nota' | 'etiqueta' | 'monto' | 'montoGrande';

export function Texto({
  variante = 'cuerpo',
  children,
  color: c,
  centrado,
  tachado,
}: {
  variante?: Variante;
  children?: ReactNode;
  color?: string;
  centrado?: boolean;
  tachado?: boolean;
}) {
  return (
    <Text
      style={[
        s[variante],
        c ? { color: c } : null,
        centrado ? s.centrado : null,
        tachado ? s.tachado : null,
      ]}
      accessibilityRole={variante === 'titulo' || variante === 'subtitulo' ? 'header' : undefined}
    >
      {children}
    </Text>
  );
}

// ─── Botón ─────────────────────────────────────────────────────────────────────

type VarianteBoton = 'primario' | 'secundario' | 'suave' | 'peligro';

/**
 * - primario: fondo morado, texto blanco (la acción principal; una por pantalla)
 * - secundario: borde morado, texto morado
 * - suave: fondo lila, texto morado (acciones de apoyo)
 * - peligro: fondo naranja, texto navy (corregir, simular alteración)
 */
export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  deshabilitado,
  grande,
  icono,
  ayuda,
}: {
  titulo: string;
  onPress: () => void;
  variante?: VarianteBoton;
  deshabilitado?: boolean;
  grande?: boolean;
  icono?: string;
  /** Lo que pasa al tocarlo, para el lector de pantalla. */
  ayuda?: string;
}) {
  const v = BOTON[variante];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityHint={ayuda}
      accessibilityState={{ disabled: !!deshabilitado }}
      onPress={onPress}
      disabled={deshabilitado}
      style={({ pressed }) => [
        s.boton,
        grande ? s.botonGrande : null,
        { backgroundColor: v.fondo, borderColor: v.borde },
        pressed ? s.presionado : null,
        deshabilitado ? s.deshabilitado : null,
      ]}
    >
      {icono ? <Text style={[s.botonTexto, { color: v.texto }]}>{icono}</Text> : null}
      <Text style={[s.botonTexto, grande ? s.botonTextoGrande : null, { color: v.texto }]}>{titulo}</Text>
    </Pressable>
  );
}

const BOTON: Record<VarianteBoton, { fondo: string; texto: string; borde: string }> = {
  primario: { fondo: colors.primary, texto: colors.onPrimary, borde: colors.primary },
  secundario: { fondo: colors.surface, texto: colors.primary, borde: colors.primary },
  suave: { fondo: colors.surfaceAlt, texto: colors.primary, borde: colors.surfaceAlt },
  peligro: { fondo: colors.danger, texto: colors.navy, borde: colors.danger },
};

// ─── Tarjeta ───────────────────────────────────────────────────────────────────

type VarianteTarjeta = 'normal' | 'destacada' | 'oscura';

/** normal: blanca · destacada: lila · oscura: navy (usa `Texto` con color `colors.white`). */
export function Tarjeta({
  children,
  variante = 'normal',
  titulo,
  estilo,
}: {
  children?: ReactNode;
  variante?: VarianteTarjeta;
  titulo?: string;
  estilo?: StyleProp<ViewStyle>;
}) {
  const fondo = variante === 'oscura' ? colors.navy : variante === 'destacada' ? colors.surfaceAlt : colors.surface;
  return (
    <View style={[s.tarjeta, { backgroundColor: fondo }, variante === 'normal' ? s.tarjetaBorde : null, estilo]}>
      {titulo ? (
        <Text style={[s.etiqueta, { color: variante === 'oscura' ? colors.lilac : colors.textMuted }]} accessibilityRole="header">
          {titulo.toUpperCase()}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** Título de una sección dentro de la pantalla, con una acción opcional a la derecha. */
export function Seccion({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: { titulo: string; onPress: () => void };
  children?: ReactNode;
}) {
  return (
    <View style={{ gap: spacing.s }}>
      <View style={s.seccionCabeza}>
        <Text style={s.subtitulo} accessibilityRole="header">
          {titulo}
        </Text>
        {accion ? (
          <Pressable accessibilityRole="link" onPress={accion.onPress} style={s.enlace} hitSlop={8}>
            <Text style={s.enlaceTexto}>{accion.titulo}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// ─── Fila de lista ─────────────────────────────────────────────────────────────

export function FilaLista({
  titulo,
  detalle,
  derecha,
  derechaDetalle,
  icono,
  onPress,
  tachado,
  colorDerecha,
  ultima,
}: {
  titulo: string;
  detalle?: string;
  derecha?: string;
  derechaDetalle?: string;
  icono?: string;
  onPress?: () => void;
  /** Para lo que se corrigió: se ve tachado pero no desaparece. */
  tachado?: boolean;
  colorDerecha?: string;
  /** Sin línea divisoria abajo. */
  ultima?: boolean;
}) {
  const etiqueta = [titulo, detalle, derecha, derechaDetalle].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={etiqueta}
      style={({ pressed }) => [s.fila, ultima ? null : s.filaBorde, pressed && onPress ? s.presionadoFila : null]}
    >
      {icono ? (
        <View style={s.filaIcono}>
          <Text style={s.filaIconoTexto}>{icono}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={[s.cuerpoFuerte, tachado ? s.tachado : null]}>{titulo}</Text>
        {detalle ? <Text style={s.nota}>{detalle}</Text> : null}
      </View>
      {derecha || derechaDetalle ? (
        <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
          {derecha ? (
            <Text style={[s.cuerpoFuerte, tachado ? s.tachado : null, colorDerecha ? { color: colorDerecha } : null]}>
              {derecha}
            </Text>
          ) : null}
          {derechaDetalle ? <Text style={s.nota}>{derechaDetalle}</Text> : null}
        </View>
      ) : null}
      {onPress ? <Text style={s.chevron}>›</Text> : null}
    </Pressable>
  );
}

// ─── Campo ─────────────────────────────────────────────────────────────────────

export function Campo({
  etiqueta,
  ayuda,
  error,
  ...props
}: { etiqueta: string; ayuda?: string; error?: string } & TextInputProps) {
  const [foco, setFoco] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={s.campoEtiqueta}>{etiqueta}</Text>
      <TextInput
        accessibilityLabel={etiqueta}
        accessibilityHint={ayuda}
        placeholderTextColor={colors.textMuted}
        {...props}
        onFocus={(e) => {
          setFoco(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFoco(false);
          props.onBlur?.(e);
        }}
        style={[s.campo, foco ? s.campoFoco : null, error ? s.campoError : null, props.style]}
      />
      {error ? <Text style={[s.nota, { color: colors.dangerText }]}>✕ {error}</Text> : null}
      {!error && ayuda ? <Text style={s.nota}>{ayuda}</Text> : null}
    </View>
  );
}

// ─── Teclado de monto ──────────────────────────────────────────────────────────

/** Teclado de monto en pesos enteros. `valor` son los dígitos ("20000"). */
export function TecladoMonto({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <View style={s.teclado}>
      {TECLAS.map((t) => (
        <Pressable
          key={t}
          onPress={() => onChange(teclear(valor, t))}
          onLongPress={t === '⌫' ? () => onChange('') : undefined}
          style={({ pressed }) => [s.tecla, t === '⌫' ? s.teclaBorrar : null, pressed ? s.teclaPresionada : null]}
          accessibilityRole="button"
          accessibilityLabel={t === '⌫' ? 'Borrar' : t === '000' ? 'Tres ceros' : t}
          accessibilityHint={t === '⌫' ? 'Mantén presionado para borrar todo' : undefined}
        >
          <Text style={s.teclaTexto}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Monto grande ──────────────────────────────────────────────────────────────

/** Un monto protagonista con su etiqueta. `monto` ya viene formateado ("$ 20.000"). */
export function MontoGrande({
  etiqueta,
  monto,
  detalle,
  tamano = 'grande',
  claro,
}: {
  etiqueta: string;
  monto: string;
  detalle?: string;
  tamano?: 'grande' | 'mediano';
  /** Sobre una tarjeta oscura (navy). */
  claro?: boolean;
}) {
  return (
    <View style={{ gap: spacing.xxs }} accessible accessibilityLabel={[etiqueta, monto, detalle].filter(Boolean).join(', ')}>
      <Text style={[s.etiqueta, { color: claro ? colors.lilac : colors.textMuted }]}>{etiqueta.toUpperCase()}</Text>
      {/* En web no existe adjustsFontSizeToFit: limitado a una línea, el monto se cortaría con "…". */}
      <Text
        style={[tamano === 'grande' ? s.montoGrande : s.monto, { color: claro ? colors.white : colors.text }]}
        adjustsFontSizeToFit
        numberOfLines={Platform.OS === 'web' ? undefined : 1}
      >
        {monto}
      </Text>
      {detalle ? <Text style={[s.nota, claro ? { color: colors.lilac } : null]}>{detalle}</Text> : null}
    </View>
  );
}

// ─── Chip de canal ─────────────────────────────────────────────────────────────

/** Opción de canal de cobro. Elegido: fondo morado + ✓ (no depende solo del color). */
export function ChipCanal({
  nombre,
  detalle,
  seleccionado,
  onPress,
}: {
  nombre: string;
  detalle?: string;
  seleccionado?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!seleccionado, checked: !!seleccionado }}
      accessibilityLabel={[nombre, detalle].filter(Boolean).join(', ')}
      style={({ pressed }) => [s.chip, seleccionado ? s.chipElegido : null, pressed ? s.presionado : null]}
    >
      <Text style={[s.chipTexto, { color: seleccionado ? colors.onPrimary : colors.text }]}>
        {seleccionado ? '✓ ' : ''}
        {nombre}
      </Text>
      {detalle ? (
        <Text style={[s.chipDetalle, { color: seleccionado ? colors.lilac : colors.textMuted }]}>{detalle}</Text>
      ) : null}
    </Pressable>
  );
}

// ─── Insignias de estado ───────────────────────────────────────────────────────

export type TonoInsignia = 'ok' | 'neutro' | 'error' | 'atencion' | 'proceso';

const INSIGNIA: Record<TonoInsignia, { fondo: string; icono: string }> = {
  ok: { fondo: colors.success, icono: '✅' },
  neutro: { fondo: colors.lilac, icono: '⚪' },
  error: { fondo: colors.danger, icono: '❌' },
  atencion: { fondo: colors.warning, icono: '⚠️' },
  proceso: { fondo: colors.lilac, icono: '⏳' },
};

/** Píldora de estado: siempre ícono + texto, texto navy sobre el color del tono. */
export function Insignia({ tono, texto, icono }: { tono: TonoInsignia; texto: string; icono?: string }) {
  const t = INSIGNIA[tono];
  return (
    <View style={[s.insignia, { backgroundColor: t.fondo }]} accessible accessibilityLabel={texto}>
      <Text style={s.insigniaTexto}>
        {icono ?? t.icono} {texto}
      </Text>
    </View>
  );
}

/** Estados del día de negocio (spec 07 §1). */
export type EstadoDia = 'abierto' | 'cerrado' | 'firmado' | 'sellado' | 'requiere_enmienda';

const TONO_DIA: Record<EstadoDia, { tono: TonoInsignia; icono: string }> = {
  abierto: { tono: 'neutro', icono: '⚪' },
  cerrado: { tono: 'atencion', icono: '⚠️' },
  firmado: { tono: 'proceso', icono: '⏳' },
  sellado: { tono: 'ok', icono: '🔒' },
  requiere_enmienda: { tono: 'error', icono: '❌' },
};

/**
 * Insignia del estado del día. `texto` es el de spec 07 §6 tal cual (lo da el hook:
 * `textoEstadoDia`), por ejemplo "Cerrado · falta tu confirmación".
 */
export function InsigniaEstadoDia({ estado, texto }: { estado: EstadoDia; texto: string }) {
  const t = TONO_DIA[estado];
  return <Insignia tono={t.tono} icono={t.icono} texto={texto} />;
}

/** Resultado de un día en el verificador (spec 05 §4.1). */
export type ResultadoVerificacion = 'coincide' | 'sin_sellar' | 'no_coincide';

const TEXTO_RESULTADO: Record<ResultadoVerificacion, { tono: TonoInsignia; texto: string }> = {
  coincide: { tono: 'ok', texto: 'Coincide' },
  sin_sellar: { tono: 'neutro', texto: 'Sin sellar' },
  no_coincide: { tono: 'error', texto: 'No coincide' },
};

export function InsigniaResultado({ resultado, enmiendas = 0 }: { resultado: ResultadoVerificacion; enmiendas?: number }) {
  const r = TEXTO_RESULTADO[resultado];
  const extra =
    resultado === 'coincide' && enmiendas > 0 ? ` · enmendado ${enmiendas} ${enmiendas === 1 ? 'vez' : 'veces'}` : '';
  return <Insignia tono={r.tono} texto={r.texto + extra} />;
}

// ─── Aviso ─────────────────────────────────────────────────────────────────────

type TonoAviso = 'info' | 'exito' | 'atencion' | 'error';

const AVISO: Record<TonoAviso, { barra: string; icono: string }> = {
  info: { barra: colors.lavender, icono: 'ℹ️' },
  exito: { barra: colors.success, icono: '✓' },
  atencion: { barra: colors.warning, icono: '!' },
  error: { barra: colors.danger, icono: '✕' },
};

/** Mensaje en una caja blanca con barra de color e ícono. Tranquilo, nunca alarmista. */
export function Aviso({
  tono = 'info',
  titulo,
  children,
}: {
  tono?: TonoAviso;
  titulo?: string;
  children?: ReactNode;
}) {
  const a = AVISO[tono];
  return (
    <View
      style={[s.aviso, { borderLeftColor: a.barra }]}
      accessibilityRole={tono === 'error' ? 'alert' : undefined}
    >
      <View style={[s.avisoIcono, { backgroundColor: a.barra }]}>
        <Text style={s.avisoIconoTexto}>{a.icono}</Text>
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        {titulo ? <Text style={s.cuerpoFuerte}>{titulo}</Text> : null}
        {typeof children === 'string' ? <Text style={s.nota}>{children}</Text> : children}
      </View>
    </View>
  );
}

// ─── Simulación ────────────────────────────────────────────────────────────────

/** Etiqueta discreta para lo que se simula (Face ID, sello, envío de código). */
export function EtiquetaSimulacion() {
  return (
    <View
      style={s.simulacion}
      accessible
      accessibilityLabel="Simulación: en esta demostración esta parte no es real"
    >
      <View style={s.simulacionPunto} />
      <Text style={s.simulacionTexto}>Simulación</Text>
    </View>
  );
}

// ─── Monto ─────────────────────────────────────────────────────────────────────

/**
 * Un monto en pesos colombianos ("$ 20.000"). Recibe CENTAVOS ENTEROS (spec 01 §1);
 * si llega un número con decimales, `formatoCOP` lo rechaza en vez de redondearlo.
 */
export function Monto({
  centavos,
  variante = 'cuerpoFuerte',
  color: c,
  tachado,
}: {
  centavos: number;
  variante?: 'cuerpo' | 'cuerpoFuerte' | 'subtitulo' | 'monto' | 'montoGrande';
  color?: string;
  tachado?: boolean;
}) {
  return (
    <Text style={[s[variante], s.numeros, c ? { color: c } : null, tachado ? s.tachado : null]}>{formatoCOP(centavos)}</Text>
  );
}

// ─── Estado vacío ──────────────────────────────────────────────────────────────

/** Lo que se ve cuando una lista no tiene nada todavía: ícono, qué pasa y qué hacer. */
export function EstadoVacio({
  icono = '🗒️',
  titulo,
  texto,
  accion,
}: {
  icono?: string;
  titulo: string;
  texto?: string;
  accion?: { titulo: string; onPress: () => void };
}) {
  return (
    <View style={s.vacio} accessible={!accion} accessibilityLabel={!accion ? [titulo, texto].filter(Boolean).join('. ') : undefined}>
      <View style={s.vacioIcono}>
        <Text style={s.vacioIconoTexto}>{icono}</Text>
      </View>
      <Text style={[s.subtitulo, s.centrado]}>{titulo}</Text>
      {texto ? <Text style={[s.nota, s.centrado]}>{texto}</Text> : null}
      {accion ? <Boton titulo={accion.titulo} variante="suave" onPress={accion.onPress} /> : null}
    </View>
  );
}

export function EnConstruccion() {
  return <Texto variante="nota">En construcción</Texto>;
}

// ─── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.bg },
  contenido: { padding: spacing.xl - 4, gap: spacing.l, paddingBottom: spacing.xxl },
  encabezado: { gap: spacing.s, alignItems: 'flex-start' },
  pie: {
    paddingHorizontal: spacing.xl - 4,
    paddingTop: spacing.m,
    paddingBottom: spacing.l,
    backgroundColor: colors.bg,
    borderTopWidth: borders.fino,
    borderTopColor: colors.border,
    gap: spacing.s,
  },

  titulo: { ...typography.titulo, color: colors.text },
  subtitulo: { ...typography.subtitulo, color: colors.text },
  cuerpo: { ...typography.cuerpo, color: colors.text },
  cuerpoFuerte: { ...typography.cuerpoFuerte, color: colors.text },
  nota: { ...typography.nota, color: colors.textMuted },
  etiqueta: { ...typography.etiqueta, color: colors.textMuted },
  monto: { ...typography.monto, color: colors.text, fontVariant: ['tabular-nums'] },
  montoGrande: { ...typography.montoGrande, color: colors.text, fontVariant: ['tabular-nums'] },
  centrado: { textAlign: 'center' },
  numeros: { fontVariant: ['tabular-nums'] },
  vacio: { alignItems: 'center', gap: spacing.s, paddingVertical: spacing.xl, paddingHorizontal: spacing.l },
  vacioIcono: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  vacioIconoTexto: { fontSize: 28 },
  tachado: { textDecorationLine: 'line-through', color: colors.textMuted },

  boton: {
    minHeight: touch.minimo + 4,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: borders.medio,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  botonGrande: { minHeight: touch.grande + 4, paddingVertical: spacing.l },
  botonTexto: { ...typography.boton },
  botonTextoGrande: { fontSize: 19 },
  presionado: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  deshabilitado: { opacity: 0.4 },

  tarjeta: { borderRadius: radii.l, padding: spacing.l + 4, gap: spacing.m, ...shadow.tarjeta },
  tarjetaBorde: { borderWidth: borders.fino, borderColor: colors.border },
  seccionCabeza: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  enlace: { minHeight: touch.minimo, justifyContent: 'center', paddingHorizontal: spacing.xs },
  enlaceTexto: { ...typography.cuerpoFuerte, color: colors.primary, textDecorationLine: 'underline' },

  fila: { flexDirection: 'row', alignItems: 'center', minHeight: touch.minimo + 8, paddingVertical: spacing.m, gap: spacing.m },
  filaBorde: { borderBottomWidth: borders.fino, borderBottomColor: colors.border },
  presionadoFila: { backgroundColor: colors.overlay },
  filaIcono: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaIconoTexto: { fontSize: 18 },
  chevron: { fontSize: 26, color: colors.textMuted, marginLeft: spacing.xs },

  campoEtiqueta: { ...typography.nota, fontWeight: '700', color: colors.text },
  campo: {
    minHeight: touch.minimo + 4,
    borderWidth: borders.medio,
    borderColor: colors.borderStrong,
    borderRadius: radii.s,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    ...typography.cuerpo,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  campoFoco: { borderColor: colors.primary },
  campoError: { borderColor: colors.dangerText },

  teclado: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  tecla: {
    width: '31%',
    flexGrow: 1,
    minHeight: touch.grande,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.m,
    borderWidth: borders.fino,
    borderColor: colors.border,
  },
  teclaBorrar: { backgroundColor: colors.surfaceAlt, borderColor: colors.surfaceAlt },
  teclaPresionada: { backgroundColor: colors.lilac, transform: [{ scale: 0.97 }] },
  teclaTexto: { ...typography.tecla, color: colors.text },

  chip: {
    minHeight: touch.minimo + 4,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
    borderRadius: radii.m,
    borderWidth: borders.medio,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipElegido: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTexto: { ...typography.cuerpoFuerte },
  chipDetalle: { ...typography.nota, fontSize: 13 },

  insignia: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.l,
    maxWidth: '100%',
  },
  insigniaTexto: { ...typography.nota, fontWeight: '700', color: colors.navy, flexShrink: 1 },

  aviso: {
    flexDirection: 'row',
    gap: spacing.m,
    alignItems: 'flex-start',
    padding: spacing.l,
    borderRadius: radii.m,
    backgroundColor: colors.surface,
    borderWidth: borders.fino,
    borderColor: colors.border,
    borderLeftWidth: 6,
  },
  avisoIcono: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  avisoIconoTexto: { fontSize: 14, fontWeight: '800', color: colors.navy },

  simulacion: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s + 2,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radii.pill,
    backgroundColor: colors.warning,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  simulacionPunto: { width: 8, height: 8, borderRadius: radii.pill, borderWidth: borders.medio, borderColor: colors.navy },
  simulacionTexto: { ...typography.etiqueta, color: colors.navy },
});

// ─── Íconos de canal ───────────────────────────────────────────────────────────

const ICONO_CANAL: Record<string, string> = {
  efectivo: '💵',
  breb: '⚡',
  datafono_externo: '💳',
  tap_to_pay: '📱',
  fiado: '📒',
  transferencia_otro: '📲',
};

/** Ícono decorativo de un canal (`channel` del spec 01). Siempre va junto al nombre. */
export function iconoCanal(channel: string): string {
  return ICONO_CANAL[channel] ?? '•';
}
