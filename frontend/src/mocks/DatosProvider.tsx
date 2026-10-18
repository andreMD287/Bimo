// Provider de datos de la app. Lo monta `app/_layout.tsx` a traves de `src/hooks` (las pantallas nunca lo importan).
// - Sin API configurada: datos de ejemplo en memoria (SIMULACION, la demo de la semana 3).
// - Con API (EXPO_PUBLIC_API_URL): base local (expo-sqlite), sincronizacion con bimo-core y firma real. El estado que
//   leen los hooks sale SIEMPRE de la base local; cada accion se guarda primero (una transaccion) y despues se muestra.

import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { configureRandom } from '@bimo/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { kv } from '../kv';
import { config, MODO_REAL } from '../runtime/config';
import { createRuntime, type Runtime } from '../runtime/runtime';
import { cargarFirmante } from '../signer';
import { openStore } from '../store/open';
import type { Store } from '../store/types';
import { reducer, type Accion, type DiaMock, type EstadoMock } from './estado';
import { crearEstadoInicial } from './semilla';

interface Ctx {
  estado: EstadoMock;
  dispatch: Dispatch<Accion>;
  /** Solo en modo real. */
  rt: Runtime | null;
}

const DatosContext = createContext<Ctx | null>(null);

/** Proyecta la base local al estado que leen los hooks (mismo formato que los datos de ejemplo). */
function estadoDesdeStore(store: Store, rt: Runtime, enlaces: EstadoMock['enlaces']): EstadoMock {
  const snap = store.snapshot();
  const acc = rt.account();
  const session = rt.auth.session();
  const dias: DiaMock[] = snap.days.map((d) => ({
    business_date: d.business_date,
    status: d.status,
    counted_cash_minor: d.counted_cash_minor,
    closed_at: d.closed_at,
    sellos: d.sellos
      .filter((x) => x.status === 'confirmado')
      .map((x) => ({
        version: x.version,
        entry_count: snap.entries.filter((e) => e.asiento.business_date === d.business_date).length,
        tx_hash: x.tx_hash ?? '',
        confirmed_at: '',
      })),
  }));
  const meta: EstadoMock['meta'] = {};
  for (const e of snap.entries) if (e.meta) meta[e.asiento.id] = e.meta;
  return {
    comercio: {
      merchant_id: acc?.merchant_id ?? '',
      business_name: acc?.business_name ?? '',
      correo: session?.email ?? null,
      stellar_address: acc?.stellar_address ?? '',
      account_status: acc?.account_status ?? 'pending',
      registrado: rt.ready,
    },
    canales: snap.channels.map(({ updated_at_ms: _u, ...c }) => c),
    clientes: snap.customers.map((c) => ({ id: c.id, display_name: c.display_name })),
    asientos: snap.entries.map((e) => e.asiento),
    meta,
    dias,
    enlaces,
    alterados: [],
  };
}

/** Guarda la accion en la base local (UNA transaccion: asiento + lineas + outbox). */
function persistir(store: Store, a: Accion, estado: EstadoMock): void {
  const now = Date.now();
  switch (a.tipo) {
    case 'guardar_canal':
      store.upsertChannel({ ...a.canal, updated_at_ms: now }, 'local');
      break;
    case 'agregar_cliente':
      store.upsertCustomer({ id: a.cliente.id, display_name: a.cliente.display_name, phone: null, updated_at_ms: now }, 'local');
      break;
    case 'agregar_asiento':
      store.addEntry(a.asiento, a.meta ?? null, 'local');
      break;
    case 'cerrar_dia': {
      // D-3 en el celular: solo se cierra un dia abierto; el cierre se sube despues de sus asientos
      const dia = store.snapshot().days.find((d) => d.business_date === a.business_date);
      if (dia && dia.status !== 'abierto') break;
      store.transaction(() => {
        store.upsertDay(a.business_date, { status: 'cerrado', counted_cash_minor: a.counted_cash_minor, closed_at: a.at });
        store.enqueueClose(a.business_date);
      });
      break;
    }
    default:
      void estado; // lo demas (sello, enlaces, comercio) lo resuelve el runtime con la API
  }
}

export function DatosProvider({ children }: { children: ReactNode }) {
  const rt = useMemo<Runtime | null>(() => {
    if (!MODO_REAL) return null;
    configureRandom((n) => Crypto.getRandomBytes(n));
    return createRuntime({ config, kv, store: openStore(), signer: cargarFirmante(kv, (n) => Crypto.getRandomBytes(n)) });
  }, []);
  const enlacesRef = useRef<EstadoMock['enlaces']>([]);

  const [estado, rawDispatch] = useReducer(reducer, undefined, () => (rt ? estadoDesdeStore(rt.store, rt, []) : crearEstadoInicial()));
  const estadoRef = useRef(estado);
  estadoRef.current = estado;

  const refrescar = useCallback(() => {
    if (rt) rawDispatch({ tipo: 'hidratar', estado: estadoDesdeStore(rt.store, rt, enlacesRef.current) });
  }, [rt]);

  const dispatch = useCallback<Dispatch<Accion>>(
    (a) => {
      if (!rt) return rawDispatch(a);
      if (a.tipo === 'enlaces') enlacesRef.current = a.enlaces;
      persistir(rt.store, a, estadoRef.current);
      refrescar();
      if (rt.ready && (a.tipo === 'agregar_asiento' || a.tipo === 'cerrar_dia' || a.tipo === 'guardar_canal' || a.tipo === 'agregar_cliente')) void rt.sync();
    },
    [rt, refrescar],
  );

  // Modo real: refresca la pantalla cuando cambia la base (sincronizacion), sincroniza al abrir, cada 30 s y al volver a primer plano.
  useEffect(() => {
    if (!rt) return;
    const off = rt.onChange(refrescar);
    const tick = () => {
      if (rt.ready) void rt.sync();
    };
    if (rt.ready) void rt.refreshAccount().catch(() => undefined);
    tick();
    const id = setInterval(tick, 30_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && tick());
    return () => {
      off();
      clearInterval(id);
      sub.remove();
    };
  }, [rt, refrescar]);

  return <DatosContext.Provider value={{ estado, dispatch, rt }}>{children}</DatosContext.Provider>;
}

export function useDatos(): Ctx {
  const ctx = useContext(DatosContext);
  if (!ctx) throw new Error('useDatos fuera de DatosProvider');
  return ctx;
}
