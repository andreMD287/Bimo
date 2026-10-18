import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_CODES,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  CHANNEL_CODES,
  CURRENCY_CODES,
  DAY_STATUSES,
  ENTRY_KINDS,
  ENTRY_ORIGINS,
  KEY_KINDS,
  LINE_DIRECTIONS,
  MEMBER_ROLES,
  OUTBOX_STATUSES,
  SEAL_STATUSES,
  SIGNING_STATUSES,
  isUlid,
  newUlid,
} from '../src';

describe('V-01: ULID', () => {
  it('V-01 acepta ULID validos y los que genera newUlid', () => {
    expect(isUlid('01JA2B3C4D5E6F7G8H9J0KMNPQ')).toBe(true);
    for (let i = 0; i < 50; i++) expect(isUlid(newUlid())).toBe(true);
  });
  it('V-01 rechaza minusculas, longitud distinta y caracteres fuera de Crockford base32 (I, L, O, U)', () => {
    expect(isUlid('01ja2b3c4d5e6f7g8h9j0kmnpq')).toBe(false);
    expect(isUlid('01JA2B3C4D5E6F7G8H9J0KMNP')).toBe(false);
    expect(isUlid('01JA2B3C4D5E6F7G8H9J0KMNPQQ')).toBe(false);
    for (const c of ['I', 'L', 'O', 'U']) expect(isUlid(`01JA2B3C4D5E6F7G8H9J0KMNP${c}`)).toBe(false);
    expect(isUlid(undefined)).toBe(false);
    expect(isUlid(123)).toBe(false);
  });
  it('los ULID generados con tiempos distintos se ordenan por tiempo', () => {
    const a = newUlid(1_700_000_000_000);
    const b = newUlid(1_700_000_001_000);
    expect(a < b).toBe(true);
  });
});

/** Valores de un enum SQL del spec 01 §3. */
function specEnum(name: string): string[] {
  const md = readFileSync(new URL('../../docs/specs/01-modelo-de-datos.md', import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
  const re = new RegExp(`create type ${name}\\s+as enum \\(([^)]*)\\)`, 's');
  const m = re.exec(md);
  if (!m?.[1]) throw new Error(`enum ${name} no encontrado en el spec 01`);
  return [...m[1].replace(/--[^\n]*/g, '').matchAll(/'([^']+)'/g)].map((x) => x[1] as string);
}

describe('spec 01 §3: los enums coinciden uno a uno', () => {
  const cases: Array<[string, readonly string[]]> = [
    ['member_role', MEMBER_ROLES],
    ['key_kind', KEY_KINDS],
    ['currency_code', CURRENCY_CODES],
    ['account_type', ACCOUNT_TYPES],
    ['account_code', ACCOUNT_CODES],
    ['channel_code', CHANNEL_CODES],
    ['entry_kind', ENTRY_KINDS],
    ['entry_origin', ENTRY_ORIGINS],
    ['line_direction', LINE_DIRECTIONS],
    ['day_status', DAY_STATUSES],
    ['seal_status', SEAL_STATUSES],
    ['outbox_status', OUTBOX_STATUSES],
    ['signing_status', SIGNING_STATUSES],
    ['account_status', ACCOUNT_STATUSES],
  ];
  for (const [name, values] of cases) {
    it(`spec01-3 enum ${name}`, () => {
      expect([...values]).toEqual(specEnum(name));
    });
  }
});
