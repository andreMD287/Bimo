// L-01: pruebas del sistema de diseño (src/ui) y del lenguaje de las pantallas.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatoCOP, pesosACentavos } from '../src/lib/dinero';
import { MAX_DIGITOS, TECLAS, teclear, type Tecla } from '../src/ui/teclado';

const RAIZ = join(__dirname, '..');

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Textos que puede ver una persona: literales de cadena y texto JSX, sin comentarios ni imports. */
function textosVisibles(fuente: string): string[] {
  const sinComentarios = fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/^\s*(import|export)\b.*\bfrom\s+['"].*['"];?\s*$/gm, '');
  const out: string[] = [];
  for (const m of sinComentarios.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`]*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  for (const m of sinComentarios.matchAll(/>([^<>{}]+)</g)) out.push(m[1] ?? '');
  return out.map((t) => t.trim()).filter(Boolean);
}

const JERGA = /\b(wallet|token|xlm|blockchain|hash)\b|firma digital/i;
// En el verificador, "Stellar" y "blockchain" se permiten solo en "¿Cómo funciona?" (spec 05 §4.2).
const JERGA_VERIFICADOR = /\b(wallet|token|xlm|hash)\b|firma digital/i;

function jergaEn(archivosRevisados: string[], regla: RegExp): string[] {
  return archivosRevisados.flatMap((f) =>
    textosVisibles(readFileSync(f, 'utf8'))
      .filter((t) => regla.test(t))
      .map((t) => `${relative(RAIZ, f)}: "${t}"`),
  );
}

describe('QA-04 sin jerga', () => {
  it('QA-04 ningún componente de src/ui muestra wallet, token, XLM, blockchain, hash ni firma digital', () => {
    expect(jergaEn(archivos(join(RAIZ, 'src/ui')), JERGA)).toEqual([]);
  });

  it('QA-04 ninguna pantalla del dueño muestra wallet, token, XLM, blockchain, hash ni firma digital', () => {
    const pantallas = archivos(join(RAIZ, 'app')).filter((f) => !f.includes('verificar') && !f.endsWith('_layout.tsx'));
    expect(pantallas.length).toBeGreaterThan(0);
    expect(jergaEn(pantallas, JERGA)).toEqual([]);
  });

  it('QA-04 la página del verificador no muestra wallet, token, XLM, hash ni firma digital', () => {
    expect(jergaEn(archivos(join(RAIZ, 'app/verificar')), JERGA_VERIFICADOR)).toEqual([]);
  });

  it('QA-04 la revisión detecta la jerga si aparece (control de la prueba)', () => {
    expect(textosVisibles(`<Text>Tu wallet</Text>`).some((t) => JERGA.test(t))).toBe(true);
    expect(textosVisibles(`const x = 'tu token';`).some((t) => JERGA.test(t))).toBe(true);
    expect(textosVisibles(`import { colors } from './tokens';`)).toEqual([]);
  });
});

describe('spec 01 §1 montos enteros en el teclado', () => {
  function escribir(teclas: Tecla[]): string {
    return teclas.reduce<string>((v, t) => teclear(v, t), '');
  }

  it('spec 01 §1 el teclado solo produce dígitos, sin ceros a la izquierda ni decimales', () => {
    expect(escribir(['2', '0', '000'])).toBe('20000');
    expect(escribir(['0', '0', '5'])).toBe('5');
    expect(escribir(['000'])).toBe('');
    expect(escribir(['1', '2', '⌫'])).toBe('1');
    expect(escribir(['⌫'])).toBe('');
    expect(TECLAS).not.toContain(',');
    expect(TECLAS).not.toContain('.');
  });

  it(`spec 01 §1 el teclado no pasa de ${MAX_DIGITOS} dígitos y el monto en centavos es un entero seguro`, () => {
    const largo = escribir(Array<Tecla>(15).fill('9'));
    expect(largo).toHaveLength(MAX_DIGITOS);
    const centavos = pesosACentavos(largo);
    expect(Number.isSafeInteger(centavos)).toBe(true);
    expect(centavos).toBe(999_999_999_900);
  });

  it('spec 01 §1 cualquier secuencia de teclas da un monto entero en centavos', () => {
    let semilla = 7;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 500; i++) {
      const teclas = Array.from({ length: 1 + Math.floor(azar() * 14) }, () => TECLAS[Math.floor(azar() * TECLAS.length)]!);
      const v = escribir(teclas);
      expect(v).toMatch(/^([1-9]\d*)?$/);
      const c = pesosACentavos(v);
      expect(Number.isSafeInteger(c)).toBe(true);
      expect(c % 100).toBe(0);
    }
  });

  it('spec 01 §1 el formato de pesos rechaza montos con decimales en vez de redondearlos', () => {
    expect(formatoCOP(2_000_000)).toBe('$ 20.000');
    expect(formatoCOP(124_000_000)).toBe('$ 1.240.000');
    expect(() => formatoCOP(20000.5)).toThrow();
  });
});
