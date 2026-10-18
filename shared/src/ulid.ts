import { ulid } from 'ulid';

/** ULID: 26 caracteres, Crockford base32, mayusculas (spec 01 §1; regla V-01). */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && ULID_PATTERN.test(value);
}

let prng: (() => number) | undefined;

/**
 * Entornos sin `crypto.getRandomValues` (React Native) entregan aqui su fuente de bytes aleatorios seguros
 * (por ejemplo `expo-crypto`). Despues de llamarla, `newUlid` la usa.
 */
export function configureRandom(randomBytes: (n: number) => Uint8Array): void {
  prng = () => {
    const b = randomBytes(4);
    return new DataView(b.buffer, b.byteOffset, 4).getUint32(0) / 0x100000000;
  };
}

/** Genera un ULID nuevo (el tiempo de la maquina y 80 bits aleatorios). */
export function newUlid(seedTime?: number): string {
  return prng ? ulid(seedTime, prng) : ulid(seedTime);
}
