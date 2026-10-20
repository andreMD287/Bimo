// L-06: corregir una venta nunca edita; crea un reverso espejo (spec 01 §6, V-09).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateEntry, type Entry, type ValidationContext } from '@bimo/shared';
import { describe, expect, it } from 'vitest';
import type { CanalConfig } from '../src/lib/tipos';
import { asientoReverso, asientoVenta } from '../src/mocks/contabilidad';

const efectivo: CanalConfig = { id: 'canal_efectivo', nombre: 'Efectivo', channel: 'efectivo', comision_bps: 0, dias_consignacion: 0, activo: true };
const breb: CanalConfig = { id: 'canal_breb', nombre: 'Bre-B', channel: 'breb', comision_bps: 0, dias_consignacion: 0, activo: true };
const AHORA = '2026-10-19T15:00:00.000Z';

function contexto(conocidos: Entry[]): ValidationContext {
  return { knownCustomerIds: new Set(), findEntry: (id) => conocidos.find((e) => e.id === id), isReversed: () => false };
}

describe('L-06 corrección de una venta', () => {
  const venta = asientoVenta(AHORA, [{ canal: efectivo, monto_minor: 3_000_000 }, { canal: breb, monto_minor: 2_000_000 }], null);

  it('V-09 la corrección crea un reverso espejo que shared acepta', () => {
    const reverso = asientoReverso(AHORA, venta, 'era otro monto');
    expect(reverso.kind).toBe('reverso');
    expect(reverso.reverses_entry_id).toBe(venta.id);
    expect(validateEntry(reverso, contexto([venta]))).toEqual({ ok: true });
  });

  it('V-09 un "reverso" que cambia el monto no es espejo y shared lo rechaza', () => {
    const malo = asientoReverso(AHORA, venta, null);
    const editado: Entry = { ...malo, lines: malo.lines.map((l, i) => (i === 0 ? { ...l, amount_minor: l.amount_minor - 100 } : l)) };
    expect(validateEntry(editado, contexto([venta]))).toMatchObject({ ok: false });
  });

  it('V-09 la pantalla corrige con corregir() y deja la venta original visible como anulada', () => {
    const pantalla = readFileSync(join(__dirname, '../app/(comercio)/movimientos.tsx'), 'utf8');
    expect(pantalla).toContain('corregir(m.id, motivo)');
    expect(pantalla).toContain('· anulada');
    expect(pantalla).toContain('tachado={m.corregido}');
  });
});
