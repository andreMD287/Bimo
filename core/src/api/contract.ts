/**
 * Contrato HTTP de bimo-core (spec 06 v1.1): una sola descripcion de cada endpoint, con sus esquemas Zod.
 * De aqui sale `core/openapi.yaml` (scripts/gen-openapi.ts) y, a medida que se implementan los endpoints
 * (A-07 en adelante), los handlers validan con estos mismos esquemas.
 */
import { z } from 'zod';
import type { ErrorCode } from '../errors';

const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).describe('ULID (26 caracteres Crockford base32)');
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).describe('ISO-8601 UTC con milisegundos');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Dia de negocio AAAA-MM-DD (America/Bogota)');
const base64 = z.string().describe('Base64 estandar');
const money = z.number().int().describe('Entero en unidades minimas (COP en centavos)');

const accountStatus = z.enum(['pending', 'deploying', 'ready', 'failed']);
const dayStatus = z.enum(['abierto', 'cerrado', 'firmado', 'sellado', 'requiere_enmienda']);
const channelCode = z.enum(['efectivo', 'breb', 'datafono_externo', 'tap_to_pay', 'fiado', 'transferencia_otro']);
const entryKind = z.enum(['venta', 'abono_cliente', 'liquidacion_psp', 'ajuste_caja', 'reverso', 'conversion', 'salida']);
const accountCode = z.enum([
  'caja', 'por_cobrar_clientes', 'por_cobrar_psp', 'cuenta_socio', 'bolsillo_usd', 'adelantos_por_pagar',
  'ventas', 'comisiones', 'diferencias_caja', 'gastos', 'retiros_dueno',
]);

export const Network = z
  .object({
    network: z.enum(['testnet', 'mainnet']),
    network_passphrase: z.string(),
    rpc_url: z.string(),
    registry_ids: z.array(z.string()),
    p256_verifier_id: z.string(),
    account_wasm_hash: z.string(),
    attester: z.string(),
    admin: z.string(),
    deployer: z.string(),
    usdc_sac: z.string(),
  })
  .describe('Contenido de contracts/deployments/<red>.json (spec 03 §9)');

export const PushLine = z.object({
  id: ulid,
  line_no: z.number().int().min(1).max(20),
  account_code: accountCode,
  direction: z.enum(['debe', 'haber']),
  amount_minor: money,
  currency: z.enum(['COP', 'USDC']),
  channel: channelCode.optional(),
  customer_id: ulid.optional(),
});

export const PushEntry = z.object({
  id: ulid,
  occurred_at: instant,
  kind: entryKind,
  origin: z.literal('declarado'),
  reverses_entry_id: ulid.nullable(),
  note: z.string().max(140).nullable(),
  lines: z.array(PushLine).min(2).max(20),
});

export const PushCustomer = z.object({
  id: ulid,
  display_name: z.string().min(1).max(60),
  phone: z.string().nullable(),
  updated_at: instant,
});

export const PushChannel = z.object({
  id: ulid,
  name: z.string().min(1).max(60),
  channel: channelCode,
  commission_bps: z.number().int().min(0).max(10000),
  settlement_days: z.number().int().min(0).max(30),
  active: z.boolean(),
  updated_at: instant,
});

export const PushItem = z.discriminatedUnion('type', [
  z.object({ type: z.literal('customer'), data: PushCustomer }),
  z.object({ type: z.literal('channel'), data: PushChannel }),
  z.object({ type: z.literal('entry'), data: PushEntry }),
]);

export const PushRequest = z.object({
  device_id: ulid,
  device_time: instant,
  items: z.array(PushItem).max(200),
});

export const PushResult = z.object({
  type: z.enum(['customer', 'channel', 'entry']),
  id: ulid,
  result: z.enum(['accepted', 'duplicate', 'id_conflict', 'rejected', 'dependency_failed']),
  code: z.string().optional().describe('Codigo V-xx del spec 04 §4 cuando result = rejected'),
  business_date: day.optional(),
  day_status: dayStatus.optional(),
});

export const PushResponse = z.object({ results: z.array(PushResult), clock_skew_ms: z.number().int() });

export const PullResponse = z.object({
  changes: z.array(
    z.object({
      seq: z.number().int(),
      entity: z.enum(['entry', 'customer', 'channel', 'day', 'seal']),
      data: z.record(z.string(), z.unknown()),
    }),
  ),
  next_cursor: z.number().int(),
  has_more: z.boolean(),
});

const SigningItem = z.object({ date: day, entry_count: z.number().int(), is_amend: z.boolean() });

const LinkStatus = z.enum(['activo', 'vencido', 'revocado']);

export type HttpMethod = 'get' | 'post' | 'delete';

