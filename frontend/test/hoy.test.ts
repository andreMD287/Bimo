// L-04: "Hoy" muestra cada dato de la tabla del spec 04 §9, con texto sin jerga.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const hoy = readFileSync(join(__dirname, '../app/(comercio)/hoy.tsx'), 'utf8');

describe('spec 04 §9 pantalla Hoy', () => {
  const datos: [string, string, string][] = [
    ['Vendido hoy', 'Vendido hoy', 'hoy.vendido_minor'],
    ['Vendido por canal', 'Por canal', 'hoy.porCanal'],
    ['Efectivo que debería haber en caja', 'Efectivo que debería haber en caja', 'hoy.disponible.caja_minor'],
    ['En la cuenta (Bre-B y consignaciones)', 'En la cuenta', 'hoy.disponible.cuenta_minor'],
    ['Pendiente de consignar', 'Pendiente de consignar', 'hoy.pendiente.total_minor'],
    ['Te deben (fiado)', 'Te deben (fiado)', 'hoy.teDeben'],
    ['Comisiones de hoy', 'Comisiones de hoy', 'hoy.comisiones_minor'],
    ['Salidas de hoy', 'Salidas de hoy', 'hoy.salidas_minor'],
  ];
  for (const [dato, texto, campo] of datos)
    it(`spec 04 §9 muestra "${dato}" con su texto y su dato`, () => {
      expect(hoy).toContain(texto);
      expect(hoy).toContain(campo);
    });

  it('spec 04 §9 muestra el indicador discreto de lo que falta por subir', () => {
    expect(hoy).toContain('hoy.porSubir');
  });
});
