import * as SecureStore from 'expo-secure-store';
import type { Kv } from './kv';

/** Llavero del telefono (Keychain). Las llaves de SecureStore solo admiten letras, numeros, `.`, `-` y `_`. */
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const kv: Kv = {
  get: (k) => SecureStore.getItem(safe(k)),
  set: (k, v) => SecureStore.setItem(safe(k), v),
  // SecureStore no tiene borrado sincrono: se deja vacio (get lo trata como ausente)
  remove: (k) => SecureStore.setItem(safe(k), ''),
};

export { memoryKv } from './kv';
