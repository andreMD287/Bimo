import { ulid } from 'ulid';

/**
 * ULID del servidor (spec 01 §1). TEMPORAL: el generador oficial vive en `@bimo/shared` (S-01, CLAUDE.md §5);
 * cuando exista se reemplaza esta funcion por su import y se borra este archivo.
 */
export function newId(): string {
  return ulid();
}
