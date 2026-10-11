// Frontera entre las pantallas y los datos. Las pantallas importan SOLO desde aquí.
// Hoy los hooks leen los datos de ejemplo en memoria (`src/mocks/`); cuando exista
// el backend, solo cambia la implementación de estos hooks, no su forma.

export { DatosProvider } from '../mocks/DatosProvider';
export { useComercio, type Comercio } from './useComercio';
export { useCanales, type CanalConfig, type ChannelCode } from './useCanales';
export { useHoy, type PendienteDeConsignar } from './useHoy';
export { useRegistrarVenta, type PagoInput, type VentaInput, type Resultado } from './useRegistrarVenta';
export { useMovimientos, type Movimiento } from './useMovimientos';
export { useCierre, type Diferencia } from './useCierre';
export { useSello, type FaseSello } from './useSello';
export { useHistorial } from './useHistorial';
export { useEnlaces, VIGENCIAS, type Vigencia } from './useEnlaces';
export { useVerificacion, type ResultadoDia, type TotalCanal } from './useVerificacion';

// Formato para mostrar (no son datos): dinero y fechas
export { formatoCOP, formatoBps, pesosACentavos } from '../lib/dinero';
export { fechaLarga, fechaCorta } from '../lib/fechas';
