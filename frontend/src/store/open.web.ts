import { kv } from '../kv.web';
import { MemoryStore, type MemoryState } from './memory';
import type { Store } from './types';

const KEY = 'bimo.store.v1';

/** En la web (demo) la base local es en memoria y se respalda en localStorage despues de cada transaccion. */
export function openStore(): Store {
  let initial: MemoryState | undefined;
  try {
    const raw = kv.get(KEY);
    if (raw) initial = JSON.parse(raw) as MemoryState;
  } catch {
    initial = undefined;
  }
  return new MemoryStore(initial, (s) => {
    try {
      kv.set(KEY, JSON.stringify(s));
    } catch {
      /* cuota llena: la sesion sigue en memoria */
    }
  });
}
