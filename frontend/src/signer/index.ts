/**
 * Firmante (spec 03 §6): interfaz detras de la cual vive la llave del dueno. Incremento 1: llave P-256 de software
 * guardada en el llavero del telefono (`expo-secure-store`; en Expo Go sin biometria, en el development build con
 * Face ID). En el incremento 2 se cambia por el Secure Enclave o una passkey sin tocar el resto.
 */
import { p256 } from '@noble/curves/nist.js';
import type { Kv } from '../kv';

export interface Firmante {
  /** Clave publica SEC1 sin comprimir (65 bytes). */
  publicKey(): Uint8Array;
  /** ECDSA P-256 sobre SHA-256(mensaje), low-S, 64 bytes (r || s). */
  sign(message: Uint8Array): Uint8Array;
  readonly kind: 'software_p256';
}

const KEY = 'bimo.signer.p256';
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => Uint8Array.from(h.match(/../g)?.map((x) => parseInt(x, 16)) ?? []);

export function softwareFirmante(priv: Uint8Array): Firmante {
  const pub = p256.getPublicKey(priv, false);
  return {
    kind: 'software_p256',
    publicKey: () => pub,
    sign: (message) => p256.sign(message, priv, { prehash: true, lowS: true }),
  };
}

/** Carga la llave guardada o crea una nueva con la fuente de bytes aleatorios segura del telefono. */
export function cargarFirmante(kv: Kv, randomBytes: (n: number) => Uint8Array): Firmante {
  const saved = kv.get(KEY);
  if (saved) return softwareFirmante(fromHex(saved));
  const priv = p256.utils.randomSecretKey(randomBytes(48));
  kv.set(KEY, toHex(priv));
  return softwareFirmante(priv);
}

export function borrarFirmante(kv: Kv): void {
  kv.remove(KEY);
}
