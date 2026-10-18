import { ulid } from 'ulid';

/** ULID: 26 caracteres, Crockford base32, mayusculas (spec 01 §1; regla V-01). */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && ULID_PATTERN.test(value);
}

/** Genera un ULID nuevo (el tiempo de la maquina y 80 bits aleatorios). */
export function newUlid(seedTimeMs?: number): string {
  return ulid(seedTimeMs);
}
