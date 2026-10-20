// L-07 y L-08: los textos de estado que ve el dueño son los del spec 07 §6, tal cual.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textoEstadoCuenta, textoEstadoDia } from '../src/lib/estados';
import type { DayStatus } from '../src/lib/tipos';

const spec = readFileSync(join(__dirname, '../../docs/specs/07-maquinas-de-estado.md'), 'utf8');
const seccion6 = spec.slice(spec.indexOf('## 6. Textos para la app'), spec.indexOf('## 7.'));

/** Filas de la tabla del spec 07 §6: estado → texto entre comillas. */
function textoDelSpec(estado: string): string {
  const fila = seccion6.split('\n').find((l) => l.startsWith(`| \`${estado}\``) || l.startsWith(`| Cuenta \`${estado}\``));
  const m = fila?.match(/"([^"]+)"/);
  if (!m?.[1]) throw new Error(`no encontré ${estado} en el spec 07 §6`);
  return m[1];
}

describe('spec 07 §6 textos de estado', () => {
  const dias: DayStatus[] = ['abierto', 'cerrado', 'firmado', 'sellado', 'requiere_enmienda'];
  for (const d of dias)
    it(`spec 07 §6 el día ${d} se muestra igual que en el spec`, () => {
      expect(textoEstadoDia(d)).toBe(textoDelSpec(d));
    });

  it('spec 07 §6 la cuenta deploying y failed se muestran igual que en el spec', () => {
    expect(textoEstadoCuenta('deploying')).toBe(textoDelSpec('deploying'));
    expect(textoEstadoCuenta('failed')).toBe(textoDelSpec('failed'));
  });
});

describe('L-07 cierre del día', () => {
  const cierre = readFileSync(join(__dirname, '../app/(comercio)/cierre.tsx'), 'utf8');

  it('spec 07 §1 el conteo de un día pasado es opcional: se cierra sin contar', () => {
    expect(cierre).toContain('cerrarDiaPasado(d.fecha)');
    expect(cierre).toContain('Cerrar sin contar');
  });

  it('spec 04 §6 el cierre sin conexión avisa que se enviará cuando vuelva la señal', () => {
    expect(cierre).toContain('se enviará cuando vuelva la señal');
  });

  it('L-07 el efectivo se cuenta con el teclado de montos', () => {
    expect(cierre).toContain('<TecladoMonto');
  });
});
