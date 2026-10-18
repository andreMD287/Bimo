/**
 * Prepara un Postgres para las pruebas con base de datos real (spec 08 §4): levanta uno embebido (sin Docker),
 * imita lo basico de Supabase (schema `auth`, roles) y aplica `supabase/migrations/*.sql`. Cada archivo de prueba
 * crea su propia base a partir de la plantilla (ver pg.ts).
 *
 * Con TEST_ADMIN_DATABASE_URL se usa un Postgres existente (por ejemplo el de la CI) en lugar del embebido; en ese
 * caso la base debe permitir `create database`.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
  }
}

const SUPABASE_STUBS = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text);
  create or replace function auth.uid() returns uuid language sql stable as $f$
    select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $f$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

let embedded: EmbeddedPostgres | undefined;
let dir: string | undefined;

export default async function setup(project: TestProject) {
  let adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
  if (!adminUrl) {
    const port = 56000 + Math.floor(Math.random() * 900);
    dir = mkdtempSync(path.join(tmpdir(), 'bimo-pg-'));
    embedded = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: false });
    await embedded.initialise();
    await embedded.start();
    adminUrl = `postgres://postgres:postgres@localhost:${port}/postgres`;
  }
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query('drop database if exists bimo_template');
  await admin.query('create database bimo_template');
  await admin.end();

  const tpl = new pg.Client({ connectionString: adminUrl.replace(/\/[^/]*$/, '/bimo_template') });
  await tpl.connect();
  await tpl.query(SUPABASE_STUBS);
  const migrations = path.resolve(import.meta.dirname, '../../supabase/migrations');
  for (const f of readdirSync(migrations).filter((x) => x.endsWith('.sql')).sort()) {
    await tpl.query(readFileSync(path.join(migrations, f), 'utf8'));
  }
  await tpl.end();

  project.provide('pgAdminUrl', adminUrl);
  return async () => {
    await embedded?.stop();
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // Windows puede tardar en soltar los archivos del Postgres embebido; el directorio es temporal
      }
    }
  };
}
