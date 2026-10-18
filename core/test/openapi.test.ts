import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Validator } from '@seriousme/openapi-schema-validator';
import { buildOpenApi, toYaml } from '../src/api/openapi';
import { ROUTES } from '../src/api/contract';

// Endpoints del spec 06 §3 (menos los webhooks del incremento 2, §3.8).
const SPEC_06 = [
  'post /merchants', 'post /devices/challenge', 'post /devices', 'get /merchants/me', 'delete /merchants/me',
  'post /sync/push', 'get /sync/pull',
  'post /days/{date}/close', 'get /days',
  'get /signing/pending', 'post /signing/{id}/signature',
  'post /verification-links', 'get /verification-links', 'delete /verification-links/{id}',
  'get /public/verification', 'post /public/verification/restore', 'get /public/entry-proof', 'get /health',
  'post /dev/simulate/breb-incoming', 'post /dev/simulate/card-sale', 'post /dev/simulate/psp-settlement',
];

describe('spec 06 §6: core/openapi.yaml', () => {
  it('spec06-6 el documento es un OpenAPI 3.1 valido', async () => {
    const result = await new Validator().validate(buildOpenApi() as Record<string, unknown>);
    expect(result.errors ?? result.errors).toBeFalsy();
    expect(result.valid).toBe(true);
  });

  it('spec06-6 describe exactamente los endpoints del spec 06', () => {
    const have = ROUTES.map((r) => `${r.method} ${r.path}`).sort();
    expect(have).toEqual([...SPEC_06].sort());
  });

  it('cada endpoint documenta sus errores con el codigo HTTP del spec 06 §1.1', () => {
    const doc = buildOpenApi() as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
    expect(Object.keys(doc.paths['/days/{date}/close']!.post!.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '409', '429']),
    );
    expect(Object.keys(doc.paths['/devices']!.post!.responses)).toEqual(expect.arrayContaining(['201', '422']));
  });

  it('el archivo openapi.yaml del repo esta al dia (regenerar con pnpm --filter @bimo/core gen:openapi)', () => {
    const header = '# Generado por scripts/gen-openapi.ts desde src/api/contract.ts. No editar a mano.\n';
    const expected = header + toYaml(buildOpenApi());
    const actual = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(actual).toBe(expected);
  });

  it('el YAML generado se parsea como JSON equivalente (comillas dobles = escalares YAML validos)', () => {
    const y = toYaml({ a: 'x: y', b: [1, 'dos', { c: null }], d: {} });
    expect(y).toContain('a: "x: y"');
    expect(y).toContain('d: {}');
  });
});
