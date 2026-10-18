import { z } from 'zod';
import { HTTP_STATUS } from '../errors';
import { ROUTES, type ApiRoute } from './contract';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const ERROR_SCHEMA: Json = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'details'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object', additionalProperties: true },
      },
    },
  },
};

function jsonSchema(schema: z.ZodType): Json {
  const out = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' }) as Record<string, Json>;
  delete out.$schema;
  return out;
}

function operation(r: ApiRoute): Json {
  const params: Json[] = [];
  for (const m of r.path.matchAll(/\{(\w+)\}/g)) {
    params.push({ name: m[1] as string, in: 'path', required: true, schema: { type: 'string' } });
  }
  if (r.query) {
    const js = jsonSchema(r.query) as { properties?: Record<string, Json>; required?: string[] };
    for (const [name, schema] of Object.entries(js.properties ?? {})) {
      params.push({ name, in: 'query', required: (js.required ?? []).includes(name), schema });
    }
  }
  if (r.auth === 'device') {
    params.push({ name: 'X-Device-Id', in: 'header', required: true, schema: { type: 'string' } });
  }
  if (r.auth === 'device' || r.auth === 'user') {
    params.push({ name: 'X-Device-Time', in: 'header', required: true, schema: { type: 'string' }, description: 'ISO-8601 UTC con milisegundos (spec 04 §7)' });
  }
  const responses: Record<string, Json> = {};
  const ok: Json = r.success.schema
    ? { description: 'Exito', content: { 'application/json': { schema: jsonSchema(r.success.schema) } } }
    : { description: 'Exito (sin cuerpo)' };
  responses[String(r.success.status)] = ok;
  for (const code of r.errors) {
    const status = String(HTTP_STATUS[code]);
    const prev = responses[status] as { description: string } | undefined;
    responses[status] = {
      description: prev ? `${prev.description}, ${code}` : `Error: ${code}`,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
  }
  const op: Record<string, Json> = {
    summary: r.summary,
    tags: [r.tag],
    operationId: `${r.method}_${r.path.replace(/[{}]/g, '').replace(/\//g, '_').replace(/^_/, '')}`,
    parameters: params,
    responses,
  };
  if (r.simulatorOnly) op.description = 'Solo existe con BIMO_SIMULATORS=on; con off responde 404.';
  if (r.body) {
    op.requestBody = { required: true, content: { 'application/json': { schema: jsonSchema(r.body) } } };
  }
  if (r.auth === 'public') op.security = [];
  else if (r.auth === 'token') op.security = [{ linkToken: [] }];
  else op.security = [{ supabaseJwt: [] }];
  return op;
}

export function buildOpenApi(): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const r of ROUTES) {
    paths[r.path] ??= {};
    (paths[r.path] as Record<string, Json>)[r.method] = operation(r);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'bimo-core',
      version: '1.1.0',
      description: 'API de bimo-core (spec 06). Generado por `pnpm --filter @bimo/core gen:openapi`; no se edita a mano.',
    },
    servers: [{ url: 'https://api.bimo.example/v1', description: 'Base /v1 (spec 06 §1)' }],
    paths,
    components: {
      schemas: { Error: ERROR_SCHEMA },
      securitySchemes: {
        supabaseJwt: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT de Supabase Auth (spec 06 §2)' },
        linkToken: { type: 'http', scheme: 'bearer', description: 'Token del enlace de verificacion (spec 05)' },
      },
    },
  };
}

// ---- Serializador YAML minimo (solo lo que produce buildOpenApi) ----
function scalar(v: string | number | boolean | null): string {
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v); // un string JSON entre comillas dobles es un escalar YAML valido
}

export function toYaml(value: Json, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]\n';
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const inner = toYaml(item, indent + 1);
          if (Array.isArray(item) ? item.length === 0 : Object.keys(item).length === 0) return `${pad}- ${inner}`;
          return `${pad}- ${inner.slice(pad.length + 2)}`;
        }
        return `${pad}- ${scalar(item)}\n`;
      })
      .join('');
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}\n';
    return keys
      .map((k) => {
        const v = (value as Record<string, Json>)[k] as Json;
        const key = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) ? k : JSON.stringify(k);
        if (v !== null && typeof v === 'object') {
          const empty = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
          if (empty) return `${pad}${key}: ${Array.isArray(v) ? '[]' : '{}'}\n`;
          return `${pad}${key}:\n${toYaml(v, indent + 1)}`;
        }
        return `${pad}${key}: ${scalar(v)}\n`;
      })
      .join('');
  }
  return `${pad}${scalar(value)}\n`;
}
