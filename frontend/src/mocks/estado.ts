// Estado en memoria de los datos de ejemplo (React Context + useReducer).
// SIMULACIÓN: reemplaza a la base local, la sincronización y la API.
// Solo lo usan los hooks de `src/hooks/`; las pantallas nunca lo importan.

import type {
  AccountStatus,
  Asiento,
  BusinessDate,
  CanalConfig,
  Cliente,
  DayStatus,
} from '../lib/tipos';

export interface SelloMock {
  version: number;
  entry_count: number;
  tx_hash: string; // simulado
  confirmed_at: string;
}

export interface DiaMock {
  business_date: BusinessDate;
  status: DayStatus;
  counted_cash_minor: number | null;
  closed_at: string | null;
  sellos: SelloMock[];
}

/** Datos del front que no van en el asiento (no entran al hash ni existen en el spec). */
export interface MetaAsiento {
  canal_ids: string[]; // id del CanalConfig de cada línea de cobro, en orden
  anticipo_total_minor?: number; // SOLO FRONT (A-00): la venta fue un anticipo con este total
}

export interface EnlaceMock {
  id: string;
  token: string; // en la app real solo existe en el enlace (spec 05 §2)
  date_from: BusinessDate;
  date_to: BusinessDate;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  view_count: number;
}

export interface ComercioMock {
  merchant_id: string;
  business_name: string;
  correo: string | null;
  stellar_address: string; // simulada
  account_status: AccountStatus;
  registrado: boolean;
}

export interface EstadoMock {
  comercio: ComercioMock;
  canales: CanalConfig[];
  clientes: Cliente[];
  asientos: Asiento[];
  meta: Record<string, MetaAsiento>;
  dias: DiaMock[];
  enlaces: EnlaceMock[];
  alterados: BusinessDate[]; // días que "Simular alteración" marcó como modificados
}

export type Accion =
  | { tipo: 'hidratar'; estado: EstadoMock }
  | { tipo: 'enlaces'; enlaces: EnlaceMock[] }
  | { tipo: 'registrar_comercio'; business_name: string; correo: string }
  | { tipo: 'guardar_canal'; canal: CanalConfig }
  | { tipo: 'agregar_cliente'; cliente: Cliente }
  | { tipo: 'agregar_asiento'; asiento: Asiento; meta?: MetaAsiento }
  | { tipo: 'cerrar_dia'; business_date: BusinessDate; counted_cash_minor: number | null; at: string }
  | { tipo: 'firmar_dias'; fechas: BusinessDate[] }
  | { tipo: 'confirmar_sellos'; fechas: BusinessDate[]; at: string }
  | { tipo: 'crear_enlace'; enlace: EnlaceMock }
  | { tipo: 'revocar_enlace'; id: string; at: string }
  | { tipo: 'ver_enlace'; token: string }
  | { tipo: 'alternar_alteracion'; business_date: BusinessDate };

function conDia(dias: DiaMock[], fecha: BusinessDate): DiaMock[] {
  if (dias.some((d) => d.business_date === fecha)) return dias;
  // D-1: el primer asiento de una fecha crea el día abierto
  const nuevo: DiaMock = { business_date: fecha, status: 'abierto', counted_cash_minor: null, closed_at: null, sellos: [] };
  return [...dias, nuevo].sort((a, b) => a.business_date.localeCompare(b.business_date));
}

/** Hash simulado de 64 caracteres hex, determinista por texto. */
export function txHashSimulado(semilla: string): string {
  let h = 2166136261;
  let out = '';
  while (out.length < 64) {
    for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 16777619) >>> 0;
    h = Math.imul(h ^ out.length, 16777619) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

export function reducer(estado: EstadoMock, accion: Accion): EstadoMock {
  switch (accion.tipo) {
    case 'hidratar':
      return accion.estado;
    case 'enlaces':
      return { ...estado, enlaces: accion.enlaces };
    case 'registrar_comercio':
      return {
        ...estado,
        comercio: { ...estado.comercio, business_name: accion.business_name, correo: accion.correo, registrado: true },
      };
    case 'guardar_canal': {
      const existe = estado.canales.some((c) => c.id === accion.canal.id);
      return {
        ...estado,
        canales: existe
          ? estado.canales.map((c) => (c.id === accion.canal.id ? accion.canal : c))
          : [...estado.canales, accion.canal],
      };
    }
    case 'agregar_cliente':
      return { ...estado, clientes: [...estado.clientes, accion.cliente] };
    case 'agregar_asiento': {
      const fecha = accion.asiento.business_date;
      // DB-09 / D-9: un asiento en un día sellado lo pasa a requiere_enmienda
      const dias = conDia(estado.dias, fecha).map((d) =>
        d.business_date === fecha && d.status === 'sellado' ? { ...d, status: 'requiere_enmienda' as const } : d,
      );
      return {
        ...estado,
        asientos: [...estado.asientos, accion.asiento],
        meta: accion.meta ? { ...estado.meta, [accion.asiento.id]: accion.meta } : estado.meta,
        dias,
      };
    }
    case 'cerrar_dia': {
      // D-2 / D-3: solo se cierra un día abierto (o se crea cerrado si no tenía asientos)
      const dias = conDia(estado.dias, accion.business_date).map((d) =>
        d.business_date === accion.business_date && d.status === 'abierto'
          ? { ...d, status: 'cerrado' as const, counted_cash_minor: accion.counted_cash_minor, closed_at: accion.at }
          : d,
      );
      return { ...estado, dias };
    }
    case 'firmar_dias':
      // D-4
      return {
        ...estado,
        dias: estado.dias.map((d) =>
          accion.fechas.includes(d.business_date) && (d.status === 'cerrado' || d.status === 'requiere_enmienda')
            ? { ...d, status: 'firmado' as const }
            : d,
        ),
      };
    case 'confirmar_sellos':
      // D-5 (simulado: el sello siempre se confirma)
      return {
        ...estado,
        dias: estado.dias.map((d) => {
          if (!accion.fechas.includes(d.business_date) || d.status !== 'firmado') return d;
          const entry_count = estado.asientos.filter((a) => a.business_date === d.business_date).length;
          const version = d.sellos.length + 1;
          const sello: SelloMock = {
            version,
            entry_count,
            tx_hash: txHashSimulado(`${d.business_date}#${version}`),
            confirmed_at: accion.at,
          };
          return { ...d, status: 'sellado' as const, sellos: [...d.sellos, sello] };
        }),
      };
    case 'crear_enlace':
      return { ...estado, enlaces: [accion.enlace, ...estado.enlaces] };
    case 'revocar_enlace':
      return {
        ...estado,
        enlaces: estado.enlaces.map((e) => (e.id === accion.id && e.revoked_at === null ? { ...e, revoked_at: accion.at } : e)),
      };
    case 'ver_enlace':
      return {
        ...estado,
        enlaces: estado.enlaces.map((e) => (e.token === accion.token ? { ...e, view_count: e.view_count + 1 } : e)),
      };
    case 'alternar_alteracion': {
      const f = accion.business_date;
      return {
        ...estado,
        alterados: estado.alterados.includes(f) ? estado.alterados.filter((x) => x !== f) : [...estado.alterados, f],
      };
    }
  }
}
