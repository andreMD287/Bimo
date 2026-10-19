/** Version para las pruebas (memoria). En el telefono la reemplaza `kv.native.ts` y en la web `kv.web.ts`. */
import { memoryKv, type Kv } from './kvMemoria';

export type { Kv };
export { memoryKv };
export const kv: Kv = memoryKv();
