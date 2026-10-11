// Tiempo: instantes en UTC con milisegundos; el día de negocio es la fecha en
// America/Bogota (UTC-5, sin horario de verano), spec 01 §7 y ADR-14.

import type { BusinessDate } from './tipos';

const OFFSET_BOGOTA_MS = -5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Instante actual en UTC ISO con milisegundos (V-11). */
export function ahoraISO(): string {
  return new Date().toISOString();
}

/** Fecha de negocio en Bogotá de un instante. 2026-10-07T04:30:00Z → "2026-10-06". */
export function fechaBogota(instante: string | Date): BusinessDate {
  const ms = typeof instante === 'string' ? Date.parse(instante) : instante.getTime();
  return new Date(ms + OFFSET_BOGOTA_MS).toISOString().slice(0, 10);
}

export function hoyBogota(): BusinessDate {
  return fechaBogota(new Date());
}

/** Suma días calendario a una fecha "AAAA-MM-DD". */
export function sumarDias(fecha: BusinessDate, dias: number): BusinessDate {
  const ms = Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Instante UTC (ISO con ms) de una hora local de Bogotá en una fecha de negocio. */
export function instanteBogota(fecha: BusinessDate, hora: number, minuto = 0): string {
  const ms = Date.parse(`${fecha}T00:00:00Z`) + (hora * 60 + minuto) * 60 * 1000 - OFFSET_BOGOTA_MS;
  return new Date(ms).toISOString();
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "2026-10-06" → "lunes 6 de octubre". */
export function fechaLarga(fecha: BusinessDate): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** "2026-10-06" → "6 oct". */
export function fechaCorta(fecha: BusinessDate): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  return `${d.getUTCDate()} ${(MESES[d.getUTCMonth()] ?? '').slice(0, 3)}`;
}

/** Hora en Bogotá de un instante: "2:05 p. m.". */
export function horaBogota(instante: string): string {
  const d = new Date(Date.parse(instante) + OFFSET_BOGOTA_MS);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
