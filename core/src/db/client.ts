import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types';

/**
 * bigint (int8) llega como entero de JS, y se falla si no es seguro: el dinero son enteros en unidades minimas
 * (spec 01 §1) y V-03 limita cada linea a 10^12. `date` llega como texto 'AAAA-MM-DD' (nada de zonas horarias).
 */
export function createPool(connectionString: string, max = 10): pg.Pool {
  const types = {
    getTypeParser(oid: number, format?: 'text' | 'binary') {
      if (oid === 20) {
        return (v: string) => {
          const n = Number(v);
          if (!Number.isSafeInteger(n)) throw new Error('bigint fuera de rango seguro');
          return n;
        };
      }
      if (oid === 1082) return (v: string) => v;
      return pg.types.getTypeParser(oid, format as 'text');
    },
  };
  const pool = new pg.Pool({ connectionString, max, types: types as unknown as pg.CustomTypesConfig });
  // una conexion ociosa que se cae (reinicio de la base) no debe tumbar el proceso; el pool abre otra en el siguiente uso
  pool.on('error', () => undefined);
  return pool;
}

export function createDb(pool: pg.Pool): Kysely<Database> {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

export type Db = Kysely<Database>;
