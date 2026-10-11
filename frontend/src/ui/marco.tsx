// Marco de teléfono para web: en un computador, el flujo del dueño se ve dentro de un
// teléfono centrado (escritorio navy, pantalla blanca). En el celular y en ventanas
// angostas no hay marco. La página del verificador lo desactiva con `sinMarco`.

import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, frame, radii, shadow, spacing, typography } from './tokens';

export function MarcoTelefono({ children, sinMarco }: { children: ReactNode; sinMarco?: boolean }) {
  const { width, height } = useWindowDimensions();
  const conMarco = Platform.OS === 'web' && !sinMarco && width > frame.ancho + 80 && height > 600;
  if (!conMarco) return <View style={s.lleno}>{children}</View>;
  return (
    <View style={s.escritorio}>
      <View style={s.telefono}>
        <View style={s.muesca} />
        <View style={s.pantalla}>{children}</View>
      </View>
      {width > frame.ancho + 520 ? (
        <View style={s.leyenda} pointerEvents="none">
          <Text style={s.marca}>bimo</Text>
          <Text style={s.leyendaTexto}>Así se ve la app en el celular del dueño.</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  lleno: { flex: 1, backgroundColor: colors.white },
  escritorio: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxxl,
    backgroundColor: colors.navy,
    padding: spacing.xl,
  },
  telefono: {
    width: frame.ancho,
    height: '100%',
    maxHeight: frame.altoMax,
    borderRadius: frame.radio,
    borderWidth: frame.borde,
    borderColor: colors.bezel,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...shadow.telefono,
  },
  muesca: {
    position: 'absolute',
    top: spacing.s,
    alignSelf: 'center',
    width: 110,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: colors.bezel,
    zIndex: 10,
  },
  pantalla: { flex: 1, paddingTop: spacing.xl + spacing.s, backgroundColor: colors.surface },
  leyenda: { maxWidth: 260, gap: spacing.s },
  marca: { ...typography.hero, color: colors.lavender, letterSpacing: -1 },
  leyendaTexto: { ...typography.cuerpo, color: colors.lilac },
});
