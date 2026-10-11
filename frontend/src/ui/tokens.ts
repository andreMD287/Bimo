// Tokens del sistema de diseño de Bimo (paleta Velto). Es el ÚNICO archivo con colores
// en hex: ninguna pantalla ni componente escribe un color directo. Si llega otro sistema
// de diseño, se reemplazan estos valores y las pantallas no cambian.
//
// Contraste medido (WCAG, mínimo 4.5:1; 7:1 en montos y botones):
//   text/bg 16.9 · textMuted/bg 8.3 · blanco/primary 12.7 · primary/surface 12.7
//   navy/lavender 7.2 · navy/green 8.4 · navy/yellow 13.6 · navy/orange 5.4 · navy/lilac 13.6
//   successText/surface 6.5 · dangerText/surface 6.3 · borderStrong/surface 3.5 (bordes de campos, ≥ 3:1)
//
// Reglas: lavanda, verde, naranja y amarillo son SOLO fondo, con texto navy encima.
// Para texto sobre blanco: text, textMuted, primary, successText o dangerText.

export const colors = {
  // Marca
  lavender: '#B58FFF',
  purple: '#3B1F77',
  lilac: '#E4D9FF',
  navy: '#131328',
  white: '#F7F6FC',
  orange: '#FD4E19',
  green: '#39C68B',
  yellow: '#FFDD33',

  // Semánticos
  bg: '#F7F6FC', // fondo de pantallas
  surface: '#FFFFFF', // tarjetas
  surfaceAlt: '#E4D9FF', // chips, filas destacadas
  text: '#131328',
  textMuted: '#4A4568', // ~8:1 sobre bg
  primary: '#3B1F77', // botón principal (texto blanco)
  onPrimary: '#FFFFFF',
  accent: '#B58FFF', // fondo/decoración (texto navy encima)
  success: '#39C68B', // solo fondo (texto navy encima)
  successText: '#0F6B45', // texto sobre blanco
  warning: '#FFDD33', // solo fondo (texto navy encima)
  danger: '#FD4E19', // solo fondo (texto navy encima)
  dangerText: '#B3300F', // texto sobre blanco
  border: '#E0DAF0', // separadores y bordes decorativos
  borderStrong: '#8A84A3', // bordes de campos y controles (≥ 3:1)
  overlay: 'rgba(19, 19, 40, 0.06)', // tecla presionada
  bezel: '#05050D', // borde del marco de teléfono en web
} as const;

export type ColorToken = keyof typeof colors;

/** Familia del sistema: en iOS es San Francisco y en web la del navegador; legible y sin descargar fuentes. */
const familia = 'System';

export const typography = {
  familia,
  // tamaño / alto de línea / peso
  hero: { fontSize: 40, lineHeight: 46, fontWeight: '800' },
  titulo: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  subtitulo: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  cuerpo: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  cuerpoFuerte: { fontSize: 17, lineHeight: 24, fontWeight: '700' },
  nota: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  etiqueta: { fontSize: 13, lineHeight: 16, fontWeight: '700', letterSpacing: 0.4 },
  boton: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  tecla: { fontSize: 26, lineHeight: 32, fontWeight: '600' },
  monto: { fontSize: 32, lineHeight: 38, fontWeight: '800' },
  montoGrande: { fontSize: 44, lineHeight: 52, fontWeight: '800' },
} as const;

export const spacing = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radii = { s: 10, m: 16, l: 24, pill: 999 } as const;

export const borders = { fino: 1, medio: 2 } as const;

/** Alto mínimo de todo lo que se toca (≥ 44 px, apuntamos a 48). */
export const touch = { minimo: 48, grande: 60 } as const;

/** Medidas del marco de teléfono en web. */
export const frame = { ancho: 420, altoMax: 880, borde: 10, radio: 44 } as const;

export const shadow = {
  tarjeta: {
    shadowColor: colors.navy,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  telefono: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
} as const;
