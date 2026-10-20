// L-08: pantalla de firma (spec 03 §5.2 y §5.5, spec 07 §2 y §6).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textoEstadoDia } from '../src/lib/estados';

const sellar = readFileSync(join(__dirname, '../app/(comercio)/sellar.tsx'), 'utf8');
const spec07 = readFileSync(join(__dirname, '../../docs/specs/07-maquinas-de-estado.md'), 'utf8');

describe('L-08 pantalla de firma', () => {
  it('spec 07 §6 los estados del sello que muestra la firma son los del spec', () => {
    for (const s of ['firmado', 'sellado', 'requiere_enmienda'] as const) expect(spec07).toContain(`"${textoEstadoDia(s)}"`);
    expect(sellar).toContain('sello.textoFase');
    expect(sellar).toContain("'requiere_enmienda'");
  });

  it('spec 03 §5.2 muestra el resumen en lenguaje humano antes de pedir Face ID', () => {
    expect(sellar.indexOf('sello.resumen')).toBeGreaterThan(-1);
    expect(sellar.indexOf('sello.resumen')).toBeLessThan(sellar.lastIndexOf('Confirmar con Face ID') + 2000);
  });

  it('spec 03 §5.5 varios días se confirman con un solo Face ID', () => {
    expect(sellar).toContain('con un solo Face ID');
  });

  it('spec 07 §2 una solicitud vencida o reemplazada muestra el error y el resumen al día', () => {
    expect(sellar).toContain('sello.error');
    expect(sellar).toContain('Revísalo y confirma de nuevo');
  });

  it('L-08 lo simulado lleva la etiqueta "Simulación" (Face ID en la web y en Expo Go)', () => {
    expect(sellar).toContain('<EtiquetaSimulacion />');
    expect(sellar).toContain('simulacion={sello.simulacion}');
    expect(sellar).not.toMatch(/simulacion>\n|simulacion\n/);
  });
});
