// L-10: página del verificador (spec 05 §4.1, §4.2, §6 y §8).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagina = readFileSync(join(__dirname, '../app/verificar/[token].tsx'), 'utf8');
const sinComentarios = pagina.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

describe('L-10 página del verificador', () => {
  it('spec 05 §4.2 la palabra "blockchain" solo aparece en "¿Cómo funciona?"', () => {
    const como = sinComentarios.indexOf('¿Cómo funciona?');
    expect(como).toBeGreaterThan(-1);
    const usos = [...sinComentarios.matchAll(/blockchain/gi)].map((m) => m.index ?? -1);
    expect(usos.length).toBeGreaterThan(0);
    for (const i of usos) expect(i).toBeGreaterThan(como);
  });

  it('spec 05 §8 un enlace revocado o vencido se explica en lenguaje simple', () => {
    expect(pagina).toContain('Este enlace ya no está activo');
    expect(pagina).toContain('El comercio lo revocó o se venció. Pídele uno nuevo.');
  });

  it('spec 05 §4.1 cada día muestra su resultado y el ❌ se explica', () => {
    expect(pagina).toContain('<InsigniaResultado resultado={d.resultado} enmiendas={d.enmiendas} />');
    expect(pagina).toContain('Los datos de este día no coinciden con lo que se guardó en Stellar');
  });

  it('spec 05 §4.2 enlaza el tx_hash de cada día a un explorador público de testnet', () => {
    expect(pagina).toContain('https://stellar.expert/explorer/testnet/tx/');
    expect(pagina).toContain('Ver en el explorador de Stellar');
  });

  it('spec 05 §4.2 el resumen trae % verificado por terceros y registros con hora dudosa', () => {
    expect(pagina).toContain('r.porcentajeTerceros');
    expect(pagina).toContain('r.relojDudoso');
  });

  it('spec 05 §6 la página lleva noindex', () => {
    expect(pagina).toMatch(/name="robots" content="noindex/);
  });
});
