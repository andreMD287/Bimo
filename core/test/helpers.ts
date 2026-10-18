import { Writable } from 'node:stream';
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import type { DeviceDirectory, DeviceRecord } from '../src/auth/devices';
import { createJwtVerifier } from '../src/auth/jwt';
import { buildServer, type ServerDeps } from '../src/api/server';
import { loadConfig, type CoreConfig } from '../src/config';
import type { Db } from '../src/db/client';
import type { MemberRole } from '../src/db/types';

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
export const USER_EMPLEADO = '33333333-3333-4333-8333-333333333333';
export const DEVICE_A = '01JA0000000000000000000DEA';
export const DEVICE_B = '01JA0000000000000000000DEB';
export const DEVICE_REVOKED = '01JA0000000000000000000DEC';
export const DEVICE_EMPLEADO = '01JA0000000000000000000DED';
export const MERCHANT_A = '01JA0000000000000000000MA1';
export const MERCHANT_B = '01JA0000000000000000000MB1';

export function testConfig(over: Record<string, string> = {}): CoreConfig {
  return loadConfig({
    BIMO_ENV: 'local',
    DATABASE_URL: 'postgres://x',
    SUPABASE_URL: 'http://localhost:54321',
    STELLAR_NETWORK: 'testnet',
    ...over,
  });
}

export async function makeAuth() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const keys: JWTVerifyGetKey = async () => publicKey;
  const jwt = createJwtVerifier({ keys });
  const sign = (sub: string, aud = 'authenticated') =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(sub)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
  return { jwt, sign };
}

export function memoryDevices(
  devices: DeviceRecord[],
  members: Array<{ userId: string; merchantId: string; role: MemberRole }>,
): DeviceDirectory {
  return {
    async findDevice(id) {
      return devices.find((d) => d.id === id) ?? null;
    },
    async memberRole(userId, merchantId) {
      return members.find((m) => m.userId === userId && m.merchantId === merchantId)?.role ?? null;
    },
  };
}

export class LogCapture extends Writable {
  readonly lines: string[] = [];
  override _write(chunk: Buffer, _enc: string, cb: () => void) {
    this.lines.push(...chunk.toString().split('\n').filter(Boolean));
    cb();
  }
  get text() {
    return this.lines.join('\n');
  }
}

export async function makeApp(over: Partial<ServerDeps> = {}) {
  const auth = await makeAuth();
  const log = new LogCapture();
  const devices = memoryDevices(
    [
      { id: DEVICE_A, merchantId: MERCHANT_A, userId: USER_A, revoked: false },
      { id: DEVICE_B, merchantId: MERCHANT_B, userId: USER_B, revoked: false },
      { id: DEVICE_REVOKED, merchantId: MERCHANT_A, userId: USER_A, revoked: true },
      { id: DEVICE_EMPLEADO, merchantId: MERCHANT_A, userId: USER_EMPLEADO, revoked: false },
    ],
    [
      { userId: USER_A, merchantId: MERCHANT_A, role: 'dueno' },
      { userId: USER_B, merchantId: MERCHANT_B, role: 'dueno' },
      { userId: USER_EMPLEADO, merchantId: MERCHANT_A, role: 'empleado' },
    ],
  );
  const app = await buildServer({
    config: testConfig(),
    db: {} as unknown as Db,
    jwt: auth.jwt,
    devices,
    health: { db: async () => true, rpc: async () => true, relayer: async () => 'not_configured' },
    logDestination: log,
    routes: [
      (a) => {
        a.post('/_t/echo', async (req) => ({ ok: true, merchant: req.ctx.merchantId }));
        a.post('/_t/solo-dueno', { config: { roles: ['dueno'] } }, async () => ({ ok: true }));
        a.post('/_t/registro', { config: { access: 'user' } }, async (req) => ({ user: req.ctx.userId }));
      },
    ],
    ...over,
  });
  const headers = async (user: string, deviceId?: string, extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${await auth.sign(user)}`,
    'x-device-time': new Date().toISOString(),
    ...(deviceId ? { 'x-device-id': deviceId } : {}),
    ...extra,
  });
  return { app, auth, log, headers };
}
