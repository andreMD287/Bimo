import { MemoryStore } from './memory';
import type { Store } from './types';

/** Abre la base local. Por omision (pruebas) es en memoria; `open.native.ts` usa expo-sqlite y `open.web.ts` localStorage. */
export function openStore(): Store {
  return new MemoryStore();
}
