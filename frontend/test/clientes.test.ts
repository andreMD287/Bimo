// L-05: clientes de fiado. El saldo sale de `por_cobrar_clientes` (spec 04 §9).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { saldo, saldoPorCliente } from '../src/lib/hoy';
import type { CanalConfig } from '../src/lib/tipos';
import { asientoAbono, asientoVenta } from '../src/mocks/contabilidad';

const fiado: CanalConfig = { id: 'canal_fiado', nombre: 'Fiado', channel: 'fiado', comision_bps: 0, dias_consignacion: 0, activo: true };
const efectivo: CanalConfig = { id: 'canal_efectivo', nombre: 'Efectivo', channel: 'efectivo', comision_bps: 0, dias_consignacion: 0, activo: true };
const AHORA = '2026-10-19T15:00:00.000Z';

describe('L-05 clientes de fiado', () => {
  it('spec 01 §6 fiado de $ 50.000 y abono de $ 20.000: el cliente debe $ 30.000', () => {
    const asientos = [
      asientoVenta(AHORA, [{ canal: fiado, monto_minor: 5_000_000, customer_id: 'cli_rosa' }], null),
      asientoAbono(AHORA, efectivo, 'cli_rosa', 2_000_000),
    ];
    expect(saldoPorCliente(asientos).get('cli_rosa')).toBe(3_000_000);
    expect(saldo(asientos, 'por_cobrar_clientes')).toBe(3_000_000);
    expect(saldo(asientos, 'caja')).toBe(2_000_000);
  });

  it('spec 01 §4.2 el nombre del cliente no pasa de 60 caracteres', () => {
    const pantalla = readFileSync(join(__dirname, '../app/(comercio)/clientes.tsx'), 'utf8');
    expect(pantalla).toContain('const NOMBRE_CLIENTE_MAX = 60;');
    expect(pantalla).toContain('maxLength={NOMBRE_CLIENTE_MAX}');
  });

  it('spec 04 §4.1 el abono se recibe en efectivo, Bre-B o billetera', () => {
    const pantalla = readFileSync(join(__dirname, '../app/(comercio)/clientes.tsx'), 'utf8');
    expect(pantalla).toContain("const CANALES_ABONO = ['efectivo', 'breb', 'transferencia_otro'];");
  });
});
