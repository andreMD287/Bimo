// Ayudas compartidas por los hooks. No lo importan las pantallas.

import type { Asiento, CanalConfig } from '../lib/tipos';
import { esCuentaDeActivo } from '../lib/hoy';
import type { EstadoMock } from '../mocks/estado';

export interface CobroDeVenta {
  asiento: Asiento;
  canal: CanalConfig | null;
  channel: NonNullable<Asiento['lines'][number]['channel']>;
  monto_minor: number;
}

/** Líneas de cobro (débitos en cuentas de activo) de una venta, con su canal configurado. */
export function cobrosDeVenta(estado: EstadoMock, a: Asiento): CobroDeVenta[] {
  const ids = estado.meta[a.id]?.canal_ids ?? [];
  const debitos = a.lines.filter((l) => l.direction === 'debe' && esCuentaDeActivo(l.account_code) && l.channel !== null);
  return debitos.map((l, i) => ({
    asiento: a,
    canal: estado.canales.find((c) => c.id === ids[i]) ?? null,
    channel: l.channel!,
    monto_minor: l.amount_minor,
  }));
}

export function idsReversados(asientos: readonly Asiento[]): Set<string> {
  const s = new Set<string>();
  for (const a of asientos) if (a.kind === 'reverso' && a.reverses_entry_id) s.add(a.reverses_entry_id);
  return s;
}

