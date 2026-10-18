/**
 * Cola de trabajos en Postgres (spec 08 §2): `outbox_messages` con FOR UPDATE SKIP LOCKED y alquiler del mensaje.
 * Infraestructura comun de los workers; cada modulo encola sus mensajes y su worker los toma.
 */
import { sql, type Kysely, type Transaction } from 'kysely';
import { newId } from '../ids';
import type { Database } from './types';

type Db = Kysely<Database> | Transaction<Database>;

export async function enqueue(db: Db, topic: string, payload: Record<string, unknown>, at: Date): Promise<string> {
  const id = newId();
  await db.insertInto('outbox_messages').values({ id, topic, payload: JSON.stringify(payload), next_attempt_at: at }).execute();
  return id;
}

export interface Claimed<P> {
  id: string;
  attempts: number;
  payload: P;
}

/** Toma el mensaje pendiente mas viejo cuyo momento ya llego y lo "alquila" por `leaseMs`. */
export async function claim<P>(db: Db, topic: string, now: Date, leaseMs: number): Promise<Claimed<P> | null> {
  const res = await sql<{ id: string; attempts: number; payload: P }>`
    update outbox_messages
       set attempts = attempts + 1, next_attempt_at = ${new Date(now.getTime() + leaseMs)}
     where id = (
       select id from outbox_messages
        where topic = ${topic} and status = 'pendiente' and next_attempt_at <= ${now}
        order by created_at
        for update skip locked
        limit 1)
    returning id, attempts, payload`.execute(db);
  return res.rows[0] ?? null;
}

export async function complete(db: Db, id: string): Promise<void> {
  await db.updateTable('outbox_messages').set({ status: 'enviado', last_error: null }).where('id', '=', id).execute();
}

export async function retryLater(db: Db, id: string, reason: string, at: Date): Promise<void> {
  await db.updateTable('outbox_messages').set({ last_error: reason, next_attempt_at: at }).where('id', '=', id).execute();
}

/** Spec 07 §5: `fallido` solo despues de 20 intentos; genera alerta. */
export async function giveUp(db: Db, id: string, reason: string): Promise<void> {
  await db.updateTable('outbox_messages').set({ status: 'fallido', last_error: reason }).where('id', '=', id).execute();
}
