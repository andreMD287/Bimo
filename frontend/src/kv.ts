/**
 * Almacen clave-valor sincrono para la sesion, el dispositivo y la llave. En el telefono lo reemplaza `kv.native.ts`
 * (expo-secure-store) y en la web `kv.web.ts` (localStorage); este archivo sirve para las pruebas (memoria).
 */
export interface Kv {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryKv(initial: Record<string, string> = {}): Kv {
  const m = new Map(Object.entries(initial));
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

export const kv: Kv = memoryKv();
