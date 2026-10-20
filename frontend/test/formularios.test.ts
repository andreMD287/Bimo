// L-03: reglas del formulario de venta (spec 04 §4).
import { describe, expect, it } from 'vitest';
import { NOTA_MAX, contadorNota, faltaCliente, recortarNota } from '../src/ui/formularios';

describe('formulario de venta', () => {
  it('V-07 exige cliente en fiado', () => {
    expect(faltaCliente({ channels: ['fiado'], anticipo: false, clienteId: null })).toBe(true);
    expect(faltaCliente({ channels: ['efectivo', 'fiado'], anticipo: false, clienteId: null })).toBe(true);
    expect(faltaCliente({ channels: ['fiado'], anticipo: false, clienteId: 'cli_rosa' })).toBe(false);
  });

  it('V-07 exige cliente en un anticipo, porque el saldo queda fiado', () => {
    expect(faltaCliente({ channels: ['efectivo'], anticipo: true, clienteId: null })).toBe(true);
    expect(faltaCliente({ channels: ['efectivo'], anticipo: true, clienteId: 'cli_camila' })).toBe(false);
  });

  it('V-07 no pide cliente en una venta de contado', () => {
    expect(faltaCliente({ channels: ['efectivo'], anticipo: false, clienteId: null })).toBe(false);
    expect(faltaCliente({ channels: ['efectivo', 'breb'], anticipo: false, clienteId: null })).toBe(false);
  });

  it('V-10 la nota no pasa de 140 caracteres', () => {
    expect(NOTA_MAX).toBe(140);
    expect(recortarNota('a'.repeat(200))).toHaveLength(140);
    expect(recortarNota('torta de cumpleaños')).toBe('torta de cumpleaños');
    expect(contadorNota('hola')).toBe('4/140');
  });

  it('V-10 cuenta caracteres y no bytes (tildes y emojis)', () => {
    const nota = 'ñ'.repeat(139) + '🎂🎂';
    expect(Array.from(recortarNota(nota))).toHaveLength(140);
    expect(contadorNota('año')).toBe('3/140');
  });
});

describe('V-10 con el validador de shared', () => {
  it('V-10 una nota recortada siempre la acepta shared', async () => {
    const { MAX_NOTE_LENGTH } = await import('@bimo/shared');
    const nota = recortarNota('é'.repeat(300)); // "é" descompuesta: en NFC es un solo caracter
    expect(nota).toBe(nota.normalize('NFC'));
    expect([...nota].length).toBeLessThanOrEqual(MAX_NOTE_LENGTH);
  });
});
