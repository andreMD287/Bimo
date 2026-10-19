import { memoryKv, type Kv } from './kvMemoria';

/** localStorage del navegador (con respaldo en memoria si esta bloqueado). Solo para la demo web. */
function webKv(): Kv {
  const fallback = memoryKv();
  const ls = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };
  return {
    get: (k) => {
      try {
        return ls()?.getItem(k) ?? fallback.get(k);
      } catch {
        return fallback.get(k);
      }
    },
    set: (k, v) => {
      try {
        ls()?.setItem(k, v);
      } catch {
        fallback.set(k, v);
      }
      fallback.set(k, v);
    },
    remove: (k) => {
      try {
        ls()?.removeItem(k);
      } catch {
        /* sin almacenamiento */
      }
      fallback.remove(k);
    },
  };
}

export const kv: Kv = webKv();
export { memoryKv };
