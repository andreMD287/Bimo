import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb, createPool, type Db } from '../src/db/client';

export interface TestDb {
  db: Db;
  pool: pg.Pool;
  url: string;
  /** Inserta un usuario en auth.users (lo que haria Supabase Auth) y devuelve su uuid. */
  addUser(id: string, email?: string): Promise<string>;
  close(): Promise<void>;
}

/** Crea una base nueva (a partir de la plantilla con las migraciones) para un archivo de pruebas. */
export async function createTestDb(): Promise<TestDb> {
  const adminUrl = inject('pgAdminUrl');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name} template bimo_template`);
  await admin.end();
  const url = adminUrl.replace(/\/[^/]*$/, `/${name}`);
  const pool = createPool(url, 5);
  const db = createDb(pool);
  return {
    db,
    pool,
    url,
    async addUser(id, email = `${id}@test.co`) {
      await pool.query(
        `insert into auth.users (id, instance_id, aud, role, email) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
        [id, email],
      );
      return id;
    },
    async close() {
      await db.destroy();
      const a = new pg.Client({ connectionString: adminUrl });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}
