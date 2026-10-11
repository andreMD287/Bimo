// Provider de los datos de ejemplo. Lo monta `app/_layout.tsx` a través de
// `src/hooks` (las pantallas nunca importan este archivo).

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { reducer, type Accion, type EstadoMock } from './estado';
import { crearEstadoInicial } from './semilla';

interface Ctx {
  estado: EstadoMock;
  dispatch: Dispatch<Accion>;
}

const DatosContext = createContext<Ctx | null>(null);

export function DatosProvider({ children }: { children: ReactNode }) {
  const [estado, dispatch] = useReducer(reducer, undefined, crearEstadoInicial);
  return <DatosContext.Provider value={{ estado, dispatch }}>{children}</DatosContext.Provider>;
}

export function useDatos(): Ctx {
  const ctx = useContext(DatosContext);
  if (!ctx) throw new Error('useDatos fuera de DatosProvider');
  return ctx;
}
