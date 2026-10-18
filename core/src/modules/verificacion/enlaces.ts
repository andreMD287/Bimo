/**
 * Enlaces de verificacion y paquete publico (spec 05 §2-§3, spec 06 §3.5-§3.6). El token son 32 bytes aleatorios; solo
 * su SHA-256 se guarda. La API nunca manda raices ni resultados: el navegador del verificador los calcula (spec 05 §1).
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/types';
import type { Deployments } from '../../deployments';
import { AppError } from '../../errors';
import { enqueue } from '../../db/outbox';
import { newId } from '../../ids';
import { sealHistory, todayInBogota } from '../cierre';
import { getPublicProfile } from '../comercios';
import { loadDayEntriesForSeal } from '../ledger';

export const MAX_PERIOD_DAYS = 366; // spec 05 §2
export const MAX_PACKAGE_DAYS = 31; // spec 05 §3
export const EXPIRES_CHOICES = [7, 30, 90] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const daysBetween = (from: string, to: string) => Math.round((dayMs(to) - dayMs(from)) / 86_400_000) + 1;

function checkDate(d: string): string {
  if (!DATE_RE.test(d) || Number.isNaN(dayMs(d))) throw new AppError('invalid_request', 'La fecha debe ser AAAA-MM-DD');
  return d;
}

export const hashToken = (token: string): Buffer => createHash('sha256').update(Buffer.from(token, 'base64url')).digest();

export interface CreateLinkInput {
  merchantId: string;
  dateFrom: string;
  dateTo: string;
  expiresInDays: number;
  verifierBaseUrl: string;
  now: Date;
}

/** POST /verification-links: devuelve el enlace completo UNA sola vez. */
export async function createLink(db: Kysely<Database>, input: CreateLinkInput): Promise<{ id: string; url: string; expires_at: string }> {
  const from = checkDate(input.dateFrom);
  const to = checkDate(input.dateTo);
  if (to < from) throw new AppError('invalid_request', 'El periodo termina antes de empezar');
  if (daysBetween(from, to) > MAX_PERIOD_DAYS) throw new AppError('invalid_request', 'El periodo no puede pasar de 366 dias');
  if (!(EXPIRES_CHOICES as readonly number[]).includes(input.expiresInDays)) throw new AppError('invalid_request', 'La vigencia es de 7, 30 o 90 dias');
  const today = todayInBogota(input.now);
  if (to > today) throw new AppError('invalid_request', 'El periodo no puede incluir dias futuros');
  if (to === today) {
    // hasta hoy solo si hoy ya esta sellado
    const day = await db.selectFrom('business_days').select('status').where('merchant_id', '=', input.merchantId).where('business_date', '=', today).executeTakeFirst();
    if (day?.status !== 'sellado') throw new AppError('invalid_request', 'Hoy todavia no esta sellado: comparte hasta ayer');
  }
  const token = randomBytes(32).toString('base64url');
  const id = newId();
  const expiresAt = new Date(input.now.getTime() + input.expiresInDays * 86_400_000);
  await db
    .insertInto('verification_links')
    .values({ id, merchant_id: input.merchantId, token_hash: hashToken(token), date_from: from, date_to: to, expires_at: expiresAt, revoked_at: null, created_at: input.now })
    .execute();
  return { id, url: `${input.verifierBaseUrl.replace(/\/$/, '')}/#t=${token}`, expires_at: expiresAt.toISOString() };
}

export async function listLinks(db: Kysely<Database>, merchantId: string, now: Date) {
  const rows = await db.selectFrom('verification_links').selectAll().where('merchant_id', '=', merchantId).orderBy('created_at', 'desc').execute();
  return rows.map((r) => ({
    id: r.id,
    date_from: r.date_from,
    date_to: r.date_to,
    expires_at: r.expires_at.toISOString(),
    revoked_at: r.revoked_at ? r.revoked_at.toISOString() : null,
    view_count: r.view_count,
    status: r.revoked_at ? 'revocado' : r.expires_at.getTime() <= now.getTime() ? 'vencido' : 'activo',
  }));
}

export async function revokeLink(db: Kysely<Database>, merchantId: string, linkId: string, now: Date): Promise<void> {
  const res = await db
    .updateTable('verification_links')
    .set({ revoked_at: now })
    .where('id', '=', linkId)
    .where('merchant_id', '=', merchantId)
    .where('revoked_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  if (!res) {
    const exists = await db.selectFrom('verification_links').select('id').where('id', '=', linkId).where('merchant_id', '=', merchantId).executeTakeFirst();
    if (!exists) throw new AppError('not_found', 'Enlace no encontrado');
  }
}

export interface LinkAccess {
  id: string;
  merchantId: string;
  dateFrom: string;
  dateTo: string;
  expiresAt: Date;
}

