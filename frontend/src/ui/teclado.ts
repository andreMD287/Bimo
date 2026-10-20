// Lógica del teclado de monto, sin React, para poder probarla sola.
// El teclado trabaja con PESOS ENTEROS escritos como dígitos ("20000"); nunca con
// decimales ni con `float`. La pantalla los pasa a centavos con `pesosACentavos`
// (spec 01 §1: dinero en enteros en unidades mínimas).

export const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'] as const;
export type Tecla = (typeof TECLAS)[number];

/** Máximo de dígitos en pesos: 9.999.999.999 pesos = 999.999.999.900 centavos, entero seguro. */
export const MAX_DIGITOS = 10;

/** Resultado de tocar una tecla: siempre una cadena de solo dígitos, sin ceros a la izquierda. */
export function teclear(valor: string, tecla: Tecla): string {
  if (tecla === '⌫') return valor.slice(0, -1);
  const nuevo = (valor + tecla).replace(/^0+/, '');
  return nuevo.length <= MAX_DIGITOS ? nuevo : valor;
}
