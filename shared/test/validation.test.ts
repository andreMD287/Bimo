import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateEntry, type Entry, type ValidationContext } from '../src';

interface Case {
  name: string;
  entry: Entry;
  context: { customers: string[]; entries: Entry[]; reversed: string[] };
  expected: string;
}
const cases = JSON.parse(readFileSync(new URL('../validation-cases.json', import.meta.url), 'utf8')) as Case[];

function contextOf(c: Case['context']): ValidationContext {
  const byId = new Map(c.entries.map((e) => [e.id, e]));
  const reversed = new Set(c.reversed);
  return { knownCustomerIds: new Set(c.customers), findEntry: (id) => byId.get(id), isReversed: (id) => reversed.has(id) };
}

describe('spec 04 §4: casos de validation-cases.json', () => {
  for (const c of cases) {
    it(c.name, () => {
      const r = validateEntry(c.entry, contextOf(c.context));
      expect(r.ok ? 'ok' : r.code).toBe(c.expected);
    });
  }
});

describe('cobertura de V-01..V-11', () => {
  it('hay al menos un caso invalido por cada regla y uno valido en las reglas con borde', () => {
    const codes: Record<string, string> = {
      'V-01': 'invalid_id',
      'V-02': 'invalid_lines',
      'V-03': 'invalid_amount',
      'V-04': 'unbalanced',
      'V-05': 'invalid_accounts',
      'V-06': 'invalid_channel',
      'V-07': 'invalid_customer',
      'V-08': 'forbidden_origin',
      'V-09': 'invalid_reversal',
      'V-10': 'invalid_text',
      'V-11': 'invalid_time',
    };
    for (const [rule, code] of Object.entries(codes)) {
      const invalid = cases.filter((c) => c.name.startsWith(rule) && c.expected === code);
      expect(invalid.length, `${rule} necesita un caso invalido`).toBeGreaterThan(0);
    }
    for (const rule of ['V-02', 'V-03', 'V-07', 'V-09', 'V-10', 'V-11']) {
      expect(cases.some((c) => c.name.startsWith(rule) && c.expected === 'ok'), `${rule} necesita un caso valido`).toBe(true);
    }
  });

  it('los ejemplos del spec 01 §6 son validos', () => {
    const ej = cases.filter((c) => c.name.startsWith('ejemplo'));
    expect(ej.length).toBeGreaterThanOrEqual(11);
    for (const c of ej) expect(c.expected).toBe('ok');
  });

  it('V-08 origin = verificado desde la app da forbidden_origin', () => {
    const c = cases.find((x) => x.name === 'V-08 origin verificado desde la app') as Case;
    expect(validateEntry(c.entry, contextOf(c.context))).toEqual({ ok: false, code: 'forbidden_origin' });
  });

  it('la hora nunca es motivo de rechazo (solo su formato, V-11)', () => {
    const horas = cases.filter((x) => x.name.startsWith('la hora nunca'));
    expect(horas.length).toBeGreaterThanOrEqual(2);
    for (const c of horas) expect(validateEntry(c.entry, contextOf(c.context))).toEqual({ ok: true });
  });

  it('un asiento con montos bigint tambien se valida', () => {
    const c = cases.find((x) => x.name === 'ejemplo 1: venta en efectivo $20.000') as Case;
    const e = structuredClone(c.entry);
    e.lines.forEach((l) => (l.amount_minor = BigInt(l.amount_minor)));
    expect(validateEntry(e, contextOf(c.context))).toEqual({ ok: true });
  });
});
