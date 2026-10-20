// L-09: compartir historial (spec 05 §2, spec 06 §3.5).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const compartir = readFileSync(join(__dirname, '../app/(comercio)/compartir.tsx'), 'utf8');

describe('L-09 compartir historial', () => {
  it('spec 06 §3.5 la URL del enlace solo se muestra al crearlo', () => {
    // La URL sale solo de lo que devuelve crear(); la lista nunca usa e.url
    expect(compartir).toContain('setUltimoUrl(r.url)');
    expect(compartir).not.toContain('e.url');
    expect(compartir).toContain('este enlace solo se muestra ahora');
  });

  it('spec 05 §2 vigencia de 7, 30 (recomendado) o 90 días', () => {
    expect(compartir).toContain('useState<Vigencia>(30)');
    expect(compartir).toContain('vigencias.map');
  });

  it('spec 05 §2 la lista muestra veces abierto, estado y revocar con confirmación', () => {
    expect(compartir).toContain('e.vistas');
    expect(compartir).toContain('Sí, revocar enlace');
  });
});
