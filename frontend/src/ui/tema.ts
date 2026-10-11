// Nombres en español que ya usan las pantallas y el layout. No hay colores aquí:
// todo sale de `tokens.ts`, que es la única fuente.
import { colors, radii, spacing } from './tokens';

export const color = {
  fondo: colors.bg,
  superficie: colors.surface,
  superficieAlt: colors.surfaceAlt,
  texto: colors.text,
  textoSuave: colors.textMuted,
  borde: colors.border,
  bordeFuerte: colors.borderStrong,
  primario: colors.primary,
  sobrePrimario: colors.onPrimary,
  acento: colors.accent,
  exito: colors.successText, // texto sobre blanco
  alerta: colors.dangerText, // texto sobre blanco (el amarillo no sirve como texto)
  error: colors.dangerText, // texto sobre blanco
  navy: colors.navy,
} as const;

export const espacio = spacing;
export const radio = radii;
