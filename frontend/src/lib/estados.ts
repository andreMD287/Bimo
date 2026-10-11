// Textos de estado para el dueño (spec 07 §6). Nunca se muestra el nombre técnico.

import type { AccountStatus, ChannelCode, DayStatus } from './tipos';

export function textoEstadoDia(status: DayStatus): string {
  switch (status) {
    case 'abierto':
      return 'Abierto';
    case 'cerrado':
      return 'Cerrado · falta tu confirmación';
    case 'firmado':
      return 'Guardando tu cierre…';
    case 'sellado':
      return 'Sellado ✓';
    case 'requiere_enmienda':
      return 'Llegaron ventas después del cierre · confirma de nuevo';
  }
}

export function textoEstadoCuenta(status: AccountStatus): string | null {
  switch (status) {
    case 'deploying':
      return 'Preparando tu cuenta…';
    case 'failed':
      return 'Estamos terminando de preparar tu cuenta. Puedes seguir vendiendo.';
    default:
      return null;
  }
}

/** Nombre genérico de un canal del spec, cuando no hay un canal configurado. */
export function textoCanal(channel: ChannelCode): string {
  switch (channel) {
    case 'efectivo':
      return 'Efectivo';
    case 'breb':
      return 'Bre-B';
    case 'datafono_externo':
      return 'Datáfono';
    case 'tap_to_pay':
      return 'Cobro con el celular';
    case 'fiado':
      return 'Fiado';
    case 'transferencia_otro':
      return 'Billetera o transferencia';
  }
}
