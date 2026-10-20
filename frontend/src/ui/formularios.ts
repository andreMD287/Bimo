// Reglas de los formularios de la app que el dueño ve mientras escribe. Son puras para
// poder probarlas. La validación que manda está en `shared` (V-01..V-11) y la aplican
// los hooks al guardar; aquí solo se evita que el formulario deje intentar algo que no pasa.

import { MAX_NOTE_LENGTH } from '@bimo/shared';

/** V-10: la nota de un asiento tiene como máximo 140 caracteres (spec 04 §4). El límite vive en `shared`. */
export const NOTA_MAX = MAX_NOTE_LENGTH;

/** Recorta una nota a lo que acepta V-10: caracteres (no bytes) del texto en NFC, como cuenta `shared`. */
export function recortarNota(nota: string): string {
  return Array.from(nota.normalize('NFC')).slice(0, NOTA_MAX).join('');
}

/** Cuántos caracteres lleva la nota ("12/140"). */
export function contadorNota(nota: string): string {
  return `${Array.from(nota.normalize('NFC')).length}/${NOTA_MAX}`;
}

/**
 * V-07: una venta fiada exige cliente (spec 04 §4). `channels` son los canales de los
 * pagos de la venta; el anticipo deja un saldo fiado, así que también lo exige.
 */
export function faltaCliente(p: { channels: readonly string[]; anticipo: boolean; clienteId: string | null }): boolean {
  const pideCliente = p.anticipo || p.channels.includes('fiado');
  return pideCliente && !p.clienteId;
}
