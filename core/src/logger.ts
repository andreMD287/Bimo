import { pino, type DestinationStream, type Logger } from 'pino';

/**
 * Logs JSON sin datos sensibles (spec 06 §5, CLAUDE.md §4): solo se registran metodo, ruta (sin query),
 * estado, duracion, request_id, merchant_id y device_id. Nunca cuerpos, montos, notas, tokens, firmas ni nombres.
 * Las rutas de `redact` son una segunda barrera por si alguien registra un objeto con esos campos.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'authorization',
  'token',
  'access_token',
  'password',
  'secret',
  '*.token',
  '*.secret',
  '*.signature',
  '*.public_key',
  '*.amount_minor',
  '*.counted_cash_minor',
  '*.note',
  '*.display_name',
  '*.business_name',
  '*.owner_name',
  '*.phone',
  '*.email',
  'signature',
  'public_key',
  'amount_minor',
  'counted_cash_minor',
  'note',
  'display_name',
  'business_name',
  'owner_name',
  'phone',
  'email',
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'bimo-core' },
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}