/** Autentica un token de enlace: desconocido -> 401; vencido o revocado -> 410 link_inactive. */
export async function authenticateLink(db: Kysely<Database>, token: string, now: Date): Promise<LinkAccess> {
  let hashed: Buffer;
  try {
    hashed = hashToken(token);
  } catch {
    throw new AppError('unauthenticated', 'Enlace invalido');
  }
  const row = await db.selectFrom('verification_links').selectAll().where('token_hash', '=', hashed).executeTakeFirst();
  if (!row) throw new AppError('unauthenticated', 'Enlace invalido');
  if (row.revoked_at || row.expires_at.getTime() <= now.getTime()) throw new AppError('link_inactive', 'Este enlace ya no esta activo');
  return { id: row.id, merchantId: row.merchant_id, dateFrom: row.date_from, dateTo: row.date_to, expiresAt: row.expires_at };
}

function checkRange(link: LinkAccess, from: string | undefined, to: string | undefined): { from: string; to: string } {
  const f = checkDate(from ?? link.dateFrom);
  const defaultTo = new Date(Math.min(dayMs(link.dateTo), dayMs(f) + (MAX_PACKAGE_DAYS - 1) * 86_400_000)).toISOString().slice(0, 10);
  const t = checkDate(to ?? defaultTo);
  if (t < f) throw new AppError('invalid_request', 'El rango termina antes de empezar');
  if (f < link.dateFrom || t > link.dateTo) throw new AppError('invalid_request', 'El rango esta fuera del periodo del enlace');
  if (daysBetween(f, t) > MAX_PACKAGE_DAYS) throw new AppError('invalid_request', 'Pide como maximo 31 dias por peticion');
  return { from: f, to: t };
}

function* eachDate(from: string, to: string): Generator<string> {
  for (let ms = dayMs(from); ms <= dayMs(to); ms += 86_400_000) yield new Date(ms).toISOString().slice(0, 10);
}

/** GET /public/verification: el paquete `bimo-verification-v1` (spec 05 §3). Cada peticion valida suma una vista. */
export async function buildPackage(
  db: Kysely<Database>,
  input: { link: LinkAccess; from?: string | undefined; to?: string | undefined; deployments: Deployments },
) {
  const { link } = input;
  const range = checkRange(link, input.from, input.to);
  const profile = await getPublicProfile(db, link.merchantId);
  if (!profile) throw new AppError('link_inactive', 'Este enlace ya no esta activo'); // comercio olvidado (ADR-16)
  await db.updateTable('verification_links').set((eb) => ({ view_count: eb('view_count', '+', 1) })).where('id', '=', link.id).execute();

  const history = await sealHistory(db, link.merchantId, range.from, range.to);
  const days = [];
  for (const date of eachDate(range.from, range.to)) {
    const rows = await loadDayEntriesForSeal(db, link.merchantId, date);
    const h = history.get(date);
    days.push({
      date: Number(date.replace(/-/g, '')),
      status: h?.status ?? 'abierto',
      entries: rows.map((r) => ({
        entry: {
          id: r.entry.id,
          merchant_id: link.merchantId,
          occurred_at: r.entry.occurred_at,
          kind: r.entry.kind,
          origin: r.entry.origin,
          reverses_entry_id: r.entry.reverses_entry_id ?? null,
          external_source: r.entry.external_source ?? null,
          external_ref: r.entry.external_ref ?? null,
          // las notas y los nombres de clientes nunca salen (spec 05 §1)
          lines: r.entry.lines.map((l) => ({
            line_no: l.line_no,
            account_code: l.account_code,
            direction: l.direction,
            amount_minor: Number(l.amount_minor),
            currency: l.currency,
            ...(l.channel ? { channel: l.channel } : {}),
            ...(l.customer_id ? { customer_id: l.customer_id } : {}),
          })),
        },
        salt: r.salt.toString('hex'),
        clock_suspect: r.entry.clock_suspect,
      })),
      seals: h?.seals ?? [],
    });
  }
  return {
    format: 'bimo-verification-v1',
    merchant: { merchant_id: link.merchantId, business_name: profile.businessName, stellar_address: profile.stellarAddress },
    network: {
      network_passphrase: input.deployments.network_passphrase,
      rpc_url: input.deployments.rpc_url,
      registry_ids: input.deployments.registry_ids,
    },
    link: { date_from: link.dateFrom, date_to: link.dateTo, expires_at: link.expiresAt.toISOString() },
    days,
  };
}

/** POST /public/verification/restore: encola la restauracion de los datos archivados de un dia (spec 05 §4). */
export async function requestRestore(db: Kysely<Database>, link: LinkAccess, date: string, now: Date): Promise<void> {
  const d = checkDate(date);
  if (d < link.dateFrom || d > link.dateTo) throw new AppError('invalid_request', 'La fecha esta fuera del periodo del enlace');
  await enqueue(db, 'verification.restore', { merchant_id: link.merchantId, date: d }, now);
}
