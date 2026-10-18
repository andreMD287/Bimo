import * as SQLite from 'expo-sqlite';
import { SqlStore, type SqlDriver, type SqlValue } from './sql';
import type { Store } from './types';

/** expo-sqlite en su API sincrona: una transaccion local es atomica de verdad (spec 04 §2). */
export function openStore(): Store {
  const db = SQLite.openDatabaseSync('bimo.db');
  const driver: SqlDriver = {
    exec: (sql) => db.execSync(sql),
    run: (sql, params: SqlValue[] = []) => void db.runSync(sql, params),
    all: <T,>(sql: string, params: SqlValue[] = []) => db.getAllSync<T>(sql, params),
  };
  return new SqlStore(driver, (fn) => {
    let out!: ReturnType<typeof fn>;
    db.withTransactionSync(() => {
      out = fn();
    });
    return out;
  });
}