export interface ApiRoute {
  method: HttpMethod;
  path: string;
  summary: string;
  tag: string;
  /** Misma clave que `config.access` del servidor, o `token` para los enlaces de verificacion. */
  auth: 'public' | 'user' | 'device' | 'token';
  query?: z.ZodObject;
  body?: z.ZodType;
  /** Respuesta exitosa. `null` = sin cuerpo. */
  success: { status: number; schema: z.ZodType | null };
  errors: ErrorCode[];
  /** Solo existe con BIMO_SIMULATORS=on. */
  simulatorOnly?: boolean;
}

const q = (shape: z.ZodRawShape) => z.object(shape);

export const ROUTES: ApiRoute[] = [
  // 3.1 Comercio y dispositivo
  {
    method: 'post', path: '/merchants', tag: 'Comercio', auth: 'user', summary: 'Crear el comercio del usuario',
    body: z.object({ business_name: z.string().min(1).max(80), owner_name: z.string().max(80).optional(), city: z.string().optional() }),
    success: { status: 201, schema: z.object({ merchant_id: ulid }) },
    errors: ['invalid_request', 'unauthenticated', 'already_exists', 'rate_limited'],
  },
  {
    method: 'post', path: '/devices/challenge', tag: 'Comercio', auth: 'user', summary: 'Pedir un reto de un solo uso (vence en 5 min)',
    body: z.object({}),
    success: { status: 200, schema: z.object({ challenge_id: ulid, challenge: base64, expires_at: instant }) },
    errors: ['unauthenticated', 'rate_limited'],
  },
  {
    method: 'post', path: '/devices', tag: 'Comercio', auth: 'user', summary: 'Registrar el dispositivo con la firma del reto',
    body: z.object({
      device_id: ulid, challenge_id: ulid,
      public_key: base64.describe('P-256 sin comprimir, 65 bytes'),
      key_kind: z.enum(['secure_enclave_p256', 'software_p256', 'passkey_webauthn']),
      signature: base64.describe('64 bytes (r || s) sobre el reto'),
    }),
    success: { status: 201, schema: z.object({ device_id: ulid, account_status: accountStatus }) },
    errors: ['invalid_request', 'unauthenticated', 'invalid_signature', 'invalid_challenge', 'already_exists', 'rate_limited'],
  },
  {
    method: 'get', path: '/merchants/me', tag: 'Comercio', auth: 'device', summary: 'Datos del comercio del usuario',
    success: {
      status: 200,
      schema: z.object({
        merchant_id: ulid, business_name: z.string(), stellar_address: z.string().nullable(),
        account_status: accountStatus, network: Network, role: z.enum(['dueno', 'empleado']),
      }),
    },
    errors: ['unauthenticated', 'forbidden', 'device_revoked', 'rate_limited'],
  },
  {
    method: 'delete', path: '/merchants/me', tag: 'Comercio', auth: 'device', summary: 'Borrar la cuenta (ADR-16); exige firma del dispositivo',
    body: z.object({ challenge_id: ulid, signature: base64 }),
    success: { status: 202, schema: null },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'invalid_signature', 'invalid_challenge', 'rate_limited'],
  },
  // 3.2 Sincronizacion
  {
    method: 'post', path: '/sync/push', tag: 'Sincronizacion', auth: 'device', summary: 'Subir el outbox (maximo 200 items y 1 MB)',
    body: PushRequest, success: { status: 200, schema: PushResponse },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'rate_limited'],
  },
  {
    method: 'get', path: '/sync/pull', tag: 'Sincronizacion', auth: 'device', summary: 'Bajar cambios desde un cursor (maximo 500)',
    query: q({ cursor: z.coerce.number().int().min(0).optional(), limit: z.coerce.number().int().min(1).max(500).optional() }),
    success: { status: 200, schema: PullResponse },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'rate_limited'],
  },
  // 3.3 Dias y cierre
  {
    method: 'post', path: '/days/{date}/close', tag: 'Dias', auth: 'device', summary: 'Cerrar un dia de negocio',
    body: z.object({ counted_cash_minor: money, entry_ids: z.array(ulid) }),
    success: { status: 200, schema: z.object({ status: dayStatus, signing_request_id: ulid.optional() }) },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'missing_entries', 'day_not_closable', 'rate_limited'],
  },
  {
    method: 'get', path: '/days', tag: 'Dias', auth: 'device', summary: 'Estado de los dias de un rango',
    query: q({ from: day.optional(), to: day.optional() }),
    success: {
      status: 200,
      schema: z.object({
        days: z.array(z.object({ date: day, status: dayStatus, entry_count: z.number().int(), seal_version: z.number().int(), tx_hash: z.string().optional() })),
      }),
    },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'rate_limited'],
  },
  // 3.4 Firma de sellos
  {
    method: 'get', path: '/signing/pending', tag: 'Firma', auth: 'device', summary: 'Solicitud de firma vigente (o null)',
    success: {
      status: 200,
      schema: z.object({
        request: z.object({
          signing_request_id: ulid, preimage_xdr: base64, items: z.array(SigningItem),
          expiration_ledger: z.number().int(), expires_at: instant,
        }).nullable(),
      }),
    },
    errors: ['unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'rate_limited'],
  },
  {
    method: 'post', path: '/signing/{id}/signature', tag: 'Firma', auth: 'device', summary: 'Enviar la firma P-256 de la preimagen',
    body: z.object({ signature: base64.describe('64 bytes (r || s)') }),
    success: { status: 202, schema: z.object({ status: z.literal('firmado') }) },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'signature_expired', 'request_superseded', 'invalid_signature', 'rate_limited'],
  },
  // 3.5 Enlaces de verificacion
  {
    method: 'post', path: '/verification-links', tag: 'Verificacion', auth: 'device', summary: 'Crear un enlace de verificacion',
    body: z.object({ date_from: day, date_to: day, expires_in_days: z.union([z.literal(7), z.literal(30), z.literal(90)]) }),
    success: { status: 201, schema: z.object({ id: ulid, url: z.string(), expires_at: instant }) },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'rate_limited'],
  },
  {
    method: 'get', path: '/verification-links', tag: 'Verificacion', auth: 'device', summary: 'Listar mis enlaces',
    success: {
      status: 200,
      schema: z.object({
        links: z.array(z.object({
          id: ulid, date_from: day, date_to: day, expires_at: instant, revoked_at: instant.nullable(),
          view_count: z.number().int(), status: LinkStatus,
        })),
      }),
    },
    errors: ['unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'rate_limited'],
  },
  {
    method: 'delete', path: '/verification-links/{id}', tag: 'Verificacion', auth: 'device', summary: 'Revocar un enlace',
    success: { status: 204, schema: null },
    errors: ['unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'not_found', 'rate_limited'],
  },
  // 3.6 Publicos
  {
    method: 'get', path: '/public/verification', tag: 'Publico', auth: 'token', summary: 'Paquete de verificacion (spec 05 §3)',
    query: q({ from: day.optional(), to: day.optional() }),
    success: { status: 200, schema: z.record(z.string(), z.unknown()).describe('Paquete del spec 05 §3') },
    errors: ['unauthenticated', 'link_inactive', 'not_found', 'rate_limited'],
  },
  {
    method: 'post', path: '/public/verification/restore', tag: 'Publico', auth: 'token', summary: 'Pedir la restauracion de un dia archivado',
    body: z.object({ date: day }), success: { status: 202, schema: null },
    errors: ['invalid_request', 'unauthenticated', 'link_inactive', 'rate_limited'],
  },
  {
    method: 'get', path: '/public/entry-proof', tag: 'Publico', auth: 'token', summary: 'Reservado para el incremento 2 (hoy responde 404)',
    query: q({ entry_id: ulid }), success: { status: 200, schema: z.record(z.string(), z.unknown()) },
    errors: ['not_found', 'unauthenticated', 'link_inactive'],
  },
  {
    method: 'get', path: '/health', tag: 'Publico', auth: 'public', summary: 'Estado de la base de datos, el RPC y el relayer',
    success: {
      status: 200,
      schema: z.object({
        status: z.enum(['ok', 'degraded']), db: z.enum(['ok', 'down']), rpc: z.enum(['ok', 'down']),
        relayer: z.enum(['ok', 'down', 'not_configured']),
      }),
    },
    errors: [],
  },
  // 3.7 Simuladores
  {
    method: 'post', path: '/dev/simulate/breb-incoming', tag: 'Simuladores', auth: 'device', simulatorOnly: true,
    summary: 'Simular un pago Bre-B entrante (asiento verificado)',
    body: z.object({ amount_minor: money.min(1), occurred_at: instant.optional() }),
    success: { status: 201, schema: z.object({ entry_id: ulid }) },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'not_found'],
  },
  {
    method: 'post', path: '/dev/simulate/card-sale', tag: 'Simuladores', auth: 'device', simulatorOnly: true,
    summary: 'Simular una venta con Tap to Pay (asiento verificado)',
    body: z.object({ amount_minor: money.min(1) }),
    success: { status: 201, schema: z.object({ entry_id: ulid }) },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'not_found'],
  },
  {
    method: 'post', path: '/dev/simulate/psp-settlement', tag: 'Simuladores', auth: 'device', simulatorOnly: true,
    summary: 'Simular la liquidacion del PSP (asiento verificado)',
    body: z.object({ sale_entry_ids: z.array(ulid).min(1), fee_bps: z.number().int().min(0).max(10000) }),
    success: { status: 201, schema: z.object({ entry_id: ulid }) },
    errors: ['invalid_request', 'unauthenticated', 'forbidden', 'device_revoked', 'role_not_allowed', 'not_found'],
  },
];

/** Busca un endpoint del contrato; los handlers validan con sus mismos esquemas. */
export function routeOf(method: HttpMethod, path: string): ApiRoute {
  const r = ROUTES.find((x) => x.method === method && x.path === path);
  if (!r) throw new Error(`Ruta fuera del contrato: ${method} ${path}`);
  return r;
}
