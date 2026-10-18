/** Modelo de errores del spec 06 §1.1. */

export type ErrorCode =
  | 'invalid_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'device_revoked'
  | 'role_not_allowed'
  | 'not_found'
  | 'missing_entries'
  | 'day_not_closable'
  | 'signature_expired'
  | 'request_superseded'
  | 'already_exists'
  | 'link_inactive'
  | 'invalid_signature'
  | 'invalid_challenge'
  | 'rate_limited'
  | 'chain_unavailable'
  | 'internal_error'; // spec 06 v1.1: error del servidor no previsto (HTTP 500)

export const HTTP_STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  device_revoked: 403,
  role_not_allowed: 403,
  not_found: 404,
  missing_entries: 409,
  day_not_closable: 409,
  signature_expired: 409,
  request_superseded: 409,
  already_exists: 409,
  link_inactive: 410,
  invalid_signature: 422,
  invalid_challenge: 422,
  rate_limited: 429,
  chain_unavailable: 503,
  internal_error: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.status = HTTP_STATUS[code];
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details: Record<string, unknown> };
}

export function errorBody(code: ErrorCode, message: string, details: Record<string, unknown> = {}): ErrorBody {
  return { error: { code, message, details } };
}
