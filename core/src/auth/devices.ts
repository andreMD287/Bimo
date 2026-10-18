import type { Db } from '../db/client';
import type { MemberRole } from '../db/types';

export interface DeviceRecord {
  id: string;
  merchantId: string;
  userId: string;
  revoked: boolean;
}

/** Puerto de acceso a dispositivos y membresias (la implementacion real consulta Postgres). */
export interface DeviceDirectory {
  findDevice(deviceId: string): Promise<DeviceRecord | null>;
  /** Rol del usuario en el comercio, o null si no es miembro. */
  memberRole(userId: string, merchantId: string): Promise<MemberRole | null>;
}

export function createPgDeviceDirectory(db: Db): DeviceDirectory {
  return {
    async findDevice(deviceId) {
      const row = await db
        .selectFrom('devices')
        .select(['id', 'merchant_id', 'user_id', 'revoked_at'])
        .where('id', '=', deviceId)
        .executeTakeFirst();
      if (!row) return null;
      return { id: row.id, merchantId: row.merchant_id, userId: row.user_id, revoked: row.revoked_at !== null };
    },
    async memberRole(userId, merchantId) {
      const row = await db
        .selectFrom('merchant_members')
        .select('role')
        .where('user_id', '=', userId)
        .where('merchant_id', '=', merchantId)
        .executeTakeFirst();
      return row?.role ?? null;
    },
  };
}
