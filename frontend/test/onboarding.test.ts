// L-02: onboarding (spec 01 §4.1, spec 06 §2, spec 07 §6).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textoEstadoCuenta } from '../src/lib/estados';

const bienvenida = readFileSync(join(__dirname, '../app/index.tsx'), 'utf8');
const canales = readFileSync(join(__dirname, '../app/canales.tsx'), 'utf8');
const spec07 = readFileSync(join(__dirname, '../../docs/specs/07-maquinas-de-estado.md'), 'utf8');

describe('L-02 onboarding', () => {
  it('spec 01 §4.1 el nombre del negocio no pasa de 80 caracteres', () => {
    expect(bienvenida).toContain('const NOMBRE_MAX = 80;');
    expect(bienvenida).toContain('maxLength={NOMBRE_MAX}');
  });

  it('spec 06 §2 entra con correo y código de 6 dígitos', () => {
    expect(bienvenida).toContain('enviarCodigo(');
    expect(bienvenida).toContain('verificarCodigo(');
    expect(bienvenida).toContain('maxLength={6}');
  });

  it('spec 07 §6 "Preparando tu cuenta…" y el aviso de cuenta fallida son los del spec y no bloquean', () => {
    expect(spec07).toContain(`"${textoEstadoCuenta('deploying')}"`);
    expect(spec07).toContain(`"${textoEstadoCuenta('failed')}"`);
    expect(textoEstadoCuenta('ready')).toBeNull();
    for (const pantalla of [bienvenida, canales]) expect(pantalla).toContain('comercio.avisoCuenta');
  });
});
